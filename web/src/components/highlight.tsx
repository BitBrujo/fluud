import { matchRange } from "@/lib/instrument-query";

/**
 * The matched substring of a list field, marked.
 *
 * ⚠️ **The range comes from `matchRange`, which is the filter's own
 * normalisation** — `matchesText` is defined in terms of it, so a row the
 * filter accepts always has something for this to mark. Computing the range
 * here with different case or trim rules would put the mark on the wrong
 * characters, which reads as a broken search rather than a styling bug.
 *
 * ⚠️ **`text-inherit` is load-bearing.** The UA default for `<mark>` is black
 * text on system yellow — on this page that is a reading suddenly rendered in
 * a warning-adjacent colour the palette does not own. `--wl-select` at 22% is
 * the selection tint: a fact about what the reader typed, on no scale, same as
 * every other magenta on the page.
 *
 * Marks only the FIRST occurrence, exactly as `matchRange` reports it. The
 * filter needs one hit to accept a row, so one mark is the honest rendering of
 * why the row is here.
 */
export function Highlight({ text, search }: { text: string; search: string }) {
  const range = matchRange(text, search);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range.start)}
      <mark className="bg-[var(--wl-select)]/22 text-inherit">
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  );
}
