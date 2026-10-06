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
import { NotFoundError } from "./platform.ts";
import type { SimulationServices } from "./simulation.ts";

/**
 * NF-WF-024A: typed what-if refusals.
 */
export type WhatifErrorCode =
  | "INVALID_INPUT" // malformed input (e.g., <2 outline versions, unconfirmed)
  | "OUTLINE_VERSION_NOT_FOUND" // unknown outline version id
  | "BUDGET_EXCEEDED" // tokenBudget exceeded during run
  | "INVALID_STATUS_TRANSITION" // 409: lifecycle transition not allowed
  | "COMPARISON_NOT_FOUND"; // 404: unknown comparison id

export class WhatifError extends Error {
  readonly code: WhatifErrorCode;
  readonly statusCode: 400 | 404 | 409;
  constructor(code: WhatifErrorCode, message: string) {
    super(message);
    this.name = "WhatifError";
    this.code = code;
    this.statusCode =
      code === "COMPARISON_NOT_FOUND"
        ? 404
        : code === "INVALID_STATUS_TRANSITION"
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
}

export interface WhatifServices {
  createComparison(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    outlineVersionIds: string[];
    maxChapters?: number;
    tokenBudget?: number;
    confirmed: boolean;
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
}: {
  db: NovelForgeDb;
  simulations: SimulationServices;
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
    };
  }

  async function getComparisonOrThrow(workspaceId: string, novelId: string, comparisonId: string) {
    const row = await db.whatifComparison.findFirst({
      where: { id: comparisonId, workspaceId, novelId },
    });
    if (!row) throw new WhatifError("COMPARISON_NOT_FOUND", "what-if comparison not found");
    return row;
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
