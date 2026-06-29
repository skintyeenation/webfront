'use client';
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// PDF.js worker (matched to the installed pdfjs-dist v3). XFA rendering is enabled so the ISC
// dynamic (LiveCycle) forms render their actual fields instead of the "Please wait…" stub.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
const DOC_OPTIONS = { enableXfa: true };

export function PdfViewerModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [numPages, setNumPages] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          <div className="flex shrink-0 items-center gap-4">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline"
            >
              ↓ Download
            </a>
            <button onClick={onClose} aria-label="Close" className="text-lg text-ink/50 hover:text-ink">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#525659] p-4">
          {failed ? (
            <p className="mx-auto max-w-md py-10 text-center text-sm text-white/80">
              This dynamic Adobe (XFA) form couldn’t be rendered in the browser. Please download it and open
              in Adobe Acrobat Reader to view and fill it out.
            </p>
          ) : (
            <Document
              file={url}
              options={DOC_OPTIONS}
              onLoadSuccess={(doc) => setNumPages(doc.numPages)}
              onLoadError={() => setFailed(true)}
              onSourceError={() => setFailed(true)}
              loading={<p className="py-10 text-center text-sm text-white/70">Loading…</p>}
            >
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i}
                  pageNumber={i + 1}
                  width={760}
                  className="mx-auto mb-3 shadow-lg"
                  renderTextLayer
                  renderAnnotationLayer
                />
              ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
