/**
 * Anonymous reading progress (NF-WF-014, Invariant 5).
 *
 * Device-local only: NO server storage, NO reader accounts, NO cookies
 * sent to the server, NO network calls — this composable never calls
 * fetch. Progress lives in localStorage under the versioned key
 * `nf:reading-progress:v1` (the useLocale.ts precedent: feature-detect
 * localStorage, try/catch around access, namespaced key).
 *
 * Stored per novel slug: { chapterNumber, updatedAt } — chapter
 * granularity only (Q5: no scroll position). Written by the chapter
 * page on a successful (200) load of a PUBLISHED chapter — never on
 * 404. Read lazily by the browse page's "continue reading" section
 * and the novel page's "you stopped at" marker; entries whose chapter
 * 404s are dropped silently (no "removed" oracle — the generic
 * not-found copy applies).
 *
 * Privacy: progress never leaves the device. Multi-device sync is
 * 019's (the :v1 schema is migration-ready).
 */
export interface ReadingProgressEntry {
  chapterNumber: number;
  updatedAt: string;
}

const STORAGE_KEY = "nf:reading-progress:v1";

function readAll(): Record<string, ReadingProgressEntry> {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: Record<string, ReadingProgressEntry> = {};
    for (const [slug, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as { chapterNumber?: unknown }).chapterNumber ===
          "number" &&
        typeof (entry as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        out[slug] = {
          chapterNumber: (entry as ReadingProgressEntry).chapterNumber,
          updatedAt: (entry as ReadingProgressEntry).updatedAt,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, ReadingProgressEntry>): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — progress is best-effort, session-scoped */
  }
}

export function useReadingProgress() {
  /**
   * Record that the reader reached a chapter of a novel. Call only
   * after a successful (200) chapter-page load — never on 404.
   */
  function markRead(slug: string, chapterNumber: number): void {
    if (!slug || !Number.isInteger(chapterNumber) || chapterNumber < 1)
      return;
    const all = readAll();
    all[slug] = { chapterNumber, updatedAt: new Date().toISOString() };
    writeAll(all);
  }

  /** The stored entry for a slug, or null. */
  function getProgress(slug: string): ReadingProgressEntry | null {
    return readAll()[slug] ?? null;
  }

  /** Drop an entry (e.g. its chapter 404s — no "removed" oracle). */
  function dropProgress(slug: string): void {
    const all = readAll();
    if (slug in all) {
      delete all[slug];
      writeAll(all);
    }
  }

  /** All entries, newest first (for the continue-reading section). */
  function listProgress(): Array<{ slug: string } & ReadingProgressEntry> {
    return Object.entries(readAll())
      .map(([slug, entry]) => ({ slug, ...entry }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return { markRead, getProgress, dropProgress, listProgress };
}
