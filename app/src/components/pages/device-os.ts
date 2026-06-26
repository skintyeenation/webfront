// ----------------------------------------------------------------------------
// device-os — pure, RN/theme-free helpers for presenting Entra device data.
//
// Microsoft Graph reports Windows builds as an opaque osVersion string
// ("10.0.<BUILD>.<rev>") rather than a marketing name. These helpers turn the
// raw build into a human label, classify Windows Server vs. client, and model
// compliance as a tri-state (Graph returns `null` for devices with no Intune
// policy — and Skin Tyee has no Intune per ADR-16, so "null" must read as
// "Not evaluated", never "Non-compliant").
//
// Kept free of React Native / theme imports so it is trivially unit-testable;
// callers supply colours.
// ----------------------------------------------------------------------------

// Windows Server builds → marketing year. Distinct from client builds.
const SERVER_BUILDS: Record<number, string> = {
  14393: '2016',
  17763: '2019',
  20348: '2022',
  25398: '2022 (23H2)',
  26100: '2025',
};

// Windows client (10/11) builds → marketing version.
const CLIENT_BUILDS: Record<number, string> = {
  22000: 'Windows 11 21H2',
  22621: 'Windows 11 22H2',
  22631: 'Windows 11 23H2',
  26100: 'Windows 11 24H2',
  26200: 'Windows 11 25H2',
  19041: 'Windows 10 2004',
  19042: 'Windows 10 20H2',
  19043: 'Windows 10 21H1',
  19044: 'Windows 10 21H2',
  19045: 'Windows 10 22H2',
  18363: 'Windows 10 1909',
  17134: 'Windows 10 1803',
};

// Builds that are unambiguously Windows Server (26100 is shared with Win11 24H2
// and is therefore excluded — it is Server only when the OS string says so).
const UNAMBIGUOUS_SERVER_BUILDS = new Set([14393, 17763, 20348, 25398]);

const osSaysServer = (operatingSystem: string): boolean =>
  /server/i.test(operatingSystem ?? '');

// Parse the build number out of a "10.0.<BUILD>.<rev>" osVersion string.
// Returns undefined for non-Windows / unparseable versions.
const parseBuild = (osVersion: string): number | undefined => {
  if (!osVersion) return undefined;
  const m = osVersion.match(/^10\.0\.(\d+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
};

/** True if this device is a Windows Server (by OS string or by server build). */
export function isServer(operatingSystem: string, osVersion: string): boolean {
  if (osSaysServer(operatingSystem)) return true;
  const build = parseBuild(osVersion);
  return build !== undefined && UNAMBIGUOUS_SERVER_BUILDS.has(build);
}

/**
 * Human-readable OS label. Maps Windows build numbers to marketing names
 * (Server year or Windows 10/11 version); leaves non-Windows OSes as
 * "<os> <version>". Falls back to "<os> <version>" for unknown builds.
 */
export function osDisplay(operatingSystem: string, osVersion: string): string {
  const raw = `${operatingSystem} ${osVersion}`.trim();
  const build = parseBuild(osVersion);
  if (build === undefined) return raw;

  // Build 26100 is ambiguous: Server 2025 vs. Windows 11 24H2. Resolve by the
  // OS string. All other server builds are unambiguous.
  if (osSaysServer(operatingSystem) || UNAMBIGUOUS_SERVER_BUILDS.has(build)) {
    const year = SERVER_BUILDS[build];
    return year ? `Windows Server ${year}` : 'Windows Server';
  }

  // Exact version wins; otherwise fall back by build range so new/unknown builds
  // still read correctly (Win 11 = build 22000+, Win 10 = 10240–21999) instead of
  // the raw "Windows 10.0.x" that misreads as "Windows 10".
  if (CLIENT_BUILDS[build]) return CLIENT_BUILDS[build];
  if (build >= 22000) return 'Windows 11';
  if (build >= 10240) return 'Windows 10';
  return raw;
}

// ---- Compliance tri-state --------------------------------------------------

export type ComplianceState = 'compliant' | 'noncompliant' | 'unknown';

/**
 * Map Graph's `isCompliant` (which may be null when no Intune policy applies)
 * to a tri-state. null/undefined → 'unknown' ("Not evaluated").
 */
export function complianceState(
  isCompliant: boolean | null | undefined,
  isManaged?: boolean | null,
): ComplianceState {
  // Skin Tyee's compliance bar is "domain-joined + Entra-registered" — those
  // machines are org-managed and count as compliant. Intune is a BONUS, not the
  // bar. So red is reserved for a GENUINE Intune failure: Intune is actively
  // managing the device (isManaged) AND it fails its policy (isCompliant=false).
  // Everything else — incl. domain/Entra machines with no Intune — is compliant.
  if (isManaged === true && isCompliant === false) return 'noncompliant';
  return 'compliant';
}

/** Whether Intune is actively managing the device — shown as a "bonus" badge. */
export function isIntuneManaged(isManaged?: boolean | null): boolean {
  return isManaged === true;
}

/** Label + MaterialCommunityIcons glyph per compliance state. No colours — the
 * caller picks success / error / grey to suit the theme. */
export const COMPLIANCE_UI: Record<ComplianceState, { label: string; icon: string }> = {
  compliant: { label: 'Compliant', icon: 'shield-check' },
  noncompliant: { label: 'Non-compliant', icon: 'shield-alert' },
  unknown: { label: 'No Intune policy', icon: 'shield-off-outline' },
};
