// ---------------------------------------------------------------------------
// Teams meeting block parser.
//
// Outlook + Graph embed online-meeting details into the event body as a
// fixed-shape text block:
//
//   ________________________________________________________________
//   Microsoft Teams meeting
//   Join: https://teams.microsoft.com/meet/214556567085495?p=…
//   Meeting ID: 214 556 567 085 495
//   Passcode: PD7sA2CW
//   Help: https://aka.ms/JoinTeamsMeeting?omkt=en-US
//   ________________________________________________________________
//
// This module extracts that block (and an optional trailing "Links:"
// section we author ourselves) into structured fields, leaving the
// user's prose in a separate `agenda` string. The same parser is
// mirrored client-side as a fallback for events that haven't been
// re-read since this change shipped.
// ---------------------------------------------------------------------------

export interface TeamsConference {
  joinUrl?: string;
  meetingId?: string;
  passcode?: string;
  helpUrl?: string;
}

export interface MeetingLink {
  label: string;
  url: string;
}

export interface ParsedBody {
  agenda: string;                  // prose, Teams + Links sections stripped
  conference?: TeamsConference;    // parsed Teams details
  links?: MeetingLink[];           // parsed "Links:" section entries
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LINKS_HEADER_RE = /(?:^|\n)Links:\s*\n/i;

export function parseMeetingBody(raw?: string): ParsedBody {
  if (!raw) return { agenda: '' };
  const flat = stripHtml(raw);

  // Pull out a "Links:" section first. We author it ourselves so it has
  // a known shape: one URL per line, optional "label - url" or "label: url".
  let working = flat;
  let links: MeetingLink[] | undefined;
  const linksMatch = LINKS_HEADER_RE.exec(working);
  if (linksMatch) {
    const after = working.slice(linksMatch.index + linksMatch[0].length);
    // Stop the Links section at a blank line or the Teams divider.
    const end = after.search(/\n{2,}|_{5,}|Microsoft Teams meeting/i);
    const segment = end >= 0 ? after.slice(0, end) : after;
    const parsed: MeetingLink[] = [];
    for (const line of segment.split('\n')) {
      const trimmed = line.trim().replace(/^[-•*]\s*/, '');
      if (!trimmed) continue;
      const m = trimmed.match(/^(.+?)\s*[:\-]\s*(https?:\/\/\S+)/);
      if (m) {
        parsed.push({ label: m[1].trim(), url: m[2].replace(/[.,)]+$/, '') });
      } else {
        const u = trimmed.match(/(https?:\/\/\S+)/);
        if (u) parsed.push({ label: u[1], url: u[1].replace(/[.,)]+$/, '') });
      }
    }
    if (parsed.length) links = parsed;
    // Strip the entire Links: section out of `working`.
    working = working.slice(0, linksMatch.index)
      + working.slice(linksMatch.index + linksMatch[0].length + (end >= 0 ? end : segment.length));
  }

  // Now extract the Teams block.
  let conference: TeamsConference | undefined;
  if (/Microsoft Teams meeting/i.test(working)) {
    const joinMatch = working.match(/https?:\/\/teams\.microsoft\.com\/(?:meet|l\/meetup-join)\/\S+/i);
    const idMatch   = working.match(/Meeting ID:\s*([\d\s]+?)(?:\n|Passcode|Help|$)/i);
    const passMatch = working.match(/Passcode:\s*(\S+)/i);
    const helpMatch = working.match(/https?:\/\/aka\.ms\/\S+/i);
    conference = {
      joinUrl:   joinMatch?.[0]?.replace(/[.,)]+$/, ''),
      meetingId: idMatch?.[1]?.trim().replace(/\s+/g, ' '),
      passcode:  passMatch?.[1]?.replace(/[.,)]+$/, ''),
      helpUrl:   helpMatch?.[0]?.replace(/[.,)]+$/, ''),
    };
    working = working
      .replace(/_{5,}[\s\S]*?Microsoft Teams meeting[\s\S]*$/i, '')
      .replace(/Microsoft Teams meeting[\s\S]*$/i, '');
  }

  return {
    agenda: working.replace(/\n{3,}/g, '\n\n').trim(),
    conference,
    links,
  };
}

// Serialise `agenda` + optional links back into a single body string for
// Graph. (We don't serialise conference details — Graph regenerates the
// Teams block automatically when isOnlineMeeting=true.)
export function serialiseMeetingBody(input: {
  agenda?: string;
  links?: MeetingLink[];
}): string {
  const parts: string[] = [];
  if (input.agenda && input.agenda.trim()) parts.push(input.agenda.trim());
  if (input.links && input.links.length) {
    const lines = input.links
      .filter((l) => !!l.url)
      .map((l) => l.label && l.label !== l.url ? `${l.label}: ${l.url}` : l.url);
    if (lines.length) parts.push(`Links:\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}
