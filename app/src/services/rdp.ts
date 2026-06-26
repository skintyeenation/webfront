import { Platform } from 'react-native';
import Config from 'skintyee/config';

// Cross-platform remote-desktop helper. Generates a standard `.rdp` connection
// file for a device — opened by mstsc (Windows), the free Windows App (macOS /
// iOS / iPadOS / Android), or xfreerdp/Remmina (Linux). Hybrid Entra-joined PCs
// authenticate with the user's skintyee.ca identity (enablerdsaadauth).
//
// Reachability is config-driven (see app.config.js + Config):
//   • rdpGatewayHost empty  → LAN/VPN: full address = <host>.<domain>
//   • rdpGatewayHost set     → RD Gateway: RDP tunneled over TLS/443
//
// See docs/features/remote-desktop-and-device-telemetry.md.

/** The host to connect to: a bare PC name gets the AD domain suffix appended;
 *  an already-qualified name (contains a dot) is used as-is. */
export function rdpHost(displayName: string): string {
  const suffix = (Config.rdpDomainSuffix ?? '').trim();
  if (!suffix || displayName.includes('.')) return displayName;
  return `${displayName}.${suffix}`;
}

/** Build the `.rdp` file contents for a device. Lines are CRLF-terminated as
 *  Windows clients expect. */
export function buildRdpFile(device: { displayName: string }): string {
  const host = rdpHost(device.displayName);
  const gateway = (Config.rdpGatewayHost ?? '').trim();
  const lines = [
    `full address:s:${host}`,
    'screen mode id:i:2', // 2 = full screen
    'use multimon:i:0',
    'authentication level:i:2', // require server auth, warn-but-connect on mismatch
    'enablerdsaadauth:i:1', // Entra (AAD) auth — hybrid Entra-joined PCs
    'prompt for credentials:i:0',
    'redirectclipboard:i:1',
    'redirectprinters:i:0',
    'audiomode:i:0',
  ];
  if (gateway) {
    lines.push(
      `gatewayhostname:s:${gateway}`,
      'gatewayusagemethod:i:1', // always use the gateway
      'gatewaycredentialssource:i:4', // prompt / Entra
      'gatewayprofileusagemethod:i:1',
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Safe download filename for a device's `.rdp`. */
export function rdpFilename(device: { displayName: string }): string {
  return `${device.displayName.replace(/[^\w.-]+/g, '_')}.rdp`;
}

/** Whether a one-click download is available (web/Electron only). */
export function canDownloadRdp(): boolean {
  return Platform.OS === 'web';
}

/** Generate + download the device's `.rdp` file (web/Electron). No-op elsewhere. */
export function downloadRdp(device: { displayName: string }): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([buildRdpFile(device)], { type: 'application/x-rdp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = rdpFilename(device);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
