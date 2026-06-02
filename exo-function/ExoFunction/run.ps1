using namespace System.Net

# ExoFunction — HTTP-triggered Exchange Online operations.
#
# Single entry point that NestJS api/ calls to perform shared-mailbox
# permission operations. Request body shape:
#
#   { "op": "list" }                                  → all shared mailboxes
#   { "op": "list-access",   "mailbox": "chief@…" }   → users with FullAccess
#   { "op": "list-for-user", "user": "lucas@…" }      → mailboxes the user can open
#   { "op": "grant",  "mailbox": "chief@…", "user": "lucas@…" }
#   { "op": "revoke", "mailbox": "chief@…", "user": "lucas@…" }
#
# Auth: HTTP function key (authLevel: function). Caller is the NestJS api/.
# EXO auth: cert from Key Vault, pulled via the Function App's managed
# identity. Cert thumbprint is registered against the skintyee-app-graph
# Entra app (provisioned by scripts/setup-app-exo.sh).
#
# Required app settings (set by scripts/setup-exo-function.sh):
#   KEY_VAULT_NAME       — the KV holding the cert
#   EXO_CERT_NAME        — name of the cert in KV (e.g. "skintyee-exo-app")
#   EXO_APP_ID           — Entra appId of skintyee-app-graph
#   EXO_ORGANIZATION     — tenant .onmicrosoft.com (e.g. skintyeenation.onmicrosoft.com)

param($Request, $TriggerMetadata)

function Send-Json([int]$Status, [hashtable]$Body) {
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode  = $Status
        Headers     = @{ 'Content-Type' = 'application/json' }
        Body        = ($Body | ConvertTo-Json -Depth 10 -Compress)
    })
}

# --- Validate input ---------------------------------------------------------
$op = $Request.Body.op
if (-not $op) { Send-Json 400 @{ error = "missing 'op' in body" }; return }

$mailbox = $Request.Body.mailbox
$user    = $Request.Body.user

# --- Pull cert from Key Vault ----------------------------------------------
try {
    $cert = Get-AzKeyVaultCertificate -VaultName $env:KEY_VAULT_NAME -Name $env:EXO_CERT_NAME -ErrorAction Stop
    $secret = Get-AzKeyVaultSecret -VaultName $env:KEY_VAULT_NAME -Name $cert.Name -AsPlainText -ErrorAction Stop
    $bytes = [Convert]::FromBase64String($secret)
    # KV stores the cert as a base64-encoded PFX with no password. Load it
    # with the Exportable flag so MSAL's confidential-client flow can use
    # the private key without re-prompting.
    $x509 = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $bytes, [string]$null,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
    )
} catch {
    Send-Json 500 @{ error = "couldn't load cert: $_" }; return
}

# --- Connect to EXO --------------------------------------------------------
# Workers are reused across invocations. A previous invocation's
# Disconnect doesn't always clear the in-process REST session — the next
# Connect silently keeps the stale token and the first cmdlet trips
# "You must call Connect-ExchangeOnline before calling any other cmdlet."
# Force a clean state by disconnecting any existing connection first.
try {
    Get-ConnectionInformation -ErrorAction SilentlyContinue |
        ForEach-Object { Disconnect-ExchangeOnline -ConnectionId $_.ConnectionId -Confirm:$false 2>&1 | Out-Null }
} catch { }

try {
    Connect-ExchangeOnline `
        -AppId $env:EXO_APP_ID `
        -Certificate $x509 `
        -Organization $env:EXO_ORGANIZATION `
        -ShowBanner:$false `
        -CommandName 'Get-Mailbox','Get-MailboxPermission','Add-MailboxPermission','Remove-MailboxPermission','Get-RecipientPermission','Add-RecipientPermission','Remove-RecipientPermission','Get-ServicePrincipal','New-ServicePrincipal','Get-ManagementRoleAssignment','New-ManagementRoleAssignment' `
        -ErrorAction Stop | Out-Null
} catch {
    Send-Json 500 @{ error = "Connect-ExchangeOnline failed: $_" }; return
}

# --- Dispatch on op ---------------------------------------------------------
try {
    switch ($op) {
        # All shared mailboxes in the org
        'list' {
            $mbxs = Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize Unlimited |
                Select-Object DisplayName, UserPrincipalName, PrimarySmtpAddress, Alias
            Send-Json 200 @{ ok = $true; mailboxes = @($mbxs) }
        }

        # Who has FullAccess / SendAs on this mailbox?
        'list-access' {
            if (-not $mailbox) { Send-Json 400 @{ error = "list-access requires 'mailbox'" }; return }

            $full = Get-MailboxPermission -Identity $mailbox |
                Where-Object {
                    $_.User -notlike 'NT AUTHORITY\*' -and
                    $_.User -notlike 'S-1-*' -and
                    -not $_.IsInherited -and
                    $_.AccessRights -contains 'FullAccess'
                } |
                Select-Object @{N='user';E={$_.User.ToString()}}, @{N='rights';E={$_.AccessRights -join ','}}

            $sendAs = Get-RecipientPermission -Identity $mailbox |
                Where-Object {
                    $_.Trustee -notlike 'NT AUTHORITY\*' -and
                    $_.Trustee -notlike 'S-1-*' -and
                    $_.AccessRights -contains 'SendAs'
                } |
                Select-Object @{N='user';E={$_.Trustee.ToString()}}, @{N='rights';E={'SendAs'}}

            Send-Json 200 @{
                ok       = $true
                mailbox  = $mailbox
                full     = @($full)
                sendAs   = @($sendAs)
            }
        }

        # What mailboxes does this user have access to? (auto-mapping discovery)
        'list-for-user' {
            if (-not $user) { Send-Json 400 @{ error = "list-for-user requires 'user'" }; return }
            $mbxs = Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize Unlimited |
                ForEach-Object {
                    $m = $_
                    $perm = Get-MailboxPermission -Identity $m.UserPrincipalName -User $user -ErrorAction SilentlyContinue
                    if ($perm -and ($perm.AccessRights -contains 'FullAccess')) {
                        [pscustomobject]@{
                            mailbox = $m.UserPrincipalName
                            display = $m.DisplayName
                            rights  = ($perm.AccessRights -join ',')
                        }
                    }
                }
            Send-Json 200 @{ ok = $true; user = $user; mailboxes = @($mbxs) }
        }

        # Grant FullAccess + SendAs to a user on a mailbox.
        'grant' {
            if (-not $mailbox -or -not $user) { Send-Json 400 @{ error = "grant requires 'mailbox' and 'user'" }; return }

            Add-MailboxPermission -Identity $mailbox -User $user -AccessRights FullAccess -InheritanceType All -AutoMapping:$true -Confirm:$false -ErrorAction Stop | Out-Null
            Add-RecipientPermission -Identity $mailbox -Trustee $user -AccessRights SendAs -Confirm:$false -ErrorAction Stop | Out-Null

            Send-Json 200 @{ ok = $true; granted = @{ mailbox = $mailbox; user = $user; rights = @('FullAccess','SendAs') } }
        }

        # Revoke FullAccess + SendAs.
        'revoke' {
            if (-not $mailbox -or -not $user) { Send-Json 400 @{ error = "revoke requires 'mailbox' and 'user'" }; return }

            Remove-MailboxPermission -Identity $mailbox -User $user -AccessRights FullAccess -InheritanceType All -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
            Remove-RecipientPermission -Identity $mailbox -Trustee $user -AccessRights SendAs -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

            Send-Json 200 @{ ok = $true; revoked = @{ mailbox = $mailbox; user = $user } }
        }

        # Register the Entra SP in Exchange Online as an Application
        # Service Principal (modern RBAC for Applications — replaces the
        # legacy ApplicationAccessPolicy mechanism). Then assign the
        # 'Application Calendars.ReadWrite' management role so the SP
        # can read/write M365 Group calendars (which the directory-only
        # Calendars.ReadWrite app-permission DOESN'T cover for groups).
        #
        # Required env vars on the Function App:
        #   EXO_APP_ID         — the Entra application (client) id
        #   EXO_SP_OBJECT_ID   — the SP's object id in Entra
        #
        # Idempotent: re-running tolerates "already exists" errors on both
        # the SP entry and the role assignment.
        'setup-app-rbac' {
            $appId   = $env:EXO_APP_ID
            $spOid   = $env:EXO_SP_OBJECT_ID
            $appName = 'skintyee-app-graph'
            if (-not $spOid) { Send-Json 400 @{ error = "EXO_SP_OBJECT_ID env var not set on Function App" }; return }

            $created = $false
            try {
                Get-ServicePrincipal -Identity $appId -ErrorAction Stop | Out-Null
            } catch {
                try {
                    New-ServicePrincipal -AppId $appId -ServiceId $spOid -DisplayName $appName -ErrorAction Stop | Out-Null
                    $created = $true
                } catch {
                    Send-Json 500 @{ error = "New-ServicePrincipal failed: $_" }; return
                }
            }

            # Assign Application Calendars.ReadWrite (tenant-wide for now;
            # can be scoped later via -CustomResourceScope if we want to
            # restrict to specific groups).
            $assigned = $false
            try {
                $existing = Get-ManagementRoleAssignment -RoleAssignee $spOid -ErrorAction SilentlyContinue |
                            Where-Object { $_.Role -eq 'Application Calendars.ReadWrite' }
                if (-not $existing) {
                    New-ManagementRoleAssignment -App $spOid -Role 'Application Calendars.ReadWrite' -ErrorAction Stop | Out-Null
                    $assigned = $true
                }
            } catch {
                Send-Json 500 @{ error = "Role assignment failed: $_" }; return
            }

            Send-Json 200 @{
                ok = $true
                servicePrincipalCreated = $created
                roleAssigned            = $assigned
                role                    = 'Application Calendars.ReadWrite'
                note                    = '30-60 min propagation across Exchange caches before group calendar writes start working.'
            }
        }

        default {
            Send-Json 400 @{ error = "unknown op '$op' — known: list, list-access, list-for-user, grant, revoke, setup-app-rbac" }
        }
    }
} catch {
    Send-Json 500 @{ error = "$op failed: $_" }
} finally {
    Disconnect-ExchangeOnline -Confirm:$false 2>&1 | Out-Null
}
