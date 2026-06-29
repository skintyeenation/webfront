// Generated from the ISC PAW application form PDFs in public/docs/forms/ (pre-fetched
// from sac-isc.gc.ca). Keyed by PAW number as it appears in the filename.
import { FUNDING_PROGRAMS } from '@skintyee/models';

export const FORM_FILES: Record<string, string> = {
  '10138570-bc': '/docs/forms/paw-10138570-bc.pdf',
  '1058111': '/docs/forms/paw-1058111.pdf',
  '1071595': '/docs/forms/paw-1071595.pdf',
  '1213680': '/docs/forms/paw-1213680.pdf',
  '1268917': '/docs/forms/paw-1268917.pdf',
  '1271719': '/docs/forms/paw-1271719.pdf',
  '1296545': '/docs/forms/paw-1296545.pdf',
  '1296953': '/docs/forms/paw-1296953.pdf',
  '1307063': '/docs/forms/paw-1307063.pdf',
  '1323247': '/docs/forms/paw-1323247.pdf',
  '1327498': '/docs/forms/paw-1327498.pdf',
  '1775522': '/docs/forms/paw-1775522.pdf',
  '1898217': '/docs/forms/paw-1898217.pdf',
  '3845614': '/docs/forms/paw-3845614.pdf',
  '3869162': '/docs/forms/paw-3869162.pdf',
  '41802': '/docs/forms/paw-41802.pdf',
  '41814': '/docs/forms/paw-41814.pdf',
  '41932': '/docs/forms/paw-41932.pdf',
  '493710-bc': '/docs/forms/paw-493710-bc.pdf',
  '493738-bc': '/docs/forms/paw-493738-bc.pdf',
  '515410': '/docs/forms/paw-515410.pdf',
  '5664860': '/docs/forms/paw-5664860.pdf',
  '5677670': '/docs/forms/paw-5677670.pdf',
  '5740523': '/docs/forms/paw-5740523.pdf',
  '5814375': '/docs/forms/paw-5814375.pdf',
  '6161886': '/docs/forms/paw-6161886.pdf',
  '638262': '/docs/forms/paw-638262.pdf',
  '6735961': '/docs/forms/paw-6735961.pdf',
  '6978371': '/docs/forms/paw-6978371.pdf',
  '6978382': '/docs/forms/paw-6978382.pdf',
  '7638775': '/docs/forms/paw-7638775.pdf',
  '84458230': '/docs/forms/paw-84458230.pdf',
  '9359624-bc': '/docs/forms/paw-9359624-bc.pdf',
  '9701986': '/docs/forms/paw-9701986.pdf',
  '9744235': '/docs/forms/paw-9744235.pdf',
};

// Resolve the downloaded form PDF for a PAW/DCI number (tolerates the -bc regional
// suffix, e.g. dataset '493710' matches file key '493710-bc').
export function formUrlFor(no?: string): string | undefined {
  if (!no) return undefined;
  const key = no.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const k of Object.keys(FORM_FILES)) {
    const kk = k.replace(/[^a-z0-9]/g, '');
    if (kk === key || kk.startsWith(key)) return FORM_FILES[k];
  }
  return undefined;
}

// Authoritative mapping of each PAW/DCI number to WHICH form/program it is in our app —
// e.g. FORM_INDEX['1775522'] tells you paw-1775522.pdf is the <name> form for <program>
// (<area>). Built by joining FORM_FILES (the downloaded PDFs) with the funding dataset's
// paw[]/dci[] items, so it stays in sync with @skintyee/models.
export type FormInfo = {
  no: string;
  file: string;
  name: string;
  area: string;
  program: string;
  kind: 'paw' | 'dci';
};

export const FORM_INDEX: Record<string, FormInfo> = (() => {
  const idx: Record<string, FormInfo> = {};
  for (const p of FUNDING_PROGRAMS) {
    const program = p.acronym ?? p.name;
    for (const [kind, items] of [
      ['paw', p.paw],
      ['dci', p.dci],
    ] as const) {
      for (const it of items ?? []) {
        const file = formUrlFor(it.no);
        if (it.no && file && !idx[it.no]) {
          idx[it.no] = { no: it.no, file, name: it.name, area: p.area, program, kind };
        }
      }
    }
  }
  return idx;
})();

/** Reverse lookup: given a PAW/DCI number, what form/program is it in our application? */
export function formInfoFor(no?: string): FormInfo | undefined {
  return no ? FORM_INDEX[no] : undefined;
}
