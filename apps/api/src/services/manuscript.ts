/**
 * @novelforge/api — manuscript services (Phase 2: chapters/scenes).
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
  }): Promise<{ created: number }>;
  exportNovel(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<{ filename: string; content: string }>;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function createManuscriptServices(db: PrismaClient): ManuscriptServices {
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
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${novelId} FOR UPDATE`;
        const max = await tx.chapter.findFirst({
          where: { novelId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const chapter = await tx.chapter.create({
          data: {
            novelId,
            number: (max?.number ?? 0) + 1,
            title,
            createdById: actorUserId,
          },
        });
        return { id: chapter.id, number: chapter.number };
      });
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
        return created.number;
      });
      return { version, wordCount };
    },

    async deleteChapter({ actorUserId, workspaceId, novelId, chapterId }) {
      await gate(workspaceId, novelId, actorUserId, "chapter:delete");
      await getChapterOr404(chapterId, novelId);
      await db.chapter.delete({ where: { id: chapterId } });
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
      await db.chapter.update({ where: { id: chapterId }, data: { status } });
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
    }): Promise<{ created: number }> {
      await gate(input.workspaceId, input.novelId, input.actorUserId, "chapter:create");
      const parts: Array<{ title: string; content: string }> = [];
      const lines = input.text.split(/\r?\n/);

      let current: { title: string; content: string[] } | null = null;
      for (const line of lines) {
        const md = input.format === "md" ? /^(#{1,2})\s+(.+)$/.exec(line) : null;
        if (md) {
          if (current) parts.push({ title: current.title, content: current.content.join("\n") });
          current = { title: md[2]!.trim(), content: [] };
        } else if (input.format === "txt" && /^(={3,}|-{3,})$/.test(line.trim())) {
          // TXT: separator under a title line — title is the previous line.
          const prev = current?.content.at(-1);
          if (current && prev && current.content.length === 1) {
            current.title = prev;
            current.content = [];
            continue;
          }
        } else {
          (current ??= { title: "Imported", content: [] }).content.push(line);
        }
      }
      if (current) parts.push({ title: current.title, content: current.content.join("\n") });

      const importable = parts.filter((p) => p.content.trim());
      if (importable.length === 0) return { created: 0 };
      // One transaction: import is atomic (no partial chapters on failure)
      // and the novel-row lock serializes numbering against concurrent
      // createChapter/saveChapter (CLAUDE.md §12 transactional integrity).
      let created = 0;
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM novels WHERE id = ${input.novelId} FOR UPDATE`;
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
  };
}
