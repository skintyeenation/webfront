# Remote desktop + device telemetry (IP & geolocation)

Two additions to **Assets → Devices → device detail**, both admin-only:

1. **Download a remote-desktop connection** for the PC (cross-platform).
2. Show the device's **last-seen IP address + geolocation**.

Both build on the Entra-backed devices feature (see `app/STUBS.md` §2cc and
[`docs/365/device-identity-vs-management.md`](../365/device-identity-vs-management.md)).

---

## 1. Remote desktop — how cross-platform RDP works

The universal artifact is a **`.rdp` connection file**. One generated file
connects from every platform, no custom client:

| Platform | Opens `.rdp` with |
|---|---|
| Windows | built-in `mstsc` |
| macOS / iOS / iPadOS / Android | **Windows App** (formerly *Microsoft Remote Desktop*), free from the App Store / Play Store / Mac App Store |
| Linux | `xfreerdp <file>` or Remmina (imports `.rdp`) |

Because the fleet is **Hybrid Entra-joined**, the file sets
`enablerdsaadauth:i:1` so the user authenticates with their **skintyee.ca Entra
identity** (no separate local password). See
[`docs/365/device-identity-vs-management.md`](../365/device-identity-vs-management.md).

### Reachability (a runtime dropdown)

RDP/3389 must never face the internet. The device-detail screen has a **"Connect
via" dropdown** with three modes; the action button adapts to the choice. Which
modes are *selectable* is gated by config (an unconfigured mode is shown but
disabled):

| Mode | Enabled when | Action | Infra |
|---|---|---|---|
| **LAN / VPN** (always) | — | downloads `.rdp` → `full address:s:<host>.stfn.local` | none — admin must be on the LAN or VPN |
| **RD Gateway** (recommended for remote) | `rdpGatewayHost` set | downloads `.rdp` with `gatewayhostname` + `gatewayusagemethod:i:1` → RDP tunneled over TLS/443, gated by Entra + Conditional Access/MFA | an RD Gateway server |
| **Browser (Guacamole)** | `rdpBrowserBaseUrl` set | opens a clientless Guacamole URL (`open-in-new`) — no file, no client app | an Apache Guacamole host + per-device connection config |

Default mode = **RD Gateway if configured, else LAN/VPN**. The gateway host and
Guacamole base URL come from env (`EXPO_PUBLIC_RDP_GATEWAY_HOST`,
`EXPO_PUBLIC_RDP_BROWSER_BASE_URL`) so enabling a mode is a build-config change,
not a code change.

### Implementation

- `app/src/services/rdp.ts` — `buildRdpFile(device)` emits the `.rdp` text from
  `Config.rdpDomainSuffix` + `Config.rdpGatewayHost`; `downloadRdp(device)` does
  a web Blob download (`<host>.rdp`). Web/Electron only (`Platform.OS === 'web'`).
- `app/src/config.ts` + `app.config.js` — `rdpDomainSuffix` (default
  `stfn.local`), `rdpGatewayHost` (default empty).
- `DeviceDetail.tsx` — a **"Remote desktop (.rdp)"** button for Windows devices,
  with a one-line hint that mac/mobile open it in the free Windows App.

### Linux one-liner (documented, not generated)

```bash
xfreerdp /v:<host>.stfn.local /u:<you>@skintyee.ca /dynamic-resolution
```

---

## 2. IP address + geolocation

**Entra device objects carry no IP or location** — Graph `/devices` has none.
The Azure-native source is the **Entra sign-in logs**
(`/auditLogs/signIns`), which record, per sign-in, the `ipAddress` and a
`location` (`city` / `state` / `countryOrRegion` / `geoCoordinates`). So what we
show is the **network location of the device's most recent sign-in** — not a
real-time GPS fix.

Requires the **`AuditLog.Read.All`** application permission and **Entra ID P1**
(the tenant has P1 — `AAD_PREMIUM` is in the license catalog). If the permission
isn't granted, the fields degrade gracefully to "unavailable".

### Implementation

- `api/src/graph-feed.service.ts` — `getDevice()` calls a new
  `latestSignInTelemetry(displayName, users)`: query
  `/auditLogs/signIns?$filter=userPrincipalName eq '<owner upn>'&$top=25&$orderby=createdDateTime desc`,
  pick the most recent row whose `deviceDetail.displayName` matches the device,
  and return its `ipAddress` + `location`. Best-effort: any failure (no users,
  missing permission, no matching sign-in) returns nothing and the UI hides the
  rows.
- `ApiService.ts` — `DeviceGeoLocation` + `DeviceDetailDto.lastSignInIp` /
  `lastSignInLocation`.
- `DeviceDetail.tsx` — "IP address" + "Location" rows (city, region, country)
  with a **View on map** link (Google Maps at the geo-coordinates) when present.
- Mock: a couple of fixtures carry sample IP/location so the screen renders in
  mock mode.

### Caveats

- It's **last sign-in** location, cached by the sign-in log — not live.
- `geoCoordinates` is often null even when city/country are present (Entra
  derives it from IP); the map link only shows when lat/lon exist.
- A device with **no registered user** (some Hybrid objects) has no UPN to query
  by, so telemetry is unavailable for it. (Filtering signIns directly by
  `deviceDetail/deviceId` isn't supported by Graph, hence the UPN approach.)

---

## See also

- `app/STUBS.md` §2cc — the devices feature + its Graph mapping.
- [`docs/365/device-identity-vs-management.md`](../365/device-identity-vs-management.md)
  — join vs management vs compliance; duplicate-registration consolidation.
