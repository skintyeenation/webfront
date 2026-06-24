# E-signature setup runbook — self-hosted OpenSign on Azure

Stand up **OpenSign** (open-source e-signature, AGPL-3.0) on a single Azure VM
to collect signatures on band documents, with completed sealed PDFs handed off
to **SharePoint** (the system of record). Implements **ADR-17**; cost basis in
[`esign-costs.md`](esign-costs.md).

> **Target:** `https://esig.skintyee.ca` · all-in-one VM (Docker Compose:
> Parse backend + React UI + MongoDB + Caddy) · Azure Files persistence.

## Contents

- [Phase 0 — Prerequisites + go/no-go checks](#phase-0)
- [Phase 1 — Azure provisioning (VM, Azure Files, DNS)](#phase-1)
- [Phase 2 — Server base install (Docker)](#phase-2)
- [Phase 3 — OpenSign deploy (Compose + env + persistence)](#phase-3)
- [Phase 4 — TLS + DNS cutover (Caddy)](#phase-4)
- [Phase 5 — First run, admin, signing certificate, SMTP](#phase-5)
- [Phase 6 — SharePoint hand-off](#phase-6)
- [Phase 7 — Backups](#phase-7)
- [Phase 8 — Verify + hardening](#phase-8)

---

## Phase 0 — Prerequisites + go/no-go checks {#phase-0}

**Accounts / access**
- Azure access to `skintyee-prod-rg` (or a new `skintyee-esign-rg`), `canadacentral`.
- Control of the **Azure DNS zone** for `skintyee.ca` (to add the `esig` record).
- The existing **`skintyee-app-graph`** Entra app + a SharePoint site with
  `Sites.Selected` granted (for the Phase 6 hand-off — same app used by ADR-8).
- 1Password vault for the secrets created below.

**Two go/no-go checks BEFORE building app integration (ADR-17):**
1. **OpenSign API access on the self-hosted build** — community reports suggest
   API-token generation may be gated to a paid self-host plan. Confirm whether
   the free build can issue API tokens / fire completion webhooks. *If not:* run
   Phase 6 in **manual mode** (download the sealed PDF, upload to SharePoint),
   and don't build the automated app→OpenSign flow until resolved.
2. **Entra ID SSO (OIDC)** — verify whether the community edition accepts an
   external OIDC provider. *If not:* use **local OpenSign accounts + 2FA**
   (Phase 5) and revisit SSO later.

Record both answers in the ADR before proceeding to automation.

---

## Phase 1 — Azure provisioning (VM, Azure Files, DNS) {#phase-1}

```bash
RG=skintyee-prod-rg
LOC=canadacentral
VM=esign-vm
az login

# 1.1 Ubuntu VM (B2s = recommended baseline; B1ms only for a light PoC)
az vm create -g "$RG" -n "$VM" --image Ubuntu2204 --size Standard_B2s \
  --admin-username azureuser --generate-ssh-keys \
  --public-ip-sku Standard --os-disk-size-gb 64 --storage-sku StandardSSD_LRS

# 1.2 Open HTTP/HTTPS (Caddy needs 80 for the ACME challenge + 443 to serve)
az vm open-port -g "$RG" -n "$VM" --port 80  --priority 1001
az vm open-port -g "$RG" -n "$VM" --port 443 --priority 1002
# (SSH/22 stays restricted — lock it to your IP in the NSG.)

# 1.3 Azure Files share for persistence (Mongo data + OpenSign doc store)
SA=skintyeeesign$RANDOM           # storage account name must be globally unique, ≤24 lc-alnum
az storage account create -g "$RG" -n "$SA" -l "$LOC" --sku Standard_LRS --kind StorageV2
az storage share-rm create -g "$RG" --storage-account "$SA" -n esign-data --quota 16

# 1.4 DNS — point esig.skintyee.ca at the VM's public IP
IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
az network dns record-set a add-record -g "$RG" -z skintyee.ca -n esig -a "$IP"
echo "esig.skintyee.ca -> $IP"
```

Save to 1Password: the VM SSH key, the storage account name + key
(`az storage account keys list -g "$RG" -n "$SA"`), and the public IP.

> ⚠️ **Mongo-on-Azure-Files caveat (ADR-17):** mounting Mongo's data dir on SMB
> is not officially supported. It is acceptable here **only because Phase 7 takes
> frequent `mongodump` logical backups** as the real recovery source. If you ever
> see Mongo corruption, move the Mongo volume to the **managed OS disk** (local
> block storage) and keep only OpenSign's document store on Azure Files.

---

## Phase 2 — Server base install (Docker) {#phase-2}

```bash
ssh azureuser@esig.skintyee.ca

# Docker engine + compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Mount the Azure Files share at /mnt/esign-data (persistent volume root)
sudo mkdir -p /mnt/esign-data
SA=<storage-account>; KEY=<storage-key>
sudo bash -c "cat >/etc/smbcredentials/esign.cred <<EOF
username=$SA
password=$KEY
EOF"
sudo chmod 600 /etc/smbcredentials/esign.cred
echo "//$SA.file.core.windows.net/esign-data /mnt/esign-data cifs nofail,credentials=/etc/smbcredentials/esign.cred,dir_mode=0700,file_mode=0700,serverino,nosharesock,actimeo=30 0 0" | sudo tee -a /etc/fstab
sudo mount -a && mkdir -p /mnt/esign-data/{mongo,files}
```

---

## Phase 3 — OpenSign deploy (Compose + env + persistence) {#phase-3}

OpenSign ships a `docker-compose.yml` + `Caddyfile` for self-hosting
(`docs.opensignlabs.com` → self-host → Docker).

```bash
mkdir -p ~/opensign && cd ~/opensign
curl -fsSLO https://raw.githubusercontent.com/OpenSignLabs/OpenSign/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/OpenSignLabs/OpenSign/main/Caddyfile
```

Edit the Compose + env for **our** deployment (exact var names: see OpenSign
self-host env-variables docs — they evolve, so confirm against the version you
pull):

- **Domain / Caddy:** set the site address in `Caddyfile` to `esig.skintyee.ca`
  and the public URL env (e.g. `SERVER_URL` / `PUBLIC_URL`) to
  `https://esig.skintyee.ca`.
- **Persistent MongoDB (required — default is ephemeral):** bind the Mongo
  service's data dir to the Azure Files mount, e.g.
  `volumes: - /mnt/esign-data/mongo:/data/db`, and set `MONGODB_URI` to the
  internal Mongo service.
- **Document storage:** use the **local** backend (`USE_LOCAL=true`) pointed at
  `/mnt/esign-data/files` (OpenSign supports local volume or S3 only — **no Azure
  Blob/SharePoint backend**; SharePoint is handled in Phase 6).
- **App secrets:** generate strong values for the Parse `appId` / `masterKey` /
  JWT secret; store them in 1Password.
- **SMTP** (Phase 5): for signer email-OTP + invitations.

```bash
docker compose up -d
docker compose ps          # backend, mongo, ui, caddy all healthy
docker compose logs -f caddy   # watch the TLS cert issue
```

---

## Phase 4 — TLS + DNS cutover (Caddy) {#phase-4}

Caddy obtains a **Let's Encrypt** certificate automatically once
`esig.skintyee.ca` resolves to the VM (Phase 1.4) and ports 80/443 are open
(Phase 1.2). No Certbot needed. Set a contact email in the `Caddyfile`
(`email it@skintyee.ca`) so renewal notices have a home.

```bash
curl -I https://esig.skintyee.ca          # expect HTTP 200 + valid cert
```

If issuance fails: confirm the A record has propagated, port 80 is reachable
(ACME HTTP-01), and Caddy logs show the challenge.

---

## Phase 5 — First run, admin, signing certificate, SMTP {#phase-5}

1. Open `https://esig.skintyee.ca`, create the **admin account**, enable **2FA**.
2. **Document-signing certificate (the tamper-evident seal):** generate a
   **P12/PFX** and upload it in OpenSign (self-host → "generate self-signed
   document-signing certificate"). This P12 is what cryptographically seals
   completed PDFs so any later edit invalidates the signature (verifiable in
   Acrobat).
   - ⚠️ This is a **self-signed** cert — fine for the *ordinary* electronic
     signatures Skin Tyee needs (BC ETA + PIPEDA; onboarding/NDA/TD1). It is
     **not** a Treasury-Board-listed CA cert and does **not** make a federal
     "secure electronic signature" (ADR-17 scope limit). Don't advertise it as
     one.
3. **SMTP:** point OpenSign at a sender (Mailgun, per the app's existing
   transactional email, or M365) so signer **email-OTP** + signing invitations
   send. Email-OTP is the attribution/identity control (also what CRA wants for
   TD1 identity authentication).
4. Add a **"consent to sign electronically" checkbox** to the signing flow — the
   one compliance pillar OpenSign doesn't capture by default (PIPEDA/ETA consent).

---

## Phase 6 — SharePoint hand-off {#phase-6}

OpenSign keeps the sealed PDF + certificate of completion on its **own** Azure
Files store. To make **SharePoint the system of record**, push the completed
document there on completion:

- **Automated (preferred, gated on Phase 0 check #1):** on the OpenSign
  completion **webhook** (or a poll of its API), the app retrieves the sealed PDF
  + completion certificate and uploads them to the SharePoint Documents library
  via Microsoft Graph — reusing the documents feature's **SharePoint adapter /
  `skintyee-app-graph` app** (`Sites.Selected`, same as ADR-8). File it under the
  relevant document tag; record the OpenSign envelope id for the audit link.
- **Manual fallback (if the API is paywalled):** download the completed PDF from
  the OpenSign UI and upload it through the app's document uploader (which already
  targets SharePoint).

---

## Phase 7 — Backups {#phase-7}

The Azure Files volume is convenient but **`mongodump` is the recovery source of
truth** for the database (per the SMB caveat). Add a nightly cron on the VM:

```bash
# nightly logical dump → Azure Files (or straight to the backup Blob)
docker exec opensign-mongo mongodump --archive=/data/db/backups/esign-$(date +%F).gz --gzip
```

- Keep ~14 daily dumps; copy them (and an Azure Files snapshot) to the existing
  **backup Blob** (see the backup runbook) so they're off the VM.
- OpenSign's document store on Azure Files is covered by **share snapshots**
  (`az storage share snapshot`), scheduled or manual before upgrades.

---

## Phase 8 — Verify + hardening {#phase-8}

- [ ] `https://esig.skintyee.ca` loads with a valid cert; admin login + 2FA work.
- [ ] A test envelope: send → email-OTP → sign → **completed PDF is sealed**
      (open in Acrobat: signature valid; edit a byte → signature breaks).
- [ ] **Certificate of completion** generated, with audit trail (timestamps, IPs).
- [ ] Sealed PDF lands in **SharePoint** (Phase 6).
- [ ] `mongodump` cron runs and copies off-box (Phase 7).
- [ ] NSG: SSH locked to admin IP; only 80/443 public.
- [ ] AGPL-3.0 note recorded — if OpenSign is ever **modified** and served, those
      changes must be published (network copyleft).
- [ ] Phase 0 go/no-go answers (API access, Entra OIDC) recorded in ADR-17.

---

### See also
- **ADR-17** — decision + Canadian/BC compliance basis + caveats:
  [`architecture-decisions.md`](architecture-decisions.md)
- **Cost record:** [`esign-costs.md`](esign-costs.md)
- **OpenSign docs:** <https://docs.opensignlabs.com/docs/self-host/>
