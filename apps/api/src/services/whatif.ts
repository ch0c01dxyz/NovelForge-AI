/**
 * @novelforge/api — what-if outline simulation services (M9, NF-WF-024A).
 *
 * Promotes docs/ideas/what-if-outline-simulation.md from draft to feature:
 * the author picks 2+ outline versions (any status), the system simulates
 * the story path each would produce (bounded), and shows where the paths
 * diverge.
 *
 * This is the NARRATIVE-level counterpart to 021's world-level simulation
 * (021 Q8 kept them distinct). 024A consumes 021A's run lifecycle and tick
 * storage (shared primitives), with scenario kind='WHATIF'.
 *
 * Invariants (024 contract §"Behavior and invariants"):
 * - Invariant 1: What-if runs NEVER enter the 008 canon pipeline, 009
 *   memory consolidation, or the approved manuscript. Inspect-only: there
 *   is NO approve/promote operation on a comparison.
 * - Invariant 2: Unattributed divergence is reported as unattributed,
 *   never smoothed over.
 * - Invariant 3: Bounded cost — maxChapters + tokenBudget declared up
 *   front, explicit author confirmation (confirmed: true), server-side
 *   enforcement. Budget exhaustion → INCOMPLETE_BUDGET_EXHAUSTED.
 * - Read-path isolation (F1): WHATIF runs excluded from 021D's list;
 *   the what-if panel is the sole surface.
 *
 * Capabilities: reuses simulation:read / simulation:manage (no new
 * capabilities per 024 contract §Capabilities).
 */
import type { NovelForgeDb, InputJsonValue } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import { NotFoundError } from "@novelforge/ai-services";
import type { SimulationServices } from "./simulation.ts";

/**
 * NF-WF-024A: typed what-if refusals.
 */
export type WhatifErrorCode =
  | "INVALID_INPUT" // malformed input (e.g., <2 outline versions, unconfirmed)
  | "OUTLINE_VERSION_NOT_FOUND" // unknown outline version id
  | "BUDGET_EXCEEDED" // tokenBudget exceeded during run
  | "INVALID_STATUS_TRANSITION" // 409: lifecycle transition not allowed
  | "COMPARISON_NOT_FOUND" // 404: unknown comparison id
  | "MAIN_BRANCH_FORBIDDEN" // 400: selected branch is the novel's main branch
  | "BRANCH_NOT_FOUND" // 404: existing branchId unknown or not in novel/workspace
  | "WHATIF_NO_SNAPSHOT" // 409: branch has no checkpoint (or no head revision)
  | "WHATIF_MODULE_NOT_ENABLED" // 409: simulation module not enabled for novel
  | "BRANCH_PROVISION_FAILED"; // 409: provision failed; no partial branch left

export class WhatifError extends Error {
  readonly code: WhatifErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: WhatifErrorCode, message: string) {
    super(message);
    this.name = "WhatifError";
    this.code = code;
    this.statusCode =
      code === "COMPARISON_NOT_FOUND" || code === "BRANCH_NOT_FOUND"
        ? 404
        : code === "INVALID_STATUS_TRANSITION" ||
            code === "WHATIF_NO_SNAPSHOT" ||
            code === "WHATIF_MODULE_NOT_ENABLED" ||
            code === "BRANCH_PROVISION_FAILED"
          ? 409
          : 400;
  }
}

/**
 * NF-WF-024A (F10): pinned token budget maximum. Documented rationale:
 * a what-if comparison multiplies generation cost by the number of
 * outline versions; 100k tokens caps a 5-version comparison at ~20k
 * tokens per version — enough for bounded narrative simulation (default
 * 3 chapters) without runaway cost. The bound is enforced server-side.
 */
export const WHATIF_MAX_TOKEN_BUDGET = 100_000;
/** Default token budget per comparison (documented; author-adjustable up to the max). */
export const WHATIF_DEFAULT_TOKEN_BUDGET = 20_000;
/** Default max chapters per simulated path (contract Q1). */
export const WHATIF_DEFAULT_MAX_CHAPTERS = 3;
/** Maximum outline versions per comparison (bounded fan-out). */
export const WHATIF_MAX_OUTLINE_VERSIONS = 5;

export type WhatifComparisonStatus =
  | "DRAFT"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "INCOMPLETE_BUDGET_EXHAUSTED"
  | "ABORTED";

export interface DivergencePoint {
  tickNumber: number;
  chapterIndex: number;
  /**
   * NF-WF-024A F4 (P3 observation): UNATTRIBUTED is reserved but never
   * emitted by the current detector. The detector defines divergence AS a
   * structural difference in canonicalized tick stateAfter payloads — so
   * any detected divergence is structural by construction. UNATTRIBUTED
   * exists for future detectors (e.g., semantic/probabilistic) where the
   * cause may not be clear from state comparison. Per Invariant 2, if such
   * a detector ever reports unattributed divergence, it must be surfaced
   * as UNATTRIBUTED, never smoothed over.
   */
  kind: "STRUCTURAL" | "UNATTRIBUTED";
  summary: string;
  outlineVersionIds: string[];
}

export interface WhatifComparisonShape {
  id: string;
  novelId: string;
  outlineVersionIds: string[];
  runIds: string[];
  divergencePoints: DivergencePoint[];
  maxChapters: number;
  tokenBudget: number;
  tokenSpent: number;
  status: WhatifComparisonStatus;
  createdAt: Date;
  /** NF-WF-027: the simulation branch the runs execute on (null for pre-027 rows). */
  branchId: string | null;
  /** NF-WF-027: 'existing' | 'provision' (null for pre-027 rows). */
  branchMode: WhatifBranchMode | null;
}

/**
 * NF-WF-027 (GAP-100): explicit branch ownership for live comparisons.
 * Required on createComparison — no default, no silent fallback.
 */
export type WhatifBranchMode = "existing" | "provision";

export type WhatifBranchSelection =
  | { mode: "existing"; branchId: string }
  | { mode: "provision" };

export interface WhatifServices {
  createComparison(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    outlineVersionIds: string[];
    maxChapters?: number;
    tokenBudget?: number;
    confirmed: boolean;
    /**
     * NF-WF-027: required at the HTTP boundary (Zod-validated). Optional for
     * direct service calls (e.g., stub-path tests) — if omitted, the comparison
     * is created without a branch (pre-027 state); the live path refuses with
     * BRANCH_NOT_FOUND, the stub path works unaffected.
     */
    branchSelection?: WhatifBranchSelection;
  }): Promise<WhatifComparisonShape>;

  runComparison(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    comparisonId: string;
    /** Deterministic tick-state generator for tests/eval. When provided,
     *  no LLM is called; the generator produces tick states directly. */
    stubGenerator?: (outlineVersionId: string, chapterIndex: number) => Record<string, unknown>;
  }): Promise<WhatifComparisonShape>;

  listComparisons(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<WhatifComparisonShape[]>;

  getComparison(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    comparisonId: string;
  }): Promise<WhatifComparisonShape>;
}

/**
 * Structural divergence detection (contract Q3): the first tick/chapter
 * where trajectories differ beyond a pinned threshold on a fixture-stable
 * signal. The signal is a deterministic JSON-canonicalized comparison of
 * tick stateAfter payloads. Divergence the detector cannot attribute is
 * reported as UNATTRIBUTED (Invariant 2), never smoothed over.
 */
export function detectDivergence(
  trajectories: { outlineVersionId: string; ticks: { tickNumber: number; stateAfter: unknown }[] }[],
  maxChapters: number,
): DivergencePoint[] {
  const points: DivergencePoint[] = [];
  if (trajectories.length < 2) return points;

  const maxTicks = Math.max(...trajectories.map((t) => t.ticks.length));
  for (let tickIdx = 0; tickIdx < maxTicks; tickIdx++) {
    const states = trajectories.map((t) => {
      const tick = t.ticks[tickIdx];
      return {
        outlineVersionId: t.outlineVersionId,
        // Fixture-stable signal: canonicalized JSON of the tick state.
        signal: tick ? canonicalize(tick.stateAfter) : null,
      };
    });
    // NF-WF-024A F5 (P3 observation): length-mismatched trajectories are
    // handled by skipping ticks where fewer than 2 trajectories have data.
    // A tick that doesn't exist in one trajectory cannot be compared; the
    // divergence (if any) would have been caught at an earlier tick when
    // states first differed, or the shorter trajectory simply ended.
    const nonNull = states.filter((s) => s.signal !== null);
    if (nonNull.length < 2) continue;
    const first = nonNull[0]?.signal;
    if (first === undefined) continue;
    const diverged = nonNull.filter((s) => s.signal !== first);
    if (diverged.length > 0) {
      const tickNumber = tickIdx + 1;
      points.push({
        tickNumber,
        chapterIndex: Math.min(tickNumber, maxChapters),
        kind: "STRUCTURAL",
        summary: `Trajectories diverge at tick ${tickNumber}: ${diverged.length} of ${nonNull.length} paths differ structurally.`,
        outlineVersionIds: diverged.map((d) => d.outlineVersionId),
      });
      // NF-WF-024A F6 (P3 observation): Report only the FIRST divergence
      // per trajectory pair set to keep the timeline focused; subsequent
      // ticks are downstream effects. This is a conscious choice per
      // contract Q3 (not a limitation): the author cares WHERE paths first
      // split, not every downstream ripple.
      break;
    }
  }
  return points;
}

/** Deterministic JSON canonicalization (sorted keys, recursive). */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function createWhatifServices({
  db,
  simulations,
  revisions,
}: {
  db: NovelForgeDb;
  simulations: SimulationServices;
  /**
   * NF-WF-027: required for `provision` mode (020B `createBranch`).
   * The what-if service calls `revisions.createBranch()` which gates on
   * `revision:manage`; the what-if service additionally gates provision
   * on `simulation:manage` (fail fast at createComparison time).
   */
  revisions?: {
    createBranch(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      name: string;
      fromRevisionId?: string;
      fromCheckpointId?: string;
    }): Promise<{ branchId: string; name: string; headRevisionId: string | null }>;
  };
}): WhatifServices {
  /** Membership gate — 404 for non-members (ADR-0004), role for caps. */
  async function gate(
    workspaceId: string,
    novelId: string,
    userId: string,
    cap: Capability,
  ): Promise<void> {
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
  }

  function toShape(row: {
    id: string;
    novelId: string;
    outlineVersionIds: unknown;
    runIds: unknown;
    divergencePoints: unknown;
    maxChapters: number;
    tokenBudget: number;
    tokenSpent: number;
    status: string;
    createdAt: Date;
    branchId: string | null;
    branchMode: string | null;
  }): WhatifComparisonShape {
    return {
      id: row.id,
      novelId: row.novelId,
      outlineVersionIds: row.outlineVersionIds as string[],
      runIds: row.runIds as string[],
      divergencePoints: row.divergencePoints as DivergencePoint[],
      maxChapters: row.maxChapters,
      tokenBudget: row.tokenBudget,
      tokenSpent: row.tokenSpent,
      status: row.status as WhatifComparisonStatus,
      createdAt: row.createdAt,
      branchId: row.branchId,
      branchMode: row.branchMode as WhatifBranchMode | null,
    };
  }

  async function getComparisonOrThrow(workspaceId: string, novelId: string, comparisonId: string) {
    const row = await db.whatifComparison.findFirst({
      where: { id: comparisonId, workspaceId, novelId },
    });
    if (!row) throw new WhatifError("COMPARISON_NOT_FOUND", "what-if comparison not found");
    return row;
  }

  /**
   * NF-WF-027 (GAP-100) Invariant 3: verify branch prerequisites in order.
   * Used at createComparison (existing mode) and re-verified at runComparison.
   *
   * Order:
   * 1. Branch exists in novel/workspace → BRANCH_NOT_FOUND (404)
   * 2. Not main → MAIN_BRANCH_FORBIDDEN (400)
   * 3. Has checkpoint → WHATIF_NO_SNAPSHOT (409)
   * 4. Has head revision → WHATIF_NO_SNAPSHOT variant (409)
   * 5. Simulation module enabled → WHATIF_MODULE_NOT_ENABLED (409)
   *
   * Returns the branch id on success. Never falls back to main.
   */
  async function verifyBranchPrerequisites(
    workspaceId: string,
    novelId: string,
    branchId: string,
  ): Promise<string> {
    // 1. Branch exists (tenant-gated).
    const branch = await db.novelBranch.findFirst({
      where: { id: branchId, novelId, workspaceId },
      select: { id: true, name: true, headRevisionId: true },
    });
    if (!branch) {
      throw new WhatifError("BRANCH_NOT_FOUND", "simulation branch not found in this novel");
    }

    // 2. Not main — explicit refusal, never silent fallback (Invariant 2).
    if (branch.name.toLowerCase() === "main") {
      throw new WhatifError(
        "MAIN_BRANCH_FORBIDDEN",
        "what-if comparisons cannot run on the main branch; select or provision an isolated simulation branch",
      );
    }

    // 3. Checkpoint exists on the branch.
    const checkpoint = await db.checkpoint.findFirst({
      where: { novelId, branchId: branch.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!checkpoint) {
      throw new WhatifError(
        "WHATIF_NO_SNAPSHOT",
        "no checkpoint exists for the simulation branch; create one first",
      );
    }

    // 4. Head revision (canon pin).
    if (!branch.headRevisionId) {
      throw new WhatifError("WHATIF_NO_SNAPSHOT", "simulation branch has no head revision");
    }

    // 5. Simulation module enabled.
    const module = await db.novelModule.findUnique({
      where: { novelId_moduleName: { novelId, moduleName: "simulation" } },
    });
    if (!module) {
      throw new WhatifError(
        "WHATIF_MODULE_NOT_ENABLED",
        "the simulation module is not enabled for this novel",
      );
    }

    return branch.id;
  }

  /**
   * NF-WF-027 (GAP-100) Invariant 5: provision a simulation branch + checkpoint
   * atomically (mechanism B: sequential with compensating delete).
   *
   * The checkpoint CANNOT use the standard `createCheckpoint` service — it
   * refuses non-checked-out branches (409 NOT_ON_CHECKED_OUT_BRANCH), and a
   * provisioned simulation branch is never checked out. Instead, this creates
   * the checkpoint row directly, pinning the source revision (the main head
   * the branch was forked from) with equivalent audit.
   *
   * On any failure after branch creation, the branch is deleted (compensating
   * delete) before throwing BRANCH_PROVISION_FAILED. If the compensating
   * delete itself fails, the orphan is audit-logged (never silent).
   */
  async function provisionBranch({
    actorUserId,
    workspaceId,
    novelId,
    comparisonShortId,
  }: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    comparisonShortId: string;
  }): Promise<string> {
    if (!revisions) {
      throw new WhatifError(
        "BRANCH_PROVISION_FAILED",
        "branch provisioning unavailable: revisions service not configured",
      );
    }

    const branchName = `simulation-whatif-${comparisonShortId}`;
    let branchId: string | null = null;

    try {
      const created = await revisions.createBranch({
        actorUserId,
        workspaceId,
        novelId,
        name: branchName,
      });
      branchId = created.branchId;

      if (!created.headRevisionId) {
        throw new Error("provisioned branch has no head revision");
      }

      const headRevision = await db.revision.findUnique({
        where: { id: created.headRevisionId },
        select: { id: true, snapshot: { select: { id: true } } },
      });
      if (!headRevision?.snapshot) {
        throw new Error("head revision has no snapshot; cannot pin checkpoint");
      }

      await db.checkpoint.create({
        data: {
          workspaceId,
          novelId,
          branchId,
          revisionId: headRevision.id,
          snapshotId: headRevision.snapshot.id,
          kind: "MANUAL",
          label: `what-if provision checkpoint (${branchName})`,
          note: "NF-WF-027: initial checkpoint for provisioned what-if simulation branch",
          createdById: actorUserId,
        },
      });

      return branchId;
    } catch (err) {
      if (branchId) {
        try {
          await db.novelBranch.delete({ where: { id: branchId } });
        } catch (cleanupErr) {
          console.error(
            `[whatif] ORPHAN BRANCH: failed to delete partially-provisioned branch ${branchId} ` +
              `(${branchName}) for novel ${novelId}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
          );
        }
      }
      if (err instanceof WhatifError) throw err;
      throw new WhatifError(
        "BRANCH_PROVISION_FAILED",
        `failed to provision simulation branch: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    async createComparison({
      actorUserId,
      workspaceId,
      novelId,
      outlineVersionIds,
      maxChapters,
      tokenBudget,
      confirmed,
      branchSelection,
    }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");

      // Invariant 3: explicit author confirmation required before execution.
      if (!confirmed) {
        throw new WhatifError(
          "INVALID_INPUT",
          "What-if comparison requires explicit author confirmation (confirmed: true).",
        );
      }
      if (!Array.isArray(outlineVersionIds) || outlineVersionIds.length < 2) {
        throw new WhatifError("INVALID_INPUT", "At least 2 outline versions are required.");
      }
      if (outlineVersionIds.length > WHATIF_MAX_OUTLINE_VERSIONS) {
        throw new WhatifError(
          "INVALID_INPUT",
          `At most ${WHATIF_MAX_OUTLINE_VERSIONS} outline versions per comparison.`,
        );
      }

      // Verify all outline versions exist and belong to the novel (any
      // status allowed — 024A Q2: this is the one legitimate use of
      // non-APPROVED outlines). Each run records the version's status at
      // comparison time.
      const versions = await db.outlineVersion.findMany({
        where: { id: { in: outlineVersionIds }, novelId },
        select: { id: true, status: true },
      });
      if (versions.length !== outlineVersionIds.length) {
        throw new WhatifError("OUTLINE_VERSION_NOT_FOUND", "One or more outline versions not found.");
      }

      const budget = tokenBudget ?? WHATIF_DEFAULT_TOKEN_BUDGET;
      if (budget <= 0 || budget > WHATIF_MAX_TOKEN_BUDGET) {
        throw new WhatifError(
          "INVALID_INPUT",
          `tokenBudget must be between 1 and ${WHATIF_MAX_TOKEN_BUDGET}.`,
        );
      }
      const chapters = maxChapters ?? WHATIF_DEFAULT_MAX_CHAPTERS;
      if (chapters < 1 || chapters > 10) {
        throw new WhatifError("INVALID_INPUT", "maxChapters must be between 1 and 10.");
      }

      // NF-WF-027 (GAP-100) Invariant 2: explicit branch ownership.
      // At the HTTP boundary, branchSelection is required (Zod). For direct
      // service calls (stub-path tests), it may be omitted — the comparison
      // is created without a branch (pre-027 state); the live path refuses
      // with BRANCH_NOT_FOUND, the stub path works unaffected.
      let branchId: string | null = null;
      let branchMode: WhatifBranchMode | null = null;
      if (branchSelection) {
        if (typeof branchSelection.mode !== "string") {
          throw new WhatifError(
            "INVALID_INPUT",
            "branchSelection is required: { mode: 'existing', branchId } or { mode: 'provision' }",
          );
        }
        if (branchSelection.mode === "existing") {
        if (!branchSelection.branchId) {
          throw new WhatifError("INVALID_INPUT", "branchSelection.branchId is required for existing mode");
        }
        branchId = await verifyBranchPrerequisites(workspaceId, novelId, branchSelection.branchId);
        branchMode = "existing";
      } else if (branchSelection.mode === "provision") {
        // Provision mode requires BOTH simulation:manage AND revision:manage
        // (fail fast at create time, never mid-run).
        await gate(workspaceId, novelId, actorUserId, "revision:manage");
        const shortId = Math.random().toString(36).slice(2, 10);
        branchId = await provisionBranch({ actorUserId, workspaceId, novelId, comparisonShortId: shortId });
        branchMode = "provision";
        } else {
          throw new WhatifError(
            "INVALID_INPUT",
            `unknown branchSelection.mode: ${(branchSelection as { mode: string }).mode}`,
          );
        }
      }

      const row = await db.whatifComparison.create({
        data: {
          workspaceId,
          novelId,
          outlineVersionIds: outlineVersionIds as object,
          runIds: [] as object,
          divergencePoints: [] as object,
          maxChapters: chapters,
          tokenBudget: budget,
          tokenSpent: 0,
          status: "DRAFT",
          branchId,
          branchMode,
        },
      });
      return toShape(row);
    },

    async runComparison({ actorUserId, workspaceId, novelId, comparisonId, stubGenerator }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:manage");
      const comparison = await getComparisonOrThrow(workspaceId, novelId, comparisonId);

      if (comparison.status !== "DRAFT" && comparison.status !== "READY") {
        throw new WhatifError(
          "INVALID_STATUS_TRANSITION",
          `Cannot run comparison in status ${comparison.status}.`,
        );
      }

      // NF-WF-027 (GAP-100) Invariant 3: re-verify branch prerequisites at
      // run time (the branch could have been deleted/modified since creation).
      // This is a LIVE-path requirement only: the stub path (eval harness,
      // stubGenerator) bypasses the 021A lifecycle and needs no branch
      // (contract acceptance: stub evaluations unaffected).
      // Pre-027 rows have NULL branchId — their live path never worked; refuse
      // with a typed error rather than silently falling back.
      let branchId: string | undefined;
      if (!stubGenerator) {
        if (!comparison.branchId) {
          throw new WhatifError(
            "BRANCH_NOT_FOUND",
            "comparison has no branch (pre-027 row); create a new comparison with branchSelection",
          );
        }
        branchId = await verifyBranchPrerequisites(workspaceId, novelId, comparison.branchId);
      }

      const outlineVersionIds = comparison.outlineVersionIds as string[];
      const maxChapters = comparison.maxChapters;
      const tokenBudget = comparison.tokenBudget;

      await db.whatifComparison.update({
        where: { id: comparison.id },
        data: { status: "RUNNING" },
      });

      // Create one 021A run per outline version (kind='WHATIF').
      // Each run's initialState carries the outline version id + status
      // (recorded at comparison time, per 024A Q2).
      const runIds: string[] = [];
      const trajectories: { outlineVersionId: string; ticks: { tickNumber: number; stateAfter: unknown }[] }[] = [];
      let tokenSpent = 0;
      let budgetExhausted = false;

      try {
        for (const outlineVersionId of outlineVersionIds) {
          const version = await db.outlineVersion.findFirst({
            where: { id: outlineVersionId, novelId },
            select: { id: true, status: true, content: true },
          });
          if (!version) throw new WhatifError("OUTLINE_VERSION_NOT_FOUND", "Outline version not found.");

          // Token accounting (Invariant 3): estimate per-chapter cost.
          // Stubbed generation costs 0 (deterministic, no LLM). Live
          // generation would meter actual tokens here.
          const estimatedCost = stubGenerator ? 0 : 1000 * maxChapters;
          if (tokenSpent + estimatedCost > tokenBudget) {
            budgetExhausted = true;
            break;
          }

          const run = await simulations.createRun({
            actorUserId,
            workspaceId,
            novelId,
            // NF-WF-027: the stored branchId for the live path (verified
            // above); undefined for the stub path (eval harness bypasses
            // 021A lifecycle and needs no branch). configureRun
            // prerequisites now succeed on real state for live runs.
            branchId,
            scenario: {
              initialState: {
                // Narrative-level what-if: the outline version drives the
                // simulated trajectory. World-entity kinds are never used
                // here (021 Q8: narrative stays in tick payloads).
                outlineVersionId: version.id,
                outlineStatus: version.status,
                whatif: true,
              },
              maxTicks: maxChapters,
              seed: `whatif-${comparison.id}-${version.id}`,
            },
            kind: "WHATIF",
          });
          runIds.push(run.id);

          // Step the run through its bounded ticks. With a stub generator,
          // tick states are produced deterministically (eval harness). The
          // 021A step path is used for lifecycle; tick payloads carry the
          // narrative trajectory.
          const ticks: { tickNumber: number; stateAfter: unknown }[] = [];
          if (stubGenerator) {
            for (let chapterIndex = 1; chapterIndex <= maxChapters; chapterIndex++) {
              const stateAfter = stubGenerator(outlineVersionId, chapterIndex);
              ticks.push({ tickNumber: chapterIndex, stateAfter });
            }
            // Persist the stubbed ticks via the 021A tick storage so the
            // trajectory is queryable through the standard run/tick paths.
            for (const tick of ticks) {
              const prevState = tick.tickNumber === 1 ? {} : (ticks[tick.tickNumber - 2]?.stateAfter ?? {});
              await db.simulationTick.create({
                data: {
                  runId: run.id,
                  tickNumber: tick.tickNumber,
                  stateBefore: prevState as InputJsonValue,
                  stateAfter: tick.stateAfter as InputJsonValue,
                  events: [],
                },
              });
            }
            await db.simulationRun.update({
              where: { id: run.id },
              data: { status: "COMPLETED", currentTick: maxChapters },
            });
          } else {
            // Live path: configure + start + step via 021A lifecycle.
            // (Requires branch/snapshot/module prerequisites per 021A
            // Invariant 4; the run stays DRAFT if unmet — surfaced, not
            // silently resolved, per 024 Invariant 2.)
            // NOTE: Live LLM generation is MODEL_UNVERIFIED per GAP-013.
            await simulations.configureRun({ actorUserId, workspaceId, novelId, runId: run.id });
            await simulations.startRun({ actorUserId, workspaceId, novelId, runId: run.id });
            const stepped = await simulations.stepRun({
              actorUserId,
              workspaceId,
              novelId,
              runId: run.id,
              ticks: maxChapters,
            });
            for (const t of stepped.ticks) {
              ticks.push({ tickNumber: t.tickNumber, stateAfter: t.stateAfter });
            }
            tokenSpent += estimatedCost;
          }

          trajectories.push({ outlineVersionId, ticks });
        }

        if (budgetExhausted) {
          // Invariant 3: partial results marked incomplete, never silently
          // truncated.
          const row = await db.whatifComparison.update({
            where: { id: comparison.id },
            data: {
              runIds: runIds as object,
              tokenSpent,
              status: "INCOMPLETE_BUDGET_EXHAUSTED",
            },
          });
          return toShape(row);
        }

        // Detect divergence points (structural first, per 024A Q3).
        const divergencePoints = detectDivergence(trajectories, maxChapters);

        const row = await db.whatifComparison.update({
          where: { id: comparison.id },
          data: {
            runIds: runIds as object,
            divergencePoints: divergencePoints as object,
            tokenSpent,
            status: "COMPLETED",
          },
        });
        return toShape(row);
      } catch (err) {
        await db.whatifComparison.update({
          where: { id: comparison.id },
          data: { runIds: runIds as object, tokenSpent, status: "ABORTED" },
        });
        throw err;
      }
    },

    async listComparisons({ actorUserId, workspaceId, novelId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const rows = await db.whatifComparison.findMany({
        where: { workspaceId, novelId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toShape);
    },

    async getComparison({ actorUserId, workspaceId, novelId, comparisonId }) {
      await gate(workspaceId, novelId, actorUserId, "simulation:read");
      const row = await getComparisonOrThrow(workspaceId, novelId, comparisonId);
      return toShape(row);
    },
  };
}
