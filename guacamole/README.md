# Remote Desktop in the browser — Apache Guacamole

This is the **"Browser" connect mode** behind the app's **Assets → Devices**
remote-desktop dropdown. Until a Guacamole host exists and the app is pointed at
it, that option stays **disabled** (the app gates it on `rdpBrowserBaseUrl`; only
**LAN / VPN** is selectable today). RD Gateway is gated the same way on
`rdpGatewayHost`. See
[`docs/features/remote-desktop-and-device-telemetry.md`](../docs/features/remote-desktop-and-device-telemetry.md).

Guacamole is **clientless**: it renders RDP/VNC/SSH in a normal browser tab — no
Windows App, no `.rdp` file, works on any device including Chromebooks. The
trade-off is you must run a server.

---

## Cost

**Apache Guacamole itself is \$0** — open source (Apache 2.0), self-hosted, no
per-user or per-connection licence. The only cost is the **server** it runs on
and the **network path** to the PCs:

| Item | Cost | Notes |
|---|---|---|
| Guacamole software | **\$0** | Apache 2.0, unlimited users/connections |
| **On-prem host** (small Linux box / existing server on the LAN) | **\$0 extra** | The only option that *natively* reaches the on-prem PCs. Recommended. |
| **Azure VM** (Ubuntu `B2s`, 2 vCPU/4 GB) | **~\$30–40/mo** | `B1ms` (1 vCPU/2 GB) works for a few sessions ~\$13–15/mo |
| Database | **\$0** | Reuse the existing `skintyee-prod-pg` flexible server (add a `guacamole_db`) |
| **VPN to office** (only if hosted in Azure) | **~\$27/mo** | Azure VPN Gateway *Basic* — needed so a cloud guacd can reach `*.stfn.local`. Not needed if hosted on-prem. |
| DNS + TLS | **\$0** | Azure DNS (already have it) + Let's Encrypt (Caddy auto-TLS) |

**Bottom line:** **on-prem ≈ \$0/mo and it works**; **Azure ≈ \$15–40/mo + ~\$27/mo
VPN** (because a cloud host can't reach on-prem PCs without a tunnel). The deploy
script supports both — point it at a LAN box, or have it provision an Azure VM.

---

## What we have to do (checklist)

1. **Stand up the Guacamole stack** (guacd + web app + a database + a TLS
   reverse proxy) — see the compose below.
2. **Put it where it can reach the PCs.** This is the real constraint (see
   *Network reachability*). For Skin Tyee's on-prem fleet, guacd must sit **on
   the STFN.local LAN** (or reach it over a site-to-site/VPN link).
3. **DNS + TLS**: point `remote.skintyee.ca` at it (Azure DNS) and issue a cert
   (Let's Encrypt / the existing certbot pattern).
4. **Entra SSO**: wire the OpenID extension so staff sign in with skintyee.ca
   (no separate Guacamole passwords).
5. **Define connections** — one per PC (hostname `<pc>.stfn.local`, protocol
   `rdp`, port `3389`), or auto-provision them from the api/ (see *Connections*).
6. **Enable it in the app**: set `EXPO_PUBLIC_RDP_BROWSER_BASE_URL=https://remote.skintyee.ca`
   at build time. The "Browser" dropdown item then lights up.
7. **Lock it down**: never expose 3389 publicly; require NLA + Entra on the PCs;
   scope access with Conditional Access; optionally turn on session recording.

---

## Network reachability (the part that bites)

Guacamole does **not** remove the need to reach the PC — it replaces the client,
not the network path. `guacd` opens a raw RDP socket to the target on **3389**,
so it needs line-of-sight to each PC:

```
 Browser ──TLS/443──▶ nginx ──▶ guacamole (webapp) ──▶ guacd ──RDP/3389──▶ PC
 (anywhere)            └────────── on the STFN.local LAN ──────────┘
```

Because the fleet is on-prem behind `STFN-DC`, **guacd has to run on that LAN**
(e.g. a small Linux box / VM on-site, or the existing server), with only 443
published outward through the reverse proxy. A cloud-only Guacamole can't reach
`*.stfn.local` unless you also run a VPN/site-to-site tunnel back to the office.

> This is the same reachability question as RD Gateway — both terminate a secure
> public endpoint and then reach the PC privately. Guacamole's win is "no client
> app"; RD Gateway's win is "no new server if you already run one".

---

## Deploy

The stack is real files in this dir, deployed two ways (both do the same steps):

- **[`docker-compose.yml`](docker-compose.yml)** — guacd + postgres + guacamole
  (Entra OpenID SSO, served at root) + **Caddy** (auto-TLS for `GUAC_DOMAIN`).
- **[`.env.example`](.env.example)** — copy to `.env`, fill in
  `GUAC_DOMAIN` / `DB_PASSWORD` / `ENTRA_CLIENT_ID`.
- **[`deploy-guacamole.sh`](deploy-guacamole.sh)** — reusable: ships the compose
  + `.env` to a host over SSH, brings it up, loads the DB schema once. Can also
  provision the Azure VM first (`--provision-vm`). Run it locally:

  ```bash
  cp .env.example .env && $EDITOR .env
  ./deploy-guacamole.sh --host azureuser@<ip>          # existing LAN box / VM
  ./deploy-guacamole.sh --provision-vm                  # create an Azure VM too
  ```

- **Azure DevOps**: [`azure-pipelines/Deployments/deploy-guacamole.yml`](../azure-pipelines/Deployments/deploy-guacamole.yml)
  runs the same steps over SSH. One-time setup: SSH service connection
  `skintyee-guac-host` + variable group `skintyee-guacamole`
  (`DEPLOY_PATH`, `GUAC_DOMAIN`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` secret,
  `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`) — mirrors `website/`'s `skintyee-website`
  group + `skintyee-host` connection.

> The host still has to **reach the PCs on 3389** (see *Network reachability*) —
> on the LAN, or an Azure VM behind a site-to-site VPN.

### Entra app registration

Create (or reuse) a **public→web** Entra app `skintyee-guacamole` with redirect
URI `https://remote.skintyee.ca`, ID-token implicit grant enabled, and the
`openid`/`profile`/`email` scopes. Put its client id in `ENTRA_CLIENT_ID`.

---

## Connections (how a PC becomes clickable)

Guacamole addresses a session by a **connection id**, not a hostname — so a PC
must exist as a connection before the app can deep-link to it. Two ways:

- **Pre-provision (recommended):** create one RDP connection per PC in the DB
  (or via the **REST API** from the api/, driven off the same Graph `/devices`
  list the app already shows). Each connection sets `hostname`, `port: 3389`,
  `security: nla`, and ideally Entra/`domain: skintyee.ca`. The app would then
  link to `https://remote.skintyee.ca/#/client/<base64 id>`.
- **Quickconnect extension** (`guacamole-auth-quickconnect`): lets a URL carry
  the connection string ad-hoc — closest to the app's current
  `browserRdpUrl()` placeholder (`/#/?host=<fqdn>`), but it's typically
  **disabled** in SSO/multi-user setups for safety.

> ⚠️ The app's current `browserRdpUrl()` (`app/src/services/rdp.ts`) emits a
> provisional `/#/?host=<fqdn>` URL. Align it with whichever model above is
> chosen once the host exists — pre-provisioned connection ids are the secure
> default. Until then the Browser option stays config-disabled, so nothing
> points at a dead URL.

---

## Enable it in the app

Once `remote.skintyee.ca` is live:

```bash
# build-time env (e.g. in the deploy-app-web pipeline / .env)
EXPO_PUBLIC_RDP_BROWSER_BASE_URL=https://remote.skintyee.ca
```

`Config.rdpBrowserBaseUrl` → `browserConfigured()` true → the **Browser**
dropdown item enables on both the Devices list and detail.

---

## Lighter alternative — RD Gateway

If a Windows RD Gateway already exists (or is easier than a new Linux stack), set
`EXPO_PUBLIC_RDP_GATEWAY_HOST=rdgw.skintyee.ca` instead and use the **RD Gateway**
mode — same secure-public-endpoint model, native `.rdp`, no browser host to run.
Guacamole is the right call only when "zero client install, any device" matters
(e.g. Chromebooks, locked-down machines).
