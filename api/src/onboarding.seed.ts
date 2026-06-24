// Onboarding seed — a realistic multi-step new-hire flow so a fresh install
// (and prod) has a usable checklist, not just a single NDA step.
//
// Idempotent + ADDITIVE: the seeder ensures the flow exists, then ensures each
// step below exists (matched by title) — so re-running adds any step that's new
// since the last seed without disturbing admin edits to existing rows. Each
// step's document is a generated "sample" PDF (replace the real TD1 / TD1BC /
// T4 / direct-deposit forms via the in-app uploader before production use).

const FLOW_TITLE = 'Contractor Onboarding (sample)';
const SEED_AUTHOR_UPN = 'system@skintyee.ca';

// Generalised one-page PDF builder (was buildSampleNdaPdf). Cross-reference
// offsets are computed from real byte positions so the file opens cleanly in
// browsers + Acrobat. Title at the top, then each body line below it.
function buildSamplePdf(title: string, bodyLines: string[]): Buffer {
  const esc = (s: string) => s.replace(/([()\\])/g, '\\$1');
  let y = 690;
  const body = bodyLines.map((ln) => { const t = `BT /F1 12 Tf 72 ${y} Td (${esc(ln)}) Tj ET`; y -= 18; return t; }).join('\n');
  const text = `BT /F1 22 Tf 72 720 Td (${esc(title)}) Tj ET\n${body}`;

  const objects: string[] = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${text.length}>>\nstream\n${text}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  const header = '%PDF-1.4\n';
  const offsets: number[] = [0];
  let cursor = header.length;
  let bodyStr = '';
  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    const obj = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    bodyStr += obj;
    cursor += obj.length;
  }
  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(header + bodyStr + xref + trailer, 'binary');
}

export type SeedCompletion = 'admin_marks' | 'person_uploads' | 'both';

export interface SeedStep {
  stepTitle: string;
  instructions: string;
  completion: SeedCompletion;
  doc: {
    title: string;
    fileName: string;
    description: string;
    bodyLines: string[];
    // When set, seed the real embedded blank from FORM_PDF_B64[pdfKey] (e.g. the
    // fillable TD1/TD1BC) instead of a generated placeholder, and attach linkUrl
    // (the canada.ca form page) to the document. Used for steps that have a real
    // government form — those drop the "(sample)" suffix.
    pdfKey?: string;
    linkUrl?: string;
  };
}

// The new-hire checklist. Order here = step order in the flow.
const STEPS: SeedStep[] = [
  {
    stepTitle: 'Sign Non-Disclosure (NDA)',
    instructions: 'Read the attached NDA, sign it, and upload the signed copy.',
    completion: 'person_uploads',
    doc: {
      title: 'Non-Disclosure Agreement (sample)',
      fileName: 'sample-nda.pdf',
      description: 'Sample placeholder NDA used by the onboarding demo flow. Replace before production use.',
      bodyLines: [
        'SAMPLE TEMPLATE - replace before production use.',
        'Contractor agrees to keep all confidential information',
        'received during the engagement strictly confidential.',
        '',
        'Signature: __________________________   Date: ____________',
      ],
    },
  },
  {
    stepTitle: 'Complete TD1 (Federal Personal Tax Credits Return)',
    instructions: 'Fill out the federal TD1, sign it, and upload the completed form so payroll can set your deductions.',
    completion: 'person_uploads',
    doc: {
      title: 'TD1 — Federal Personal Tax Credits Return',
      fileName: 'td1-fill-26e.pdf',
      description: 'CRA TD1 (federal Personal Tax Credits Return). Fillable blank; the canada.ca link has the current-year version.',
      pdfKey: 'td1',
      linkUrl: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1.html',
      bodyLines: [],
    },
  },
  {
    stepTitle: 'Complete TD1BC (BC Personal Tax Credits Return)',
    instructions: 'Fill out the British Columbia TD1BC, sign it, and upload the completed form.',
    completion: 'person_uploads',
    doc: {
      title: 'TD1BC — BC Personal Tax Credits Return',
      fileName: 'td1bc-fill-26e.pdf',
      description: 'CRA TD1BC (British Columbia Personal Tax Credits Return). Fillable blank; the canada.ca link has the current-year version.',
      pdfKey: 'td1bc',
      linkUrl: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1bc.html',
      bodyLines: [],
    },
  },
  {
    stepTitle: 'Direct Deposit Authorization',
    instructions: 'Provide your banking details (a void cheque or bank-issued direct-deposit form) so payroll can deposit your pay.',
    completion: 'person_uploads',
    doc: {
      title: 'Direct Deposit Authorization (sample)',
      fileName: 'sample-direct-deposit.pdf',
      description: 'Sample placeholder direct-deposit authorization. Replace before production use.',
      bodyLines: [
        'SAMPLE TEMPLATE - replace before production use.',
        'Authorize Skin Tyee First Nation to deposit pay to:',
        '',
        'Institution #: ______   Transit #: ________   Account #: ____________',
        'Attach a VOID cheque or a bank-issued direct-deposit form.',
        '',
        'Signature: __________________________   Date: ____________',
      ],
    },
  },
  {
    stepTitle: 'Acknowledge Workplace Policies',
    instructions: 'Read the workplace policies (conduct, safety, confidentiality) and upload the signed acknowledgement.',
    completion: 'person_uploads',
    doc: {
      title: 'Workplace Policies Acknowledgement (sample)',
      fileName: 'sample-policies.pdf',
      description: 'Sample placeholder policy acknowledgement. Replace with the band’s real policy pack before production use.',
      bodyLines: [
        'SAMPLE TEMPLATE - replace with the real policy pack.',
        'I acknowledge that I have read and agree to abide by the',
        'workplace conduct, safety, and confidentiality policies of',
        'Skin Tyee First Nation.',
        '',
        'Signature: __________________________   Date: ____________',
      ],
    },
  },
];

export const ONBOARDING_SEED = {
  FLOW_TITLE,
  SEED_AUTHOR_UPN,
  STEPS,
  buildSamplePdf,
  // Back-compat: a couple of call sites / tests referenced these.
  SAMPLE_FLOW_TITLE: FLOW_TITLE,
  SAMPLE_DOC_TITLE: STEPS[0].doc.title,
  SAMPLE_STEP_TITLE: STEPS[0].stepTitle,
  buildSampleNdaPdf: () => buildSamplePdf('Non-Disclosure Agreement', STEPS[0].doc.bodyLines),
};
