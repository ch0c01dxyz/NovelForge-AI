/**
 * Bounded long-novel fixture for NF-WF-011
 * (`apps/api/src/e2e/long-novel.fixture.ts`).
 *
 * Builds a deterministic, seeded novel at a bounded-but-meaningful scale:
 * 300 chapters, 60 characters, 3,000 canon facts, 300 timeline events,
 * 30 threads, one approved outline. Every measured row is written through
 * the REAL service paths (never revision-less bulk inserts — Invariant 4),
 * so every row is attributable to a real revision.
 *
 * GAP-042: the product creates exactly one revision per covered mutation,
 * so the fixture yields ~4,000 revisions rather than exactly 30; the
 * builder asserts `revisions >= FIXTURE_REVISIONS` (the normative floor).
 */
import { createHash } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { createAuditService } from "../services/audit.ts";
import { createPlatformServices } from "../services/platform.ts";
import { createCanonServices } from "../services/canon.ts";
import { createPlanningServices } from "../services/planning.ts";
import { createCharacterServices } from "../services/characters.ts";
import { createRelationshipServices } from "../services/relationships.ts";
import { createStoryServices } from "../services/story.ts";
import { createManuscriptServices } from "../services/manuscript.ts";
import { createRetrievalServices } from "../services/retrieval.ts";
import { createAiServices } from "../services/ai.ts";
import { createGatewayRegistry } from "../ai-registry.ts";
import { readHeadRevisionId } from "../services/revisions.ts";
import { createFinalTextReviewServices } from "../services/final-text-review.ts";
import { settleRev, processRebuild, chapterScope } from "@novelforge/memory";
import { e2eCreateGateway } from "./setup.ts";

export const FIXTURE_SEED = 20261005;
export const FIXTURE_CHAPTERS = 300;
/** Normative floor (GAP-042): the real revision machinery yields ~4,000. */
export const FIXTURE_REVISIONS = 30;
export const FIXTURE_CHARACTERS = 60;
export const FIXTURE_FACTS = 3000;
export const FIXTURE_TIMELINE_EVENTS = 300;
export const FIXTURE_THREADS = 30;
export const FIXTURE_NOVEL_SLUG = "e2e-long-novel-fixture";

/** Outline nodes materialized through the planning service (G1's tier-2 pin). */
export const FIXTURE_OUTLINE_NODES = FIXTURE_CHAPTERS;

/** Horizon policy bands: finite window 300 so tier 2 selects chapter nodes at story position 300. */
export const FIXTURE_HORIZON_POLICY = {
  bands: [
    { maxDistance: 10, detail: "FULL" },
    { maxDistance: 300, detail: "BEATS" },
    { maxDistance: null, detail: "VAGUE" },
  ],
} as const;

/** Quote embedded in chapter 300's content; cited by the KBV forcing fact. */
export const FIXTURE_KBV_QUOTE =
  "the cartographer sealed the eastern pass with wax and iron";

export interface FixtureNovel {
  ownerId: string;
  workspaceId: string;
  novelId: string;
  outlineVersionId: string;
  headRevisionId: string;
  chapterIds: string[];
  /** Fact id cited by chapter 300 (forces KNOWLEDGE_BOUNDARY_VIOLATION). */
  kbvFactId: string;
  kbvCharacterId: string;
  counts: {
    chapters: number;
    revisions: number;
    characters: number;
    facts: number;
    timelineEvents: number;
    threads: number;
    outlineNodes: number;
  };
  /** Chapter 300's settle revision (010's settle rule) — the tier-4 pin target. */
  settleRevisionId: string;
  settleRevisionNumber: number;
  /** sha256 over sampled deterministic content — the determinism gate. */
  sampleHash: string;
  buildMs: number;
}

/** mulberry32 — deterministic PRNG for the fixture. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROSE_SENTENCES = [
  "The river bent north around the basalt cliffs, carrying pine needles and cold light.",
  "Wren counted the lanterns along the quay and found one missing, as always on market days.",
  "Somewhere beyond the ridge, the foundry bells marked the third hour with iron patience.",
  "The map fragment showed a pass that no living cartographer admitted to drawing.",
  "Rain had softened the trail to black paste, and the mules complained at every step.",
  "Old Mara kept the ledger of debts in a cipher only she and the harbor master could read.",
  "A gull screamed over the fish stalls, and the crowd parted around the fallen cart.",
  "The oath was older than the city walls, and heavier than the bronze gates.",
  "Tomas swore the northern lights had spelled his sister's name the winter she vanished.",
  "By dawn the expedition would either be provisioned or exposed as a fool's errand.",
];

function chapterContent(rand: () => number, chapterNumber: number, sentences: number): string {
  const parts: string[] = [`# Fixture Chapter ${chapterNumber}`, ""];
  for (let i = 0; i < sentences; i++) {
    parts.push(PROSE_SENTENCES[Math.floor(rand() * PROSE_SENTENCES.length)]!);
  }
  return parts.join("\n\n");
}

export async function buildLongNovelFixture(
  db: NovelForgeDb,
  opts: { seed?: number; tag?: string } = {},
): Promise<FixtureNovel> {
  const seed = opts.seed ?? FIXTURE_SEED;
  // `tag` namespaces every UNIQUE identifier so two builds with the same
  // seed can coexist in one database (the determinism gate). Content
  // derivation uses ONLY the seed, so identical seeds → identical content.
  const tag = opts.tag ?? "main";
  const rand = mulberry32(seed);
  const started = Date.now();
  const audit = createAuditService(db);
  const aiServices = createAiServices({
    db,
    registry: createGatewayRegistry(db, "unit-test-encryption-key"),
    encryptionKey: "unit-test-encryption-key",
    audit,
    createGateway: e2eCreateGateway,
  });
  const retrieval = createRetrievalServices({ db, audit, ai: aiServices });
  const canon = createCanonServices({ db, audit, retrieval });
  const planning = createPlanningServices({ db, audit });
  const characters = createCharacterServices({ db, audit });
  const relationships = createRelationshipServices({ db, audit });
  const story = createStoryServices({ db, audit });
  const manuscript = createManuscriptServices(db, audit, {});
  const sampleBits: string[] = [];

  // ---- owner / workspace / novel (production path) ----
  const user = await db.user.create({
    data: {
      email: `e2e-fixture-${tag}-${seed}@example.com`,
      passwordHash: "x",
      displayName: "e2e-fixture",
    },
  });
  const token = generateSessionToken();
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const ownerId = user.id;
  const ws = await db.workspace.create({
    data: { name: "e2e-fixture-ws", slug: `e2e-fixture-ws-${tag}-${seed}`, ownerId },
  });
  await db.membership.create({
    data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" },
  });
  const novel = await createPlatformServices({ db, audit }).createNovel({
    actorUserId: ownerId,
    workspaceId: ws.id,
    title: "E2E Long-Novel Fixture",
    slug: `${FIXTURE_NOVEL_SLUG}-${tag}`,
  });
  const ctx = { actorUserId: ownerId, workspaceId: ws.id, novelId: novel.id };

  // ---- 60 characters ----
  const characterIds: string[] = [];
  for (let i = 0; i < FIXTURE_CHARACTERS; i++) {
    const c = await characters.createCharacter({
      ...ctx,
      key: `fixture-char-${tag}-${i}`,
      name: `Fixture Character ${i}`,
      summary: `Deterministic fixture cast member ${i}, seed ${seed}.`,
    });
    characterIds.push(c.id);
  }

  // ---- bounded relationship stances (60 pairs, rotating) ----
  const STANCES = ["ALLY", "FRIENDLY", "NEUTRAL", "WARY", "HOSTILE", "ENEMY"] as const;
  for (let i = 0; i < FIXTURE_CHARACTERS; i++) {
    const from = characterIds[i]!;
    const to = characterIds[(i + 1) % FIXTURE_CHARACTERS]!;
    await relationships.createStance({
      ...ctx,
      fromCharacterId: from,
      toCharacterId: to,
      stance: STANCES[i % STANCES.length]!,
      fromChapter: 1,
      toChapter: null,
    });
  }

  // ---- 300 chapters (create + one version each) ----
  const chapterIds: string[] = [];
  const chapterVersionIds: string[] = [];
  for (let n = 1; n <= FIXTURE_CHAPTERS; n++) {
    const ch = await manuscript.createChapter({
      ...ctx,
      title: `Fixture Chapter ${n}`,
    });
    let content = chapterContent(rand, n, 6 + Math.floor(rand() * 6));
    if (n === FIXTURE_CHAPTERS) {
      // The forced-KBV quote must be verifiable in the stored content.
      content += `\n\nIn the margin of the logbook someone had written that ${FIXTURE_KBV_QUOTE}, and dated it to the thaw.\n`;
    }
    const saved = await manuscript.saveChapter({
      ...ctx,
      chapterId: ch.id,
      content,
      expectedVersion: null,
    });
    const version = await db.chapterVersion.findFirstOrThrow({
      where: { chapterId: ch.id },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    chapterIds.push(ch.id);
    chapterVersionIds.push(version.id);
    void saved;
    if (n <= 3 || n === FIXTURE_CHAPTERS) sampleBits.push(`ch${n}:${content.length}`);
  }

  // ---- 3,000 canon facts over 150 entities (10 facts/chapter) ----
  const entityIds: string[] = [];
  const ENTITY_KINDS = ["CHARACTER", "LOCATION", "ITEM", "CONCEPT"] as const;
  for (let i = 0; i < 150; i++) {
    const e = await canon.createEntity({
      ...ctx,
      kind: ENTITY_KINDS[i % ENTITY_KINDS.length]!,
      name: `Fixture Entity ${i}`,
      key: `fixture-entity-${tag}-${seed}-${i}`,
    });
    entityIds.push(e.id);
  }
  const factIds: string[] = [];
  for (let i = 0; i < FIXTURE_FACTS; i++) {
    const chapterNumber = (i % FIXTURE_CHAPTERS) + 1;
    const predicate = `fixture-predicate-${String(i).padStart(4, "0")}`;
    const f = await canon.createFact({
      ...ctx,
      entityId: entityIds[i % entityIds.length]!,
      predicate,
      objectText: `deterministic fixture object ${i} (seed ${seed}): the ${PROSE_SENTENCES[i % PROSE_SENTENCES.length]}`,
      validFromChapter: chapterNumber,
    });
    factIds.push(f.id);
    if (i % 500 === 0) sampleBits.push(`fact${i}:${predicate}`);
  }

  // ---- character states + knowledge windows (rotating cast) ----
  for (let i = 0; i < 30; i++) {
    const characterId = characterIds[i]!;
    await characters.createState({
      ...ctx,
      characterId,
      fromChapter: 1,
      toChapter: null,
      summary: `Fixture state for cast member ${i}: traveling with the expedition.`,
    });
    // Half the cast knows a fact; the other half is the KBV surface.
    if (i % 2 === 0) {
      await characters.putKnowledge({
        ...ctx,
        characterId,
        factId: factIds[i]!,
        stance: "KNOWN",
        source: "LEARNED_IN_WORLD",
        fromChapter: 1,
        toChapter: null,
      });
    }
  }

  // ---- 300 timeline events (one per chapter) ----
  for (let n = 1; n <= FIXTURE_TIMELINE_EVENTS; n++) {
    await story.createEvent({
      ...ctx,
      description: `Fixture event ${n}: ${PROSE_SENTENCES[n % PROSE_SENTENCES.length]}`,
      chapterId: chapterIds[n - 1]!,
      availableFromChapter: n,
    });
  }

  // ---- 30 threads ----
  const THREAD_KINDS = ["CONFLICT", "MYSTERY", "QUESTION", "OBJECTIVE", "SUBPLOT"] as const;
  for (let i = 0; i < FIXTURE_THREADS; i++) {
    await story.createThread({
      ...ctx,
      kind: THREAD_KINDS[i % THREAD_KINDS.length]!,
      title: `Fixture thread ${i}`,
      description: `Deterministic fixture thread ${i}, opened at chapter ${i * 10 + 1}.`,
      importance: (i % 5) + 1,
      introducedAtChapter: i * 10 + 1,
      payoffIntent: `Pay off before chapter ${Math.min(300, i * 10 + 40)}.`,
    });
  }

  // ---- one approved outline covering all chapters ----
  const outlineNodes = Array.from({ length: FIXTURE_CHAPTERS }, (_, i) => ({
    chapter: i + 1,
    beat: `Fixture beat ${i + 1}: ${PROSE_SENTENCES[i % PROSE_SENTENCES.length]}`,
  }));
  const draft = await planning.createOutlineDraft({
    ...ctx,
    content: { title: "E2E fixture outline", chapters: outlineNodes },
    note: "seeded fixture outline",
  });
  const approved = await planning.approveOutlineVersion({
    ...ctx,
    versionId: draft.id,
  });

  // ---- forced KNOWLEDGE_BOUNDARY_VIOLATION content (G10) ----
  // Chapter 300's current version cites a fact; character 31 has a state
  // window covering chapter 300 but only an UNKNOWN knowledge stance for
  // that fact — evaluateHealth({ chapter: 300 }) must flag it.
  const kbvChapterVersionId = chapterVersionIds[FIXTURE_CHAPTERS - 1]!;
  const ch300 = await db.chapterVersion.findUniqueOrThrow({
    where: { id: kbvChapterVersionId },
    select: { content: true },
  });
  const quoteStart = ch300.content.indexOf(FIXTURE_KBV_QUOTE);
  if (quoteStart < 0) throw new Error("KBV quote missing from chapter 300 content");
  const kbvFact = await canon.createFact({
    ...ctx,
    entityId: entityIds[0]!,
    predicate: "fixture-predicate-kbv",
    objectText: "the eastern pass was sealed with wax and iron",
    validFromChapter: FIXTURE_CHAPTERS,
    source: {
      chapterVersionId: kbvChapterVersionId,
      quote: FIXTURE_KBV_QUOTE,
      start: quoteStart,
      end: quoteStart + FIXTURE_KBV_QUOTE.length,
    },
  });
  const kbvFactId = kbvFact.id;
  const kbvCharacterId = characterIds[31]!;
  await characters.createState({
    ...ctx,
    characterId: kbvCharacterId,
    fromChapter: 295,
    toChapter: null,
    summary: "KBV forcing state: present at the finale, ignorant of the sealed pass.",
  });
  const kbvKnowledge = await characters.putKnowledge({
    ...ctx,
    characterId: kbvCharacterId,
    factId: kbvFactId,
    stance: "UNKNOWN",
    source: "LEARNED_IN_WORLD",
    fromChapter: 300,
    toChapter: null,
  });
  // NOTE: only seed-derived content enters the sample hash — row ids are
  // random per build and must not affect determinism comparison.
  sampleBits.push(`kbv:fixture-predicate-kbv:${kbvKnowledge.stance}`);

  // ---- outline nodes materialized through the planning service (G1) ----
  // The approved-outline DRAFT content alone never renders tier 2: the
  // compiler reads OutlineNode rows under a horizon policy. One saga +
  // one CHAPTER node per chapter, each linked to its chapter row.
  const saga = await planning.createSaga({
    ...ctx,
    kind: "SAGA",
    title: "E2E fixture saga",
    parentId: null,
    intent: "the expedition saga",
  });
  for (let n = 1; n <= FIXTURE_OUTLINE_NODES; n++) {
    await planning.createOutlineNode({
      ...ctx,
      sagaId: saga.id,
      kind: "CHAPTER",
      title: `Fixture Chapter ${n}`,
      summary: `Fixture beat ${n}: ${PROSE_SENTENCES[(n - 1) % PROSE_SENTENCES.length]}`,
      order: n,
      chapterId: chapterIds[n - 1]!,
      sceneId: null,
    });
  }

  // ---- planning-horizon policy (G1): finite window 300 ----
  // Without a policy the horizon probe reports EMPTY_POLICY and tier 2
  // selects no nodes (loud, never a silent default — planning.ts).
  await planning.putHorizon({
    ...ctx,
    policy: FIXTURE_HORIZON_POLICY as unknown as Record<string, unknown>,
  });

  // ---- publish chapter 300 through the real product path (G1) ----
  // Story position = max(IN_REVIEW, PUBLISHED) chapter number; the
  // compiler's temporal tiers resolve against it, so chapter 300 must
  // leave DRAFT for tier 4 to reflect state at chapter 300. The 010
  // gate demands a PASS receipt for the current version first.
  const review = createFinalTextReviewServices({ db, audit });
  const ch300Version = await db.chapterVersion.findFirstOrThrow({
    where: { chapterId: chapterIds[FIXTURE_CHAPTERS - 1]! },
    orderBy: { number: "desc" },
    select: { id: true },
  });
  const verdict = await review.reviewFinalText({
    ...ctx,
    chapterId: chapterIds[FIXTURE_CHAPTERS - 1]!,
    chapterVersionId: ch300Version.id,
  });
  if (verdict.verdict !== "PASS") {
    throw new Error(`fixture chapter 300 review verdict ${verdict.verdict}, expected PASS`);
  }
  await manuscript.setStatus({
    ...ctx,
    chapterId: chapterIds[FIXTURE_CHAPTERS - 1]!,
    status: "PUBLISHED",
  });

  // ---- chapter 300's settle revision (010's settle rule, G1's tier-4 pin) ----
  const settled = await settleRev(db, novel.id, FIXTURE_CHAPTERS);
  if (!settled) throw new Error("fixture chapter 300 has no settle revision");

  // ---- memory projection for chapter-300 scope at the final head (G1) ----
  // Built after every fixture mutation, so it is FRESH and its source
  // revision is ≥ the settle revision: tier 4 reflects settled state.
  const finalHead = await readHeadRevisionId(db, novel.id);
  if (!finalHead) throw new Error("fixture novel lost its head revision");
  const ch300Scope = chapterScope(chapterIds[FIXTURE_CHAPTERS - 1]!);
  await processRebuild(db, {
    workspaceId: ws.id,
    novelId: novel.id,
    scope: ch300Scope,
    sourceRevisionId: finalHead,
  });

  const headRevisionId = await readHeadRevisionId(db, novel.id);
  if (!headRevisionId) throw new Error("fixture novel has no head revision");
  const revisionCount = await db.revision.count({ where: { novelId: novel.id } });
  if (revisionCount < FIXTURE_REVISIONS) {
    throw new Error(
      `fixture produced ${revisionCount} revisions, below the ${FIXTURE_REVISIONS} floor (GAP-042)`,
    );
  }

  const sampleHash = createHash("sha256").update(sampleBits.join("|")).digest("hex");
  const outlineNodeCount = await db.outlineNode.count({ where: { novelId: novel.id } });
  return {
    ownerId,
    workspaceId: ws.id,
    novelId: novel.id,
    outlineVersionId: approved.id,
    headRevisionId,
    chapterIds,
    kbvFactId,
    kbvCharacterId,
    counts: {
      chapters: chapterIds.length,
      revisions: revisionCount,
      characters: characterIds.length,
      facts: factIds.length + 1, // + the KBV fact
      timelineEvents: FIXTURE_TIMELINE_EVENTS,
      threads: FIXTURE_THREADS,
      outlineNodes: outlineNodeCount,
    },
    settleRevisionId: settled.revisionId,
    settleRevisionNumber: settled.revisionNumber,
    sampleHash,
    buildMs: Date.now() - started,
  };
}

/**
 * Build once per runner process (and reuse across the e2e files, which run
 * sequentially via --no-file-parallelism). If the fixture novel is already
 * present (a previous file in this process built it), it is re-read, not
 * rebuilt.
 */
let cached: FixtureNovel | null = null;

export async function ensureFixture(db: NovelForgeDb): Promise<FixtureNovel> {
  if (cached) return cached;
  const existing = await db.novel.findFirst({
    where: { slug: `${FIXTURE_NOVEL_SLUG}-main` },
    select: { id: true },
  });
  if (existing) {
    // Re-read the identifying rows (built earlier in this process).
    const [outline, kbvFact, kbvChar, headRevisionId] = await Promise.all([
      db.outlineVersion.findFirstOrThrow({
        where: { novelId: existing.id, status: "APPROVED" },
        orderBy: { number: "desc" },
        select: { id: true },
      }),
      db.canonFact.findFirstOrThrow({
        where: { novelId: existing.id, predicate: "fixture-predicate-kbv" },
        select: { id: true },
      }),
      db.character.findFirstOrThrow({
        where: { novelId: existing.id, key: "fixture-char-main-31" },
        select: { id: true },
      }),
      readHeadRevisionId(db, existing.id),
    ]);
    const novel = await db.novel.findUniqueOrThrow({
      where: { id: existing.id },
      select: { workspaceId: true },
    });
    const owner = await db.membership.findFirstOrThrow({
      where: { workspaceId: novel.workspaceId, role: "OWNER" },
      select: { userId: true },
    });
    const chapters = await db.chapter.findMany({
      where: { novelId: existing.id },
      orderBy: { number: "asc" },
      select: { id: true },
    });
    const [revisionCount, characterCount, factCount, eventCount, threadCount, outlineNodeCount] = await Promise.all([
      db.revision.count({ where: { novelId: existing.id } }),
      db.character.count({ where: { novelId: existing.id } }),
      db.canonFact.count({ where: { novelId: existing.id } }),
      db.storyEvent.count({ where: { novelId: existing.id } }),
      db.storyThread.count({ where: { novelId: existing.id } }),
      db.outlineNode.count({ where: { novelId: existing.id } }),
    ]);
    const settled = await settleRev(db, existing.id, FIXTURE_CHAPTERS);
    cached = {
      ownerId: owner.userId,
      workspaceId: novel.workspaceId,
      novelId: existing.id,
      outlineVersionId: outline.id,
      headRevisionId: headRevisionId ?? "",
      chapterIds: chapters.map((c) => c.id),
      kbvFactId: kbvFact.id,
      kbvCharacterId: kbvChar.id,
      counts: {
        chapters: chapters.length,
        revisions: revisionCount,
        characters: characterCount,
        facts: factCount,
        timelineEvents: eventCount,
        threads: threadCount,
        outlineNodes: outlineNodeCount,
      },
      settleRevisionId: settled?.revisionId ?? "",
      settleRevisionNumber: settled?.revisionNumber ?? 0,
      sampleHash: "",
      buildMs: 0,
    };
    return cached;
  }
  cached = await buildLongNovelFixture(db, { seed: FIXTURE_SEED });
  return cached;
}
