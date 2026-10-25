# Derived Rebuild Intent Lifecycle Implementation Plan

Execution note2026-10-25: this is the retained original plan, not fresh instructions
to rerun completed steps. Post-review repairs and author-authorized publication are
tracked in tasks/NF-WF-060-canon-summary-projection.md and ADR-0022's dated repair
amendment. Timestamp-based derivation described below is superseded; the current
implementation requires an exact snapshot or consistent checked-out head source.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `derived_rebuild_intents` honest and operable: document the audit end-state, add a read-only status surface, implement a CAS-based consumer, and register the first real projection pipeline (`canon`) that turns canon invalidation intents into a bounded `canon_summary` artifact.

**Architecture:** Phase 1 records the author's accepted end-state (ADR-0017 Option B) and exposes intent status read-only. Phase 2 adds a Postgres-only consumer: per `(projection, branch)` the newest eligible intent is claimed `PENDING|FAILED → RUNNING → FRESH|FAILED`; older intents are superseded `→ STALE`. Phase 3 defines `canon_summary` (ADR-0022), a bounded deterministic digest keyed by `(novelId, branchId, sourceRevisionId)`, and registers the `canon` handler so its intents become real rebuild work. Projections with no registered handler keep `PENDING` as terminal audit.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Vitest, pnpm workspaces. No Redis dependency for the intent consumer (the table is the queue).

**Spec:**
- [ADR-0017](../../adr/ADR-0017-derived-rebuild-intent-end-state.md)
- [STORY-VERSIONING.md](../../03-domain/STORY-VERSIONING.md) C1/C6/C7/C10
- New: `docs/adr/ADR-0022-canon-summary-projection.md`

## Global Constraints

- Canon is the source of truth; derived artifacts are never truth and never silently committed as canon (§2.1–2.2).
- Never report success without an outcome: a failed or skipped rebuild leaves `FAILED`/`STALE`, never `FRESH` (§9, §13).
- All mutations stay revisioned/audited; this plan adds no canonical mutation.
- Tenant scope is resolved server-side; missing membership and missing/foreign novel are the same 404 (ADR-0004).
- Frozen contract text is amended with a dated amendment + review record, never silently rewritten (§10, C12 precedent).
- Project language is English for all authored artifacts, identifiers, comments, tests and docs.
- Do not commit unless the author explicitly asks.
- Test databases are disposable (`novelforge_test_*`); never point a mutating test at the acceptance database.
- Apply the acceptance migration and run the sweep against acceptance only at the final gated step (Task 11).

## File Structure

Phase 1 (docs + read surface):
- Modify `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md` — acceptance record.
- Modify `docs/03-domain/STORY-VERSIONING.md` — dated C6/C7 amendment.
- Modify `packages/database/prisma/schema.prisma` — comment-only docstrings.
- Create `apps/api/src/services/derived-intents.ts` — intent status read model.
- Create `apps/api/src/derived-intents-routes.ts` — `GET .../derived-intents`.
- Modify `apps/api/src/app.ts` — register the route.
- Create `apps/api/src/derived-intents.test.ts` — integration coverage.
- Modify `apps/web/app/components/workspace/HealthMemoryPanel.vue` — comment truth fix.

Phase 2 (consumer):
- Create `packages/story-versioning/intents.ts` — shared projection/pipeline constants and pure eligibility helpers.
- Create `apps/worker/src/derived-intents.ts` — claim/complete/fail/supersede/sweep.
- Create `apps/worker/src/derived-intents.test.ts` — lifecycle and concurrency coverage.
- Modify `apps/worker/src/index.ts` — start/stop the sweeper.
- Modify `packages/story-versioning/index.ts` — export the new constants.

Phase 3 (canon pipeline):
- Create `docs/adr/ADR-0022-canon-summary-projection.md` — accepted design.
- Create `tasks/NF-WF-060-canon-summary-projection.md` — task contract.
- Modify `packages/database/prisma/schema.prisma` — `CanonSummary` model + relations.
- Create `packages/database/prisma/migrations/20261025_canon_summary_projection/migration.sql`.
- Create `packages/story-intelligence/canon-summary.ts` + `canon-summary.test.ts` — pure digest.
- Create `packages/ai-services/src/canon-summary.ts` — DB rebuild shared by worker and API.
- Modify `packages/ai-services/index.ts` — export the rebuild + handler factory.
- Create `apps/worker/src/canon-summary.ts` — thin `RebuildHandler` adapter.
- Create `apps/worker/src/canon-summary.test.ts` — DB-backed coverage.
- Create `apps/api/src/services/canon-summary.ts` — read/rebuild service.
- Create `apps/api/src/canon-summary-routes.ts` + `canon-summary.test.ts`.
- Modify `apps/api/src/app.ts` — register routes.
- Modify `apps/worker/src/index.ts` — register the handler (via `derived-intents.ts` registry).

Phase 4 (evidence):
- Create `apps/worker/src/ops-derived-intents.tmp.ts` — dry-run/`--apply` acceptance runner (deleted after use).
- Modify `docs/implementation/ISSUES-AND-GAPS.md` — close the intent-lifecycle entry with evidence.
- Modify `docs/14-progress/CURRENT.md` — record verified results.

---

## Phase 1 — Audit end-state and read surface

### Task 1: Record the accepted decision and amend C6/C7

**Files:**
- Modify: `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md:5`
- Modify: `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md:72-97`
- Modify: `docs/03-domain/STORY-VERSIONING.md` (append after line 1038)

**Interfaces:**
- Consumes: author decision "kerjakan sesuai urutan 1-2-3" (2026-10-25).
- Produces: normative statement that `PENDING` is terminal for projections without a registered pipeline; per-projection opt-in is allowed via a superseding ADR (used by ADR-0022).

- [ ] **Step 1: Replace the ADR status line**

Replace line 5 with:

```markdown
**ACCEPTED — Option B (write-side audit end-state), 2026-10-25.** The author accepted the recommendation in §"Decision" and directed the follow-on order: (1) audit end-state, (2) generic consumer, (3) first real projection pipeline (`canon`). Option A remains available per projection through a superseding ADR; ADR-0022 exercises that path for `canon`. Drafted 2026-10-13 from the NF-WF-009 intent-lifecycle gap re-verification; evidence sections re-verified 2026-10-14.
```

- [ ] **Step 2: Replace the Decision heading and closing paragraph**

Replace the `## Decision (recommendation — the author decides)` heading with `## Decision (accepted 2026-10-25)`. Append this paragraph after the existing recommendation text:

```markdown
**Author decision (2026-10-25): Option B is accepted as the platform end-state.** Concretely: `PENDING` is terminal for any projection without a registered rebuild pipeline; the lifecycle columns (`status` beyond `PENDING`, `attempts`, `lastError`, `completedAt`) are reserved for projections that register a pipeline; the write-side atomic commit is unchanged. The author also directed a generic consumer (phase 2) and a first real pipeline for `canon` (phase 3), which supersedes this ADR for `canon` only. No other projection is superseded.
```

- [ ] **Step 3: Append the dated contract amendment**

Append to `docs/03-domain/STORY-VERSIONING.md`:

```markdown
## 2026-10-25 amendment — C6/C7 audit end-state and per-projection opt-in

Status: ACCEPTED by the author (2026-10-25), following ADR-0017.

**C6 amendment.** For a projection with no registered rebuild pipeline,
`PENDING` is the assigned-and-final intent status. `attempts`, `lastError`
and `completedAt` are audit-inert; `RUNNING`, `FRESH`, `FAILED` and
`STALE` are reserved vocabulary for registered pipelines. Deduplication
`UNIQUE (projection, source_revision_id)` plus `skipDuplicates` remains the
whole of replay idempotency. The atomic mutation+intent commit is unchanged.

**Per-projection opt-in.** A projection may register a pipeline through a
superseding ADR. For a registered projection, the consumer claims the newest
eligible intent per `(projection, branch)` and supersedes older eligible
intents as `STALE`. Supersession is relative to newer intents for the same
projection and branch, not to unrelated head advancement: a projection is
invalidated only by its own covered tables. A registered pipeline's read
surface derives freshness from intent status (no newer `PENDING`/`RUNNING`/
`FAILED` intent than the artifact) and reports `MISSING` when no artifact
exists. This refinement applies only to projections that opt in; ADR-0022
opts in `canon`.

**C7 amendment.** Restore preview continues to report affected projections
from the impact mapping (`projectionsForTables`). It never reads intent rows;
`derived_rebuild_intents` remains classified `OPERATIONAL` and is never
rewound.

**Review record.** Implementation session (writer) and an independent
reviewer actor reviewed the exact diff; verdict and findings are appended in
Task 12. This amendment changes documentation and comments only; it changes
no runtime behaviour.
```

- [ ] **Step 4: Verify the amendment markers**

Run: `grep -n "2026-10-25 amendment" docs/03-domain/STORY-VERSIONING.md`
Expected: one match.

Run: `grep -n "ACCEPTED — Option B" docs/adr/ADR-0017-derived-rebuild-intent-end-state.md`
Expected: one match.

### Task 2: Fix the intent schema comments (comment-only, no migration)

**Files:**
- Modify: `packages/database/prisma/schema.prisma:2821-2827`
- Modify: `packages/database/prisma/schema.prisma:3048-3066`

**Interfaces:**
- Consumes: Task 1 normative text.
- Produces: schema docstrings that no longer describe an always-on lifecycle.

- [ ] **Step 1: Annotate `RebuildStatus`**

Replace the enum block with:

```prisma
/// Intent lifecycle. `PENDING` is assigned-and-final for projections with no
/// registered pipeline (ADR-0017 Option B). The remaining values are reserved
/// for projections that opt in via a superseding ADR (ADR-0022 opts in
/// `canon`).
enum RebuildStatus {
  PENDING
  RUNNING
  FRESH
  FAILED
  STALE
}
```

- [ ] **Step 2: Add a docstring above `DerivedRebuildIntent`**

```prisma
/// Write-side, transactional record of which projections a committed revision
/// invalidated (STORY-VERSIONING C6). Rows are written inside the mutation
/// transaction with `skipDuplicates`. For projections without a registered
/// pipeline, `PENDING` is terminal audit and `attempts`/`lastError`/
/// `completedAt` are audit-inert. Registered projections use the full
/// lifecycle: newest intent per `(projection, branch)` is claimed
/// `PENDING|FAILED → RUNNING → FRESH|FAILED`; older eligible intents are
/// superseded as `STALE` (ADR-0017, ADR-0022).
model DerivedRebuildIntent {
```

- [ ] **Step 3: Validate and typecheck the database package**

Run: `pnpm --filter @novelforge/database exec prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`

Run: `pnpm --filter @novelforge/database typecheck`
Expected: exit 0.

### Task 3: Read-only intent status API

**Files:**
- Create: `apps/api/src/services/derived-intents.ts`
- Create: `apps/api/src/derived-intents-routes.ts`
- Modify: `apps/api/src/app.ts` (near the memory route registration, line ~591)
- Create: `apps/api/src/derived-intents.test.ts`

**Interfaces:**
- Consumes: `PROJECTIONS`, `PIPELINE_PROJECTIONS` from `@novelforge/story-versioning` (the latter is created in Task 4; for this task create the file with an empty list).
- Produces:
  ```ts
  export interface DerivedIntentProjectionStatus {
    projection: Projection;
    hasPipeline: boolean;
    counts: Record<RebuildStatus, number>;
    latestSourceRevisionNumber: number | null;
    headRevisionNumber: number | null;
  }
  export function createDerivedIntentServices(deps: { db: NovelForgeDb }): {
    getStatus(actorUserId: string, workspaceId: string, novelId: string): Promise<{
      headRevisionNumber: number | null;
      projections: DerivedIntentProjectionStatus[];
    }>;
  }
  ```

- [ ] **Step 1: Create the shared constants module**

`packages/story-versioning/intents.ts`:

```ts
/**
 * Derived rebuild intent vocabulary shared by the API and the worker.
 *
 * ADR-0017: `PENDING` is terminal for projections with no registered
 * pipeline. ADR-0022 registers `canon`.
 */
import { PROJECTIONS, type Projection } from "./impact.ts";

/** Projections with a registered rebuild pipeline in apps/worker. */
export const PIPELINE_PROJECTIONS: readonly Projection[] = [];

export function isProjection(value: string): value is Projection {
  return (PROJECTIONS as readonly string[]).includes(value);
}
```

Also export it from `packages/story-versioning/index.ts` (append):

```ts
export { PIPELINE_PROJECTIONS, isProjection } from "./intents.ts";
```

Check `packages/story-versioning/index.ts` first; if it uses `export * from`, skip the append.

- [ ] **Step 2: Write the failing API test**

`apps/api/src/derived-intents.test.ts` (dedicated DB `novelforge_test_derived_intents`, same bootstrap as `apps/api/src/memory.test.ts:87-134`). Add these cases:

```ts
import { describe, expect, it } from "vitest";

it("returns 401 without a session", async () => {
  const res = await app.inject({ method: "GET", url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents` });
  expect(res.statusCode).toBe(401);
});

it("returns per-projection counts and head revision", async () => {
  const branch = await db.novelBranch.findFirstOrThrow({ where: { novelId } });
  const head = await db.revision.findUniqueOrThrow({ where: { id: branch.headRevisionId! } });
  await db.derivedRebuildIntent.create({
    data: { workspaceId, novelId, projection: "canon", sourceRevisionId: head.id },
  });
  await db.derivedRebuildIntent.create({
    data: { workspaceId, novelId, projection: "character", sourceRevisionId: head.id },
  });
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/novels/${novelId}/derived-intents`,
    cookies: { [SESSION_COOKIE]: cookie },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.headRevisionNumber).toBe(head.number);
  const canon = body.projections.find((p: { projection: string }) => p.projection === "canon");
  expect(canon.counts.PENDING).toBe(1);
  expect(canon.hasPipeline).toBe(false);
});

it("treats a foreign workspace as 404", async () => {
  const other = await seedNovel(otherUserId);
  const res = await app.inject({
    method: "GET",
    url: `/api/workspaces/${other.workspaceId}/novels/${other.novelId}/derived-intents`,
    cookies: { [SESSION_COOKIE]: cookie },
  });
  expect(res.statusCode).toBe(404);
});
```

Use `createNovel` from `createPlatformServices` for seeding, as in `apps/api/src/memory.test.ts:163-179`.

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm --filter @novelforge/api exec vitest run src/derived-intents.test.ts`
Expected: FAIL (404 / route missing).

- [ ] **Step 4: Implement the service**

`apps/api/src/services/derived-intents.ts`:

```ts
import type { NovelForgeDb } from "@novelforge/database";
import { requireCapability } from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import {
  PIPELINE_PROJECTIONS,
  PROJECTIONS,
  type Projection,
} from "@novelforge/story-versioning";

type RebuildStatus = "PENDING" | "RUNNING" | "FRESH" | "FAILED" | "STALE";

export interface DerivedIntentProjectionStatus {
  projection: Projection;
  hasPipeline: boolean;
  counts: Record<RebuildStatus, number>;
  latestSourceRevisionNumber: number | null;
  headRevisionNumber: number | null;
}

const EMPTY_COUNTS = (): Record<RebuildStatus, number> => ({
  PENDING: 0,
  RUNNING: 0,
  FRESH: 0,
  FAILED: 0,
  STALE: 0,
});

export function createDerivedIntentServices(deps: { db: NovelForgeDb }) {
  const { db } = deps;

  return {
    async getStatus(actorUserId: string, workspaceId: string, novelId: string) {
      const membership = await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
        select: { role: true },
      });
      const novel = await db.novel.findFirst({
        where: { id: novelId, workspaceId },
        select: { id: true, currentBranchId: true },
      });
      if (!membership || !novel) throw new NotFoundError("novel");
      requireCapability(membership.role, "novel:read");

      const branch = novel.currentBranchId
        ? await db.novelBranch.findUnique({
            where: { id: novel.currentBranchId },
            select: { headRevision: { select: { number: true } } },
          })
        : await db.novelBranch.findFirst({
            where: { novelId, name: "main" },
            select: { headRevision: { select: { number: true } } },
          });

      const grouped = await db.derivedRebuildIntent.groupBy({
        by: ["projection", "status"],
        where: { novelId, workspaceId },
        _count: { _all: true },
      });

      // groupBy cannot aggregate a relation field, so the max source revision
      // number is read with one bounded aggregate query.
      const latest = await db.$queryRaw<Array<{ projection: string; latest: number | null }>>`
        SELECT i.projection, MAX(r.number)::int AS latest
        FROM derived_rebuild_intents i
        JOIN revisions r ON r.id = i.source_revision_id
        WHERE i.novel_id = ${novelId}::uuid AND i.workspace_id = ${workspaceId}::uuid
        GROUP BY i.projection
      `;
      const latestByProjection = new Map(
        latest.map((row) => [row.projection, row.latest ?? null]),
      );

      const countsByProjection = new Map<string, Record<RebuildStatus, number>>();
      for (const row of grouped) {
        const counts = countsByProjection.get(row.projection) ?? EMPTY_COUNTS();
        counts[row.status as RebuildStatus] = row._count._all;
        countsByProjection.set(row.projection, counts);
      }

      const headRevisionNumber = branch?.headRevision?.number ?? null;
      return {
        headRevisionNumber,
        projections: PROJECTIONS.map((projection) => ({
          projection,
          hasPipeline: PIPELINE_PROJECTIONS.includes(projection),
          counts: countsByProjection.get(projection) ?? EMPTY_COUNTS(),
          latestSourceRevisionNumber: latestByProjection.get(projection) ?? null,
          headRevisionNumber,
        })),
      };
    },
  };
}

export type DerivedIntentServices = ReturnType<typeof createDerivedIntentServices>;
```

- [ ] **Step 5: Implement the route**

`apps/api/src/derived-intents-routes.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "@novelforge/auth";
import { SESSION_COOKIE } from "./auth-routes.ts";
import type { DerivedIntentServices } from "./services/derived-intents.ts";

const params = z.object({
  workspaceId: z.string().uuid(),
  novelId: z.string().uuid(),
});

export function registerDerivedIntentRoutes(
  app: FastifyInstance,
  { auth, intents }: { auth: AuthService; intents: DerivedIntentServices },
): void {
  const requireActor = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await auth.validateSession(token) : null;
    if (!session) {
      reply.code(401).send({ error: "UNAUTHENTICATED" });
      return null;
    }
    return session.userId;
  };

  app.get(
    "/api/workspaces/:workspaceId/novels/:novelId/derived-intents",
    async (request, reply) => {
      const actorUserId = await requireActor(request, reply);
      if (!actorUserId) return;
      const parsed = params.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
      const status = await intents.getStatus(
        actorUserId,
        parsed.data.workspaceId,
        parsed.data.novelId,
      );
      return reply.code(200).send(status);
    },
  );
}
```

- [ ] **Step 6: Register it in `apps/api/src/app.ts`**

Import:

```ts
import { createDerivedIntentServices } from "./services/derived-intents.ts";
import { registerDerivedIntentRoutes } from "./derived-intents-routes.ts";
```

After the memory route registration block (~line 591):

```ts
    // ADR-0017: read-only intent status. PENDING is terminal audit for
    // projections without a registered pipeline; this route never mutates.
    registerDerivedIntentRoutes(app, {
      auth,
      intents: createDerivedIntentServices({ db: options.db }),
    });
```

- [ ] **Step 7: Run the test and typecheck**

Run: `pnpm --filter @novelforge/api exec vitest run src/derived-intents.test.ts`
Expected: PASS.

Run: `pnpm --filter @novelforge/api typecheck`
Expected: exit 0.

- [ ] **Step 8: Fix the UI comment**

In `apps/web/app/components/workspace/HealthMemoryPanel.vue:14-17`, replace the parenthetical:

```text
 * Memory: GET .../memory/status (reads statuses only). DerivedRebuildIntent
 * is audit-only for projections without a registered pipeline (ADR-0017);
 * GET .../derived-intents exposes its status read-only.
```

---

## Phase 2 — Consumer machinery

### Task 4: Consumer lifecycle primitives

**Files:**
- Create: `apps/worker/src/derived-intents.ts`
- Create: `apps/worker/src/derived-intents.test.ts`

**Interfaces:**
- Consumes: `PIPELINE_PROJECTIONS`, `PROJECTIONS`, `Projection` from `@novelforge/story-versioning`; `NovelForgeDb`.
- Produces:
  ```ts
  export const INTENT_MAX_ATTEMPTS = 5;
  export const INTENT_RETRY_BASE_MS = 30_000;
  export const INTENT_RETRY_MAX_MS = 300_000;
  export const INTENT_RUNNING_LEASE_MS = 300_000;
  export const INTENT_SWEEP_BATCH = 200;

  export interface RebuildHandler {
    projection: Projection;
    rebuild(ctx: {
      db: NovelForgeDb;
      workspaceId: string;
      novelId: string;
      sourceRevisionId: string;
    }): Promise<void>;
  }
  export type HandlerRegistry = Partial<Record<Projection, RebuildHandler>>;

  export interface SweepReport {
    claimed: number;
    fresh: number;
    failed: number;
    superseded: number;
    skipped: number;
  }

  export function backoffMs(attempts: number): number;
  export async function runDerivedIntentSweep(ctx: {
    db: NovelForgeDb;
    handlers: HandlerRegistry;
    logger: { warn(msg: string, meta?: Record<string, unknown>): void; error(msg: string, meta?: Record<string, unknown>): void };
    now?: () => Date;
    batchSize?: number;
  }): Promise<SweepReport>;
  ```

- [ ] **Step 1: Write the failing lifecycle test**

Bootstrap `apps/worker/src/derived-intents.test.ts` like the API test: create/drop `novelforge_test_intents`, `prisma migrate deploy`, seed a user/workspace/novel/membership and one `main` branch with a baseline revision. Insert intents with explicit revisions:

```ts
async function seedIntents(projections: string[]) {
  const rev = await db.revision.create({
    data: { workspaceId, novelId, branchId, number: 2, origin: "MANUAL" },
  });
  const rows = [];
  for (const projection of projections) {
    rows.push(
      await db.derivedRebuildIntent.create({
        data: { workspaceId, novelId, projection, sourceRevisionId: rev.id },
      }),
    );
  }
  return { rev, rows };
}
```

Cases:

```ts
it("leaves intents untouched when no handler is registered", async () => {
  const { rows } = await seedIntents(["character"]);
  const report = await runDerivedIntentSweep({ db, handlers: {}, logger: quiet });
  expect(report.claimed).toBe(0);
  const after = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0].id } });
  expect(after.status).toBe("PENDING");
  expect(after.attempts).toBe(0);
});

it("claims the newest intent, supersedes older ones, and marks FRESH", async () => {
  const older = await seedIntents(["canon"]);
  const newerRev = await db.revision.create({
    data: { workspaceId, novelId, branchId, number: 3, origin: "MANUAL" },
  });
  const newer = await db.derivedRebuildIntent.create({
    data: { workspaceId, novelId, projection: "canon", sourceRevisionId: newerRev.id },
  });
  let seen: string | null = null;
  const report = await runDerivedIntentSweep({
    db,
    handlers: {
      canon: {
        projection: "canon",
        rebuild: async ({ sourceRevisionId }) => { seen = sourceRevisionId; },
      },
    },
    logger: quiet,
  });
  expect(seen).toBe(newerRev.id);
  expect(report.fresh).toBe(1);
  expect(report.superseded).toBe(1);
  const oldRow = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: older.rows[0].id } });
  expect(oldRow.status).toBe("STALE");
  const newRow = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: newer.id } });
  expect(newRow.status).toBe("FRESH");
  expect(newRow.completedAt).not.toBeNull();
});

it("records FAILED with lastError and retries up to the cap", async () => {
  const { rows } = await seedIntents(["canon"]);
  const handler = {
    projection: "canon" as const,
    rebuild: async () => { throw new Error("boom"); },
  };
  await runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
  let row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0].id } });
  expect(row.status).toBe("FAILED");
  expect(row.attempts).toBe(1);
  expect(row.lastError).toContain("boom");

  await runDerivedIntentSweep({
    db,
    handlers: { canon: handler },
    logger: quiet,
    now: () => new Date(Date.now() + INTENT_RETRY_MAX_MS),
  });
  row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0].id } });
  expect(row.attempts).toBe(2);
});

it("one CAS winner under two concurrent sweeps", async () => {
  const { rows } = await seedIntents(["canon"]);
  let calls = 0;
  const handler = {
    projection: "canon" as const,
    rebuild: async () => { calls += 1; },
  };
  const [a, b] = await Promise.all([
    runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet }),
    runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet }),
  ]);
  expect(calls).toBe(1);
  expect(a.claimed + b.claimed).toBe(1);
  const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0].id } });
  expect(row.attempts).toBe(1);
});

it("reaps an expired RUNNING lease into FAILED", async () => {
  const { rows } = await seedIntents(["canon"]);
  // attempts at the cap: after reaping, the row is not eligible again, so the
  // assertion isolates the lease transition.
  await db.derivedRebuildIntent.update({
    where: { id: rows[0].id },
    data: { status: "RUNNING", attempts: INTENT_MAX_ATTEMPTS },
  });
  await db.$executeRaw`
    UPDATE derived_rebuild_intents
    SET updated_at = NOW() - INTERVAL '10 minutes'
    WHERE id = ${rows[0].id}::uuid
  `;
  const handler = {
    projection: "canon" as const,
    rebuild: async () => {},
  };
  await runDerivedIntentSweep({ db, handlers: { canon: handler }, logger: quiet });
  const row = await db.derivedRebuildIntent.findUniqueOrThrow({ where: { id: rows[0].id } });
  expect(row.status).toBe("FAILED");
  expect(row.lastError).toContain("lease expired");
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @novelforge/worker exec vitest run src/derived-intents.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the primitives and sweep**

`apps/worker/src/derived-intents.ts`:

```ts
/**
 * Derived rebuild intent consumer (ADR-0017, ADR-0022).
 *
 * PostgreSQL is the queue. The worker claims the newest eligible intent per
 * `(projection, branch)` with a compare-and-set, supersedes older eligible
 * intents for the same pair, runs the registered handler, and records the
 * outcome. Projections without a handler are never touched: their rows stay
 * PENDING as terminal audit.
 */
import type { NovelForgeDb } from "@novelforge/database";
import {
  PIPELINE_PROJECTIONS,
  isProjection,
  type Projection,
} from "@novelforge/story-versioning";

export const INTENT_MAX_ATTEMPTS = 5;
export const INTENT_RETRY_BASE_MS = 30_000;
export const INTENT_RETRY_MAX_MS = 300_000;
export const INTENT_RUNNING_LEASE_MS = 300_000;
export const INTENT_SWEEP_BATCH = 200;

export interface RebuildHandler {
  projection: Projection;
  rebuild(ctx: {
    db: NovelForgeDb;
    workspaceId: string;
    novelId: string;
    sourceRevisionId: string;
  }): Promise<void>;
}

export type HandlerRegistry = Partial<Record<Projection, RebuildHandler>>;

export interface SweepReport {
  claimed: number;
  fresh: number;
  failed: number;
  superseded: number;
  skipped: number;
}

export function backoffMs(attempts: number): number {
  return Math.min(INTENT_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), INTENT_RETRY_MAX_MS);
}

export async function runDerivedIntentSweep(ctx: {
  db: NovelForgeDb;
  handlers: HandlerRegistry;
  logger: {
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
  now?: () => Date;
  batchSize?: number;
}): Promise<SweepReport> {
  const { db, handlers, logger } = ctx;
  const now = ctx.now?.() ?? new Date();
  const report: SweepReport = { claimed: 0, fresh: 0, failed: 0, superseded: 0, skipped: 0 };

  const active = PIPELINE_PROJECTIONS.filter((p) => handlers[p] !== undefined);
  if (active.length === 0) return report;

  // Crash recovery: a claimed row whose worker died stays RUNNING. Reap it
  // into FAILED after the lease so the normal retry path can see it again.
  await db.derivedRebuildIntent.updateMany({
    where: {
      projection: { in: active },
      status: "RUNNING",
      updatedAt: { lt: new Date(now.getTime() - INTENT_RUNNING_LEASE_MS) },
    },
    data: { status: "FAILED", lastError: "rebuild lease expired" },
  });

  const candidates = await db.derivedRebuildIntent.findMany({
    where: {
      projection: { in: active },
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: INTENT_MAX_ATTEMPTS } },
      ],
    },
    include: { sourceRevision: { select: { branchId: true, number: true } } },
    orderBy: { createdAt: "desc" },
    take: ctx.batchSize ?? INTENT_SWEEP_BATCH,
  });

  const groups = new Map<string, typeof candidates>();
  for (const row of candidates) {
    if (!isProjection(row.projection)) continue;
    const key = `${row.projection}:${row.sourceRevision.branchId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const rows of groups.values()) {
    rows.sort((a, b) => b.sourceRevision.number - a.sourceRevision.number);
    const newest = rows[0];
    if (!isProjection(newest.projection)) continue;
    const handler = handlers[newest.projection];
    if (!handler) continue;

    if (
      newest.status === "FAILED" &&
      newest.updatedAt.getTime() + backoffMs(newest.attempts) > now.getTime()
    ) {
      report.skipped += 1;
      continue;
    }

    const claimWhere =
      newest.status === "FAILED"
        ? {
            id: newest.id,
            status: "FAILED" as const,
            attempts: { lt: INTENT_MAX_ATTEMPTS },
            updatedAt: { lte: new Date(now.getTime() - backoffMs(newest.attempts)) },
          }
        : { id: newest.id, status: "PENDING" as const };

    const claimed = await db.$transaction(async (tx) => {
      const cas = await tx.derivedRebuildIntent.updateMany({
        where: claimWhere,
        data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
      });
      if (cas.count !== 1) return false;
      const older = rows.slice(1).map((row) => row.id);
      if (older.length > 0) {
        const superseded = await tx.derivedRebuildIntent.updateMany({
          where: { id: { in: older }, status: { in: ["PENDING", "FAILED"] } },
          data: {
            status: "STALE",
            completedAt: now,
            lastError: `superseded by intent ${newest.id} at revision ${newest.sourceRevision.number}`,
          },
        });
        report.superseded += superseded.count;
      }
      return true;
    });
    if (!claimed) {
      report.skipped += 1;
      continue;
    }
    report.claimed += 1;

    try {
      await handler.rebuild({
        db,
        workspaceId: newest.workspaceId,
        novelId: newest.novelId,
        sourceRevisionId: newest.sourceRevisionId,
      });
      await db.derivedRebuildIntent.updateMany({
        where: { id: newest.id, status: "RUNNING" },
        data: { status: "FRESH", completedAt: new Date() },
      });
      report.fresh += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.derivedRebuildIntent.updateMany({
        where: { id: newest.id, status: "RUNNING" },
        data: { status: "FAILED", lastError: message.slice(0, 2000) },
      });
      report.failed += 1;
      logger.error("derived intent rebuild failed", {
        intentId: newest.id,
        projection: newest.projection,
        sourceRevisionId: newest.sourceRevisionId,
        message,
      });
    }
  }

  return report;
}
```

Note: Prisma's `where` type for `updateMany` narrows per branch; if TypeScript complains about the union, type `claimWhere` as `Prisma.DerivedRebuildIntentWhereInput` using the generated namespace, or inline the two calls:

```ts
const cas =
  newest.status === "FAILED"
    ? await tx.derivedRebuildIntent.updateMany({ where: { ... }, data })
    : await tx.derivedRebuildIntent.updateMany({ where: { ... }, data });
```

Prefer the inline pair if the union fails typecheck.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @novelforge/worker exec vitest run src/derived-intents.test.ts`
Expected: PASS (4 tests).

Run: `pnpm --filter @novelforge/worker typecheck`
Expected: exit 0.

### Task 5: Sweeper app wiring and pipeline-constant guard

**Files:**
- Modify: `apps/worker/src/derived-intents.ts` (append app starter)
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/derived-intents.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const INTENT_SWEEP_INTERVAL_MS = 30_000;
  export function startDerivedIntentWorkerApp(
    env: { DATABASE_URL: string },
    logger: { info(msg: string, meta?: Record<string, unknown>): void; warn(...): void; error(...): void },
    deps?: {
      db?: NovelForgeDb;
      handlers?: HandlerRegistry;
      intervalMs?: number;
      sweep?: typeof runDerivedIntentSweep;
    },
  ): {
    started: boolean;
    stopped: boolean;
    /** Runs one sweep immediately; exposed for tests and one-off ops. */
    tick(): Promise<SweepReport>;
    stop(): Promise<void>;
  };
  ```

- [ ] **Step 1: Add an initial registry test**

For Task 5 (before the canon handler exists), assert the registry is empty:

```ts
it("the initial registry is empty", () => {
  expect(Object.keys(INTENT_HANDLERS)).toHaveLength(0);
});
```

Task 9 replaces this test with the consistency assertion against
`PIPELINE_PROJECTIONS`.

- [ ] **Step 2: Implement the app starter**

Append to `apps/worker/src/derived-intents.ts` (add `import { createDb } from "@novelforge/database";` at the top):

```ts
export const INTENT_SWEEP_INTERVAL_MS = 30_000;

/** Handlers registered in this build. ADR-0022 adds `canon`. */
export const INTENT_HANDLERS: HandlerRegistry = {};

export function startDerivedIntentWorkerApp(
  env: { DATABASE_URL: string },
  logger: {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  },
  deps: {
    db?: NovelForgeDb;
    handlers?: HandlerRegistry;
    intervalMs?: number;
    sweep?: typeof runDerivedIntentSweep;
    createDb?: (url: string) => NovelForgeDb;
  } = {},
) {
  const db = deps.db ?? (deps.createDb ?? createDb)(env.DATABASE_URL);
  const handlers = deps.handlers ?? INTENT_HANDLERS;
  const sweep = deps.sweep ?? runDerivedIntentSweep;
  const intervalMs = deps.intervalMs ?? INTENT_SWEEP_INTERVAL_MS;
  let stopped = false;

  const tick = async () => {
    if (stopped) return { claimed: 0, fresh: 0, failed: 0, superseded: 0, skipped: 0 };
    try {
      return await sweep({ db, handlers, logger });
    } catch (error) {
      logger.error("derived intent sweep failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return { claimed: 0, fresh: 0, failed: 0, superseded: 0, skipped: 0 };
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  logger.info("derived intent sweeper started", { intervalMs, handlers: Object.keys(handlers) });

  return {
    started: true,
    get stopped() {
      return stopped;
    },
    tick,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await db.$disconnect();
    },
  };
}
```

Do not import `apps/api` (ESLint `no-restricted-imports`).

- [ ] **Step 3: Wire into the worker entrypoint**

`apps/worker/src/index.ts`:

```ts
import {
  startDerivedIntentWorkerApp,
  INTENT_HANDLERS,
} from "./derived-intents.ts";
```

After `const covers = ...`:

```ts
// ADR-0017/ADR-0022: PostgreSQL-backed intent consumer. No Redis dependency.
const intents = startDerivedIntentWorkerApp(env, logger, { handlers: INTENT_HANDLERS });
```

Add to shutdown before `await app.stop()`:

```ts
    await intents.stop();
```

Add to the startup log:

```ts
  intentsStarted: intents.started,
```

- [ ] **Step 4: Run worker tests and typecheck**

Run: `pnpm --filter @novelforge/worker exec vitest run src/derived-intents.test.ts`
Expected: PASS.

Run: `pnpm --filter @novelforge/worker typecheck`
Expected: exit 0.

---

## Phase 3 — Canon summary pipeline

### Task 6: ADR-0022 and task contract

**Files:**
- Create: `docs/adr/ADR-0022-canon-summary-projection.md`
- Create: `tasks/NF-WF-060-canon-summary-projection.md`

**Interfaces:**
- Consumes: ADR-0017 accepted end-state; Task 1 per-projection opt-in.
- Produces: normative artifact definition, freshness rule, and acceptance criteria used by Tasks 7–11.

- [ ] **Step 1: Write ADR-0022**

Required sections and exact decisions:

```markdown
# ADR-0022: Canon summary projection — first registered intent pipeline

## Status
ACCEPTED — 2026-10-25. Supersedes ADR-0017 for the `canon` projection only.

## Context
ADR-0017 accepted the audit end-state for projections with no pipeline and
left per-projection opt-in open. The seven projections have no derived
artifacts, so a consumer alone would be a no-op. This ADR defines the first
real artifact and the exact lifecycle that makes its intents truthful.

## Decision
1. Artifact: `canon_summaries`, one row per `(novel_id, branch_id,
   source_revision_id)`, holding a bounded deterministic digest:
   entity count, fact counts by status, entity counts by kind, and the top
   20 predicates by active-fact count (ties by predicate ascending).
   No statements, no prose, no second truth: the digest is an index/health
   projection, never a canon source.
2. Derivation is as-of the source revision: entities and facts with
   `created_at <= revision.created_at`. Status counts are the current status
   of those rows (documented approximation, same posture as memory).
3. Lifecycle: the consumer claims the newest eligible `canon` intent per
   `(novel, branch)`, supersedes older eligible intents as `STALE`, rebuilds
   the digest at the claimed intent's source revision, and marks the intent
   `FRESH` or `FAILED`. `attempts` caps at 5 with exponential backoff.
4. Freshness is intent-based: `FRESH` iff a summary exists and no
   `PENDING`/`RUNNING`/`FAILED` canon intent for the same `(novel, branch)`
   has a source revision number greater than the summary's; `STALE` if one
   does; `MISSING` if no summary exists. Head advancement that did not
   invalidate canon does not stale the summary. This is the C6 staleness
   refinement recorded in the 2026-10-25 amendment.
5. Read/rebuild surface: `GET .../canon/summary` (`novel:read`) and
   `POST .../canon/summary/rebuild` (`novel:update`). The rebuild route
   rebuilds at the current branch head synchronously and is the recovery
   path after `FAILED` exhaustion or an intentional re-derive.
6. No canonical mutation, no Redis, no LLM call. A failed rebuild leaves the
   prior summary and a `FAILED` intent; it never reports FRESH.

## Consequences
- The `canon` intents become real rebuild work; the other six projections
  remain terminal audit until they register pipelines.
- Rebuild cost is bounded: two indexed aggregations plus one upsert.
- The digest is intentionally shallow; richer canon summaries need a new ADR.
```

- [ ] **Step 2: Write the task contract**

Use `tasks/templates/TASK-TEMPLATE.md`. Fill: Status READY; allowed paths exactly the Phase 3 files; forbidden paths everything else; inputs ADR-0017/ADR-0022 + C6/C7/C10; outputs the table, handler, routes; acceptance includes Tasks 7–11 tests; migration/rollback: additive table, drop is safe before first production use; reviewer separate actor.

- [ ] **Step 3: Verify**

Run: `grep -n "ACCEPTED — 2026-10-25" docs/adr/ADR-0022-canon-summary-projection.md`
Expected: one match.

### Task 7: Schema and migration for `canon_summaries`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20261025_canon_summary_projection/migration.sql`

**Interfaces:**
- Produces Prisma model `CanonSummary` with unique `(novelId, branchId, sourceRevisionId)` and fields listed below.

- [ ] **Step 1: Add the model**

```prisma
/// ADR-0022: bounded, deterministic digest of canon at a source revision.
/// Derived, never truth. One row per (novel, branch, source revision).
model CanonSummary {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId          String    @map("workspace_id") @db.Uuid
  workspace            Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  novelId              String    @map("novel_id") @db.Uuid
  novel                Novel     @relation(fields: [novelId], references: [id], onDelete: Cascade)
  branchId             String    @map("branch_id") @db.Uuid
  branch               NovelBranch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  sourceRevisionId     String    @map("source_revision_id") @db.Uuid
  sourceRevision       Revision  @relation(fields: [sourceRevisionId], references: [id], onDelete: Cascade)
  sourceRevisionNumber Int       @map("source_revision_number")
  entityCount          Int       @map("entity_count")
  activeFactCount      Int       @map("active_fact_count")
  supersededFactCount  Int       @map("superseded_fact_count")
  retractedFactCount   Int       @map("retracted_fact_count")
  /// { entitiesByKind: Record<string, number>, topPredicates: Array<{predicate,count}>, truncatedPredicates: boolean }
  digest               Json
  createdAt            DateTime  @default(now()) @map("created_at")

  @@unique([novelId, branchId, sourceRevisionId])
  @@index([novelId, branchId, sourceRevisionNumber])
  @@map("canon_summaries")
}
```

Add relation arrays:
- `Workspace`: `canonSummaries CanonSummary[]`
- `Novel`: `canonSummaries CanonSummary[]`
- `NovelBranch`: `canonSummaries CanonSummary[]`
- `Revision`: `canonSummaries CanonSummary[]`

- [ ] **Step 2: Write the migration SQL**

```sql
CREATE TABLE "canon_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "source_revision_number" INTEGER NOT NULL,
    "entity_count" INTEGER NOT NULL,
    "active_fact_count" INTEGER NOT NULL,
    "superseded_fact_count" INTEGER NOT NULL,
    "retracted_fact_count" INTEGER NOT NULL,
    "digest" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canon_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canon_summaries_novel_id_branch_id_source_revision_id_key"
  ON "canon_summaries"("novel_id", "branch_id", "source_revision_id");

CREATE INDEX "canon_summaries_novel_id_branch_id_source_revision_number_idx"
  ON "canon_summaries"("novel_id", "branch_id", "source_revision_number");

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_novel_id_fkey"
  FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "novel_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canon_summaries"
  ADD CONSTRAINT "canon_summaries_source_revision_id_fkey"
  FOREIGN KEY ("source_revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate and deploy to a disposable DB**

```bash
pnpm --filter @novelforge/database exec prisma validate
DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge_test_canon_mig \
  pnpm --filter @novelforge/database exec prisma migrate deploy
```

Create `novelforge_test_canon_mig` first if it does not exist. Expected: migration applied, no drift.

Run: `pnpm --filter @novelforge/database typecheck`
Expected: exit 0.

### Task 8: Pure digest builder

**Files:**
- Create: `packages/story-intelligence/canon-summary.ts`
- Create: `packages/story-intelligence/canon-summary.test.ts`
- Modify: `packages/story-intelligence/index.ts` (export if not `export *`)

**Interfaces:**
- Produces:
  ```ts
  export const CANON_SUMMARY_MAX_PREDICATES = 20;
  export interface CanonSummaryInput {
    entities: Array<{ kind: string }>;
    facts: Array<{ predicate: string; status: "ACTIVE" | "SUPERSEDED" | "RETRACTED" }>;
  }
  export interface CanonSummaryDigest {
    entityCount: number;
    activeFactCount: number;
    supersededFactCount: number;
    retractedFactCount: number;
    entitiesByKind: Record<string, number>;
    topPredicates: Array<{ predicate: string; count: number }>;
    truncatedPredicates: boolean;
  }
  export function buildCanonSummaryDigest(input: CanonSummaryInput): CanonSummaryDigest;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CANON_SUMMARY_MAX_PREDICATES, buildCanonSummaryDigest } from "./canon-summary.ts";

it("counts statuses and kinds deterministically", () => {
  const digest = buildCanonSummaryDigest({
    entities: [{ kind: "CHARACTER" }, { kind: "CHARACTER" }, { kind: "PLACE" }],
    facts: [
      { predicate: "memiliki anak", status: "ACTIVE" },
      { predicate: "memelihara", status: "ACTIVE" },
      { predicate: "memiliki anak", status: "ACTIVE" },
      { predicate: "memiliki anak", status: "SUPERSEDED" },
      { predicate: "bekerja dengan", status: "RETRACTED" },
    ],
  });
  expect(digest.entityCount).toBe(3);
  expect(digest.activeFactCount).toBe(3);
  expect(digest.supersededFactCount).toBe(1);
  expect(digest.retractedFactCount).toBe(1);
  expect(digest.entitiesByKind).toEqual({ CHARACTER: 2, PLACE: 1 });
  expect(digest.topPredicates).toEqual([
    { predicate: "memiliki anak", count: 2 },
    { predicate: "memelihara", count: 1 },
  ]);
  expect(digest.truncatedPredicates).toBe(false);
});

it("caps predicates and reports truncation", () => {
  const facts = Array.from({ length: CANON_SUMMARY_MAX_PREDICATES + 1 }, (_, i) => ({
    predicate: `p${String(i).padStart(2, "0")}`,
    status: "ACTIVE" as const,
  }));
  const digest = buildCanonSummaryDigest({ entities: [], facts });
  expect(digest.topPredicates).toHaveLength(CANON_SUMMARY_MAX_PREDICATES);
  expect(digest.truncatedPredicates).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @novelforge/story-intelligence exec vitest run canon-summary.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export const CANON_SUMMARY_MAX_PREDICATES = 20;

export interface CanonSummaryInput {
  entities: Array<{ kind: string }>;
  facts: Array<{ predicate: string; status: "ACTIVE" | "SUPERSEDED" | "RETRACTED" }>;
}

export interface CanonSummaryDigest {
  entityCount: number;
  activeFactCount: number;
  supersededFactCount: number;
  retractedFactCount: number;
  entitiesByKind: Record<string, number>;
  topPredicates: Array<{ predicate: string; count: number }>;
  truncatedPredicates: boolean;
}

export function buildCanonSummaryDigest(input: CanonSummaryInput): CanonSummaryDigest {
  const entitiesByKind: Record<string, number> = {};
  for (const entity of input.entities) {
    entitiesByKind[entity.kind] = (entitiesByKind[entity.kind] ?? 0) + 1;
  }
  const sortedKinds = Object.fromEntries(
    Object.entries(entitiesByKind).sort(([a], [b]) => a.localeCompare(b)),
  );

  let active = 0;
  let superseded = 0;
  let retracted = 0;
  const predicateCounts = new Map<string, number>();
  for (const fact of input.facts) {
    if (fact.status === "ACTIVE") {
      active += 1;
      predicateCounts.set(fact.predicate, (predicateCounts.get(fact.predicate) ?? 0) + 1);
    } else if (fact.status === "SUPERSEDED") {
      superseded += 1;
    } else {
      retracted += 1;
    }
  }
  const ranked = [...predicateCounts.entries()]
    .map(([predicate, count]) => ({ predicate, count }))
    .sort((a, b) => b.count - a.count || a.predicate.localeCompare(b.predicate));

  return {
    entityCount: input.entities.length,
    activeFactCount: active,
    supersededFactCount: superseded,
    retractedFactCount: retracted,
    entitiesByKind: sortedKinds,
    topPredicates: ranked.slice(0, CANON_SUMMARY_MAX_PREDICATES),
    truncatedPredicates: ranked.length > CANON_SUMMARY_MAX_PREDICATES,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @novelforge/story-intelligence test`
Expected: PASS.

### Task 9: Canon handler, registry, and rebuild service

**Files:**
- Create: `packages/ai-services/src/canon-summary.ts` (shared rebuild)
- Modify: `packages/ai-services/index.ts` (export)
- Create: `apps/worker/src/canon-summary.ts` (handler adapter)
- Create: `apps/worker/src/canon-summary.test.ts`
- Modify: `apps/worker/src/derived-intents.ts` (`createIntentHandlers`)
- Modify: `packages/story-versioning/intents.ts` (`PIPELINE_PROJECTIONS = ["canon"]`)
- Modify: `apps/worker/src/derived-intents.test.ts` (registry assertion)

**Interfaces:**
- Produces:
  ```ts
  // @novelforge/ai-services
  export async function rebuildCanonSummary(
    db: NovelForgeDb,
    input: { workspaceId: string; novelId: string; sourceRevisionId: string },
  ): Promise<CanonSummaryRow>;
  // apps/worker/src/canon-summary.ts
  export function createCanonSummaryHandler(deps: { db: NovelForgeDb }): RebuildHandler;
  // apps/worker/src/derived-intents.ts
  export function createIntentHandlers(db: NovelForgeDb): HandlerRegistry;
  ```

- [ ] **Step 1: Write the failing DB test**

Bootstrap `novelforge_test_canon_summary`, seed novel/branch/revision/entities/facts, then:

```ts
it("rebuilds an as-of digest and is idempotent", async () => {
  const first = await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1.id });
  const second = await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1.id });
  expect(second.id).toBe(first.id);
  expect(first.entityCount).toBe(2);
  expect(first.activeFactCount).toBe(1);
});

it("excludes rows created after the source revision", async () => {
  const summary = await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: rev1.id });
  expect(summary.entityCount).toBe(2); // the third entity was created later
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @novelforge/worker exec vitest run src/canon-summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the shared rebuild in `@novelforge/ai-services`**

`packages/ai-services/src/canon-summary.ts`:

```ts
import type { NovelForgeDb } from "@novelforge/database";
import { buildCanonSummaryDigest } from "@novelforge/story-intelligence";

export async function rebuildCanonSummary(
  db: NovelForgeDb,
  input: { workspaceId: string; novelId: string; sourceRevisionId: string },
) {
  const revision = await db.revision.findFirst({
    where: { id: input.sourceRevisionId, novelId: input.novelId, workspaceId: input.workspaceId },
    select: { id: true, branchId: true, number: true, createdAt: true },
  });
  if (!revision) throw new Error(`source revision ${input.sourceRevisionId} not found for novel`);

  // A mutation writes its revision row first, so its own rows are newer than
  // the revision. The next revision's createdAt is the exclusive upper bound;
  // at head, include everything written so far (acceptance finding, 2026-10-25).
  const nextRevision = await db.revision.findFirst({
    where: { branchId: revision.branchId, number: { gt: revision.number } },
    orderBy: { number: "asc" },
    select: { createdAt: true },
  });
  const asOf = nextRevision ? { lt: nextRevision.createdAt } : undefined;

  const [entities, facts] = await Promise.all([
    db.storyEntity.findMany({
      where: { novelId: input.novelId, ...(asOf ? { createdAt: asOf } : {}) },
      select: { kind: true },
    }),
    db.canonFact.findMany({
      where: { novelId: input.novelId, ...(asOf ? { createdAt: asOf } : {}) },
      select: { predicate: true, status: true },
    }),
  ]);

  const digest = buildCanonSummaryDigest({
    entities,
    facts: facts.map((fact) => ({
      predicate: fact.predicate,
      status: fact.status as "ACTIVE" | "SUPERSEDED" | "RETRACTED",
    })),
  });

  return db.canonSummary.upsert({
    where: {
      novelId_branchId_sourceRevisionId: {
        novelId: input.novelId,
        branchId: revision.branchId,
        sourceRevisionId: revision.id,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      novelId: input.novelId,
      branchId: revision.branchId,
      sourceRevisionId: revision.id,
      sourceRevisionNumber: revision.number,
      entityCount: digest.entityCount,
      activeFactCount: digest.activeFactCount,
      supersededFactCount: digest.supersededFactCount,
      retractedFactCount: digest.retractedFactCount,
      digest: {
        entitiesByKind: digest.entitiesByKind,
        topPredicates: digest.topPredicates,
        truncatedPredicates: digest.truncatedPredicates,
      },
    },
    update: {
      sourceRevisionNumber: revision.number,
      entityCount: digest.entityCount,
      activeFactCount: digest.activeFactCount,
      supersededFactCount: digest.supersededFactCount,
      retractedFactCount: digest.retractedFactCount,
      digest: {
        entitiesByKind: digest.entitiesByKind,
        topPredicates: digest.topPredicates,
        truncatedPredicates: digest.truncatedPredicates,
      },
    },
  });
}
```

Export it from `packages/ai-services/index.ts`:

```ts
export { rebuildCanonSummary } from "./src/canon-summary.ts";
```

- [ ] **Step 3b: Implement the worker adapter**

`apps/worker/src/canon-summary.ts`:

```ts
import type { NovelForgeDb } from "@novelforge/database";
import { rebuildCanonSummary } from "@novelforge/ai-services";
import type { RebuildHandler } from "./derived-intents.ts";

export function createCanonSummaryHandler(deps: { db: NovelForgeDb }): RebuildHandler {
  return {
    projection: "canon",
    async rebuild({ workspaceId, novelId, sourceRevisionId }) {
      await rebuildCanonSummary(deps.db, { workspaceId, novelId, sourceRevisionId });
    },
  };
}
```

- [ ] **Step 4: Register the pipeline**

`packages/story-versioning/intents.ts`:

```ts
export const PIPELINE_PROJECTIONS: readonly Projection[] = ["canon"];
```

`apps/worker/src/derived-intents.ts` (replace the empty registry with a lazy factory):

```ts
import { createCanonSummaryHandler } from "./canon-summary.ts";

/** Handlers registered in this build. ADR-0022 registers `canon`. */
export function createIntentHandlers(db: NovelForgeDb): HandlerRegistry {
  return { canon: createCanonSummaryHandler({ db }) };
}
```

and in the starter: `const handlers = deps.handlers ?? createIntentHandlers(db);`
(replace `deps.handlers ?? INTENT_HANDLERS`). Remove the `INTENT_HANDLERS`
constant and the temporary empty-registry test.

Then the registry-consistency test:

```ts
it("registered handlers match PIPELINE_PROJECTIONS", () => {
  const handlers = createIntentHandlers(db);
  expect(Object.keys(handlers).sort()).toEqual([...PIPELINE_PROJECTIONS].sort());
});
```

Update `apps/worker/src/index.ts` to call `startDerivedIntentWorkerApp(env, logger)` without passing `handlers` (the starter builds them from its db).

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @novelforge/worker exec vitest run src/canon-summary.test.ts src/derived-intents.test.ts`
Expected: PASS.

Run: `pnpm --filter @novelforge/worker typecheck`
Expected: exit 0.

### Task 10: Canon summary read and rebuild API

**Files:**
- Create: `apps/api/src/services/canon-summary.ts`
- Create: `apps/api/src/canon-summary-routes.ts`
- Create: `apps/api/src/canon-summary.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createCanonSummaryServices(deps: { db: NovelForgeDb }): {
    read(actorUserId: string, workspaceId: string, novelId: string): Promise<{
      freshness: "FRESH" | "STALE" | "MISSING";
      summary: {
        id: string;
        sourceRevisionId: string;
        sourceRevisionNumber: number;
        entityCount: number;
        activeFactCount: number;
        supersededFactCount: number;
        retractedFactCount: number;
        digest: unknown;
        createdAt: string;
      } | null;
      headRevisionNumber: number;
      pendingAfterSummary: number;
      lastError: string | null;
    }>;
    rebuild(actorUserId: string, workspaceId: string, novelId: string): Promise<{ rebuilt: true; sourceRevisionNumber: number }>;
  }
  ```

- [ ] **Step 1: Write the failing API test**

Cases: 401; MISSING before any rebuild; rebuild returns 200 and read becomes FRESH; inserting a newer canon PENDING intent makes read STALE; rebuild again makes it FRESH; foreign workspace 404.

- [ ] **Step 2: Implement the service**

Freshness query (same branch):

```ts
const newestInvalidation = await db.derivedRebuildIntent.findFirst({
  where: {
    novelId,
    projection: "canon",
    status: { in: ["PENDING", "RUNNING", "FAILED"] },
    sourceRevision: { branchId: branch.id, number: { gt: latest.sourceRevisionNumber } },
  },
  orderBy: { sourceRevision: { number: "desc" } },
  select: { id: true, lastError: true, sourceRevision: { select: { number: true } } },
});
```

Freshness:

```ts
const freshness = !latest ? "MISSING" : newestInvalidation ? "STALE" : "FRESH";
```

Rebuild at head:

```ts
const branch = novel.currentBranchId
  ? await db.novelBranch.findUnique({ where: { id: novel.currentBranchId }, select: { id: true, headRevisionId: true, headRevision: { select: { number: true } } } })
  : await db.novelBranch.findFirst({ where: { novelId, name: "main" }, select: { id: true, headRevisionId: true, headRevision: { select: { number: true } } } });
if (!branch?.headRevisionId) throw new ConflictError("no baseline exists for this novel");
await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId: branch.headRevisionId });
```

The API service imports `rebuildCanonSummary` from `@novelforge/ai-services`
(created in Task 9). Never import `apps/worker` from `apps/api`.

- [ ] **Step 3: Implement the routes**

The route bodies mirror `apps/api/src/memory-routes.ts:75-102`: `requireActor`
(401), zod params (400), service call, 200. Both routes are registered with
the same `SESSION_COOKIE` helper.

- [ ] **Step 4: Register in `app.ts`**

```ts
registerCanonSummaryRoutes(app, {
  auth,
  canonSummary: createCanonSummaryServices({ db: options.db }),
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @novelforge/api exec vitest run src/canon-summary.test.ts`
Expected: PASS.

Run: `pnpm --filter @novelforge/api typecheck`
Expected: exit 0.

---

## Phase 4 — Verification, acceptance execution, evidence

### Task 11: Disposable-DB verification and acceptance run

**Files:**
- Create temporarily: `apps/worker/src/ops-derived-intents.tmp.ts`
- Modify: `docs/implementation/ISSUES-AND-GAPS.md:5950`
- Modify: `docs/14-progress/CURRENT.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified evidence and a report of the acceptance database state.

- [ ] **Step 1: Full focused verification**

```bash
pnpm --filter @novelforge/story-versioning typecheck
pnpm --filter @novelforge/story-intelligence test
pnpm --filter @novelforge/database typecheck
pnpm --filter @novelforge/worker exec vitest run src/derived-intents.test.ts src/canon-summary.test.ts
pnpm --filter @novelforge/api exec vitest run src/derived-intents.test.ts src/canon-summary.test.ts
pnpm --filter @novelforge/worker typecheck
pnpm --filter @novelforge/api typecheck
pnpm --filter @novelforge/web typecheck
```

All must exit 0. Record actual output.

- [ ] **Step 2: Dry-run the acceptance runner**

`apps/worker/src/ops-derived-intents.tmp.ts`:

```ts
import { createDb } from "@novelforge/database";
import { runDerivedIntentSweep, createIntentHandlers } from "./derived-intents.ts";

const url = process.env.CH10_DATABASE_URL ?? "postgresql://novelforge:novelforge@localhost:5433/novelforge_acceptance_050b";
const apply = process.argv.includes("--apply");
const db = createDb(url);

const before = await db.derivedRebuildIntent.groupBy({
  by: ["projection", "status"],
  _count: { _all: true },
});
console.log("before", JSON.stringify(before));
if (!apply) {
  console.log("dry run: pass --apply to run the sweep");
  await db.$disconnect();
  process.exit(0);
}

const handlers = createIntentHandlers(db);
const report = await runDerivedIntentSweep({
  db,
  handlers,
  logger: { warn: (m, x) => console.warn(m, x), error: (m, x) => console.error(m, x) },
});
console.log("sweep", JSON.stringify(report));

const after = await db.derivedRebuildIntent.groupBy({
  by: ["projection", "status"],
  _count: { _all: true },
});
console.log("after", JSON.stringify(after));
await db.$disconnect();
```

Run dry first: `node --experimental-transform-types apps/worker/src/ops-derived-intents.tmp.ts`
Expected: counts printed, no mutation.

- [ ] **Step 3: Gate: apply the migration to acceptance**

Only after the disposable DB migration and all tests pass:

```bash
DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge_acceptance_050b \
  pnpm --filter @novelforge/database exec prisma migrate deploy
```

Expected: one migration applied (`20261025_canon_summary_projection`). Confirm the table exists and no other migration is pending.

- [ ] **Step 4: Run the sweep against acceptance**

```bash
node --experimental-transform-types apps/worker/src/ops-derived-intents.tmp.ts --apply
```

Expected with the current acceptance data:
- `canon`: the newest intent is processed at its source revision and marked `FRESH`; older canon intents become `STALE`; one `canon_summaries` row exists.
- `manuscript`, `character`, `planning`, `relationship`, `story_intelligence`, `narrative`: untouched `PENDING` (terminal audit).
- No failed rebuilds.

Verify:

```sql
SELECT projection, status, count(*) FROM derived_rebuild_intents
WHERE novel_id='e36d568b-aecf-476a-8e3f-f47ca709672b'
GROUP BY projection, status ORDER BY projection, status;

SELECT source_revision_number, entity_count, active_fact_count,
       superseded_fact_count, retracted_fact_count, digest
FROM canon_summaries WHERE novel_id='e36d568b-aecf-476a-8e3f-f47ca709672b';
```

- [ ] **Step 5: Verify the read surface**

Call `GET /api/workspaces/b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9/novels/e36d568b-aecf-476a-8e3f-f47ca709672b/canon/summary` through the running API with a valid session (or assert the same query through the service in a test against a copy). Expected: `freshness: "FRESH"`, summary counts matching the SQL row, `pendingAfterSummary: 0`.

- [ ] **Step 6: Update ISSUES-AND-GAPS**

Append a dated entry under the intent-lifecycle gap:

```markdown
### 2026-10-25 closure — audit end-state accepted; canon pipeline registered

Author accepted ADR-0017 Option B (audit end-state) and directed the
generic consumer + first real pipeline. ADR-0022 registers `canon` with the
`canon_summaries` artifact. Lifecycle for registered projections is
`PENDING|FAILED → RUNNING → FRESH|FAILED`; older intents supersede to
`STALE`. The remaining six projections stay terminal audit. Evidence:
<test names + counts + acceptance SQL results>. OPEN items: none for this
entry; richer canon summaries need a new ADR.
```

Do not write the closure claims until Steps 1–5 have actual output.

- [ ] **Step 7: Update `docs/14-progress/CURRENT.md`**

Record the same evidence under the current date, distinguishing backend, worker, API and acceptance evidence. Mark the intent-lifecycle item IMPLEMENTED for `canon`, AUDIT-ONLY for the other six.

- [ ] **Step 8: Delete the temp runner**

```bash
rm -f apps/worker/src/ops-derived-intents.tmp.ts
```

Confirm `git status --porcelain` contains only intended files.

### Task 12: Independent review and final verification

**Files:**
- Read-only: the full diff of Tasks 1–11.

**Interfaces:**
- Consumes: the exact submitted diff and test output.
- Produces: review verdict appended to ADR-0017 and the task contract.

- [ ] **Step 1: Dispatch a separate reviewer**

Use the `pr-review-toolkit:code-reviewer` subagent with the exact `git diff` and the list of tests run. The implementation session must not approve itself. Prompt it to check:
1. CAS correctness (no two claims, no lost updates, correct supersession).
2. Freshness truth (no FRESH without a rebuilt artifact; no false success).
3. Tenant/auth boundaries on both new routes.
4. As-of correctness of the digest and documented approximations.
5. Migration safety (additive only, FKs, unique/index names match Prisma).
6. Contract amendment fidelity (no silent rewrite).

- [ ] **Step 2: Resolve findings and re-run verification**

Apply fixes, re-run the Task 11 Step 1 commands, and append the verdict to ADR-0017's review record and the task contract. If findings remain unresolved, keep the task status at REVIEW_PENDING and report them; do not claim completion.

- [ ] **Step 3: Final report**

Report in Indonesian: what changed per phase, acceptance counts before/after, the canon summary values, which projections remain `PENDING`, test/typecheck evidence, and any residual risk (e.g., digest is intentionally shallow; 6 projections stay audit-only until they register pipelines).
