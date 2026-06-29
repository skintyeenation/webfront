'use client';

// In-page viewer for funding templates. `url` is the browser-viewable version (an HTML
// preview for the dynamic XFA forms, or the PDF itself for normal ones); `downloadUrl` is
// always the original PDF to fill in Adobe Acrobat Reader.
export function PdfViewerModal({
  url,
  downloadUrl,
  title,
  onClose,
}: {
  url: string;
  downloadUrl: string;
  title: string;
  onClose: () => void;
}) {
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
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline"
            >
              ↓ Download to fill
            </a>
            <button onClick={onClose} aria-label="Close" className="text-lg text-ink/50 hover:text-ink">
              ✕
            </button>
          </div>
        </div>
        <iframe src={url} title={title} className="h-full w-full flex-1 bg-white" />
      </div>
    </div>
  );
}
