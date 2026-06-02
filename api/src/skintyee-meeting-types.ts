// Catalog of "meeting types" the app surfaces from Microsoft 365
// calendars. A meeting type is identified by an Outlook **category**
// applied to the event by the organizer (one-click colored label in
// the Outlook calendar UI). The app reads `event.categories[]` via
// Graph and filters.
//
// Why categories, not a separate calendar per type:
// Organizers want to schedule from their normal Outlook flow without
// switching calendars. A "Band Meeting" lives on the council@ or
// bandmanager@ calendar same as any other event; the category is
// the only typing signal.
//
// Source calendars — where the app *looks* for these events:
//   1. bandmanager@skintyee.ca           (shared inbox calendar)
//   2. council@skintyee.ca                (Skin Tyee Council M365 group)
//   3. management@…onmicrosoft.com        (Skin Tyee Management M365 group)
//
// Provisioning the master category list across mailboxes is NOT done
// here — organizers can type "Band Meeting" into the Categorize dropdown
// in Outlook and the category gets created automatically the first time.
// If we want consistent colors + cross-mailbox availability we can later
// push them via Exchange Online PowerShell (Add-MailboxCategory).

export interface MeetingType {
  slug: string;          // stable id used in API payloads / UI filters
  displayName: string;
  category: string;       // the Outlook category text to look for
  description: string;
}

export const SKINTYEE_MEETING_TYPES: MeetingType[] = [
  { slug: 'band-meeting',    displayName: 'Band Meeting',     category: 'Band Meeting',     description: 'General band membership meeting' },
  { slug: 'council-meeting', displayName: 'Council Meeting',  category: 'Council Meeting',  description: 'Council-only / governance meeting' },
  { slug: 'staff-meeting',   displayName: 'Staff Meeting',    category: 'Staff Meeting',    description: 'Staff / management operational meeting' },
  { slug: 'public-event',    displayName: 'Public Event',     category: 'Public Event',     description: 'Open to the wider community' },
  { slug: 'closed-session',  displayName: 'Closed Session',   category: 'Closed Session',   description: 'In-camera / confidential council session' },
];

// A meeting source — either a user's primary calendar (shared inbox or
// licensed user) or an M365 group's calendar.
export type MeetingSource =
  | { kind: 'user';  upn: string;    name: string }
  | { kind: 'group'; groupId: string; name: string };

export const MEETING_SOURCE_CALENDARS: MeetingSource[] = [
  { kind: 'user',  upn: 'bandmanager@skintyee.ca',                     name: 'Band Manager' },
  { kind: 'group', groupId: '67abaaf6-d7ba-4007-837d-4174822dbf3d',    name: 'Skin Tyee Council (M365)' },
  { kind: 'group', groupId: 'dc776d31-3549-4c39-9781-34c1cad28c99',    name: 'Skin Tyee Management (M365)' },
];

export const meetingTypeBySlug     = new Map(SKINTYEE_MEETING_TYPES.map((t) => [t.slug, t]));
export const meetingTypeByCategory = new Map(SKINTYEE_MEETING_TYPES.map((t) => [t.category.toLowerCase(), t]));
