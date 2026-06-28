import { expandAcronym } from '@skintyee/models';

// Wraps an acronym (PAW, DCI, FNIIP, BSF…) and shows its full name on hover/tap
// via the ISC glossary. Falls back to plain text when the acronym isn't known.
export function Acronym({ children }: { children: string }) {
  const full = expandAcronym(children);
  if (!full) return <>{children}</>;
  return (
    <abbr
      title={full}
      className="cursor-help text-inherit decoration-dotted decoration-ink/40 underline-offset-2 [text-decoration-line:underline]"
    >
      {children}
    </abbr>
  );
}
