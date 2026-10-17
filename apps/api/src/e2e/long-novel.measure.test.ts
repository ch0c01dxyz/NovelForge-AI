/**
 * NF-WF-011 measurement tests: thresholds chosen BEFORE measuring (GAP-010).
 *
 * Absolute ceilings (generous first guesses, per contract Q3 / Invariant 4):
 * - compile chapter 301: 10s p95 / 500 queries
 * - recallNovel chapter 300: 2s p95 / 200 queries
 * - processRebuild (one scope, direct @novelforge/memory call): 60s p95
 * - evaluateHealth chapter 300: 30s p95 / 1000 queries
 * - checkpoint create + preview + apply: 120s total
 * - fixture build (all 300 chapters): 600s
 *
 * PLUS the >2× no-regression rule against the committed
 * `docs/implementation/e2e-baseline.json`. The strict >2× rule applies to
 * deterministic measurements (query counts, context sizes); latencies are
 * checked against the absolute ceilings (contract P3 observation 1).
 *
 * The rebuild measurement MUST call `processRebuild` from
 * `@novelforge/memory` directly (the driver's memory queue is a no-op
 * fake).
 *
 * `SKIP_FIXTURE_BUILD=1` skips the real timed fixture build + the
 * determinism builds (documented in E2E-RUNNER.md as local-only
 * measurements); the baseline test then carries the committed
 * fixture_build receipt forward instead of re-measuring it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";
import { getE2E, closeE2E, type E2EContext } from "./setup.ts";
import {
  bindMeasureDb,
  measureQueries,
  measureLatency,
  measureContext,
  writeBaselineReceipt,
  checkNoRegression,
  type E2EBaseline,
} from "./measure.ts";
import {
  ensureFixture,
  buildLongNovelFixture,
  FIXTURE_SEED,
  FIXTURE_CHAPTERS,
  type FixtureNovel,
} from "./long-novel.fixture.ts";
import { createAuditService } from "@novelforge/ai-services";
import { createStoryHealthServices } from "../services/story-health.ts";
import { createMemoryServices } from "@novelforge/ai-services";
import { settleRev, processRebuild, chapterScope } from "@novelforge/memory";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = path.join(HERE, "..", "..", "..", "..");
const BASELINE_PATH = path.join(REPO_ROOT, "docs", "implementation", "e2e-baseline.json");
const SKIP_FIXTURE_BUILD = process.env.SKIP_FIXTURE_BUILD === "1";

let e2e: E2EContext;
let db: NovelForgeDb;
let mdb: NovelForgeDb;
let fixture: FixtureNovel;

type ApiResult = { statusCode: number; body: unknown };

async function api(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body: unknown,
  cookie: string,
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

/** One recorded measurement for the baseline receipt. */
interface RecordedMeasurement {
  p50Ms: number;
  p95Ms: number;
  queries: number;
  thresholdMs: number;
  thresholdQueries: number | null;
}

const recorded = new Map<string, RecordedMeasurement>();
const contextSizes: Record<string, Record<string, number>> = {};

function record(
  name: string,
  m: { p50Ms: number; p95Ms: number },
  queries: number,
  thresholdMs: number,
  thresholdQueries: number | null,
): void {
  recorded.set(name, {
    p50Ms: Math.round(m.p50Ms),
    p95Ms: Math.round(m.p95Ms),
    queries,
    thresholdMs,
    thresholdQueries,
  });
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function readCommittedBaseline(): { baseline: E2EBaseline | null; shapeNote: string | null } {
  try {
    if (!existsSync(BASELINE_PATH)) return { baseline: null, shapeNote: null };
    const raw = readFileSync(BASELINE_PATH, "utf8").trim();
    if (!raw) return { baseline: null, shapeNote: null };
    const parsed = JSON.parse(raw) as E2EBaseline;
    // Shape gate: a legacy/hand-written receipt that does not match the
    // E2EBaseline interface (no per-tier contextSizes, no thresholds
    // table) is not a usable baseline — re-baseline with a recorded
    // reason instead of comparing against a different schema.
    const shapeOk =
      parsed &&
      typeof parsed === "object" &&
      parsed.measurements !== null &&
      typeof parsed.measurements === "object" &&
      parsed.contextSizes !== null &&
      typeof parsed.contextSizes === "object" &&
      parsed.thresholds !== null &&
      typeof parsed.thresholds === "object";
    if (!shapeOk) {
      return {
        baseline: null,
        shapeNote:
          "previous e2e-baseline.json did not match the E2EBaseline shape (missing contextSizes/thresholds); re-baselined with the harness schema",
      };
    }
    return { baseline: parsed, shapeNote: null };
  } catch {
    return { baseline: null, shapeNote: null };
  }
}

beforeAll(async () => {
  e2e = await getE2E();
  db = e2e.db;
  mdb = bindMeasureDb(db);
  fixture = await ensureFixture(db);
  // Same shared-lock wait budget as gates/author-preview (600s): this file
  // can also be the HOLDER whose fixture runtime the siblings must out-wait.
}, 600_000);

afterAll(async () => {
  await closeE2E();
});

describe("NF-WF-011 measurements", () => {
  it("compile: chapter 301 context under 10s p95 / 500 queries", async () => {
    // The query counter instruments the compiler's OWN db handle: the
    // harness's compileFull uses the base client, so the measured compile
    // goes through compileFullWithDb(mdb, ...) (setup.ts) — same domain
    // logic, counting transport.
    const compileInput = {
      actorUserId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      novelId: fixture.novelId,
      instruction: "Write the opening of chapter 301.",
      storyPosition: 301,
    };
    const { result: compiled, queryCount } = await measureQueries("compile", () =>
      e2e.compileFullWithDb(mdb, compileInput),
    );
    expect(compiled.canDispatch).toBe(true);
    const lat = await measureLatency("compile-latency", 5, () =>
      e2e.compileFullWithDb(mdb, compileInput),
    );
    console.log(
      `COMPILE: p50Ms=${lat.p50Ms.toFixed(0)} p95Ms=${lat.p95Ms.toFixed(0)} queries=${queryCount}`,
    );
    expect(lat.p95Ms).toBeLessThanOrEqual(10000);
    expect(queryCount).toBeLessThanOrEqual(500);

    // Per-tier context sizes for chapter 301 (contract acceptance).
    const sized = await e2e.compileFull(compileInput);
    contextSizes["chapter-301"] = measureContext(sized);
    console.log("TIER-SIZES-301:", JSON.stringify(contextSizes["chapter-301"]));
    // Contract: tiers 2–9 ≤ CONTEXT_BUDGET_CHARS (18,000); tier 1 is outside.
    const tiers29 = [2, 3, 4, 5, 6, 7, 8, 9].reduce(
      (sum, t) => sum + (contextSizes["chapter-301"]![`tier${t}`] ?? 0),
      0,
    );
    expect(tiers29).toBeLessThanOrEqual(18000);

    record("compile_ch301", lat, queryCount, 10000, 500);
  }, 300_000);

  it("recall: novel memory recall under 2s p95 / 200 queries", async () => {
    const mem = createMemoryServices({ db: mdb, queue: { add: async () => ({ id: "x" }) } as never });
    const recall = () =>
      mem.recallNovel(fixture.ownerId, fixture.workspaceId, fixture.novelId, { chapter: 300 });
    const { queryCount } = await measureQueries("recall", recall);
    const lat = await measureLatency("recall-latency", 5, recall);
    console.log(
      `RECALL: p50Ms=${lat.p50Ms.toFixed(0)} p95Ms=${lat.p95Ms.toFixed(0)} queries=${queryCount}`,
    );
    expect(lat.p95Ms).toBeLessThanOrEqual(2000);
    expect(queryCount).toBeLessThanOrEqual(200);
    record("recall_ch300", lat, queryCount, 2000, 200);
  }, 120_000);

  it("rebuild: processRebuild under 60s p95 (direct @novelforge/memory call)", async () => {
    const settled = await settleRev(db, fixture.novelId, 300);
    expect(settled).not.toBeNull();
    const head = await db.revision.findFirstOrThrow({
      where: { novelId: fixture.novelId },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    const rebuild = () =>
      processRebuild(db, {
        workspaceId: fixture.workspaceId,
        novelId: fixture.novelId,
        scope: chapterScope(fixture.chapterIds[FIXTURE_CHAPTERS - 1]!),
        sourceRevisionId: head.id,
      });
    // Warm once (compiles the projection path), then measure.
    await rebuild();
    const lat = await measureLatency("rebuild", 3, rebuild);
    console.log(`REBUILD: p50Ms=${lat.p50Ms.toFixed(0)} p95Ms=${lat.p95Ms.toFixed(0)}`);
    expect(lat.p95Ms).toBeLessThanOrEqual(60000);
    record("rebuild_ch300_scope", lat, 0, 60000, null);
  }, 300_000);

  it("health: evaluateHealth under 30s p95 / 1000 queries", async () => {
    const health = createStoryHealthServices({ db: mdb, audit: createAuditService(mdb) });
    const run = () =>
      health.evaluateHealth({
        actorUserId: fixture.ownerId,
        workspaceId: fixture.workspaceId,
        novelId: fixture.novelId,
        chapter: 300,
      });
    const { queryCount } = await measureQueries("health", run);
    const lat = await measureLatency("health-latency", 3, run);
    console.log(
      `HEALTH: p50Ms=${lat.p50Ms.toFixed(0)} p95Ms=${lat.p95Ms.toFixed(0)} queries=${queryCount}`,
    );
    expect(lat.p95Ms).toBeLessThanOrEqual(30000);
    expect(queryCount).toBeLessThanOrEqual(1000);
    record("health_ch300", lat, queryCount, 30000, 1000);
  }, 600_000);

  it("restore: checkpoint + preview + apply under 120s", async () => {
    // A session for the fixture owner (the e2e admin is not a member of
    // the fixture workspace).
    const token = generateSessionToken();
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: fixture.ownerId,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const cookie = `nf_session=${token}`;
    const novelBase = `/api/workspaces/${fixture.workspaceId}/novels/${fixture.novelId}`;
    const restoreOnce = async () => {
      const cp = await api("POST", `${novelBase}/checkpoints`, { label: "e2e-restore-measure" }, cookie);
      expect(cp.statusCode).toBe(201);
      const checkpointId = (asObj(cp) as { checkpointId: string }).checkpointId;
      const preview = await api(
        "POST",
        `${novelBase}/restores/preview`,
        { checkpointId, scope: "FULL" },
        cookie,
      );
      expect(preview.statusCode).toBe(201);
      const restoreOperationId = (asObj(preview) as { restoreOperationId: string })
        .restoreOperationId;
      const applied = await api(
        "POST",
        `${novelBase}/restores/${restoreOperationId}/apply`,
        {},
        cookie,
      );
      expect([200, 201]).toContain(applied.statusCode);
    };
    const lat = await measureLatency("restore", 1, restoreOnce);
    console.log(`RESTORE: p50Ms=${lat.p50Ms.toFixed(0)} p95Ms=${lat.p95Ms.toFixed(0)}`);
    expect(lat.p95Ms).toBeLessThanOrEqual(120000);
    record("restore_full", lat, 0, 120000, null);
  }, 600_000);

  it("fixture build: real timed build under 600s, deterministic row counts + hashes", async () => {
    if (SKIP_FIXTURE_BUILD) {
      console.log("FIXTURE-BUILD: skipped via SKIP_FIXTURE_BUILD=1 (local-only measurement)");
      return;
    }
    // Two REAL builds (no ensureFixture cache): identical seeds must
    // produce identical row counts and identical sampled content hashes.
    // build-a's wall time is the fixture-build measurement.
    const a = await buildLongNovelFixture(db, { seed: FIXTURE_SEED, tag: "build-a" });
    const b = await buildLongNovelFixture(db, { seed: FIXTURE_SEED, tag: "build-b" });
    console.log(`FIXTURE-BUILD: buildMs=${a.buildMs}ms revisions=${a.counts.revisions}`);
    expect(a.buildMs).toBeLessThanOrEqual(600000);
    expect(a.sampleHash).toBe(b.sampleHash);
    expect(a.counts).toEqual(b.counts);
    record(
      "fixture_build",
      { p50Ms: a.buildMs, p95Ms: a.buildMs },
      0,
      600000,
      null,
    );
  }, 1200_000);

  it("baseline: receipt recorded, >2x no-regression rule enforced", async () => {
    const required = [
      "compile_ch301",
      "recall_ch300",
      "rebuild_ch300_scope",
      "health_ch300",
      "restore_full",
    ];
    for (const name of required) {
      expect(recorded.has(name), `measurement ${name} did not run`).toBe(true);
    }

    const measurements: E2EBaseline["measurements"] = {};
    for (const [name, m] of recorded) measurements[name] = { ...m };
    const thresholds: E2EBaseline["thresholds"] = {};
    for (const [name, m] of recorded) {
      thresholds[name] = { latencyMs: m.thresholdMs, queries: m.thresholdQueries };
    }

    const notes = [
      "First receipts for NF-WF-011 (GAP-010 E2E scope). Thresholds are generous ceilings chosen before measuring.",
      "compile_ch301 measured cleanly (fixture build excluded); p50/p95 over 5 repetitions.",
      "rebuild measured via direct processRebuild(@novelforge/memory) call — the driver's memory queue is a no-op fake.",
      "The strict >2x no-regression rule applies to deterministic measurements (query counts, context sizes); latencies are checked against absolute ceilings.",
      `fixture_build ${SKIP_FIXTURE_BUILD ? "skipped this run (SKIP_FIXTURE_BUILD=1); committed receipt carried forward" : "measured from a real uncached build"}.`,
    ];
    const committed = readCommittedBaseline();

    if (SKIP_FIXTURE_BUILD) {
      if (committed.baseline?.measurements["fixture_build"]) {
        measurements["fixture_build"] = { ...committed.baseline.measurements["fixture_build"] };
        thresholds["fixture_build"] = {
          latencyMs: committed.baseline.measurements["fixture_build"].thresholdMs,
          queries: committed.baseline.measurements["fixture_build"].thresholdQueries,
        };
      } else if (!committed.baseline) {
        throw new Error(
          "SKIP_FIXTURE_BUILD=1 with no committed baseline: run once without the skip to record the fixture_build receipt",
        );
      }
    }

    const actual: E2EBaseline = {
      generatedAt: new Date().toISOString(),
      gitSha: gitSha(),
      fixtureSeed: FIXTURE_SEED,
      fixture: {
        chapters: fixture.counts.chapters,
        revisions: fixture.counts.revisions,
        characters: fixture.counts.characters,
        facts: fixture.counts.facts,
        timelineEvents: fixture.counts.timelineEvents,
        threads: fixture.counts.threads,
      },
      measurements,
      contextSizes,
      thresholds,
      notes,
    };

    if (!committed.baseline) {
      if (committed.shapeNote) notes.push(committed.shapeNote);
      writeBaselineReceipt(BASELINE_PATH, actual);
      console.log("BASELINE-WRITTEN: first receipt recorded (no usable committed baseline found)");
      return;
    }

    // The no-regression rule, enforced: any deterministic measurement
    // regressing >2x vs the committed baseline fails the run.
    const failures = checkNoRegression(committed.baseline, actual);
    expect(failures).toEqual([]);
    console.log("BASELINE-OK: no >2x regression vs committed baseline");
  }, 120_000);
});
