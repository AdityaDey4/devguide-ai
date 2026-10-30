// Tiny helpers used by more than one step.

/** The element that holds a page's real content. */
export const MAIN_SELECTOR = "main, article, [role='main']";

/** Text of an element with whitespace squashed: "a\n   b" becomes "a b". */
export const text = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** If the line opens or closes a fenced code block, returns its ``` or ~~~ run. */
export function fenceMarker(line: string): string | undefined {
  return line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
}

/** True if `marker` closes a fence that was opened with `open`. */
export function closesFence(marker: string | undefined, open: string): boolean {
  return (
    marker !== undefined &&
    marker[0] === open[0] &&
    marker.length >= open.length
  );
}
