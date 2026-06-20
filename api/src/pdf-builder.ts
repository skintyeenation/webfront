// Tiny hand-rolled PDF builder. Produces a valid one-or-more-page PDF
// with positioned text (single Helvetica face), embedded raster images
// (FlateDecode DeviceRGB), and filled rectangles (for rule/signature
// lines). xref offsets are computed against actual byte positions so the
// file opens cleanly in browsers, Acrobat, and Preview.
//
// Still deliberately tiny (no pdfkit / pdf-lib):
//   - Images must be pre-deflated raw RGB (8 bpc) — see timesheet-logo.ts
//     and scripts/gen-timesheet-logo.py. Identical images (same `key`)
//     are embedded once and shared across pages.
//   - Helvetica Type1 only (always available; no embedding).
//   - No automatic line breaking — caller picks line positions.
//
// Coordinates are PDF-native (origin bottom-left, units = 1/72in). A US
// Letter page is 612 × 792.

export interface PdfLine {
  /** PDF font size in points. */
  size: number;
  /** Y baseline in PDF coords (bottom-left origin). */
  y: number;
  /** X position (defaults to PAGE_MARGIN). Ignored when `center` is set. */
  x?: number;
  /** Text content. */
  text: string;
  /** Horizontally center the text on the page (overrides `x`). */
  center?: boolean;
}

// Helvetica glyph advance widths (per 1000 units) for ASCII 32–126 — enough to
// measure text for centering. Anything outside that range falls back to 556.
const HELV_W: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
function textWidth(text: string, size: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    w += (c >= 32 && c <= 126 ? HELV_W[c - 32] : 556);
  }
  return (w * size) / 1000;
}

/** A filled black rectangle — used for rule lines / signature lines. */
export interface PdfRect {
  x: number;
  y: number;
  /** width in points. */
  w: number;
  /** height in points (e.g. 0.7 for a thin rule). */
  h: number;
}

/** A raster image placed on a page. Bytes are shared across pages by `key`. */
export interface PdfImage {
  /** Dedup key — identical keys embed the pixel data only once. */
  key: string;
  /** zlib/FlateDecode-compressed raw RGB (8 bits/component), base64. */
  flateRgbB64?: string;
  /** OR: raw JPEG bytes, base64 — embedded directly via DCTDecode (PDF reads
   *  JPEG natively, no decoding needed). Takes precedence over flateRgbB64. */
  jpegB64?: string;
  /** Native pixel dimensions of the (deflated) image. */
  widthPx: number;
  heightPx: number;
  /** Placement: bottom-left corner (PDF coords) + display size in points. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPage {
  lines: PdfLine[];
  rects?: PdfRect[];
  images?: PdfImage[];
}

const PAGE_W = 612;
const PAGE_H = 792;
const PAGE_MARGIN = 48;

// Map common non-ASCII Unicode → its Windows-1252 (WinAnsi) byte so the
// Helvetica face (declared /WinAnsiEncoding below) renders it. Covers the
// punctuation that sneaks into pasted notes — en/em dashes, smart quotes,
// ellipsis, bullet — plus the Latin-1 accented range (é, ç, ü, …). Anything
// outside WinAnsi (e.g. Indigenous-orthography glyphs that need a custom
// embedded font) degrades to '?' rather than corrupting the byte stream.
const WINANSI: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
function toWinAnsi(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp >= 0xa0 && cp <= 0xff) out += String.fromCharCode(cp);
    else if (WINANSI[cp] !== undefined) out += String.fromCharCode(WINANSI[cp]);
    else if (cp === 0x09 || cp === 0xa0) out += ' ';
    else out += '?';
  }
  return out;
}

// PDF strings inside (...) need basic escaping for parens + backslashes.
function escapePdfText(s: string): string {
  return toWinAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Content stream for one page: rectangles (filled), then images (XObject
// draws), then text — so text and lines sit on top of any image. `imName`
// maps an image key to its shared XObject resource name.
function pageContents(page: PdfPage, imName: Map<string, string>): string {
  const stmts: string[] = [];
  for (const r of page.rects ?? []) {
    stmts.push(`${r.x} ${r.y} ${r.w} ${r.h} re f`);
  }
  for (const img of page.images ?? []) {
    const name = imName.get(img.key)!;
    // cm = [w 0 0 h x y] scales the unit image square to w×h at (x,y).
    stmts.push(`q ${img.w} 0 0 ${img.h} ${img.x} ${img.y} cm /${name} Do Q`);
  }
  for (const ln of page.lines) {
    const x = ln.center ? (PAGE_W - textWidth(ln.text, ln.size)) / 2 : (ln.x ?? PAGE_MARGIN);
    stmts.push(`BT /F1 ${ln.size} Tf ${x} ${ln.y} Td (${escapePdfText(ln.text)}) Tj ET`);
  }
  return stmts.join('\n');
}

/**
 * Build a multi-page PDF. Shared objects (font + each unique image) live
 * up front; page + content-stream objects follow.
 */
export function buildPdf(pages: PdfPage[]): Buffer {
  if (pages.length === 0) {
    return buildPdf([{ lines: [{ size: 12, y: PAGE_H - PAGE_MARGIN, text: '(empty)' }] }]);
  }

  const objects: string[] = [];
  const fontRef = '3 0 R';
  // Fixed front slots — back-patched once page numbers are known.
  objects.push('CATALOG_PLACEHOLDER'); // 1
  objects.push('PAGES_PLACEHOLDER');   // 2
  objects.push(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`); // 3

  // Embed each unique image once (by key) → object number + resource name.
  const imObjNum = new Map<string, number>();
  const imName = new Map<string, string>();
  for (const page of pages) {
    for (const img of page.images ?? []) {
      if (imObjNum.has(img.key)) continue;
      const isJpeg = !!img.jpegB64;
      const bytes = Buffer.from((isJpeg ? img.jpegB64 : img.flateRgbB64) ?? '', 'base64');
      const objNum = objects.length + 1;
      imObjNum.set(img.key, objNum);
      imName.set(img.key, `Im${objNum}`);
      const filter = isJpeg ? 'DCTDecode' : 'FlateDecode';
      objects.push(
        `<</Type/XObject/Subtype/Image/Width ${img.widthPx}/Height ${img.heightPx}` +
        `/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/${filter}/Length ${bytes.length}>>` +
        `\nstream\n${bytes.toString('binary')}\nendstream`,
      );
    }
  }

  const pageObjNumbers: number[] = [];
  pages.forEach((page) => {
    const contentObjNum = objects.length + 1;
    const stream = pageContents(page, imName);
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
    const pageObjNum = objects.length + 1;
    pageObjNumbers.push(pageObjNum);
    // Per-page XObject dict listing only the images this page draws.
    const usedKeys = Array.from(new Set((page.images ?? []).map((i) => i.key)));
    const xobj = usedKeys.length
      ? `/XObject<<${usedKeys.map((k) => `/${imName.get(k)} ${imObjNum.get(k)} 0 R`).join('')}>>`
      : '';
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]/Contents ${contentObjNum} 0 R` +
      `/Resources<</Font<</F1 ${fontRef}>>${xobj}>>>>`,
    );
  });

  // Back-patch the catalog + pages tree.
  objects[0] = '<</Type/Catalog/Pages 2 0 R>>';
  const kids = pageObjNumbers.map((n) => `${n} 0 R`).join(' ');
  objects[1] = `<</Type/Pages/Kids[${kids}]/Count ${pages.length}>>`;

  // Serialize w/ accurate xref offsets. 'binary' (latin1) keeps the image
  // bytes 1:1 with their string length, so the offsets stay correct.
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
