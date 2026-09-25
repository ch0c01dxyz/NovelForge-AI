/**
 * Spoiler control (Phase 5).
 *
 * CLAUDE.md §10: "Never assume that information stored in the database is
 * safe to show to readers. Reader-facing AI must obey the same spoiler
 * boundaries." Retrieval is where that rule is either enforced or lost —
 * a reader-mode query that returns a chunk from chapter 400 is a spoiler
 * regardless of how good the ranking was.
 *
 * This module is the single predicate every retrieval path must pass
 * through. It is pure and deny-by-default: an unknown mode, a missing
 * boundary, or a missing reader position refuses rather than permits,
 * because the failure mode of being too permissive here is publishing the
 * ending.
 */

export const VIEW_MODES = ["AUTHOR", "EDITOR", "READER"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * Where a knowledge item becomes visible.
 *
 * `availableFromChapter` is the chapter number at which the information
 * enters the reader's world (CLAUDE.md §10). `null` means it is not
 * reader-visible at all — an author's private note, a research reference,
 * a candidate fact — which is the safe default for anything not
 * explicitly published.
 */
export interface SpoilerBoundary {
  availableFromChapter: number | null;
}

export interface ViewerContext {
  mode: ViewMode;
  /**
   * The chapter the reader has reached. Required in READER mode; ignored
   * in AUTHOR/EDITOR mode. A reader who has not started is chapter 0, and
   * sees only items available from chapter 0.
   */
  readerChapter?: number;
}

/**
 * May this item be shown?
 *
 * AUTHOR and EDITOR see everything: an editor reviewing chapter 3 needs
 * the chapter 400 notes to check foreshadowing, and hiding them would
 * make continuity work impossible. Only READER mode is bounded, which is
 * the mode the product exposes to people who have not read ahead.
 */
export function canView(boundary: SpoilerBoundary, viewer: ViewerContext): boolean {
  if (viewer.mode === "AUTHOR" || viewer.mode === "EDITOR") return true;

  // READER: anything not explicitly scheduled is withheld. An item with no
  // boundary has not been classified, and an unclassified item cannot be
  // assumed safe.
  if (boundary.availableFromChapter === null) return false;

  // A reader with no recorded position is treated as being at the start,
  // not as unbounded. Defaulting the other way would expose the whole
  // novel on a missing field.
  const at = viewer.readerChapter ?? 0;
  if (!Number.isFinite(at) || at < 0) return false;

  return boundary.availableFromChapter <= at;
}

/**
 * Filter items for a viewer.
 *
 * Exported as the single predicate for any caller holding a LIST, so a new
 * retrieval path cannot forget the check. Note that no caller uses it today:
 * the API's search applies `canView` per hit inside its SQL-filtered
 * assembly loop, where it also counts what was withheld, and the executor's
 * RETRIEVAL step delegates to that same search. Kept because the next
 * caller that has a list in hand should reach for this rather than
 * re-deriving the comparison.
 */
export function visibleTo<T extends SpoilerBoundary>(
  items: readonly T[],
  viewer: ViewerContext,
): T[] {
  return items.filter((item) => canView(item, viewer));
}

/**
 * Whether a mode may read unpublished (DRAFT) source material at all.
 * A reader sees only published prose; an editor or author may read drafts.
 */
export function canReadDrafts(mode: ViewMode): boolean {
  return mode === "AUTHOR" || mode === "EDITOR";
}

/**
 * Resolve a raw mode string from a request. Deny-by-default: anything
 * unrecognised is READER, the most restrictive mode, so a typo or a
 * missing parameter cannot widen access.
 */
export function parseViewMode(raw: unknown): ViewMode {
  return typeof raw === "string" && (VIEW_MODES as readonly string[]).includes(raw)
    ? (raw as ViewMode)
    : "READER";
}
