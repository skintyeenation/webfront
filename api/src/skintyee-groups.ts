// Catalog of the Skin Tyee Microsoft 365 / Entra groups that the app uses
// for role-gating and membership management. Each user's membership across
// these groups is the app's role model — multi-valued, mirrored 1:1 from
// Microsoft Entra.
//
// Two kinds:
//   - 'entra'  : Entra security groups (securityEnabled, !mailEnabled).
//                The native role / department groups.
//   - 'm365'   : Microsoft 365 Groups (groupTypes: Unified). Mail-enabled
//                groups that double as shared mailboxes + SharePoint sites.
//
// Source of truth: Microsoft Entra > Groups. On seed the api/ walks each
// group via Graph /groups/{id}/members; on save the app's EditMember
// screen calls PATCH /v1/directory/:id/groups which writes back via
// POST/DELETE /groups/{id}/members/$ref. Requires the Graph application
// permission Group.ReadWrite.All (granted by scripts/setup-app-graph.sh).
//
// To add a new group:
//   1) Create it in Entra > Groups
//   2) Add an entry below with its objectId + slug + kind
//   3) Restart the api/ — the seed picks it up automatically
//
// `slug` is the short, stable identifier the UI and PATCH payloads use.

export interface SkintyeeGroup {
  id: string;         // Entra group objectId
  slug: string;       // kebab-case stable ID (used in API payloads)
  displayName: string;
  description: string;
  kind: 'entra' | 'm365';
}

export const SKINTYEE_SECURITY_GROUPS: SkintyeeGroup[] = [
  // ---- Entra security groups (16) -----------------------------------------
  { id: '2e387713-c507-4de7-88f9-091c8317faf2', slug: 'public',           displayName: 'Public',                    kind: 'entra', description: 'Anonymous + external baseline access' },
  { id: '22c87a10-d041-40cb-8df5-c8b9b02f5d82', slug: 'band-members',     displayName: 'Skin Tyee Band Members',    kind: 'entra', description: 'Verified band members' },
  { id: 'fbbe6e60-a414-4c74-a5d4-c7d8138d386e', slug: 'contractors',      displayName: 'Skin Tyee Contractors',     kind: 'entra', description: 'External vendors / non-employees' },
  { id: 'ede27527-cc67-46c9-a537-c56cfaba5659', slug: 'chief',            displayName: 'Skin Tyee Chief',           kind: 'entra', description: 'Band chief' },
  { id: 'eee04972-8f40-4f3c-ba9f-90f5fb3a0b1e', slug: 'council',          displayName: 'Skin Tyee Council',         kind: 'entra', description: 'Council members' },
  { id: '8b4c3955-acec-45a9-b28c-e093833f88d5', slug: 'band-manager',     displayName: 'Skin Tyee Band Manager',    kind: 'entra', description: 'Band manager — operational leadership' },
  { id: 'd0793e28-a231-47fc-b9d5-9b0376e7359e', slug: 'management',       displayName: 'Skin Tyee Management',      kind: 'entra', description: 'Management staff' },
  { id: 'ce8ee925-0b6e-4c5a-8d60-0663ed330a85', slug: 'admins',           displayName: 'Skin Tyee Admins',          kind: 'entra', description: 'App administrators' },
  { id: 'dc2d0ea4-d41a-459b-8bac-ae2746dcd18f', slug: 'system-admin',     displayName: 'Skin Tyee System Admin',    kind: 'entra', description: 'Technical / break-glass admins' },
  { id: '51d697e6-9079-4055-8f64-c70cf5022eea', slug: 'it',               displayName: 'Skin Tyee IT',              kind: 'entra', description: 'IT staff' },
  { id: '51526fd3-0af9-4d96-b99b-dd20e1115785', slug: 'finance',          displayName: 'Skin Tyee Finance',         kind: 'entra', description: 'Finance staff' },
  { id: 'da56caea-536f-4408-9488-5a8e50e647d6', slug: 'housing',          displayName: 'Skin Tyee Housing',         kind: 'entra', description: 'Housing department' },
  { id: '6ada7b57-9820-44b9-836d-59b4a71bb0ed', slug: 'forestry',         displayName: 'Skin Tyee Forestry',        kind: 'entra', description: 'Forestry department' },
  { id: '367839cd-e9a2-4a04-a2e7-15e02ae9c65c', slug: 'land-resources',   displayName: 'Skin Tyee Land Resources',  kind: 'entra', description: 'Land resources department' },
  { id: '88076d3d-b6a0-4c5f-abce-b140d063b911', slug: 'gis',              displayName: 'Skin Tyee GIS',             kind: 'entra', description: 'GIS / Mapping department' },
  { id: '1cd86f8f-c6c4-4213-bfaa-305abe9bae94', slug: 'fire-chief',       displayName: 'Skin Tyee Fire Chief',      kind: 'entra', description: 'Fire chief role' },

  // ---- Microsoft 365 Groups (3) -------------------------------------------
  // Mail-enabled "Unified" groups; double as shared mailboxes + SharePoint
  // sites. Editable here so admins can manage membership without leaving
  // the app.
  //
  // NOTE: Microsoft auto-creates an "All Company" M365 group in every new
  // tenant (allcompany@…onmicrosoft.com). We deliberately DON'T include
  // it — it's a Microsoft-default, not a Skin Tyee group, and managing
  // membership there would be confusing.
  { id: '425b9e3e-534a-4394-97fc-64b54c2eef10', slug: 'it-project-docs',  displayName: 'IT Project Docs',           kind: 'm365',  description: 'IT documentation team (it-project-docs@skintyee.ca)' },
  { id: '67abaaf6-d7ba-4007-837d-4174822dbf3d', slug: 'council-m365',     displayName: 'Skin Tyee Council (M365)',  kind: 'm365',  description: 'Council mailbox + SharePoint (council@skintyee.ca)' },
  { id: 'dc776d31-3549-4c39-9781-34c1cad28c99', slug: 'management-m365',  displayName: 'Skin Tyee Management (M365)', kind: 'm365', description: 'Management mailbox + SharePoint (management@skintyeenation.onmicrosoft.com)' },
];

// Lookup helpers
export const groupById   = new Map(SKINTYEE_SECURITY_GROUPS.map((g) => [g.id, g]));
export const groupBySlug = new Map(SKINTYEE_SECURITY_GROUPS.map((g) => [g.slug, g]));
