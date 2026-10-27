import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import {
  createAuditService,
  createNarrativeServices,
  createPlatformServices,
  createRetrievalServices,
  type RevisionTx,
} from "@novelforge/ai-services";
import {
  applyNovelDecodeCandidate,
  type NovelDecodeCandidate,
} from "./services/novel-decode-apply.ts";

const TEST_DB = "novelforge_test_decode_apply";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(ROOT, ".env"));
function databaseUrl(name: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  return url.toString();
}
let db: NovelForgeDb;
let scope: { actorUserId: string; workspaceId: string; novelId: string };
let citations: NovelDecodeCandidate["citations"];
const embed = vi.fn(async () => {
  throw new Error("decode application must not request embeddings");
});

function facade(tx: RevisionTx): NovelForgeDb {
  return new Proxy(tx, {
    get(target, property) {
      if (property === "$transaction")
        return async (callback: (nested: NovelForgeDb) => Promise<unknown>) => callback(facade(tx));
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as NovelForgeDb;
}
function candidate(area: string, extra: Partial<NovelDecodeCandidate> = {}): NovelDecodeCandidate {
  return {
    id: randomUUID(),
    area,
    title: "Source observation",
    summary: "Aria reached the valley.",
    subject: null,
    target: null,
    chapterNumber: 2,
    citations,
    ...extra,
  };
}
async function apply(c: NovelDecodeCandidate, targetScope = scope) {
  return db.$transaction(
    async (tx) => {
      const wrapped = facade(tx);
      return applyNovelDecodeCandidate({
        db: wrapped,
        scope: targetScope,
        candidate: c,
        retrieval: createRetrievalServices({
          db: wrapped,
          audit: createAuditService(wrapped),
          ai: { embed },
        }),
      });
    },
    { timeout: 30_000 },
  );
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DB],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }
  const dbRoot = path.join(ROOT, "packages", "database");
  execFileSync(
    process.execPath,
    [path.join(dbRoot, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    { cwd: dbRoot, stdio: "pipe", env: { ...process.env, DATABASE_URL: databaseUrl(TEST_DB) } },
  );
  db = createDb(databaseUrl(TEST_DB));
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});
beforeEach(async () => {
  embed.mockClear();
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@decode.test`,
      passwordHash: "not-an-authentication-fixture",
      displayName: "Decode author",
    },
  });
  const workspace = await db.workspace.create({
    data: { name: "Decode", slug: randomUUID(), ownerId: user.id },
  });
  await db.membership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });
  const novel = await createPlatformServices({ db, audit: createAuditService(db) }).createNovel({
    actorUserId: user.id,
    workspaceId: workspace.id,
    title: "Imported source",
    slug: randomUUID(),
  });
  scope = { actorUserId: user.id, workspaceId: workspace.id, novelId: novel.id };
  citations = [];
  for (const number of [1, 2]) {
    const chapter = await db.chapter.create({
      data: { novelId: novel.id, number, title: `Chapter ${number}`, createdById: user.id },
    });
    const version = await db.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        number: 1,
        content: "<p>Aria reached the valley.</p>",
        wordCount: 5,
        authorId: user.id,
      },
    });
    await db.chapter.update({ where: { id: chapter.id }, data: { currentVersionId: version.id } });
    citations.push({
      chapterVersionId: version.id,
      chapterNumber: number,
      quote: "Aria reached the valley.",
    });
  }
});

describe("native decode candidate application", () => {
  it("creates native planning records and preserves configured DNA", async () => {
    await createNarrativeServices({ db, audit: createAuditService(db) }).putDna({
      ...scope,
      dna: { customPreference: "retain this" },
    });
    const synopsis = await apply(candidate("SYNOPSIS"));
    const outline = await apply(candidate("OUTLINE"));
    await apply(candidate("STYLE"));
    expect(
      await db.synopsis.findUnique({ where: { id: synopsis.synopsisId as string } }),
    ).toMatchObject({ status: "ACTIVE" });
    expect(
      await db.outlineVersion.findUnique({ where: { id: outline.outlineVersionId as string } }),
    ).toMatchObject({ status: "DRAFT" });
    expect(
      (await db.narrativeDnaProfile.findUniqueOrThrow({ where: { novelId: scope.novelId } })).dna,
    ).toMatchObject({
      customPreference: "retain this",
      sourceObservedStyles: [{ summary: "Aria reached the valley." }],
    });
    expect(await db.publication.count({ where: { novelId: scope.novelId } })).toBe(0);
  });

  it("reuses exact characters, links new identities, and bounds states and relationships", async () => {
    const aria = await apply(candidate("CHARACTER", { subject: "Aria" }));
    const again = await apply(
      candidate("CHARACTER", {
        subject: "Aria",
        summary: "This must not overwrite the original profile.",
      }),
    );
    const ben = await apply(candidate("CHARACTER", { subject: "Ben" }));
    expect(again).toMatchObject({ characterId: aria.characterId, reused: true });
    expect(
      await db.character.findUnique({ where: { id: aria.characterId as string } }),
    ).toMatchObject({ storyEntityId: aria.storyEntityId });
    const state = await apply(candidate("CHARACTER_STATE", { subject: "Aria" }));
    expect(
      await db.characterState.findUnique({ where: { id: state.stateId as string } }),
    ).toMatchObject({ fromChapter: 2, toChapter: 3 });
    await expect(apply(candidate("CHARACTER_STATE", { subject: "Aria" }))).rejects.toThrow(
      /already covered/i,
    );
    const stance = await apply(
      candidate("RELATIONSHIP", { subject: "Aria", target: "Ben", details: { stance: "ALLY" } }),
    );
    expect(
      await db.relationshipStance.findUnique({ where: { id: stance.stanceId as string } }),
    ).toMatchObject({
      fromCharacterId: aria.characterId,
      toCharacterId: ben.characterId,
      fromChapter: 2,
      toChapter: 3,
      stance: "ALLY",
    });
  });

  it("requires multiple chronological cited milestones and leaves a reconstructed arc active", async () => {
    await apply(candidate("CHARACTER", { subject: "Aria" }));
    await expect(
      apply(
        candidate("CHARACTER_ARC", {
          subject: "Aria",
          details: { milestones: [{ chapterNumber: 2, summary: "Arrived" }] },
        }),
      ),
    ).rejects.toThrow(/at least two/);
    await expect(
      apply(
        candidate("CHARACTER_ARC", {
          subject: "Aria",
          details: {
            milestones: [
              { chapterNumber: 2, summary: "Arrived" },
              { chapterNumber: 1, summary: "Started" },
            ],
          },
        }),
      ),
    ).rejects.toThrow(/chronological/);
    const arc = await apply(
      candidate("CHARACTER_ARC", {
        subject: "Aria",
        details: {
          milestones: [
            { chapterNumber: 1, summary: "Started" },
            { chapterNumber: 2, summary: "Arrived" },
          ],
        },
      }),
    );
    expect(await db.characterArc.findUnique({ where: { id: arc.arcId as string } })).toMatchObject({
      status: "ACTIVE",
    });
    expect(await db.characterArcMilestone.count({ where: { arcId: arc.arcId as string } })).toBe(2);
  });

  it("creates unapproved world/canon proposals and source-bound timeline records", async () => {
    const world = await apply(
      candidate("WORLD", { subject: "Valley", details: { entityKind: "LOCATION" } }),
    );
    const canon = await apply(
      candidate("CANON", {
        subject: "Valley",
        details: { predicate: "contains" },
        summary: "A river",
      }),
    );
    expect(world.status).toBe("PROPOSED");
    expect(canon.status).toBe("PROPOSED");
    expect(await db.canonFact.count({ where: { novelId: scope.novelId } })).toBe(0);
    const timeline = await apply(candidate("TIMELINE"));
    expect(
      await db.storyEvent.findUnique({ where: { id: timeline.eventId as string } }),
    ).toMatchObject({
      chapterId: (
        await db.chapter.findUniqueOrThrow({
          where: { novelId_number: { novelId: scope.novelId, number: 2 } },
        })
      ).id,
      availableFromChapter: 2,
    });
    expect(
      await db.timelineEvent.findUnique({ where: { id: timeline.timelineEventId as string } }),
    ).toMatchObject({ availableFromChapter: 2 });
  });

  it("keeps research unverified, narrative unresolved and ending evidence outside approval gates", async () => {
    const research = await apply(candidate("RESEARCH"));
    expect(research).toMatchObject({ status: "DRAFT", externallyVerified: false, embedded: false });
    expect(
      await db.reference.findUnique({ where: { id: research.referenceId as string } }),
    ).toMatchObject({ status: "DRAFT", novelId: scope.novelId });
    expect(
      (
        await apply(
          candidate("NARRATIVE", { details: { recordKind: "THREAD", threadKind: "MYSTERY" } }),
        )
      ).status,
    ).toBe("ACTIVE");
    expect(
      (await apply(candidate("NARRATIVE", { details: { recordKind: "PROMISE" } }))).status,
    ).toBe("SETUP");
    const legacy = await apply(candidate("ENDGAME", { details: { legacyKind: "THEMATIC" } }));
    expect(legacy.gateApproval).toBe(false);
    expect(
      await db.endgameLegacy.findUnique({ where: { id: legacy.legacyId as string } }),
    ).toMatchObject({ kind: "THEMATIC" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("refuses forged source quotes, foreign actors and missing or ambiguous identities before writes", async () => {
    await expect(
      apply(
        candidate("SYNOPSIS", {
          citations: [{ ...citations[1]!, quote: "Not in the manuscript" }],
        }),
      ),
    ).rejects.toThrow(/citation/);
    await expect(
      apply(candidate("CHARACTER_STATE", { subject: "Unapproved alias" })),
    ).rejects.toThrow(/missing or ambiguous/);
    await expect(
      apply(candidate("SYNOPSIS"), { ...scope, actorUserId: randomUUID() }),
    ).rejects.toThrow(/not found/);
    await db.character.createMany({
      data: ["one", "two"].map((key) => ({
        workspaceId: scope.workspaceId,
        novelId: scope.novelId,
        key,
        name: "Ambiguous",
        createdById: scope.actorUserId,
      })),
    });
    await expect(apply(candidate("CHARACTER", { subject: "Ambiguous" }))).rejects.toThrow(
      /ambiguous/,
    );
    expect(await db.synopsis.count({ where: { novelId: scope.novelId } })).toBe(0);
  });

  it("rejects oversized author-edited arcs without creating native milestones", async () => {
    await apply(candidate("CHARACTER", { title: "Aria", subject: "Aria" }));
    for (const milestones of [Array(9).fill({ chapterNumber: 1, summary: "Fear" }), [{ chapterNumber: 1, summary: "Fear" }, { chapterNumber: 2, summary: "x".repeat(2001) }]]) {
      await expect(apply(candidate("CHARACTER_ARC", { subject: "Aria", details: { milestones } }))).rejects.toThrow();
    }
    expect(await db.characterArc.count({ where: { character: { novelId: scope.novelId } } })).toBe(0);
  });

  it("rejects unsupported structured choices rather than inventing native records", async () => {
    await expect(
      apply(candidate("WORLD", { details: { entityKind: "WORLD_RULE" } })),
    ).rejects.toThrow(/unsupported/);
    await expect(
      apply(candidate("NARRATIVE", { details: { recordKind: "RESOLVED" } })),
    ).rejects.toThrow(/unsupported/);
    await expect(apply(candidate("CANON", { subject: "Unknown", details: {} }))).rejects.toThrow(
      /predicate/,
    );
    await expect(
      apply(candidate("TIMELINE", { citations: [{ ...citations[1]!, chapterNumber: 3 }] })),
    ).rejects.toThrow(/later chapter/);
    expect(await db.storyEntity.count({ where: { novelId: scope.novelId } })).toBe(0);
  });

  it("rolls native mutations, revisions and provenance back with the caller decision transaction", async () => {
    const before = await db.revision.count({ where: { novelId: scope.novelId } });
    await expect(
      db.$transaction(async (tx) => {
        await applyNovelDecodeCandidate({
          db: facade(tx),
          scope,
          candidate: candidate("SYNOPSIS"),
        });
        throw new Error("author decision receipt failed");
      }),
    ).rejects.toThrow("author decision receipt failed");
    expect(await db.synopsis.count({ where: { novelId: scope.novelId } })).toBe(0);
    expect(await db.revision.count({ where: { novelId: scope.novelId } })).toBe(before);
    expect(
      await db.auditLog.count({
        where: { entityType: "NovelDecodeCandidate", workspaceId: scope.workspaceId },
      }),
    ).toBe(0);
  });
});
