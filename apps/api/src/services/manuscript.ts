/**
 * @novelforge/api — manuscript services (Phase 2: chapters; NF-WF-015:
 * scene CRUD + sanitized-HTML chapter content).
 *
 * Chapter content is versioned immutably: every save appends a
 * chapter_versions row and moves the chapter's current pointer; content
 * is never updated in place (blueprint §Versioning: "immutable revision
 * records"). Tenant gate reuses the platform membership check (404 for
 * non-members per ADR-0004).
 *
 * NF-WF-015 (Invariant 2): `ChapterVersion.content` carries sanitized
 * HTML. The server sanitizes on every `saveChapter` write (before the
 * word count and the version insert) against the pinned allowlist, and
 * `wordCount` is computed on tag-stripped text.
 */
import type { PrismaClient } from "@novelforge/database";
import sanitizeHtml from "sanitize-html";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
// Shared error vocabulary with the platform services; requireCapability
// throws the auth-package ForbiddenError, which the platform routes'
// setErrorHandler (registered once for the whole app) maps to 403.
import { NotFoundError, ConflictError } from "@novelforge/ai-services";
import { PolicyError, checkFinalTextReviewGate } from "@novelforge/ai-services";
import type { AuditService } from "@novelforge/ai-services";
// The head CAS every covered mutation must take inside its own transaction
// (STORY-VERSIONING.md C3/C4). Imported directly rather than threaded through
// the factory: the boundary call has to share the caller's `tx`.
import { advanceForMutation, assertHeadExpectation, type RevisionTx } from "./revisions.ts";
// NF-WF-017A: the unified import normalization pipeline (TXT/Markdown/
// PDF/DOCX → import parts). The write path below consumes `ImportPart`.
import {
  extractPdfText,
  normalizeDocxImport,
  normalizeTextImport,
  validateImportFile,
  type ImportFormat,
  type ImportPart,
} from "./import-normalize.ts";
// NF-WF-017B: export rendering (HTML → TXT/Markdown/PDF/DOCX/EPUB).
import { renderExport, type ExportFormat } from "./export-render.ts";

/** Serialize scene mutations with checkout/restore before taking child locks. */
async function lockManuscriptBranch(tx: RevisionTx, novelId: string) {
  await tx.$queryRawUnsafe(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`, novelId);
  const novel = await tx.novel.findUniqueOrThrow({ where: { id: novelId }, select: { currentBranchId: true } });
  const branch = await tx.novelBranch.findFirst({
    where: novel.currentBranchId ? { id: novel.currentBranchId, novelId } : { novelId, name: "main" },
    select: { id: true, name: true },
  });
  if (!branch) throw new ConflictError("no checked-out branch exists");
  await tx.$queryRawUnsafe(`SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`, branch.id);
  return branch;
}

export interface ManuscriptServices {
  createChapter(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    title: string;

  }): Promise<{ id: string; number: number }>;
  listChapters(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;

  }): Promise<
    Array<{
      id: string;
      number: number;
      title: string;
      status: string;
      wordCount: number;
      currentVersion: number | null;
      updatedAt: Date;
    }>
  >;
  getChapter(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;

  }): Promise<{
    id: string;
    number: number;
    title: string;
    status: string;
    wordCount: number;
    currentVersion: number | null;
    content: string;
    updatedAt: Date;
  }>;
  /** Appends a new immutable version; returns its number. */
  saveChapter(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;

    content: string;
    note?: string;
    /** Optimistic concurrency: version number the author last saw. */
    expectedVersion: number | null;
  }): Promise<{ version: number; wordCount: number }>;
  deleteChapter(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;

  }): Promise<void>;
  setStatus(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    status: "IN_REVIEW" | "PUBLISHED";
  }): Promise<void>;
  importChapters(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    text: string;
    format: "md" | "txt";
    /** NF-WF-002D: the head the caller's plan was built against (C12.1). */
    expectedHeadRevisionId?: string | null;
  }): Promise<{ created: number; skipped: string[] }>;
  /** NF-WF-017A: file import (multipart) — validated, extracted, normalized. */
  importChaptersFromFile(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    buffer: Buffer;
    mimeType?: string;
    filename?: string;
    declaredFormat?: ImportFormat;
    expectedHeadRevisionId?: string | null;
  }): Promise<{ created: number; skipped: string[] }>;
  exportNovel(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    format?: ExportFormat;
  }): Promise<{ filename: string; contentType: string; buffer: Buffer }>;
  /** Version history, newest first (manuscript safety / recovery). */
  listVersions(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
  }): Promise<
    Array<{ number: number; wordCount: number; note: string | null; createdAt: Date }>
  >;
  /** Restore an old version by appending it as a NEW version (non-destructive). */
  restoreVersion(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    versionNumber: number;
  }): Promise<{ version: number }>;
  /** Scene anchors (NF-WF-015, Invariant 6): structural only, no content. */
  listScenes(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
  }): Promise<Array<{ id: string; number: number; title: string; summary: string | null }>>;
  createScene(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    title: string;
    summary?: string | null;
    /** Desired 1-based position; defaults to max+1. */
    number?: number | null;
  }): Promise<{ id: string; number: number; title: string; summary: string | null }>;
  updateScene(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    sceneId: string;
    title?: string;
    summary?: string | null;
    /** Desired 1-based position (reorder, transactional). */
    number?: number;
  }): Promise<{ id: string; number: number; title: string; summary: string | null }>;
  deleteScene(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    sceneId: string;
  }): Promise<{
    deletedBeats: Array<{ id: string; title: string; order: number; sagaId: string }>;
  }>;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * NF-WF-015 (Invariant 2): the shared tag-strip rule. Each tag is
 * replaced with a space (so `</p><p>` does not fuse words); the result
 * feeds `countWords`. Used by the save path and reused by the
 * publication path (`resolvePublicChapter`).
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/**
 * NF-WF-017C (Invariant 3): the documented offset-mapping rule between
 * raw (sanitized-HTML) content offsets and tag-stripped text offsets.
 *
 * Spans stay raw-content offsets in storage (no migration, no rescoring
 * of existing rows); evidence verification runs on stripped text, so
 * each raw offset i (0 <= i <= html.length) maps to a stripped offset
 * m(i):
 * - a raw offset outside any tag maps to the stripped offset of the
 *   same character (stripped advances one-per-character with raw,
 *   minus consumed tag characters plus one space per tag);
 * - a raw offset strictly inside a tag maps to the stripped offset of
 *   the single space that replaced the tag (the strip rule replaces
 *   each tag with exactly one space).
 *
 * The map is monotone non-decreasing and m(html.length) ===
 * stripped.length. The returned `stripped` is byte-identical to
 * `stripHtmlTags(html)` (one pass, same regex). Precondition: none —
 * out-of-range raw offsets saturate to `stripped.length`; callers
 * validate bounds first via the frozen `verifySpan`.
 */
export function stripHtmlWithOffsetMap(html: string): {
  stripped: string;
  toStripped: (rawOffset: number) => number;
} {
  const tagRe = /<[^>]*>/g;
  const parts: string[] = [];
  const map: number[] = [];
  let raw = 0;
  let strippedLen = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    for (let i = raw; i < m.index; i++) {
      map[i] = strippedLen + (i - raw);
    }
    parts.push(html.slice(raw, m.index));
    strippedLen += m.index - raw;
    for (let i = m.index; i < m.index + m[0].length; i++) {
      map[i] = strippedLen;
    }
    parts.push(" ");
    strippedLen += 1;
    raw = m.index + m[0].length;
  }
  for (let i = raw; i <= html.length; i++) {
    map[i] = strippedLen + (i - raw);
  }
  parts.push(html.slice(raw));
  const stripped = parts.join("");
  return {
    stripped,
    toStripped: (rawOffset: number) => map[rawOffset] ?? stripped.length,
  };
}

/**
 * NF-WF-017C (Invariant 3): whitespace normalization for quote
 * verification. The strip rule replaces each tag with a space, so a
 * quote spanning an inline-tag boundary carries a whitespace artifact
 * that is not part of the prose (`<strong>the</strong> dark forest`
 * strips to ` the  dark forest`). Collapsing whitespace runs (and
 * trimming ends) compares what the reader sees; it never loosens
 * non-whitespace content.
 */
export function normalizeQuoteWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * NF-WF-017C (Invariant 3): strip-aware evidence-quote verification.
 *
 * `start`/`end` are raw-content offsets into the stored
 * (sanitized-HTML) `content`; `quote` is prose. The raw span is mapped
 * onto tag-stripped text through the shared strip rule and compared:
 * exact first (the frozen 008 rule — plain-text rows and spans that do
 * not cross tag boundaries verify exactly as before), then the
 * whitespace-normalized fallback for the tag-boundary space artifact.
 * A quote that is not the span's prose under either comparison fails.
 *
 * Bounds are not checked here: callers run the frozen `verifySpan` on
 * the raw content first (its bounds semantics are unchanged).
 */
export function verifyEvidenceQuote(
  content: string,
  start: number,
  end: number,
  quote: string,
): boolean {
  const { stripped, toStripped } = stripHtmlWithOffsetMap(content);
  const sStart = toStripped(start);
  const sEnd = toStripped(end);
  if (sStart > sEnd) return false;
  const spanText = stripped.slice(sStart, sEnd);
  if (spanText === quote) return true;
  return (
    normalizeQuoteWhitespace(spanText) === normalizeQuoteWhitespace(quote)
  );
}

/**
 * NF-WF-017C (Invariant 3): strip-aware "does this chapter's prose
 * contain the quote" check — the 008 fact-source pin in
 * `canon-applications.ts` on HTML content. Exact substring first (the
 * frozen behavior), then the stripped text, then the
 * whitespace-normalized fallback for quotes split by inline tags. A
 * whitespace-only quote never matches via normalization.
 */
export function strippedContentIncludes(content: string, quote: string): boolean {
  if (content.includes(quote)) return true;
  const stripped = stripHtmlTags(content);
  if (stripped.includes(quote)) return true;
  const normalizedQuote = normalizeQuoteWhitespace(quote);
  if (normalizedQuote === "") return false;
  return normalizeQuoteWhitespace(stripped).includes(normalizedQuote);
}

/**
 * NF-WF-015 (Invariant 2): the pinned sanitized-HTML allowlist.
 * `p, h2, blockquote, strong, em, ul, ol, li, hr, br` — no attributes,
 * no `script`/`style`/`iframe`, no event handlers, no `h1` (chapter
 * titles are metadata, not prose). `disallowedTagsMode: "discard"` drops
 * a disallowed tag but keeps its inner text as prose (so a `<script>`
 * payload becomes inert text, never code). Idempotent:
 * `sanitize(sanitize(x)) === sanitize(x)`.
 *
 * Q2 decision of record: `sanitize-html` (implementer pick; the Invariant
 * 2 allowlist is pinned here and mirrored by the reader page).
 */
const CHAPTER_HTML_ALLOWLIST = [
  "p",
  "h2",
  "blockquote",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
] as const;

export function sanitizeChapterHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...CHAPTER_HTML_ALLOWLIST],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    allowProtocolRelative: false,
  });
}

/**
 * NF-WF-012 (Invariant 3, GAP-045): the publish review gate as a shared
 * helper. Any transition whose TARGET is PUBLISHED requires a PASS
 * `FinalTextReview` receipt keyed to the chapter's current version —
 * whether the source is DRAFT or IN_REVIEW. The receipt's verdict is the
 * whole contract (the 010 precedent): no receipt → 409 REVIEW_STALE;
 * FAIL verdict → 409 HARD_POLICY_VIOLATION.
 *
 * Used by `setStatus` (manuscript) and the publication service
 * (`publishChapter`, fire-time check) so both paths enforce the same
 * rule. Takes a live `db` or a transaction client — the publication
 * service calls it inside its locked transaction.
 */
export async function assertPublishReviewGate(
  tx: PrismaClient,
  input: {
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
  },
): Promise<void> {
  // 050B: use the shared transactional gate (API and worker use the same
  // helper). The caller must hold the lock order (novel NO KEY UPDATE ->
  // branch UPDATE -> chapter UPDATE) before calling.
  const result = await checkFinalTextReviewGate(tx as never, input);
  if (result.ok) return;
  // Map gate codes to typed PolicyError.
  if (result.code === "REVIEW_STALE") {
    throw new PolicyError(
      "REVIEW_STALE",
      `chapter has no current final-text review receipt for its version — review it before publishing`,
    );
  }
  if (result.code === "SCALE_ASSESSMENT_INCOMPLETE") {
    throw new PolicyError(
      "SCALE_ASSESSMENT_INCOMPLETE",
      `SCALE assessment is incomplete for a HARD policy — complete the assessment before publishing`,
    );
  }
  throw new PolicyError(
    "HARD_POLICY_VIOLATION",
    `final-text review failed with a HARD policy violation — see the review receipt for evidence`,
  );
}

export function createManuscriptServices(
  db: PrismaClient,
  audit?: AuditService,
  dbg?: { error?: (message: string, meta?: Record<string, unknown>) => void },
): ManuscriptServices {
  /** Membership gate — 404 for non-members (ADR-0004), role for caps. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
    requireCapability(membership.role, cap);
    return membership.role;
  }

  async function getChapterOr404(chapterId: string, novelId: string) {
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { currentVersion: { select: { number: true, content: true } } },
    });
    if (!chapter) throw new NotFoundError("chapter");
    return chapter;
  }

  /**
   * NF-WF-017A: the shared atomic import write path (paste + file).
   * Every part lands as a DRAFT chapter with one version, `note:
   * "import"` — imported material is source material, never canon
   * (Invariant 4). GAP-061: the write runs the SAME sanitize → strip →
   * count sequence as `saveChapter`, so no import path writes raw
   * content.
   */
  async function writeImportParts(args: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    expectedHeadRevisionId?: string | null;
    format: string;
    parts: ImportPart[];
    skipped: string[];
  }): Promise<{ created: number; skipped: string[] }> {
    const importable = args.parts.filter((p) => p.rawText.trim());
    if (importable.length === 0) return { created: 0, skipped: args.skipped };
    // One transaction: import is atomic (no partial chapters on failure)
    // and the novel-row lock serializes numbering against concurrent
    // createChapter/saveChapter (CLAUDE.md §12 transactional integrity).
    let created = 0;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM novels WHERE id = ${args.novelId} FOR UPDATE`;
      // HIGH (C3): the import captures a mandatory PRE_MUTATION checkpoint
      // and snapshot in this same transaction, pinned to the pre-import
      // head. A bulk import is exactly the operation a checkpoint is for.
      // It runs before the loop, not after: `captureSnapshot` reads the live
      // tables, so advancing last would file the post-import chapters under a
      // PRE_MUTATION label and restoring the checkpoint would remove nothing
      // (GAP-024). One advance for the whole import, not one per part.
      await advanceForMutation(tx, {
        workspaceId: args.workspaceId,
        novelId: args.novelId,
        expectedHeadRevisionId: args.expectedHeadRevisionId,
        operation: "chapters.import",
        origin: "MANUAL",
        actorUserId: args.actorUserId,
        tables: ["chapters", "chapter_versions"],
        items: [{ entityType: "Novel", entityId: args.novelId, operation: "UPDATE" }],
      });
      let next =
        (
          await tx.chapter.findFirst({
            where: { novelId: args.novelId },
            orderBy: { number: "desc" },
            select: { number: true },
          })
        )?.number ?? 0;
      for (const part of importable) {
        next += 1;
        const chapter = await tx.chapter.create({
          data: {
            novelId: args.novelId,
            number: next,
            title: part.title.slice(0, 200),
            createdById: args.actorUserId,
          },
        });
        // GAP-061: sanitize BEFORE the word count and the version insert,
        // exactly like saveChapter — imported HTML is untrusted input.
        const cleanContent = sanitizeChapterHtml(part.htmlBody);
        const wordCount = countWords(stripHtmlTags(cleanContent));
        const version = await tx.chapterVersion.create({
          data: {
            chapterId: chapter.id,
            number: 1,
            content: cleanContent,
            wordCount,
            note: "import",
            authorId: args.actorUserId,
          },
        });
        await tx.chapter.update({
          where: { id: chapter.id },
          data: { currentVersionId: version.id, wordCount: version.wordCount },
        });
        created++;
      }
    });
    await audit?.record({
      actorUserId: args.actorUserId,
      workspaceId: args.workspaceId,
      action: "chapters.imported",
      entityType: "Novel",
      entityId: args.novelId,
      payload: { format: args.format, created, skipped: args.skipped },
    });
    return { created, skipped: args.skipped };
  }

  return {
    async createChapter({ actorUserId, workspaceId, novelId, title }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:create");

      // Novel-row lock serializes numbering against importChapters (same
      // lock) and concurrent creates; max+1 cannot collide under it.
      const chapter = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR UPDATE`;
        const max = await tx.chapter.findFirst({
          where: { novelId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const created = await tx.chapter.create({
          data: {
            novelId,
            number: (max?.number ?? 0) + 1,
            title,
            createdById: actorUserId,
          },
        });
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.create",
          origin: "MANUAL",
          actorUserId,
          tables: ["chapters"],
          items: [{ entityType: "Chapter", entityId: created.id, operation: "CREATE" }],
        });
        return created;
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "chapter.created",
        entityType: "Chapter",
        entityId: chapter.id,
        payload: { novelId, number: chapter.number, title },
      });
      return { id: chapter.id, number: chapter.number };
    },

    async listChapters({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:read");
      const chapters = await db.chapter.findMany({
        where: { novelId },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          wordCount: true,
          updatedAt: true,
          currentVersion: { select: { number: true } },
        },
      });
      return chapters.map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        status: c.status,
        wordCount: c.wordCount,
        currentVersion: c.currentVersion?.number ?? null,
        updatedAt: c.updatedAt,
      }));
    },

    async getChapter({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:read");
      const chapter = await getChapterOr404(chapterId, novelId);
      return {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        status: chapter.status,
        wordCount: chapter.wordCount,
        currentVersion: chapter.currentVersion?.number ?? null,
        content: chapter.currentVersion?.content ?? "",
        updatedAt: chapter.updatedAt,
      };
    },

    async saveChapter({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      content,
      note,
      expectedVersion,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      const chapter = await getChapterOr404(chapterId, novelId);

      const current = chapter.currentVersion?.number ?? null;
      if (expectedVersion !== current) {
        throw new ConflictError(
          `stale version: expected ${expectedVersion}, current ${current}`,
        );
      }
      if (chapter.status === "PUBLISHED") {
        throw new ConflictError("published chapters are immutable; unpublish first");
      }

      // NF-WF-015 (Invariant 2): sanitize on write, BEFORE the word count
      // and the version insert, so every stored version is clean. The
      // word count is computed on tag-stripped text (tags are not words).
      const cleanContent = sanitizeChapterHtml(content);
      const wordCount = countWords(stripHtmlTags(cleanContent));
      // Version append + pointer move in one transaction.
      const version = await db.$transaction(async (tx) => {
        const branch = await lockManuscriptBranch(tx, novelId);
        // Serialize concurrent saves on the same chapter row.
        await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`;
        const fresh = await tx.chapter.findUnique({
          where: { id: chapterId },
          select: {
            status: true,
            currentVersion: { select: { number: true } },
          },
        });
        if (!fresh) throw new NotFoundError("chapter"); // deleted mid-save
        if (fresh.status === "PUBLISHED") {
          throw new ConflictError("published chapters are immutable; unpublish first");
        }
        const nowCurrent = fresh?.currentVersion?.number ?? null;
        if (expectedVersion !== nowCurrent) {
          throw new ConflictError(
            `stale version: expected ${expectedVersion}, current ${nowCurrent}`,
          );
        }
        const last = await tx.chapterVersion.findFirst({
          where: { chapterId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const created = await tx.chapterVersion.create({
          data: {
            chapterId,
            number: (last?.number ?? 0) + 1,
            content: cleanContent,
            wordCount,
            note,
            authorId: actorUserId,
          },
        });
        await tx.chapter.update({
          where: { id: chapterId },
          data: { currentVersionId: created.id, wordCount },
        });
        // C10 step 1: a LOW save still produces a revision — one UPDATE
        // chapters and one CREATE chapter_versions — with no checkpoint.
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.save",
          branchName: branch.name,
          origin: "MANUAL",
          actorUserId,
          tables: ["chapters", "chapter_versions"],
          items: [
            { entityType: "ChapterVersion", entityId: created.id, operation: "CREATE" },
            { entityType: "Chapter", entityId: chapterId, operation: "UPDATE" },
          ],
        });
        return created.number;
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "chapter.saved",
        entityType: "ChapterVersion",
        entityId: chapterId,
        payload: { chapterId, version, wordCount, note: note ?? null },
      });
      return { version, wordCount };
    },

    async deleteChapter({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:delete");
      const chapter = await getChapterOr404(chapterId, novelId);
      // Published manuscripts are not silently destroyable — same
      // immutability rule saveChapter enforces (CLAUDE.md §9).
      if (chapter.status === "PUBLISHED") {
        throw new ConflictError("published chapters cannot be deleted; unpublish first");
      }
      await db.$transaction(async (tx) => {
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.delete",
          origin: "MANUAL",
          actorUserId,
          tables: ["chapters", "chapter_versions"],
          items: [{ entityType: "Chapter", entityId: chapterId, operation: "DELETE" }],
        });
        // NF-WF-050A S1: scale_evidence_sets.chapter_version_id is ON DELETE
        // RESTRICT, so a chapter whose versions carry SCALE evidence
        // assessments cannot be deleted. Assessments are immutable historical
        // records — they are retained, never deleted to permit the chapter's
        // deletion. Check proactively inside this transaction (after the
        // mutation lock) so the refusal is a legible 409 instead of an
        // uncaught FK 500.
        const scaleRef = await tx.scaleEvidenceSet.findFirst({
          where: { chapterVersion: { chapterId } },
          select: { id: true },
        });
        if (scaleRef) {
          throw new ConflictError(
            "this chapter has SCALE evidence assessments — assessments are retained " +
              "and cannot be deleted with the chapter",
          );
        }
        await tx.chapter.delete({ where: { id: chapterId } }).catch((e: unknown) => {
        // canon_fact_sources.chapter_version_id is ON DELETE RESTRICT, so a
        // chapter carrying canon evidence cannot be deleted. That refusal is
        // the point — a citation is the only place a fact's span is stored,
        // and cascading it away used to leave an ACTIVE fact claiming support
        // it could no longer show. But the refusal must be legible and must
        // have a way out, or it is just an unrecoverable 500 (the remedy the
        // migration comment promises, `DELETE .../canon/facts/:id/sources`,
        // is what makes it recoverable).
        const code = (e as { code?: string })?.code;
        if (code === "P2003" || code === "P2039") {
          // NF-WF-050A S1: the proactive scale-evidence check above should
          // have refused first, but the RESTRICT FK is the ultimate guard
          // (e.g. a race with assessment creation between the check and the
          // delete). Distinguish by constraint reference when available.
          const errText =
            String((e as { message?: string })?.message ?? "") +
            JSON.stringify((e as { meta?: unknown })?.meta ?? "");
          if (/scale_evidence_sets/i.test(errText)) {
            dbg?.error?.("chapter delete blocked by a SCALE evidence assessment", { err: e });
            throw new ConflictError(
              "this chapter has SCALE evidence assessments — assessments are retained " +
                "and cannot be deleted with the chapter",
            );
          }
          dbg?.error?.("chapter delete blocked by a canon citation", { err: e });
          throw new ConflictError(
            "this chapter is cited as evidence by a canon fact — unlink the evidence " +
              "on those facts first, then delete the chapter",
          );
        }
          throw e;
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "chapter.deleted",
        entityType: "Chapter",
        entityId: chapterId,
        payload: { novelId, number: chapter.number, title: chapter.title },
      });
    },

    async setStatus({ actorUserId, workspaceId, novelId, chapterId, status }) {
      await gate(
        workspaceId,
        novelId,
        actorUserId,
        status === "PUBLISHED" ? "chapter:publish" : "chapter:update",
      );
      const chapter = await getChapterOr404(chapterId, novelId);
      if (status === "PUBLISHED" && !chapter.currentVersion) {
        throw new ConflictError("cannot publish a chapter with no content");
      }
      // NF-WF-010: the final-text review gate (Invariant 4), extended by
      // NF-WF-012 (Invariant 3, GAP-045). Any transition OUT of DRAFT
      // requires a PASS receipt for the chapter's current version — the
      // receipt is keyed by chapterVersionId, so a version mismatch (the
      // author edited after review) reads as "no receipt for the current
      // version" (constitution §11). This IS an explicit product behavior
      // change owned by 010.
      //
      // NF-WF-012 supersedes 010's carve-out for the PUBLISHED target
      // only: any transition whose TARGET is PUBLISHED (from DRAFT or
      // IN_REVIEW) requires the receipt. The carve-out left a hole — an
      // author could save a NEW (unreviewed) version while IN_REVIEW and
      // publish it through the ungated IN_REVIEW→PUBLISHED path, so the
      // public would see text no review ever approved. The
      // PUBLISHED→IN_REVIEW "unpublish" path stays ungated.
      // (The route only accepts IN_REVIEW|PUBLISHED as the target status.)
      //
      // 050B: the gate runs INSIDE the locked transaction below (see
      // "050B: gate before writes"). The old outside-tx gate is removed.
      // A status change is a covered mutation like any other and takes the
      // head CAS (C3 LOW). `chapters.status` is deliberately NOT in the
      // snapshot payload (C7) — restore never rewinds publication — so the
      // revision records the change while the state restore can see does not
      // include it.
      //
      // 050B: the review gate runs INSIDE the locked transaction. Lock order:
      // novel NO KEY UPDATE -> checked-out branch UPDATE -> chapter UPDATE.
      // The gate re-reads the receipt and validates ALL pins before writes.
      await db.$transaction(async (tx) => {
        // Lock novel.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`,
          novelId,
        );
        const lockedNovel = await tx.novel.findFirst({
          where: { id: novelId, workspaceId },
          select: { id: true, currentBranchId: true },
        });
        if (!lockedNovel || !lockedNovel.currentBranchId) {
          throw new NotFoundError("novel");
        }
        // Lock the checked-out branch.
        await tx.$queryRawUnsafe(
          `SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`,
          lockedNovel.currentBranchId,
        );
        // Lock the chapter and re-read status/version inside the tx.
        await tx.$queryRawUnsafe(
          `SELECT id FROM chapters WHERE id = $1 FOR UPDATE`,
          chapterId,
        );
        const lockedChapter = await tx.chapter.findUnique({
          where: { id: chapterId },
          select: { id: true, status: true, currentVersionId: true },
        });
        if (!lockedChapter) throw new NotFoundError("chapter");

        // 050B: gate before writes, using the locked tx.
        if (lockedChapter.status === "DRAFT" || status === "PUBLISHED") {
          if (lockedChapter.currentVersionId) {
            await assertPublishReviewGate(tx as never, {
              workspaceId,
              novelId,
              chapterId,
              chapterVersionId: lockedChapter.currentVersionId,
            });
          } else {
            throw new PolicyError(
              "REVIEW_STALE",
              `chapter has no content version to review — save a version and review it before leaving DRAFT`,
            );
          }
        }

        const branch = await lockManuscriptBranch(tx, novelId);
        await tx.chapter.update({ where: { id: chapterId }, data: { status } });
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.setStatus",
          branchName: branch.name,
          origin: "MANUAL",
          actorUserId,
          tables: ["chapters"],
          items: [{ entityType: "Chapter", entityId: chapterId, operation: "UPDATE" }],
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: status === "PUBLISHED" ? "chapter.published" : "chapter.unpublished",
        entityType: "Chapter",
        entityId: chapterId,
        payload: { from: chapter.status, to: status },
      });
    },

    /**
     * Import: split plain/Markdown text into chapters on Markdown ATX
     * headings (`# Title` / `## Title`) or the first TXT separator line.
     * Imported material is NOT canon (CLAUDE.md §32): chapters land as
     * DRAFT with one version each, author review happens in the editor.
     */
    /**
     * Import: split plain/Markdown text into chapters on Markdown ATX
     * headings (`# Title` / `## Title`) or the first TXT separator line.
     * Imported material is NOT canon (CLAUDE.md §32): chapters land as
     * DRAFT with one version each, author review happens in the editor.
     *
     * NF-WF-017A: text normalization (frozen md/txt split → HTML) lives in
     * `import-normalize.ts`; the write below runs the SAME sanitize →
     * strip → count sequence as `saveChapter` (GAP-061: no import path
     * may write raw content).
     */
    async importChapters(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      text: string;
      format: "md" | "txt";
      expectedHeadRevisionId?: string | null;
    }): Promise<{ created: number; skipped: string[] }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:create");
      // Advisory pre-check after the tenant gate, before the parse and any
      // write: a stale plan does no work (NF-WF-002D). The locked CAS inside
      // the transaction below is authoritative.
      await assertHeadExpectation(db, {
        novelId: input.novelId,
        expectedHeadRevisionId: input.expectedHeadRevisionId,
      });
      const parts = normalizeTextImport(input.text, input.format);
      return writeImportParts({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        expectedHeadRevisionId: input.expectedHeadRevisionId,
        format: input.format,
        parts,
        skipped: [],
      });
    },

    /**
     * NF-WF-017A: file import (multipart). Validates the bytes (MIME
     * allowlist, magic-byte sniffing, per-format byte caps,
     * decompression-bomb limits), extracts text per format, normalizes
     * to import parts, then takes the same atomic write path as
     * `importChapters`.
     */
    async importChaptersFromFile(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      buffer: Buffer;
      mimeType?: string;
      filename?: string;
      declaredFormat?: ImportFormat;
      expectedHeadRevisionId?: string | null;
    }): Promise<{ created: number; skipped: string[] }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:create");
      await assertHeadExpectation(db, {
        novelId: input.novelId,
        expectedHeadRevisionId: input.expectedHeadRevisionId,
      });
      const { format } = validateImportFile(input.buffer, {
        mimeType: input.mimeType,
        filename: input.filename,
        declaredFormat: input.declaredFormat,
      });
      if (format === "docx") {
        const { parts, skipped } = await normalizeDocxImport(input.buffer);
        return writeImportParts({
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          expectedHeadRevisionId: input.expectedHeadRevisionId,
          format,
          parts,
          skipped,
        });
      }
      const text =
        format === "pdf"
          ? (await extractPdfText(input.buffer)).text
          : new TextDecoder("utf-8").decode(input.buffer);
      // PDF-extracted text reuses the TXT chapter-splitting rule: page
      // breaks never create chapters.
      const parts = normalizeTextImport(text, format === "md" ? "md" : "txt");
      return writeImportParts({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        expectedHeadRevisionId: input.expectedHeadRevisionId,
        format,
        parts,
        skipped: [],
      });
    },

    /**
     * Export: whole novel in the requested retained format (017B).
     * Source is the frozen 015 sanitized-HTML current-version content,
     * member `chapter:read` scope (includes drafts — the author's own
     * chapters, never the public reader's published-only view).
     */
    async exportNovel(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      format?: ExportFormat;
    }): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:read");
      const novel = await db.novel.findFirst({
        where: { id: input.novelId, workspaceId: input.workspaceId },
        select: { slug: true, title: true },
      });
      const chapters = await db.chapter.findMany({
        where: { novelId: input.novelId },
        orderBy: { number: "asc" },
        include: { currentVersion: { select: { content: true } } },
      });
      const format: ExportFormat = input.format ?? "md";
      const { buffer, contentType, extension } = await renderExport(
        format,
        novel?.title ?? "Novel",
        novel?.slug ?? "novel",
        chapters.map((c) => ({
          number: c.number,
          title: c.title,
          content: c.currentVersion?.content ?? "",
        })),
      );
      // Slug is kebab-validated at creation; sanitize anyway so a future
      // validation regression cannot smuggle quotes/CRLF into the header.
      const safe = (novel?.slug ?? "novel").replace(/[^a-z0-9-]/gi, "");
      return {
        filename: `${safe || "novel"}.${extension}`,
        contentType,
        buffer,
      };
    },

    async listVersions({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:read");
      await getChapterOr404(chapterId, novelId);
      const versions = await db.chapterVersion.findMany({
        where: { chapterId },
        orderBy: { number: "desc" },
        select: { number: true, wordCount: true, note: true, createdAt: true },
      });
      return versions;
    },

    async restoreVersion({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      versionNumber,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      await getChapterOr404(chapterId, novelId);
      const source = await db.chapterVersion.findFirst({
        where: { chapterId, number: versionNumber },
        select: { content: true },
      });
      if (!source) throw new NotFoundError("version");

      // Non-destructive (CLAUDE.md §9): restoring appends the old content
      // as a NEW version — history is never rewritten.
      const version = await db.$transaction(async (tx) => {
        const branch = await lockManuscriptBranch(tx, novelId);
        await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`;
        const fresh = await tx.chapter.findUnique({
          where: { id: chapterId },
          select: { status: true },
        });
        if (!fresh) throw new NotFoundError("chapter");
        if (fresh.status === "PUBLISHED") {
          throw new ConflictError("published chapters are immutable; unpublish first");
        }
        const last = await tx.chapterVersion.findFirst({
          where: { chapterId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const wordCount = countWords(source.content);
        const created = await tx.chapterVersion.create({
          data: {
            chapterId,
            number: (last?.number ?? 0) + 1,
            content: source.content,
            wordCount,
            note: `restore v${versionNumber}`,
            authorId: actorUserId,
          },
        });
        await tx.chapter.update({
          where: { id: chapterId },
          data: { currentVersionId: created.id, wordCount },
        });
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.restore",
          branchName: branch.name,
          origin: "MANUAL",
          actorUserId,
          tables: ["chapters", "chapter_versions"],
          items: [
            { entityType: "ChapterVersion", entityId: created.id, operation: "CREATE" },
            { entityType: "Chapter", entityId: chapterId, operation: "UPDATE" },
          ],
        });
        return created.number;
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "chapter.version-restored",
        entityType: "ChapterVersion",
        entityId: chapterId,
        payload: { chapterId, from: versionNumber, as: version },
      });
      return { version };
    },

    // --- NF-WF-015 (Invariant 6): minimal scene CRUD -------------------
    // Scenes are structural anchors (title/summary/number only): no scene
    // content editing, no scene versioning (GAP-052 follow-up). All four
    // routes reuse the `chapter:update` capability — no new capabilities.
    async listScenes({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      await getChapterOr404(chapterId, novelId);
      const scenes = await db.scene.findMany({
        where: { chapterId },
        orderBy: { number: "asc" },
        select: { id: true, number: true, title: true, summary: true },
      });
      return scenes;
    },

    async createScene({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      title,
      summary,
      number,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      await getChapterOr404(chapterId, novelId);
      // Chapter-row lock serializes numbering against concurrent creates;
      // max+1 cannot collide under it.
      const scene = await db.$transaction(async (tx) => {
        const branch = await lockManuscriptBranch(tx, novelId);
        await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`;
        if (!await tx.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } })) {
          throw new NotFoundError("chapter");
        }
        let next = number ?? null;
        if (next === null) {
          const max = await tx.scene.findFirst({
            where: { chapterId },
            orderBy: { number: "desc" },
            select: { number: true },
          });
          next = (max?.number ?? 0) + 1;
        }
        try {
          const created = await tx.scene.create({
            data: {
              chapterId,
              number: next,
              title,
              summary: summary ?? null,
            },
            select: { id: true, number: true, title: true, summary: true },
          });
          await advanceForMutation(tx, {
            workspaceId, novelId, actorUserId, branchName: branch.name,
            operation: "scene.crud", origin: "MANUAL", tables: ["scenes"],
            items: [{ entityType: "Scene", entityId: created.id, operation: "CREATE" }],
          });
          return created;
        } catch (e: unknown) {
          // @@unique([chapterId, number]): an explicit number that is
          // already taken is a client-correctable conflict, not a 500.
          if ((e as { code?: string })?.code === "P2002") {
            throw new ConflictError(
              `scene number ${next} is already used in this chapter`,
            );
          }
          throw e;
        }
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "scene.created",
        entityType: "Scene",
        entityId: scene.id,
        payload: { chapterId, number: scene.number, title },
      });
      return scene;
    },

    async updateScene({
      actorUserId,
      workspaceId,
      novelId,
      chapterId,
      sceneId,
      title,
      summary,
      number,
    }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:update");
      await getChapterOr404(chapterId, novelId);
      const updated = await db.$transaction(async (tx) => {
        const branch = await lockManuscriptBranch(tx, novelId);
        await tx.$queryRaw`SELECT id FROM chapters WHERE id = ${chapterId} FOR UPDATE`;
        const scene = await tx.scene.findFirst({
          where: { id: sceneId, chapterId },
          select: { id: true, number: true, title: true, summary: true },
        });
        if (!scene) throw new NotFoundError("scene");
        const changedIds = new Set<string>();
        if ((title !== undefined && title !== scene.title) ||
            (summary !== undefined && (summary ?? null) !== scene.summary)) {
          changedIds.add(sceneId);
        }
        if (title !== undefined && title !== scene.title) {
          await tx.scene.update({ where: { id: sceneId }, data: { title } });
        }
        if (summary !== undefined && (summary ?? null) !== scene.summary) {
          await tx.scene.update({
            where: { id: sceneId },
            data: { summary: summary ?? null },
          });
        }
        if (number !== undefined && number !== scene.number) {
          // Reorder: `number` is the desired 1-based position. Read the
          // current ordering, move the scene, then renumber 1..n in two
          // passes (negative temps first) so @@unique([chapterId,
          // number]) never sees a collision mid-write.
          const rows = await tx.scene.findMany({
            where: { chapterId },
            orderBy: [{ number: "asc" }, { id: "asc" }],
            select: { id: true, number: true },
          });
          const ids = rows.map((r) => r.id);
          const oldNumbers = new Map(rows.map((row) => [row.id, row.number]));
          ids.splice(ids.indexOf(sceneId), 1);
          const to = Math.max(0, Math.min(number - 1, ids.length));
          ids.splice(to, 0, sceneId);
          let reordered = false;
          for (const [i, id] of ids.entries()) {
            if (oldNumbers.get(id) !== i + 1) {
              changedIds.add(id);
              reordered = true;
            }
          }
          if (reordered) {
            for (const [i, id] of ids.entries()) {
              await tx.scene.update({ where: { id }, data: { number: -(i + 1) } });
            }
            for (const [i, id] of ids.entries()) {
              await tx.scene.update({ where: { id }, data: { number: i + 1 } });
            }
          }
        }
        if (changedIds.size > 0) {
          await advanceForMutation(tx, {
            workspaceId, novelId, actorUserId, branchName: branch.name,
            operation: "scene.crud", origin: "MANUAL", tables: ["scenes"],
            items: [...changedIds].map((id) => ({ entityType: "Scene", entityId: id, operation: "UPDATE" as const })),
          });
        }
        return tx.scene.findUniqueOrThrow({
          where: { id: sceneId },
          select: { id: true, number: true, title: true, summary: true },
        });
      });
      await audit?.record({
        actorUserId,
        workspaceId,
        action: "scene.updated",
        entityType: "Scene",
        entityId: sceneId,
        payload: { chapterId, title, number },
      });
      return updated;
    },

    async deleteScene({ actorUserId, workspaceId, novelId, chapterId, sceneId }) {
      const role = await gate(workspaceId, novelId, actorUserId, "chapter:update");
      await getChapterOr404(chapterId, novelId);
      // NF-WF-034 (GAP-055): deleting a scene cascades to the outline beats
      // that plan it (author decision 2026-10-07). Application-level explicit
      // delete — NOT the schema's silent ON DELETE CASCADE — so every beat
      // is audit-logged and reported. The schema cascade stays as a safety net.
      // Note: the canon:manage gate is evaluated inside the transaction on the
      // authoritative in-tx read (TOCTOU hardening) — see below.
      const deletedBeats = await db.$transaction(async (tx) => {
        // Pin checkout and lock lineage before changing live scene state.
        const branch = await lockManuscriptBranch(tx, novelId);
        // FOR UPDATE conflicts with FK insertion locks, preventing a beat
        // from appearing after the authoritative capability check.
        await tx.$queryRawUnsafe(`SELECT id FROM scenes WHERE id = $1 FOR UPDATE`, sceneId);
        const scene = await tx.scene.findFirst({
          where: { id: sceneId, chapterId },
          select: { id: true, title: true },
        });
        if (!scene) throw new NotFoundError("scene");
        // Re-select inside the transaction (C4): beats may have changed
        // between the gate check and the transaction.
        const beats = await tx.outlineNode.findMany({
          where: { sceneId, novelId },
          select: { id: true, title: true, order: true, sagaId: true },
          orderBy: [{ sagaId: "asc" }, { order: "asc" }],
        });
        // Capability gate — fail fast inside the transaction on the
        // authoritative in-tx read (TOCTOU hardening). Planning's
        // deleteOutlineNode gates on canon:manage, and EDITOR holds
        // chapter:update but deliberately NOT canon:manage. Without this
        // gate an EDITOR could delete outline nodes via scene-delete that
        // they are forbidden from deleting directly. Throws before any
        // write; the transaction rolls back.
        if (beats.length > 0) {
          requireCapability(role, "canon:manage");
        }
        if (beats.length > 0) {
          await tx.outlineNode.deleteMany({
            where: { id: { in: beats.map((b) => b.id) } },
          });
        }
        await tx.scene.delete({ where: { id: sceneId } });
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "scene.delete",
          branchName: branch.name,
          origin: "MANUAL",
          actorUserId,
          tables: ["outline_nodes", "scenes"],
          items: [
            { entityType: "Scene", entityId: sceneId, operation: "DELETE" },
            ...beats.map((b) => ({
              entityType: "OutlineNode",
              entityId: b.id,
              operation: "DELETE" as const,
            })),
          ],
        });
        for (const b of beats) {
          await audit?.record({
            actorUserId,
            workspaceId,
            action: "planning.outline-node-deleted",
            entityType: "OutlineNode",
            entityId: b.id,
            payload: { sagaId: b.sagaId, order: b.order, sceneId },
          });
        }
        await audit?.record({
          actorUserId,
          workspaceId,
          action: "scene.deleted",
          entityType: "Scene",
          entityId: sceneId,
          payload: { chapterId, title: scene.title },
        });
        return beats.map((b) => ({
          id: b.id,
          title: b.title,
          order: b.order,
          sagaId: b.sagaId,
        }));
      });
      return { deletedBeats };
    },
  };
}
