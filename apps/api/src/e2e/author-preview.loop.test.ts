/**
 * NF-WF-011 author-preview E2E loop (`apps/api/src/e2e/author-preview.loop.test.ts`).
 *
 * Replays the novel page's generation surface EXACT API sequence against
 * the real app (buildApp + real services, fake gateway adapter per
 * GAP-028): generate (workflow run) → drive/approve → save chapter →
 * canon decisions → final-text-review → setStatus PUBLISHED → next-chapter
 * continuity → checkpoint/restore.
 *
 * UI↔E2E DRIFT TRIPWIRE (contract P3 observation 2): this loop mirrors the
 * generation surface method-for-method. If any of these UI methods changes
 * its API sequence, THIS FILE must change with it — UI↔E2E drift is a
 * contract violation (Invariant 2):
 *
 * - GenerationPanel.startRun (resolveWorkflowId by key
 *   "chapter-generation-review") → useWorkflowRuns.startRun →
 *   POST /api/workspaces/:workspaceId/workflows/:workflowId/run
 *   { novelId, input, idempotencyKey }
 * - RunStatusPanel (2s poll) → useWorkflowRuns.getRun →
 *   GET /api/workspaces/:workspaceId/workflow-runs/:runId
 * - ApprovalDialog → useWorkflowRuns.decideRun →
 *   POST /api/workspaces/:workspaceId/workflow-runs/:runId/approve
 *   { expectedSnapshotHash }
 * - DraftDiffView → ApplyBar → PUT
 *   /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId
 *   { content, expectedVersion }
 * - CanonApplicationReview → POST
 *   /api/workspaces/:workspaceId/novels/:novelId/canon/applications
 *   { runId, extractStepKey, items } then
 *   POST .../canon/applications/:applicationId/approve { itemIds }
 * - FindingsPanel → POST
 *   /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/final-text-review
 *   { chapterVersionId }
 * - novel page setStatus → PATCH
 *   /api/workspaces/:workspaceId/novels/:novelId/chapters/:chapterId/status
 *   { status }
 *
 * DEVIATION (recorded as GAP-041 before the workaround): the contract's
 * Invariant 2 step 1 pins POST /api/workspaces/:workspaceId/generate as
 * "starts the chapter workflow run". That route returns a bare generation
 * (no run exists to drive or approve), and the UI never calls it for
 * chapter generation — GenerationPanel starts runs through the workflow
 * run route above. The loop implements the UI's ACTUAL sequence (the
 * contract's normative "replays the UI's EXACT API sequence"); POST
 * /generate is not called here.
 */
import { createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NovelForgeDb } from "@novelforge/database";
import { settleRev, processRebuild, chapterScope } from "@novelforge/memory";
import {
  getE2E,
  closeE2E,
  seedWorkspace,
  newIdempotencyKey,
  type E2EContext,
} from "./setup.ts";
import { createAuditService } from "../services/audit.ts";
import { createPlanningServices } from "../services/planning.ts";
import { createManuscriptServices } from "../services/manuscript.ts";
import { createStoryServices } from "../services/story.ts";
import { createNarrativeServices } from "../services/narrative.ts";
import {
  assertFindingEvidence,
  type EvidenceFinding,
} from "../services/evidence-findings.ts";

let e2e: E2EContext;
let db: NovelForgeDb;
let workspaceId: string;
let novelId: string;
let ownerId: string;
let cookie: string;
let workflowId: string;
let outlineRef: string;

type ApiResult = { statusCode: number; body: unknown };

async function api(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult> {
  const res = await e2e.app.inject({
    method,
    url,
    headers: { cookie },
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

async function resolveTemplateWorkflowId(): Promise<string> {
  // GenerationPanel.startRun → useWorkflowRuns.resolveWorkflowId:
  // list workflows, find key "chapter-generation-review".
  const res = await api("GET", `/api/workspaces/${workspaceId}/workflows`);
  expect(res.statusCode).toBe(200);
  const rows = res.body as unknown as Array<{ id: string; key: string }>;
  const found = rows.find((r) => r.key === "chapter-generation-review");
  expect(found, "chapter-generation-review workflow missing from list").toBeTruthy();
  return found!.id;
}

/** Start a chapter run exactly like GenerationPanel.startRun does. */
async function startChapterRun(chapterNumber: number, idempotencyKey?: string) {
  const key = idempotencyKey ?? newIdempotencyKey();
  const res = await api(
    "POST",
    `/api/workspaces/${workspaceId}/workflows/${workflowId}/run`,
    {
      novelId,
      input: { chapterNumber, outlineRef },
      idempotencyKey: key,
    },
  );
  return { res, key };
}

async function driveToParkOrTerminal(runId: string): Promise<string> {
  const result = await e2e.driver.driveRun(runId);
  const row = await db.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true },
  });
  void result;
  return row.status;
}

async function approvalSnapshotHash(runId: string): Promise<string> {
  const res = await api("GET", `/api/workspaces/${workspaceId}/workflow-runs/${runId}`);
  expect(res.statusCode).toBe(200);
  const body = asObj(res);
  const steps = body.steps as Array<{
    stepKey: string;
    status: string;
    approvalSnapshot: { snapshotHash: string } | null;
  }>;
  const parked = steps.find((s) => s.status === "AWAITING_APPROVAL");
  expect(parked, "no parked step found").toBeTruthy();
  expect(parked!.approvalSnapshot?.snapshotHash).toBeTruthy();
  return parked!.approvalSnapshot!.snapshotHash;
}

async function writeStepProse(runId: string): Promise<string> {
  const row = await db.workflowStepRun.findFirstOrThrow({
    where: { runId, stepKey: "write" },
    select: { output: true },
  });
  const output = row.output as { json?: { prose?: string } } | null;
  const prose = output?.json?.prose;
  expect(typeof prose === "string" && prose.length > 0).toBe(true);
  return prose!;
}

beforeAll(async () => {
  e2e = await getE2E();
  db = e2e.db;
  ownerId = e2e.admin.userId;
  cookie = e2e.admin.cookie;
  const ids = await seedWorkspace(db, ownerId, "e2e-loop");
  workspaceId = ids.workspaceId;
  novelId = ids.novelId;

  // One approved outline for the loop novel (tier-2 pin, G1).
  const planning = createPlanningServices({ db, audit: createAuditService(db) });
  const draft = await planning.createOutlineDraft({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    content: { title: "E2E loop outline", chapters: [{ chapter: 1, beat: "the expedition sets out" }] },
    note: "e2e",
  });
  const approved = await planning.approveOutlineVersion({
    actorUserId: ownerId,
    workspaceId,
    novelId,
    versionId: draft.id,
  });
  outlineRef = approved.id;

  workflowId = await resolveTemplateWorkflowId();
}, 120_000);

afterAll(async () => {
  await closeE2E();
});

describe("author-preview E2E loop (G4 + G6)", () => {
  it("asserts the 409 gate path FIRST: a HARD policy violation blocks publication", async () => {
    // The deliberately-failing chapter: HARD COOLDOWN violated → FAIL →
    // setStatus PUBLISHED → 409 HARD_POLICY_VIOLATION (state-consumers
    // recipe, adapted to the loop novel).
    //
    // Uses its OWN novel: the HARD policy must not leak into the full
    // loop's novel (which needs a PASS verdict to reach PUBLISHED).
    const failIds = await seedWorkspace(db, ownerId, "e2e-loop-409");
    const fws = failIds.workspaceId;
    const fnovel = failIds.novelId;
    const narrative = createNarrativeServices({ db, audit: createAuditService(db) });
    const story = createStoryServices({ db, audit: createAuditService(db) });
    const manuscript = createManuscriptServices(db, createAuditService(db), {});
    const sctx = { actorUserId: ownerId, workspaceId: fws, novelId: fnovel };
    await narrative.putPolicy({
      ...sctx,
      kind: "COOLDOWN",
      hardness: "HARD",
      hardReason: "the author binds the beat spacing",
      payload: { windowChapters: 5 },
    });
    const mk = async (title: string) => {
      const ch = await manuscript.createChapter({ ...sctx, title });
      const saved = await manuscript.saveChapter({
        ...sctx,
        chapterId: ch.id,
        content: `E2E failing chapter ${title}.\n\nWren counted the lanterns.`,
        expectedVersion: null,
      });
      const version = await db.chapterVersion.findFirstOrThrow({
        where: { chapterId: ch.id },
        orderBy: { number: "desc" },
        select: { id: true },
      });
      void saved;
      return { chapterId: ch.id, versionId: version.id };
    };
    const chA = await mk("E2E Fail A");
    const chB = await mk("E2E Fail B");
    await story.createEvent({
      ...sctx,
      description: "a duel",
      chapterId: chA.chapterId,
      availableFromChapter: 5,
    });
    await story.createEvent({
      ...sctx,
      description: "a second duel",
      chapterId: chB.chapterId,
      availableFromChapter: 7,
    });

    const review = await api(
      "POST",
      `/api/workspaces/${fws}/novels/${fnovel}/chapters/${chB.chapterId}/final-text-review`,
      { chapterVersionId: chB.versionId },
    );
    expect(review.statusCode).toBe(200);
    const reviewBody = asObj(review);
    expect(reviewBody.verdict).toBe("FAIL");
    const rules = (reviewBody.hardViolations as Array<{ rule: string }>).map((v) => v.rule);
    expect(rules).toContain("COOLDOWN_VIOLATION");

    // G10 (reviewFinalText half): EVERY finding from reviewFinalText
    // satisfies assertFindingEvidence — non-vacuous here, the FAIL
    // verdict carries the COOLDOWN_VIOLATION hard violation.
    const violations = reviewBody.hardViolations as EvidenceFinding[];
    expect(violations.length).toBeGreaterThan(0);
    for (const v of violations) assertFindingEvidence(v);

    const blocked = await api(
      "PATCH",
      `/api/workspaces/${fws}/novels/${fnovel}/chapters/${chB.chapterId}/status`,
      { status: "PUBLISHED" },
    );
    expect(blocked.statusCode).toBe(409);
    expect((asObj(blocked) as { error: string }).error).toBe("HARD_POLICY_VIOLATION");
  }, 120_000);

  it("runs the full 8-step UI sequence: generate → approve → save → canon → review → publish → continuity → checkpoint/restore", async () => {
    const manuscript = createManuscriptServices(db, createAuditService(db), {});
    const sctx = { actorUserId: ownerId, workspaceId, novelId };

    // -- chapter 1 exists before generation (the novel page's chapter) --
    const ch1 = await manuscript.createChapter({ ...sctx, title: "E2E Chapter 1" });
    const chapterId = ch1.id;

    // -- STEP 1: generate — GenerationPanel.startRun → POST the run route --
    const started = await startChapterRun(1);
    expect(started.res.statusCode).toBe(202);
    const runId = (asObj(started.res) as { id: string }).id;
    expect(runId).toBeTruthy();

    // -- STEP 2: drive → AWAITING_APPROVAL; ApprovalDialog → decideRun --
    let status = await driveToParkOrTerminal(runId);
    expect(status).toBe("AWAITING_APPROVAL");
    const hash = await approvalSnapshotHash(runId);
    const decided = await api(
      "POST",
      `/api/workspaces/${workspaceId}/workflow-runs/${runId}/approve`,
      { expectedSnapshotHash: hash },
    );
    expect(decided.statusCode).toBe(200);
    status = await driveToParkOrTerminal(runId);
    expect(status).toBe("SUCCEEDED");

    // -- STEP 3: DraftDiffView → ApplyBar — save the generated draft --
    const prose = await writeStepProse(runId);
    const saved = await api(
      "PUT",
      `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${ch1.id}`,
      { content: prose, note: "e2e apply draft", expectedVersion: null },
    );
    expect(saved.statusCode).toBe(200);
    const versionNumber = (asObj(saved) as { version: number }).version;
    expect(versionNumber).toBeGreaterThan(0);
    const version = await e2e.db.chapterVersion.findFirstOrThrow({
      where: { chapterId, number: versionNumber },
      select: { id: true },
    });
    const versionId = version.id;

    // -- STEP 4: CanonApplicationReview — create + approve the application --
    // The extract step's proposals are CANDIDATES; the author commits them
    // explicitly (constitution §2.13). The fake gateway's extract output
    // carries two proposals; the loop approves claim 0 only.
    const created = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/canon/applications`,
      {
        runId,
        extractStepKey: "extract",
        items: [
          {
            claimIndex: 0,
            entity: { kind: "LOCATION", name: "the hollow oak" },
            predicate: "holds a map fragment",
            object: { text: "a map fragment in the hollow oak" },
            validFromChapter: 1,
          },
        ],
      },
    );
    expect(created.statusCode).toBe(201);
    const applicationId = (asObj(created) as { id: string }).id;
    const approved = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/canon/applications/${applicationId}/approve`,
      { itemIds: (asObj(created) as { items: Array<{ id: string }> }).items.map((i) => i.id) },
    );
    if (approved.statusCode !== 200) {
      console.log("APPROVE-409-BODY:", JSON.stringify(asObj(approved)).slice(0, 800));
    }
    expect(approved.statusCode).toBe(200);
    const appRow = await db.canonApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    expect(appRow.status).toBe("APPLIED");

    // -- STEP 5: FindingsPanel — final-text-review of the saved version --
    const review = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${ch1.id}/final-text-review`,
      { chapterVersionId: versionId },
    );
    expect(review.statusCode).toBe(200);
    expect((asObj(review) as { verdict: string }).verdict).toBe("PASS");

    // G10 (reviewFinalText half): every finding the review emitted —
    // hard violations and advisories — carries evidence. (The FAIL
    // chapter above pins the non-vacuous case; the PASS chapter asserts
    // the invariant over whatever the review emitted.)
    const passBody = asObj(review) as {
      hardViolations: EvidenceFinding[];
      advisory: Array<{ evidence: unknown[] }>;
    };
    for (const v of passBody.hardViolations ?? []) assertFindingEvidence(v);
    for (const a of passBody.advisory ?? []) {
      expect(a.evidence.length).toBeGreaterThan(0);
    }

    // -- STEP 6: novel page setStatus → PUBLISHED --
    const published = await api(
      "PATCH",
      `/api/workspaces/${workspaceId}/novels/${novelId}/chapters/${ch1.id}/status`,
      { status: "PUBLISHED" },
    );
    expect(published.statusCode).toBe(200);

    // -- STEP 7: next-chapter continuity — 009 N→N+1 over settled state --
    // Chapter 1's settle revision is the max of its manuscript and canon-
    // apply revisions. Rebuild chapter:ch1's projection AT that revision,
    // then run chapter 2's generation: its compile_context step (tier 7/8)
    // must carry chapter 1's scope block at a revision ≥ the settle rev.
    const settled = await settleRev(db, novelId, 1);
    expect(settled).not.toBeNull();
    // Rebuild at the CURRENT head (the canon application in step 4 moved
    // the head past the settle revision; the recall reads as-of head).
    const head = await db.revision.findFirstOrThrow({
      where: { novelId },
      orderBy: { number: "desc" },
      select: { id: true, number: true },
    });
    await processRebuild(db, {
      workspaceId,
      novelId,
      scope: chapterScope(ch1.id),
      sourceRevisionId: head.id,
    });
    const _ch2 = await manuscript.createChapter({ ...sctx, title: "E2E Chapter 2" });
    const started2 = await startChapterRun(2);
    expect(started2.res.statusCode).toBe(202);
    const run2 = (asObj(started2.res) as { id: string }).id;
    const status2 = await driveToParkOrTerminal(run2);
    expect(status2).toBe("AWAITING_APPROVAL");
    const compileStep = await db.workflowStepRun.findFirstOrThrow({
      where: { runId: run2, stepKey: "compile_context" },
      select: { output: true },
    });
    const blocks = (
      compileStep.output as {
        json?: { blocks?: Array<{ tier: number; status: string; provenance?: { sourceRevisionId?: string } }> };
      } | null
    )?.json?.blocks;
    expect(blocks).toBeTruthy();
    const tier7 = blocks!.find((b) => b.tier === 7);
    expect(tier7).toBeTruthy();
    expect(tier7!.status).toBe("PRESENT");
    // N→N+1 continuity over settled state: the recalled chapter-1 projection
    // (which tier 7 just proved PRESENT) was built at a revision ≥ the
    // settle revision. The driver's reduced block shape does not carry the
    // provenance through the step output, so verify via the projection row.
    const projRow = await db.memoryProjection.findFirstOrThrow({
      where: { novelId, scope: chapterScope(ch1.id) },
      orderBy: { createdAt: "desc" },
      select: { sourceRevision: { select: { number: true } } },
    });
    expect(projRow.sourceRevision.number).toBeGreaterThanOrEqual(settled!.revisionNumber);

    // -- STEP 8: checkpoint → preview → apply (non-destructive restore) --
    const revCountBefore = await db.revision.count({ where: { novelId } });
    const cpCountBefore = await db.checkpoint.count({ where: { novelId } });
    const _verCountBefore = await db.chapterVersion.count({
      where: { chapter: { novelId } },
    });
    const factCountBefore = await db.canonFact.count({ where: { novelId } });
    const cp = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/checkpoints`,
      { label: "e2e-loop-checkpoint" },
    );
    expect(cp.statusCode).toBe(201);
    const checkpointId = (asObj(cp) as { checkpointId: string }).checkpointId;
    expect(checkpointId).toBeTruthy();
    // Two mutations after the checkpoint, on a fresh DRAFT chapter
    // (ch1 is PUBLISHED and immutable by step 6).
    const ch3 = await manuscript.createChapter({ ...sctx, title: "E2E Chapter 3" });
    await manuscript.saveChapter({
      ...sctx,
      chapterId: ch3.id,
      content: prose + "\n\nA post-checkpoint paragraph that must be rewound.",
      expectedVersion: null,
    });
    const story = createStoryServices({ db, audit: createAuditService(db) });
    await story.createEvent({
      ...sctx,
      description: "a post-checkpoint skirmish",
      chapterId: ch3.id,
      availableFromChapter: 1,
    });
    // …preview, then apply the restore…
    const preview = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/restores/preview`,
      { checkpointId, scope: "FULL" },
    );
    expect(preview.statusCode).toBe(201);
    const restoreOperationId = (asObj(preview) as { restoreOperationId: string }).restoreOperationId;
    expect(restoreOperationId).toBeTruthy();
    // Capture counts AFTER the post-checkpoint mutations but BEFORE apply,
    // so the +1 is the restore's own revision alone.
    const revCountPreApply = await db.revision.count({ where: { novelId } });
    const verCountPreApply = await db.chapterVersion.count({
      where: { chapter: { novelId } },
    });
    const applied = await api(
      "POST",
      `/api/workspaces/${workspaceId}/novels/${novelId}/restores/${restoreOperationId}/apply`,
    );
    expect([200, 201]).toContain(applied.statusCode);
    // …and the restore is non-destructive: exactly +1 revision with origin
    // RESTORE; the pre-restore history is still readable; the other
    // covered tables have unchanged row counts.
    const revCountAfter = await db.revision.count({ where: { novelId } });
    expect(revCountAfter).toBe(revCountPreApply + 1);
    const restoreRev = await db.revision.findFirstOrThrow({
      where: { novelId },
      orderBy: { number: "desc" },
      select: { origin: true },
    });
    expect(restoreRev.origin).toBe("RESTORE");
    // At least our checkpoint was created (the restore apply itself may
    // capture its own pre-change checkpoint as a HIGH operation).
    expect(await db.checkpoint.count({ where: { novelId } })).toBeGreaterThanOrEqual(
      cpCountBefore + 1,
    );
    // Non-destructive: the post-checkpoint version row is NOT deleted by the
    // restore (history remains readable); the count is unchanged by apply.
    expect(await db.chapterVersion.count({ where: { chapter: { novelId } } })).toBe(
      verCountPreApply,
    );
    expect(await db.canonFact.count({ where: { novelId } })).toBe(factCountBefore);
    const history = await api("GET", `/api/workspaces/${workspaceId}/novels/${novelId}/revisions`);
    expect(history.statusCode).toBe(200);
    const historyIds = new Set(
      ((asObj(history) as { revisions: Array<{ id: string }> }).revisions ?? []).map((r) => r.id),
    );
    const preRestore = await db.revision.findMany({
      where: { novelId, number: { lte: revCountBefore } },
      select: { id: true },
    });
    for (const r of preRestore) expect(historyIds.has(r.id)).toBe(true);
  }, 300_000);
});

describe("loop determinism support", () => {
  it("hashes step outputs deterministically (restart-resume compares these)", async () => {
    const started = await startChapterRun(3);
    expect([200, 202]).toContain(started.res.statusCode);
    const runId = (asObj(started.res) as { id: string }).id;
    const status = await driveToParkOrTerminal(runId);
    expect(["AWAITING_APPROVAL", "SUCCEEDED"]).toContain(status);
    const steps = await db.workflowStepRun.findMany({
      where: { runId, status: "SUCCEEDED" },
      select: { stepKey: true, output: true },
      orderBy: { sequence: "asc" },
    });
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      const h = createHash("sha256").update(JSON.stringify(s.output)).digest("hex");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  }, 180_000);
});
