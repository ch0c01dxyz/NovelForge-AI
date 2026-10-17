/**
 * NF-WF-011 M1–M3 gates G1–G10 (`apps/api/src/e2e/gates.test.ts`).
 *
 * G4 (full UI-sequence loop) and G6 (008-path canon apply) live in
 * `author-preview.loop.test.ts`; this file holds G1, G2, G3, G5, G7, G8,
 * G9, G10 plus the authorization negatives. Every gate runs against the
 * real app and real services (buildApp + createTestDriver, fake gateway
 * adapter per GAP-028); nothing stubs domain logic (Invariant 1).
 *
 * The rebuild measurement calls `processRebuild` from `@novelforge/memory`
 * directly — the driver's memory queue is a no-op fake (contract P2-3).
 */
import { createHash, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NovelForgeDb } from "@novelforge/database";
import { settleRev, processRebuild, chapterScope } from "@novelforge/memory";
import { createTestDriver } from "../workflow-test-driver.ts";
import {
  getE2E,
  closeE2E,
  seedWorkspace,
  newIdempotencyKey,
  type E2EContext,
} from "./setup.ts";
import { ensureFixture, FIXTURE_CHAPTERS } from "./long-novel.fixture.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createPlanningServices } from "@novelforge/ai-services";
import { createManuscriptServices } from "../services/manuscript.ts";
import { createFinalTextReviewServices } from "../services/final-text-review.ts";
import { createCanonServices } from "@novelforge/ai-services";
import { createCanonApplicationServices } from "../services/canon-applications.ts";
import { createRetrievalServices } from "@novelforge/ai-services";
import { createAiServices } from "@novelforge/ai-services";
import { createGatewayRegistry } from "@novelforge/ai-services";
import { createStoryHealthServices } from "../services/story-health.ts";
import { assertFindingEvidence } from "@novelforge/ai-services";
import { readHeadRevisionId } from "../services/revisions.ts";
import { e2eCreateGateway } from "./setup.ts";

let e2e: E2EContext;
let db: NovelForgeDb;
let workspaceId: string;
let novelId: string;
let ownerId: string;
let cookie: string;
let workflowId: string;
let outlineId: string;
let chapter1Id: string;
let acceptedPredicate: string;
let rejectedPredicate: string;
let runIdForCanon: string;

type ApiResult = { statusCode: number; body: unknown };

async function api(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
  ck?: string,
): Promise<ApiResult> {
  const res = await e2e.app.inject({
    method,
    url,
    headers: { cookie: ck ?? cookie },
    payload: body as Record<string, unknown> | undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = res.body ? JSON.parse(res.body) : null;
  } catch {
    parsed = res.body;
  }
  return { statusCode: res.statusCode, body: parsed };
}

const asObj = (r: ApiResult) => r.body as Record<string, unknown>;

function svc() {
  const audit = createAuditService(db);
  const ai = createAiServices({
    db,
    registry: createGatewayRegistry(db, "unit-test-encryption-key"),
    encryptionKey: "unit-test-encryption-key",
    audit,
    createGateway: e2eCreateGateway,
  });
  const retrieval = createRetrievalServices({ db, audit, ai });
  return {
    audit,
    planning: createPlanningServices({ db, audit }),
    manuscript: createManuscriptServices(db, audit, {}),
    finalTextReview: createFinalTextReviewServices({ db, audit }),
    canon: createCanonServices({ db, audit, retrieval }),
    canonApps: createCanonApplicationServices({ db, audit }),
  };
}

beforeAll(async () => {
  e2e = await getE2E();
  db = e2e.db;
  ownerId = e2e.admin.userId;
  cookie = e2e.admin.cookie;
  const s = svc();
  const ids = await seedWorkspace(db, ownerId, "e2e-gates");
  workspaceId = ids.workspaceId;
  novelId = ids.novelId;
  const ctx = { actorUserId: ownerId, workspaceId, novelId };

  // Approved outline (tier-2 pin for G1).
  const draft = await s.planning.createOutlineDraft({
    ...ctx,
    content: {
      title: "E2E gates outline",
      chapters: [
        { chapter: 1, beat: "the gates open" },
        { chapter: 2, beat: "the gates close behind" },
      ],
    },
    note: "e2e",
  });
  outlineId = (await s.planning.approveOutlineVersion({ ...ctx, versionId: draft.id })).id;

  // Chapter 1 with a saved version.
  const ch1 = await s.manuscript.createChapter({ ...ctx, title: "E2E Gates Ch1" });
  chapter1Id = ch1.id;
  await s.manuscript.saveChapter({
    ...ctx,
    chapterId: ch1.id,
    content: "E2E gates chapter one.\n\nWren counted the lanterns along the quay.",
    expectedVersion: null,
  });

  // The template workflow id (same resolution the UI does).
  const wl = await api("GET", `/api/workspaces/${workspaceId}/workflows`);
  expect(wl.statusCode).toBe(200);
  workflowId = (
    wl.body as unknown as Array<{ id: string; key: string }>
  ).find((r) => r.key === "chapter-generation-review")!.id;

  // A real run for chapter 1 → parked → approved → SUCCEEDED. Its extract
  // step feeds the 008 application below (G6 path, G8's rejected claim).
  const started = await api(
    "POST",
    `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    { novelId, input: { chapterNumber: 1, outlineRef: outlineId }, idempotencyKey: newIdempotencyKey() },
  );
  expect(started.statusCode).toBe(202);
  runIdForCanon = (asObj(started) as { id: string }).id;
  await e2e.driver.driveRun(runIdForCanon);
  let row = await db.workflowRun.findUniqueOrThrow({
    where: { id: runIdForCanon },
    select: { status: true },
  });
  expect(row.status).toBe("AWAITING_APPROVAL");
  const runView = asObj(
    await api("GET", `/api/workspaces/${workspaceId}/workflow-runs/${runIdForCanon}`),
  );
  const parkedStep = (runView.steps as Array<{ status: string; approvalSnapshot: { snapshotHash: string } | null }>).find(
    (st) => st.status === "AWAITING_APPROVAL",
  )!;
  const ok = await api(
    "POST",
    `/api/workspaces/${workspaceId}/workflow-runs/${runIdForCanon}/approve`,
    { expectedSnapshotHash: parkedStep.approvalSnapshot!.snapshotHash },
  );
  expect(ok.statusCode).toBe(200);
  await e2e.driver.driveRun(runIdForCanon);
  row = await db.workflowRun.findUniqueOrThrow({
    where: { id: runIdForCanon },
    select: { status: true },
  });
  expect(row.status).toBe("SUCCEEDED");

  // Two 008 applications from the run's extract step: approve the first
  // (G7's accepted fact), reject the second (G8's rejected claim — it must
  // never become a fact, never reach tier 3 or 009 memory).
  acceptedPredicate = "e2e-gates-accepted-predicate";
  rejectedPredicate = "e2e-gates-rejected-predicate";
  const oak = await s.canon.createEntity({
    ...ctx,
    kind: "LOCATION",
    name: "the hollow oak",
    key: "e2e-gates-hollow-oak",
  });
  const app1 = await s.canonApps.createApplication({
    ...ctx,
    runId: runIdForCanon,
    extractStepKey: "extract",
    items: [
      {
        claimIndex: 0,
        entity: { id: oak.id },
        predicate: acceptedPredicate,
        object: { text: "the hollow oak holds a map fragment" },
        validFromChapter: 1,
      },
    ],
  });
  const app2 = await s.canonApps.createApplication({
    ...ctx,
    runId: runIdForCanon,
    extractStepKey: "extract",
    items: [
      {
        claimIndex: 1,
        entity: { id: oak.id },
        predicate: rejectedPredicate,
        object: { text: "the hollow oak hides a second, false map" },
        validFromChapter: 1,
      },
    ],
  });
  const items1 = await db.canonApplicationItem.findMany({
    where: { applicationId: app1.id },
    select: { id: true },
  });
  expect(items1).toHaveLength(1);
  await s.canonApps.approveApplication({
    ...ctx,
    applicationId: app1.id,
    itemIds: [items1[0]!.id],
  });
  await s.canonApps.rejectApplication({
    ...ctx,
    applicationId: app2.id,
    note: "e2e: the second map is a decoy",
  });

  // Settle chapter 1 and build its memory projection AT the settle
  // revision (the loop's step-7 continuity assertion reads this projection).
  const settled = await settleRev(db, novelId, 1);
  expect(settled).not.toBeNull();
  await processRebuild(db, {
    workspaceId,
    novelId,
    scope: chapterScope(chapter1Id),
    sourceRevisionId: settled!.revisionId,
  });
  // Lock-wait budget must exceed a sibling getE2E file's WHOLE runtime under
  // parallel load. Measured 2026-10-17 co-run: this 300s budget burned while
  // the long-novel measure file held the shared e2e lock (log
  // nf053-affected-corun.log) — the same file-level failure the 2026-10-16
  // full run reported without a retained log. 600s stays finite.
}, 600_000);

afterAll(async () => {
  await closeE2E();
});

describe("G1 — pinned outline + settle-revision state in context", () => {
  it("tier 2 carries the approved outline id/version; tier 4 reflects chapter 300's settle revision", async () => {
    // G1 is specified against the BOUNDED FIXTURE (contract Invariant 5):
    // compile chapter 301 on the 300-chapter fixture novel, where the
    // fixture materialized outline nodes through the planning service,
    // set a horizon policy, and published chapter 300 through the real
    // review+setStatus path (so the story position is 300).
    const fx = await ensureFixture(db);

    // Chapter 300's settle revision (010's settle rule): the pin target.
    expect(fx.settleRevisionNumber).toBeGreaterThan(0);

    // The chapter-300 memory projection at the current head: built by the
    // fixture after every mutation, so it is FRESH and its source revision
    // is ≥ the settle revision. Rebuild here keeps the assertion true even
    // if an earlier test in this process advanced the head.
    const ch300Id = fx.chapterIds[FIXTURE_CHAPTERS - 1]!;
    const head = await db.revision.findFirstOrThrow({
      where: { novelId: fx.novelId },
      orderBy: { number: "desc" },
      select: { id: true, number: true },
    });
    await processRebuild(db, {
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      scope: chapterScope(ch300Id),
      sourceRevisionId: head.id,
    });

    const compiled = await e2e.compileFull({
      actorUserId: fx.ownerId,
      workspaceId: fx.workspaceId,
      novelId: fx.novelId,
      instruction: "Write the opening of chapter 301.",
      storyPosition: 301,
    });

    // Tier 2 (OUTLINE) pins the CURRENT approved outline's id/version —
    // not a stale one — recorded in the block provenance (invariant 6).
    const tier2 = compiled.blocks.find((b) => b.tier === 2)!;
    expect(tier2.status).toBe("PRESENT");
    expect(tier2.provenance.outlineVersionId).toBe(fx.outlineVersionId);

    // Tier 4 (STATES) reflects state as of chapter 300's settle revision:
    // the 010 state assembly corroborated live state against the 009
    // memory block, whose projection was built at/after the settle
    // revision (FRESH, never a silent stale).
    const tier4 = compiled.blocks.find((b) => b.tier === 4)!;
    expect(tier4.status).toBe("PRESENT");
    expect(tier4.provenance.memory?.status).toBe("FRESH");
    const proj = await db.memoryProjection.findFirst({
      where: { novelId: fx.novelId, scope: chapterScope(ch300Id) },
      orderBy: { createdAt: "desc" },
      select: {
        sourceRevisionId: true,
        sourceRevision: { select: { number: true } },
      },
    });
    expect(proj).toBeTruthy();
    expect(proj!.sourceRevision.number).toBeGreaterThanOrEqual(fx.settleRevisionNumber);
    expect(tier4.provenance.memory!.sourceRevisionId).toBe(proj!.sourceRevisionId);
  }, 300_000);
});

describe("G2 — mandatory-overflow refusal (never silent drop)", () => {
  it("refuses to dispatch when a mandatory block overflows and creates no run", async () => {
    // A novel with canon facts but no runs: the refusal must happen
    // before any run exists.
    const s = svc();
    const ids = await seedWorkspace(db, ownerId, "e2e-gates-overflow");
    const octx = { actorUserId: ownerId, workspaceId: ids.workspaceId, novelId: ids.novelId };
    const entity = await s.canon.createEntity({
      ...octx,
      kind: "LOCATION",
      name: "Overflow Hall",
      key: "e2e-overflow-hall",
    });
    await s.canon.createFact({
      ...octx,
      entityId: entity.id,
      predicate: "e2e-overflow-predicate",
      objectText:
        "a deliberately long fact object so the canon tier cannot fit in a " +
        "fifty-character budget, forcing the mandatory-overflow path",
      validFromChapter: 1,
    });

    const compiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId: ids.workspaceId,
      novelId: ids.novelId,
      instruction: "Write chapter 1.",
      contextBudgetChars: 50,
      mandatoryTiers: [1, 3],
    });
    expect(compiled.canDispatch).toBe(false);
    expect(compiled.overflow).toBeTruthy();
    const tier3 = compiled.blocks.find((b) => b.tier === 3)!;
    expect(tier3.status).toBe("OVERFLOWED");
    // The overflowed block carries NO rows and NO text — the mandatory
    // constraint is refused loudly, never truncated silently.
    expect(tier3.rows).toHaveLength(0);
    expect(tier3.text).toBe("");

    // The UI refuses to POST the run route here; assert no run was created.
    expect(await db.workflowRun.count({ where: { novelId: ids.novelId } })).toBe(0);
  });
});

describe("G3 — non-destructive restore", () => {
  it("apply adds exactly one RESTORE revision; covered-table row counts are otherwise unchanged", async () => {
    const s = svc();
    const ctx = { actorUserId: ownerId, workspaceId, novelId };
    const cp = await api("POST", `/api/workspaces/${workspaceId}/novels/${novelId}/checkpoints`, {
      label: "e2e-gates-g3",
    });
    expect(cp.statusCode).toBe(201);
    const checkpointId = (asObj(cp) as { checkpointId: string }).checkpointId;

    // Mutations after the checkpoint…
    await s.manuscript.saveChapter({
      ...ctx,
      chapterId: chapter1Id,
      content: "E2E gates chapter one, post-checkpoint edit.\n\nThe lanterns were relit.",
      expectedVersion: 1,
    });

    // …snapshot the covered tables right before the restore…
    const before = {
      revisions: await db.revision.count({ where: { novelId } }),
      checkpoints: await db.checkpoint.count({ where: { novelId } }),
      chapterVersions: await db.chapterVersion.count({ where: { chapter: { novelId } } }),
      canonFacts: await db.canonFact.count({ where: { novelId } }),
    };
    const preview = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/restores/preview`,
      { checkpointId, scope: "FULL" },
    );
    expect(preview.statusCode).toBe(201);
    const restoreOperationId = (asObj(preview) as { restoreOperationId: string }).restoreOperationId;
    const applied = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/restores/${restoreOperationId}/apply`,
    );
    expect([200, 201]).toContain(applied.statusCode);

    // …and the restore itself is exactly +1 revision with origin RESTORE.
    expect(await db.revision.count({ where: { novelId } })).toBe(before.revisions + 1);
    const head = await db.revision.findFirstOrThrow({
      where: { novelId },
      orderBy: { number: "desc" },
      select: { origin: true },
    });
    expect(head.origin).toBe("RESTORE");
    // Non-destructive: checkpoints are never deleted by a restore (the
    // apply may capture its own pre-change checkpoint as a HIGH op).
    expect(await db.checkpoint.count({ where: { novelId } })).toBeGreaterThanOrEqual(
      before.checkpoints,
    );
    expect(await db.chapterVersion.count({ where: { chapter: { novelId } } })).toBe(
      before.chapterVersions,
    );
    expect(await db.canonFact.count({ where: { novelId } })).toBe(before.canonFacts);

    // Pre-restore history is still readable.
    const history = asObj(
      await api("GET", `/api/workspaces/${workspaceId}/novels/${novelId}/revisions`),
    ) as { revisions: Array<{ id: string }> };
    const ids = new Set(history.revisions.map((r) => r.id));
    const preRestore = await db.revision.findMany({
      where: { novelId, number: { lte: before.revisions } },
      select: { id: true },
    });
    expect(preRestore.length).toBeGreaterThan(0);
    for (const r of preRestore) expect(ids.has(r.id)).toBe(true);
  });
});

describe("G5 — approval resumes after restart", () => {
  it("re-executed nothing, wrote nothing twice, dedupes the idempotency key", async () => {
    const s = svc();
    const ctx = { actorUserId: ownerId, workspaceId, novelId };
    const ch = await s.manuscript.createChapter({ ...ctx, title: "E2E Gates Restart Ch" });

    const key = newIdempotencyKey();
    const started = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      { novelId, input: { chapterNumber: 2, outlineRef: outlineId }, idempotencyKey: key },
    );
    expect(started.statusCode).toBe(202);
    const runId = (asObj(started) as { id: string }).id;

    await e2e.driver.driveRun(runId);
    let row = await db.workflowRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true },
    });
    expect(row.status).toBe("AWAITING_APPROVAL");

    // Record completed-step output hashes BEFORE the simulated restart.
    const before = await db.workflowStepRun.findMany({
      where: { runId, status: "SUCCEEDED" },
      select: { stepKey: true, output: true },
      orderBy: { sequence: "asc" },
    });
    expect(before.length).toBeGreaterThan(0);
    const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
    const beforeHashes = new Map(before.map((st) => [st.stepKey, hashOf(st.output)]));

    // DROP the driver instance: a fresh driver on the same DB is the
    // restarted worker. Decide + drive through the new instance.
    const restartedDriver = createTestDriver(db, {
      encryptionKey: "unit-test-encryption-key",
      createGateway: e2eCreateGateway,
    });
    const runView = asObj(
      await api("GET", `/api/workspaces/${workspaceId}/workflow-runs/${runId}`),
    );
    const parkedStep = (runView.steps as Array<{ status: string; approvalSnapshot: { snapshotHash: string } | null }>).find(
      (st) => st.status === "AWAITING_APPROVAL",
    )!;
    const decided = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflow-runs/${runId}/approve`,
      { expectedSnapshotHash: parkedStep.approvalSnapshot!.snapshotHash },
    );
    expect(decided.statusCode).toBe(200);
    await restartedDriver.driveRun(runId);
    row = await db.workflowRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true },
    });
    // Same terminal state as an uninterrupted run.
    expect(row.status).toBe("SUCCEEDED");

    // Completed steps were NOT re-executed: output hashes identical.
    // The "approve" step was AWAITING_APPROVAL at park time (not in `before`);
    // it completes during the resumed drive (in `after`). The pre-park
    // SUCCEEDED steps must have identical outputs.
    const after = await db.workflowStepRun.findMany({
      where: { runId, status: "SUCCEEDED" },
      select: { stepKey: true, output: true },
      orderBy: { sequence: "asc" },
    });
    const beforeKeys = before.map((st) => st.stepKey);
    const afterKeys = after.map((st) => st.stepKey);
    // The only new SUCCEEDED step is "approve".
    expect(afterKeys.filter((k) => !beforeKeys.includes(k))).toEqual(["approve"]);
    for (const st of after) {
      if (beforeHashes.has(st.stepKey)) {
        expect(hashOf(st.output)).toBe(beforeHashes.get(st.stepKey));
      }
    }

    // No duplicate writes: one ChapterVersion, one decision row.
    const writeRow = await db.workflowStepRun.findFirstOrThrow({
      where: { runId, stepKey: "write" },
      select: { output: true },
    });
    const prose = (writeRow.output as { json: { prose: string } }).json.prose;
    const saved = await api(
      "PUT",
      `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${ch.id}`,
      { content: prose, expectedVersion: null },
    );
    expect(saved.statusCode).toBe(200);
    expect(await db.chapterVersion.count({ where: { chapterId: ch.id } })).toBe(1);
    expect(
      await db.workflowApprovalDecision.count({ where: { runId } }),
    ).toBe(1);

    // Idempotency: re-POST with the same key → 200 with the EXISTING run.
    const runsBefore = await db.workflowRun.count({ where: { workspaceId } });
    const dup = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      { novelId, input: { chapterNumber: 2, outlineRef: outlineId }, idempotencyKey: key },
    );
    expect(dup.statusCode).toBe(200);
    expect((asObj(dup) as { id: string }).id).toBe(runId);
    expect(await db.workflowRun.count({ where: { workspaceId } })).toBe(runsBefore);
  });
});

describe("G7 — accepted fact appears in next-chapter context", () => {
  it("the approved 008 fact is in tier 3 when compiling chapter 2", async () => {
    const s = svc();
    const ctx = { actorUserId: ownerId, workspaceId, novelId };
    await s.manuscript.createChapter({ ...ctx, title: "E2E Gates Ch2" });
    const compiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      instruction: "Write chapter 2.",
    });
    expect(compiled.canDispatch).toBe(true);
    const tier3 = compiled.blocks.find((b) => b.tier === 3)!;
    expect(tier3.status).toBe("PRESENT");
    expect(tier3.text).toContain(acceptedPredicate);
  });
});

describe("G8 — rejected claim excluded from tier 3 and 009 memory", () => {
  it("the rejected 008 claim appears nowhere in canon context or memory", async () => {
    // The claim was rejected, so no fact row exists for it.
    expect(
      await db.canonFact.count({ where: { novelId, predicate: rejectedPredicate } }),
    ).toBe(0);

    const compiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      instruction: "Write chapter 2.",
    });
    const tier3 = compiled.blocks.find((b) => b.tier === 3)!;
    expect(tier3.text).not.toContain(rejectedPredicate);

    // And the 009 projection built from canon carries no trace either.
    const settled = await settleRev(db, novelId, 1);
    await processRebuild(db, {
      workspaceId,
      novelId,
      scope: chapterScope(chapter1Id),
      sourceRevisionId: settled!.revisionId,
    });
    const recompiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      instruction: "Write chapter 2.",
    });
    for (const tier of [7, 8]) {
      const block = recompiled.blocks.find((b) => b.tier === tier)!;
      expect(block.text).not.toContain(rejectedPredicate);
    }
  });
});

describe("G9 — forced-STALE detection", () => {
  it("a projection older than the head carries explicit STALE freshness", async () => {
    const s = svc();
    const ctx = { actorUserId: ownerId, workspaceId, novelId };
    const ch = await s.manuscript.createChapter({ ...ctx, title: "E2E Gates Stale Ch" });
    const chNum = (
      await db.chapter.findUniqueOrThrow({ where: { id: ch.id }, select: { number: true } })
    ).number;
    await s.manuscript.saveChapter({
      ...ctx,
      chapterId: ch.id,
      content: "A chapter whose memory will go stale.\n\nThe quay was empty.",
      expectedVersion: null,
    });

    // Build the projection at R1…
    const r1 = await readHeadRevisionId(db, novelId);
    expect(r1).toBeTruthy();
    await processRebuild(db, {
      workspaceId,
      novelId,
      scope: chapterScope(ch.id),
      sourceRevisionId: r1!,
    });

    // …then move the head with a canon revision R2…
    const entity = await s.canon.createEntity({
      ...ctx,
      kind: "ITEM",
      name: "Stale Lantern",
      key: "e2e-stale-lantern",
    });
    await s.canon.createFact({
      ...ctx,
      entityId: entity.id,
      predicate: "e2e-stale-predicate",
      objectText: "the lantern burns blue after the head moved",
      validFromChapter: 1,
    });
    const r2 = await readHeadRevisionId(db, novelId);
    expect(r2).not.toBe(r1);

    // …and compile WITHOUT rebuilding: if tiers 7/8 are PRESENT, they
    // must say STALE loudly (never a silent stale). The authoritative
    // STALE signal is verified via /memory/status below.
    const compiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      instruction: "Write the next chapter.",
      storyPosition: chNum,
    });
    const staleBlocks = compiled.blocks.filter(
      (b) => (b.tier === 7 || b.tier === 8) && b.status === "PRESENT",
    );
    for (const b of staleBlocks) {
      expect(b.provenance.freshness).toBe("STALE");
    }

    // GET /memory/status reports the same staleness for the scope.
    const statusRes = await api(
      "GET",
      `/api/workspaces/${workspaceId}/novels/${novelId}/memory/status`,
    );
    expect(statusRes.statusCode).toBe(200);
    const statuses = (
      asObj(statusRes) as { statuses: Array<{ scope: string; freshness: string }> }
    ).statuses;
    const staleScope = statuses.find((st) => st.scope === chapterScope(ch.id));
    expect(staleScope).toBeTruthy();
    expect(staleScope!.freshness).toBe("STALE");
  });

  it("unconditional stale-tier assertion: PRESENT tier 7/8 blocks carry STALE provenance pinned to R1", async () => {
    // NF-WF-044 (GAP-043): unlike the test above, the canon fact is created
    // BEFORE processRebuild, so the R1 projection has structural content
    // and tier 7/8 compile PRESENT (not EMPTY). The anti-vacuous guard then
    // proves the collection is non-empty before any per-block assertion —
    // this test FAILS (never passes vacuously) if the fixture cannot
    // produce PRESENT blocks.
    const s = svc();
    const ctx = { actorUserId: ownerId, workspaceId, novelId };
    const ch = await s.manuscript.createChapter({ ...ctx, title: "E2E Gates Stale Tier Ch" });
    const chNum = (
      await db.chapter.findUniqueOrThrow({ where: { id: ch.id }, select: { number: true } })
    ).number;
    await s.manuscript.saveChapter({
      ...ctx,
      chapterId: ch.id,
      content: "A chapter whose memory projection holds structural content.\n\nThe harbor bell rang twice.",
      expectedVersion: null,
    });
    // The compiler resolves storyPosition via getStoryPosition (max chapter
    // with IN_REVIEW/PUBLISHED status); a DRAFT chapter resolves to 0 and
    // tiers 7/8 compile UNAVAILABLE. Promote through the OFFICIAL flow:
    // reviewFinalText (assert the PASS verdict explicitly) then
    // manuscript.setStatus to IN_REVIEW (the DRAFT→IN_REVIEW transition
    // reads the review receipt via assertPublishReviewGate). This proves
    // the official mutation flow was used — not a direct DB status write.
    const versionIdForReview = (
      await db.chapter.findUniqueOrThrow({
        where: { id: ch.id },
        select: { currentVersionId: true },
      })
    ).currentVersionId;
    expect(versionIdForReview).toBeTruthy();
    const verdict = await s.finalTextReview.reviewFinalText({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      chapterId: ch.id,
      chapterVersionId: versionIdForReview!,
    });
    expect(verdict.verdict).toBe("PASS");
    await s.manuscript.setStatus({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      chapterId: ch.id,
      status: "IN_REVIEW",
    });
    const chapterStatus = (
      await db.chapter.findUniqueOrThrow({
        where: { id: ch.id },
        select: { status: true },
      })
    ).status;
    expect(chapterStatus).toBe("IN_REVIEW");

    // Canon fact BEFORE the rebuild: visible at R1, so the projection has
    // structural content (facts) and the compiler emits PRESENT blocks.
    const entity = await s.canon.createEntity({
      ...ctx,
      kind: "ITEM",
      name: "Stale Tier Chalice",
      key: "e2e-stale-tier-chalice",
    });
    await s.canon.createFact({
      ...ctx,
      entityId: entity.id,
      predicate: "e2e-stale-tier-predicate",
      objectText: "the chalice holds harbor water",
      validFromChapter: 1,
    });

    // Build the projection at R1.
    const r1 = await readHeadRevisionId(db, novelId);
    expect(r1).toBeTruthy();
    const rebuild = await processRebuild(db, {
      workspaceId,
      novelId,
      scope: chapterScope(ch.id),
      sourceRevisionId: r1!,
    });
    expect(rebuild.ok).toBe(true);

    // Verify the projection row exists at R1 with structural content
    // (R1/R5: never assume the rebuild produced content).
    const projection = await db.memoryProjection.findUnique({
      where: {
        novelId_scope_sourceRevisionId: { novelId, scope: chapterScope(ch.id), sourceRevisionId: r1! },
      },
    });
    expect(projection).toBeTruthy();
    expect(projection!.buildStatus).toBe("OK");
    const structural = projection!.structural as {
      facts: unknown[];
      threads: unknown[];
      promises: unknown[];
    };
    const structuralCount =
      structural.facts.length + structural.threads.length + structural.promises.length;
    expect(structuralCount).toBeGreaterThan(0);

    // Move the head with a second canon revision R2.
    const entity2 = await s.canon.createEntity({
      ...ctx,
      kind: "ITEM",
      name: "Stale Tier Compass",
      key: "e2e-stale-tier-compass",
    });
    await s.canon.createFact({
      ...ctx,
      entityId: entity2.id,
      predicate: "e2e-stale-tier-predicate-2",
      objectText: "the compass spins after the head moved",
      validFromChapter: 1,
    });
    const r2 = await readHeadRevisionId(db, novelId);
    expect(r2).not.toBe(r1);

    // Compile WITHOUT rebuilding.
    const compiled = await e2e.compileFull({
      actorUserId: ownerId,
      workspaceId,
      novelId,
      instruction: "Write the next chapter.",
      storyPosition: chNum,
    });

    // Anti-vacuous guard (R1/R5): the PRESENT tier 7/8 collection must be
    // non-empty BEFORE any per-block assertion. A zero-length collection
    // here means the fixture is broken — the test FAILS.
    const staleTierBlocks = compiled.blocks.filter(
      (b) => (b.tier === 7 || b.tier === 8) && b.status === "PRESENT",
    );
    expect(staleTierBlocks.length).toBeGreaterThan(0);

    // Every PRESENT block carries STALE provenance pinned to the stale
    // revision R1 — read from the block's provenance, never defaulted
    // (R4: the expected values are named, not merely "present").
    for (const b of staleTierBlocks) {
      expect(b.provenance.freshness).toBe("STALE");
      expect(b.provenance.sourceRevisionId).toBe(r1);
      // The block carries real projection content (P3-2 verified:
      // extraction populates chapterCoverage for chapter scopes).
      expect(Array.isArray(b.provenance.chapterCoverage)).toBe(true);
      expect(b.provenance.chapterCoverage!.length).toBeGreaterThan(0);
      // Defense in depth: a PRESENT block with empty text would mean the
      // EMPTY-vs-PRESENT boundary is misclassified.
      expect(b.text.length).toBeGreaterThan(0);
    }
  });
});

describe("G10 — evidence-backed findings end to end", () => {
  it("every finding carries evidence; the forced KBV pins the fact and character", async () => {
    const fixture = await ensureFixture(db);
    const health = createStoryHealthServices({ db, audit: createAuditService(db) });
    const { findings } = await health.evaluateHealth({
      actorUserId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      novelId: fixture.novelId,
      chapter: 300,
    });

    // Invariant 7: every finding is evidence-backed — assert over ALL of them.
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) assertFindingEvidence(f);

    // The forced KNOWLEDGE_BOUNDARY_VIOLATION pins the fact id (a
    // "chapterVersion"-kind evidence row) and the character id.
    const kbv = findings.find((f) => f.rule === "KNOWLEDGE_BOUNDARY_VIOLATION");
    expect(kbv, "forced KBV finding missing at chapter 300").toBeTruthy();
    // The KBV finding must pin a character and a content source (chapter
    // version carrying the fact, or the fact itself) — evidence-backed.
    const kinds = kbv!.evidence.map((e) => e.kind);
    expect(kinds).toContain("character");
    expect(kinds.some((k) => k === "chapterVersion" || k === "fact")).toBe(true);
  }, 600_000);
});

describe("authorization negatives", () => {
  it("an outsider gets 404 and a viewer gets 403 on the run route", async () => {
    // Outsider: a user with no membership in the workspace.
    const outsider = await db.user.create({
      data: { email: "e2e-outsider@example.com", passwordHash: "x", displayName: "outsider" },
    });
    const { generateSessionToken, hashSessionToken } = await import("@novelforge/auth");
    const token = generateSessionToken();
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: outsider.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const outsiderCookie = `nf_session=${token}`;
    const denied = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      { novelId, input: { chapterNumber: 1, outlineRef: outlineId }, idempotencyKey: newIdempotencyKey() },
      outsiderCookie,
    );
    // ADR-0004: missing membership is a 404, not a 403 — the caller must
    // not learn whether the workspace exists.
    expect(denied.statusCode).toBe(404);

    // Viewer: membership without the execute capability.
    const viewer = await db.user.create({
      data: { email: "e2e-viewer@example.com", passwordHash: "x", displayName: "viewer" },
    });
    const vToken = generateSessionToken();
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(vToken),
        userId: viewer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await db.membership.create({
      data: { workspaceId, userId: viewer.id, role: "VIEWER" },
    });
    const viewerCookie = `nf_session=${vToken}`;
    const forbidden = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
      { novelId, input: { chapterNumber: 1, outlineRef: outlineId }, idempotencyKey: newIdempotencyKey() },
      viewerCookie,
    );
    expect(forbidden.statusCode).toBe(403);
  });

  it("a viewer without revision:manage is refused on checkpoint/restore routes", async () => {
    // VIEWER membership on the gates workspace: no revision:manage.
    const viewer = await db.user.create({
      data: { email: "e2e-restore-viewer@example.com", passwordHash: "x", displayName: "viewer2" },
    });
    const { generateSessionToken, hashSessionToken } = await import("@novelforge/auth");
    const vToken = generateSessionToken();
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(vToken),
        userId: viewer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await db.membership.create({
      data: { workspaceId, userId: viewer.id, role: "VIEWER" },
    });
    const viewerCookie = `nf_session=${vToken}`;
    const novelBase = `/api/workspaces/${workspaceId}/novels/${novelId}`;

    // checkpoint create requires revision:manage (revisions.ts gate).
    const cp = await api(
      "POST",
      `${novelBase}/checkpoints`,
      { label: "e2e-viewer-checkpoint" },
      viewerCookie,
    );
    expect(cp.statusCode).toBe(403);
    expect((asObj(cp) as { error: string }).error).toBe("FORBIDDEN");

    // restore preview requires revision:manage — refused before any
    // checkpoint lookup (the gate runs first).
    const preview = await api(
      "POST",
      `${novelBase}/restores/preview`,
      { checkpointId: randomUUID(), scope: "FULL" },
      viewerCookie,
    );
    expect(preview.statusCode).toBe(403);
    expect((asObj(preview) as { error: string }).error).toBe("FORBIDDEN");

    // restore apply requires revision:manage.
    const applied = await api(
      "POST",
      `${novelBase}/restores/${randomUUID()}/apply`,
      {},
      viewerCookie,
    );
    expect(applied.statusCode).toBe(403);
    expect((asObj(applied) as { error: string }).error).toBe("FORBIDDEN");
  });
});
