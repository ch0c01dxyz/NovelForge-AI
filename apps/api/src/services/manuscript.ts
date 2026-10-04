/**
 * @novelforge/api — manuscript services (Phase 2: chapters).
 *
 * Scene CRUD is schema-only in Phase 2 (no API yet); the editor scrolls
 * chapters as free text until the AI/scene features of Phases 3-8 demand
 * a scene write path — YAGNI until then.
 *
 * Chapter content is versioned immutably: every save appends a
 * chapter_versions row and moves the chapter's current pointer; content
 * is never updated in place (blueprint §Versioning: "immutable revision
 * records"). Tenant gate reuses the platform membership check (404 for
 * non-members per ADR-0004).
 */
import type { PrismaClient } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
// Shared error vocabulary with the platform services; requireCapability
// throws the auth-package ForbiddenError, which the platform routes'
// setErrorHandler (registered once for the whole app) maps to 403.
import { NotFoundError, ConflictError } from "./platform.ts";
import type { AuditService } from "./audit.ts";
// The head CAS every covered mutation must take inside its own transaction
// (STORY-VERSIONING.md C3/C4). Imported directly rather than threaded through
// the factory: the boundary call has to share the caller's `tx`.
import { advanceForMutation, assertHeadExpectation } from "./revisions.ts";

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
  }): Promise<{ created: number }>;
  exportNovel(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<{ filename: string; content: string }>;
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
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
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

      const wordCount = countWords(content);
      // Version append + pointer move in one transaction.
      const version = await db.$transaction(async (tx) => {
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
            content,
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
      // A status change is a covered mutation like any other and takes the
      // head CAS (C3 LOW). `chapters.status` is deliberately NOT in the
      // snapshot payload (C7) — restore never rewinds publication — so the
      // revision records the change while the state restore can see does not
      // include it.
      await db.$transaction(async (tx) => {
        await tx.chapter.update({ where: { id: chapterId }, data: { status } });
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "chapter.setStatus",
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
    async importChapters(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      text: string;
      format: "md" | "txt";
      expectedHeadRevisionId?: string | null;
    }): Promise<{ created: number }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:create");
      // Advisory pre-check after the tenant gate, before the parse and any
      // write: a stale plan does no work (NF-WF-002D). The locked CAS inside
      // the transaction below is authoritative.
      await assertHeadExpectation(db, {
        novelId: input.novelId,
        expectedHeadRevisionId: input.expectedHeadRevisionId,
      });
      const lines = input.text.split(/\r?\n/);

      // Parse into raw blocks, then flush each to a part. `cur` holds the
      // current block; `push()` emits it only when it has a body, so a
      // trailing heading with no prose does not become an empty chapter.
      interface Block {
        title: string;
        body: string[];
      }
      const parts: Array<{ title: string; content: string }> = [];
      const push = (b: Block): void => {
        if (b.body.some((l) => l.trim())) {
          parts.push({ title: b.title, content: b.body.join("\n") });
        }
      };
      let cur: Block = { title: "Imported", body: [] };

      for (const line of lines) {
        const md = input.format === "md" ? /^(#{1,2})\s+(.+)$/.exec(line) : null;
        if (md) {
          push(cur);
          cur = { title: md[2]!.trim(), body: [] };
          continue;
        }
        // TXT: a setext-style underline — the line ABOVE '===' is a
        // title, and whatever precedes it belongs to the previous
        // chapter. Only '=' counts; '---' is ambiguous with a horizontal
        // rule / em-dash run and must stay content.
        if (input.format === "txt" && /^={3,}$/.test(line.trim())) {
          const last = cur.body[cur.body.length - 1];
          if (last !== undefined && last.trim()) {
            cur.body.pop();
            push(cur);
            cur = { title: last.trim(), body: [] };
            continue;
          }
        }
        cur.body.push(line);
      }
      push(cur);

      const importable = parts.filter((p) => p.content.trim());
      if (importable.length === 0) return { created: 0 };
      // One transaction: import is atomic (no partial chapters on failure)
      // and the novel-row lock serializes numbering against concurrent
      // createChapter/saveChapter (CLAUDE.md §12 transactional integrity).
      let created = 0;
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${input.novelId} FOR UPDATE`;
        // HIGH (C3): the import captures a mandatory PRE_MUTATION checkpoint
        // and snapshot in this same transaction, pinned to the pre-import
        // head. A bulk import is exactly the operation a checkpoint is for.
        // It runs before the loop, not after: `captureSnapshot` reads the live
        // tables, so advancing last would file the post-import chapters under a
        // PRE_MUTATION label and restoring the checkpoint would remove nothing
        // (GAP-024). One advance for the whole import, not one per part.
        await advanceForMutation(tx, {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          expectedHeadRevisionId: input.expectedHeadRevisionId,
          operation: "chapters.import",
          origin: "MANUAL",
          actorUserId: input.actorUserId,
          tables: ["chapters", "chapter_versions"],
          items: [{ entityType: "Novel", entityId: input.novelId, operation: "UPDATE" }],
        });
        let next =
          (
            await tx.chapter.findFirst({
              where: { novelId: input.novelId },
              orderBy: { number: "desc" },
              select: { number: true },
            })
          )?.number ?? 0;
        for (const part of importable) {
          next += 1;
          const chapter = await tx.chapter.create({
            data: {
              novelId: input.novelId,
              number: next,
              title: part.title.slice(0, 200),
              createdById: input.actorUserId,
            },
          });
          const version = await tx.chapterVersion.create({
            data: {
              chapterId: chapter.id,
              number: 1,
              content: part.content.trim(),
              wordCount: countWords(part.content),
              note: "import",
              authorId: input.actorUserId,
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
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "chapters.imported",
        entityType: "Novel",
        entityId: input.novelId,
        payload: { format: input.format, created },
      });
      return { created };
    },

    /** Export: whole novel as Markdown (ATX headings, ordered). */
    async exportNovel(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
    }): Promise<{ filename: string; content: string }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:read");
      const novel = await db.novel.findFirst({
        where: { id: input.novelId, workspaceId: input.workspaceId },
        select: { slug: true },
      });
      const chapters = await db.chapter.findMany({
        where: { novelId: input.novelId },
        orderBy: { number: "asc" },
        include: { currentVersion: { select: { content: true } } },
      });
      const body = chapters
        .map(
          (c) =>
            `# ${c.number}. ${c.title}\n\n${c.currentVersion?.content ?? "_No content yet._"}`,
        )
        .join("\n\n---\n\n");
      // Slug is kebab-validated at creation; sanitize anyway so a future
      // validation regression cannot smuggle quotes/CRLF into the header.
      const safe = (novel?.slug ?? "novel").replace(/[^a-z0-9-]/gi, "");
      return { filename: `${safe || "novel"}.md`, content: body };
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
  };
}
