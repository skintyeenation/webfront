// Tiny hand-rolled PDF builder. Produces a valid one-or-more-page PDF
// with positioned text using a single Helvetica font face. Same approach
// as the NDA seed — xref offsets are computed against actual byte
// positions so the file opens cleanly in browsers, Acrobat, and Preview.
//
// Limitations (deliberate — we'd rather ship a tiny zero-dep builder than
// pull in pdfkit / pdf-lib for the POC):
//   - No images.
//   - No font embedding beyond Type1 Helvetica (always available).
//   - No automatic line breaking — caller picks line positions.
//
// Coordinates are PDF-native (origin bottom-left, units = 1/72in). A US
// Letter page is 612 × 792.

export interface PdfLine {
  /** PDF font size in points. */
  size: number;
  /** Y baseline in PDF coords (bottom-left origin). */
  y: number;
  /** X position (defaults to PAGE_MARGIN). */
  x?: number;
  /** Text content. */
  text: string;
}

export interface PdfPage {
  lines: PdfLine[];
}

const PAGE_W = 612;
const PAGE_H = 792;
const PAGE_MARGIN = 48;

// PDF strings inside (...) need basic escaping for parens + backslashes.
function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pageContents(lines: PdfLine[]): string {
  const stmts: string[] = [];
  for (const ln of lines) {
    const x = ln.x ?? PAGE_MARGIN;
    stmts.push(`BT /F1 ${ln.size} Tf ${x} ${ln.y} Td (${escapePdfText(ln.text)}) Tj ET`);
  }
  return stmts.join('\n');
}

/**
 * Build a multi-page PDF from an array of pages. The font dictionary
 * (Helvetica Type1) is shared across pages.
 */
export function buildPdf(pages: PdfPage[]): Buffer {
  if (pages.length === 0) {
    return buildPdf([{ lines: [{ size: 12, y: PAGE_H - PAGE_MARGIN, text: '(empty)' }] }]);
  }
  // Object layout — fixed slots at the front, dynamic page + content objects after:
  //   1 = Catalog
  //   2 = Pages tree
  //   3 = Font (Helvetica)
  //   then per page: PageObj, ContentsStream
  const objects: string[] = [];
  const fontRef = '3 0 R';
  // Placeholders — back-patched below once page object numbers are known.
  objects.push('CATALOG_PLACEHOLDER');
  objects.push('PAGES_PLACEHOLDER');
  objects.push(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`);

  const pageObjNumbers: number[] = [];
  pages.forEach((page) => {
    const contentObjNum = objects.length + 1;
    const stream = pageContents(page.lines);
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
    const pageObjNum = objects.length + 1;
    pageObjNumbers.push(pageObjNum);
    objects.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]/Contents ${contentObjNum} 0 R/Resources<</Font<</F1 ${fontRef}>>>>>>`);
  });
  // Back-patch the catalog + pages tree.
  objects[0] = '<</Type/Catalog/Pages 2 0 R>>';
  const kids = pageObjNumbers.map((n) => `${n} 0 R`).join(' ');
  objects[1] = `<</Type/Pages/Kids[${kids}]/Count ${pages.length}>>`;

  // Serialize w/ accurate xref offsets.
  const header = '%PDF-1.4\n';
  const offsets: number[] = [0]; // slot 0 = free
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

export const PDF_CONST = { PAGE_W, PAGE_H, PAGE_MARGIN };
