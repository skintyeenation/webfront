// Phase 2 onboarding seed — drops a single "Contractor Onboarding (sample)"
// flow with one "Sign Non-Disclosure (NDA)" step so the screens have
// something to render on a fresh install. The attached document is a
// generated PDF stored via the active storage adapter.
//
// Re-running is safe: each upsert is keyed on title + flow title so
// the seed never duplicates rows. Editing the seeded rows from the UI
// is fine; they aren't pinned.

const SAMPLE_DOC_TITLE = 'Non-Disclosure Agreement (sample)';
const SAMPLE_FLOW_TITLE = 'Contractor Onboarding (sample)';
const SAMPLE_STEP_TITLE = 'Sign Non-Disclosure (NDA)';
const SEED_AUTHOR_UPN = 'system@skintyee.ca';

// Hand-rolled minimal one-page PDF. Cross-reference offsets are
// computed against the actual byte positions so the file opens cleanly
// in browsers + Acrobat. ~500 bytes total — small enough to ship inline
// without taxing the Blob container.
function buildSampleNdaPdf(): Buffer {
  const objects: string[] = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '', // 4 — populated below
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const text =
    'BT /F1 22 Tf 72 720 Td (Non-Disclosure Agreement) Tj ET\n' +
    'BT /F1 12 Tf 72 690 Td (SAMPLE TEMPLATE - replace before production use.) Tj ET\n' +
    'BT /F1 12 Tf 72 660 Td (Contractor agrees to keep all confidential information) Tj ET\n' +
    'BT /F1 12 Tf 72 644 Td (received during the engagement strictly confidential.) Tj ET\n' +
    'BT /F1 12 Tf 72 610 Td (Signature: __________________________   Date: ____________) Tj ET';
  objects[3] = `<</Length ${text.length}>>\nstream\n${text}\nendstream`;

  const header = '%PDF-1.4\n';
  const offsets: number[] = [0]; // [0] is the "free" slot
  let cursor = header.length;
  let body = '';
  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    const obj = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    body += obj;
    cursor += obj.length;
  }
  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(header + body + xref + trailer, 'binary');
}

export const ONBOARDING_SEED = {
  SAMPLE_DOC_TITLE,
  SAMPLE_FLOW_TITLE,
  SAMPLE_STEP_TITLE,
  SEED_AUTHOR_UPN,
  buildSampleNdaPdf,
};
