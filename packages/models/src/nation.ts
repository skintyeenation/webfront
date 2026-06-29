import type { FundingProgram } from './funding';

/**
 * Demographic / size profile of a First Nation. Several ISC programs are tiered or gated
 * by population, Nominal Roll students, or the number of First Nations served, so funding
 * figures are resolved against this profile. This is the system-of-record shape tracked in
 * the API (GET / PATCH `/community/profile`); for Skin Tyee most fields are not yet confirmed.
 */
export interface NationProfile {
  name: string;
  /** Total registered members (on- and off-reserve). Approximate for Skin Tyee. */
  totalMembers?: number;
  /** On-reserve resident population — the figure most ISC tiers key on. */
  onReservePopulation?: number;
  /** Registered (status) members — used by per-capita formulas (e.g. vital statistics). */
  registeredMembers?: number;
  /** Nominal Roll enrolment — drives per-student education funding. */
  nominalRollStudents?: number;
  /** Number of First Nations served (1 = serves only itself). Gates Tribal Council Funding. */
  firstNationsServed?: number;
  /** Count of ongoing ISC programs delivered — a TCF tier input. */
  ongoingIscPrograms?: number;
  /** As-of label for the figures (e.g. fiscal year). */
  asOf?: string;
  /** Free-text caveats — what is estimated vs confirmed. */
  notes?: string;
}

/**
 * Best-known profile for Skin Tyee First Nation. Population is approximate (~200 members);
 * most other fields are still to be confirmed (see `notes`) — funding figures that depend on
 * them cannot be resolved until they are. The tracked/editable copy lives in the API; this is
 * the seed for that copy and the website's default.
 */
export const SKIN_TYEE_PROFILE: NationProfile = {
  name: 'Skin Tyee First Nation',
  totalMembers: 200,
  firstNationsServed: 1,
  asOf: 'FY2024-2025',
  notes:
    'Population is approximate (~200 members). On-reserve resident count, registered (status) members, Nominal Roll enrolment, and the number of ongoing ISC programs are not yet confirmed — funding figures that depend on them cannot be resolved until they are.',
};

/** Result of resolving a program against a Nation profile. */
export interface NationFunding {
  /** Whether the Nation is eligible for this program at its current size. */
  eligible: boolean;
  /** Size-resolved amount when computable (e.g. the applicable tier). */
  amount?: string;
  /** Tier label when tiered (e.g. 'Tier 1'). */
  tier?: string;
  /** Plain-language explanation of the eligibility / amount decision. */
  basis: string;
}

/**
 * Resolve a program's funding for a Nation profile when the program's access or amount
 * depends on Nation size. Returns `null` for programs that are not size-sensitive (show them
 * normally). When it returns `eligible: false`, the Nation's size disqualifies the program and
 * the UI should grey it out; when `eligible: true` with an `amount`, show the size-adjusted
 * figure in place of the static floor/limit range.
 */
export function fundingForNation(program: FundingProgram, profile: NationProfile): NationFunding | null {
  const key = program.acronym ?? program.name;
  const pop = profile.onReservePopulation ?? profile.totalMembers;

  // Tribal Council Funding — supports councils serving multiple member First Nations, tiered by
  // population / Nations served / programs delivered. A single small Nation serving only itself
  // does not access TCF directly (the funding flows to its tribal council, if any).
  if (key === 'TCF') {
    const served = profile.firstNationsServed ?? 1;
    if (served < 2) {
      return {
        eligible: false,
        basis: `Tribal Council Funding supports councils serving 2+ member First Nations; ${profile.name} serves ${served}.`,
      };
    }
    if (pop == null) return null;
    if (pop < 2000) return { eligible: true, tier: 'Tier 1', amount: '$200,000', basis: `on-reserve population under 2,000 (~${pop}).` };
    if (pop <= 5500) return { eligible: true, tier: 'Tier 2', amount: '$350,000', basis: `on-reserve population 2,000–5,500 (~${pop}).` };
    return { eligible: true, tier: 'Tier 3', amount: '$500,000', basis: `on-reserve population over 5,500 (~${pop}).` };
  }

  return null;
}
