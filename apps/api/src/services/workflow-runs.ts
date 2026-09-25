/**
 * Workflow executor (Phase 4).
 *
 * Runs a stored workflow graph over the Phase 3 AI path. There is exactly
 * one way a workflow reaches a model: through the injected `StepGenerator`,
 * which is `AiServices.generate` (CLAUDE.md §18 — no separate hidden AI
 * implementation per step kind). That means every agent step inherits
 * gateway routing, retry, fallback, circuit-breaking and the generation
 * ledger for free, and is attributable to user + novel + agent + prompt +
 * model + gateway.
 *
 * Determinism is the exit criterion for this phase and is structural:
 * - the graph is re-validated on load, so a hand-edited row cannot smuggle
 *   in a cycle;
 * - steps execute in the validator's topological order (declaration-order
 *   tie-break), never in map-iteration order;
 * - a CONDITION step has exactly one true and one false branch, so
 *   branching never depends on edge ordering;
 * - every step's outcome is recorded with the exact definition versions it
 *   used, so the same graph + inputs replays to the same orchestration.
 *
 * Model output itself is not deterministic, and this module never pretends
 * otherwise: a step's `json` output is validated against its contract
 * before any later step may read it.
 */
import type { NovelForgeDb } from "@novelforge/database";
import { GatewayError, type ModelProfile } from "@novelforge/ai-core";
import { requireCapability } from "@novelforge/auth/authorization";
import {
  compileSchema,
  validateGraph,
  type WorkflowGraph,
  type WorkflowStep,
  ABSOLUTE_STEP_CEILING,
  EXECUTABLE_STEP_KINDS,
} from "@novelforge/validation";
import { BadGatewayError, ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";

/**
 * The narrow port to the AI path. `AiServices.generate` satisfies it.
 * Declared structurally so tests can drive the executor without a gateway.
 */
export interface StepGenerator {
  generate(input: {
    actorUserId: string;
    workspaceId: string;
    novelId?: string;
    task: string;
    profile: ModelProfile;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ generationId: string; content: string; model: string }>;
}

/**
 * The narrow port to the knowledge index. `RetrievalServices.search`
 * satisfies it.
 *
 * Declared structurally for the same reason as `StepGenerator`: the
 * executor's contract is "search returns cited hits", not "the API's
 * retrieval service exists", so a test can drive a RETRIEVAL step without
 * a database-backed index.
 */
export interface StepRetriever {
  search(input: {
    actorUserId: string;
    workspaceId: string;
    query: string;
    novelId?: string;
    mode?: unknown;
    readerChapter?: number;
    limit?: number;
    stepRunId?: string;
  }): Promise<{
    hits: Array<{
      chunkId: string;
      referenceId: string;
      referenceVersionId: string;
      referenceTitle: string;
      start: number;
      end: number;
      text: string;
      score: number;
      foundBy: string[];
    }>;
    withheldCount: number;
    retrievers: string[];
    mode: string;
    auditId: string;
  }>;
}

export interface StepRunView {
  stepKey: string;
  sequence: number;
  kind: string;
  status: string;
  agentKey: string | null;
  agentVersionNumber: number | null;
  skillKey: string | null;
  skillVersionNumber: number | null;
  generationId: string | null;
  output: unknown;
  errorMessage: string | null;
  latencyMs: number | null;
}

export interface RunView {
  id: string;
  workflowId: string;
  workflowKey: string;
  workflowVersionNumber: number;
  novelId: string | null;
  status: string;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  stepCount: number;
  startedAt: Date;
  completedAt: Date | null;
  steps?: StepRunView[];
}

export interface WorkflowRunServices {
  run(input: {
    actorUserId: string;
    workspaceId: string;
    workflowId: string;
    runInput?: Record<string, unknown>;
    novelId?: string;
  }): Promise<RunView>;
  listRuns(input: {
    actorUserId: string;
    workspaceId: string;
    workflowId?: string;
    limit?: number;
  }): Promise<RunView[]>;
  getRun(input: {
    actorUserId: string;
    workspaceId: string;
    runId: string;
  }): Promise<RunView>;
}

/** A resolved definition pinned to the version the run will use. */
interface ResolvedAgent {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  skillKeys: string[];
  outputSchema: unknown;
  temperature: number | null;
  maxTokens: number | null;
}

interface ResolvedSkill {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  outputSchema: unknown;
}

/** Per-run state a later step can read through `$steps.<key>.*`. */
interface StepOutcome {
  text: string | null;
  json: unknown;
}

export function createWorkflowRunServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
  ai: StepGenerator;
  /**
   * Knowledge index port for RETRIEVAL steps. Optional so a deployment (or
   * a test) without a knowledge engine still runs every other step kind;
   * a workflow that declares a RETRIEVAL step then fails with a clear
   * conflict instead of a silent empty result.
   */
  retrieval?: StepRetriever;
  /** Optional diagnostic sink for details that must not reach a client. */
  dbg?: { error?: (message: string, meta: unknown) => void };
}): WorkflowRunServices {
  const { db, audit, ai, dbg, retrieval } = deps;

  async function gateWorkspace(
    workspaceId: string,
    userId: string,
    cap: "workflow:run" | "workflow:read",
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundError("workflow");
    requireCapability(membership.role, cap);
  }

  /**
   * Resolve a definition by key, preferring the workspace's own row over
   * the shared platform catalog. A workspace row shadows a platform row of
   * the same key — that is the point of a scoped catalog.
   *
   * Only PUBLISHED definitions may be executed: a DRAFT is mid-edit, and
   * pinning a run to an unfinished definition would make the run
   * unexplainable after the next edit.
   */
  async function resolveAgent(
    workspaceId: string,
    key: string,
  ): Promise<ResolvedAgent> {
    const agent = await db.agent.findFirst({
      where: {
        key,
        status: "PUBLISHED",
        OR: [
          { scope: "WORKSPACE", workspaceId },
          { scope: "PLATFORM" },
        ],
      },
      include: { currentVersion: true },
      // WORKSPACE sorts AFTER PLATFORM in the DefinitionScope enum, so
      // `desc` is what puts a tenant's own definition first. (PostgreSQL
      // orders enums by declaration position: PLATFORM, WORKSPACE.)
      orderBy: { scope: "desc" },
    });
    if (!agent) throw new ConflictError(`workflow references unpublished or unknown agent "${key}"`);
    const v = agent.currentVersion;
    if (!v) throw new ConflictError(`agent "${key}" has no version`);
    return {
      id: agent.id,
      key: agent.key,
      versionId: v.id,
      versionNumber: v.number,
      instructions: v.instructions,
      modelProfile: v.modelProfile as ModelProfile,
      skillKeys: v.skillKeys,
      outputSchema: v.outputSchema,
      temperature: v.temperature,
      maxTokens: v.maxTokens,
    };
  }

  async function resolveSkill(
    workspaceId: string,
    key: string,
  ): Promise<ResolvedSkill> {
    const skill = await db.skill.findFirst({
      where: {
        key,
        status: "PUBLISHED",
        OR: [
          { scope: "WORKSPACE", workspaceId },
          { scope: "PLATFORM" },
        ],
      },
      include: { currentVersion: true },
      // WORKSPACE sorts after PLATFORM in the enum; `desc` prefers the
      // tenant's own definition (see resolveAgent).
      orderBy: { scope: "desc" },
    });
    if (!skill) throw new ConflictError(`workflow references unpublished or unknown skill "${key}"`);
    const v = skill.currentVersion;
    if (!v) throw new ConflictError(`skill "${key}" has no version`);
    return {
      id: skill.id,
      key: skill.key,
      versionId: v.id,
      versionNumber: v.number,
      instructions: v.instructions,
      modelProfile: v.modelProfile as ModelProfile,
      outputSchema: v.outputSchema,
    };
  }

  /** Resolve one `$input.x` / `$steps.k.text` / `$steps.k.json` reference. */
  function resolveReference(
    expr: string,
    runInput: Record<string, unknown>,
    outcomes: Map<string, StepOutcome>,
  ): unknown {
    if (expr.startsWith("$input.")) {
      // `Object.hasOwn`, never a bare index. The validator screens the
      // reference SYNTAX, so `$input.constructor` and `$input.__proto__`
      // both pass it, and a bare lookup would return the inherited
      // `Object.prototype` member — a function, which is not `undefined`,
      // so the caller's guard below never fires and `JSON.stringify(fn)`
      // injects the literal text `undefined` into the prompt as if it were
      // caller-supplied data. The same trap is documented at
      // packages/validation/json-schema.ts (§ prototype keys).
      const key = expr.slice("$input.".length);
      return Object.hasOwn(runInput, key) ? runInput[key] : undefined;
    }
    const m = /^\$steps\.([a-z0-9_-]{1,64})\.(text|json)$/.exec(expr);
    if (!m) return undefined;
    const outcome = outcomes.get(m[1]!);
    if (!outcome) return undefined;
    return m[2] === "text" ? outcome.text : outcome.json;
  }

  /** Render a step's instruction with its bound inputs appended. */
  function renderInstruction(
    step: WorkflowStep,
    runInput: Record<string, unknown>,
    outcomes: Map<string, StepOutcome>,
  ): string {
    const parts: string[] = [];
    if (step.instruction) parts.push(step.instruction);
    for (const [name, expr] of Object.entries(step.inputs ?? {})) {
      const value = resolveReference(expr, runInput, outcomes);
      // A reference to a step that did not run (a branch not taken) is
      // reported as empty rather than "undefined", so the model sees an
      // absence rather than a string that looks like data.
      const rendered =
        value === undefined || value === null
          ? "(not available)"
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
      parts.push(`## ${name}\n${rendered}`);
    }
    return parts.join("\n\n");
  }

  return {
    async run(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:run");

      const workflow = await db.workflow.findUnique({
        where: { id: input.workflowId },
        include: { currentVersion: true },
      });
      if (!workflow) throw new NotFoundError("workflow");
      // A workspace may only run its own workflows or the shared catalog.
      if (workflow.scope === "WORKSPACE" && workflow.workspaceId !== input.workspaceId) {
        throw new NotFoundError("workflow");
      }
      if (workflow.scope === "PLATFORM" && workflow.status !== "PUBLISHED") {
        throw new NotFoundError("workflow");
      }
      // Only a PUBLISHED workflow runs, in EVERY scope. The gate used to
      // cover PLATFORM only, so a WORKSPACE-scoped DRAFT was fully
      // executable — and since the column defaults to DRAFT, a freshly
      // created workflow ran before anyone published it. That contradicts
      // the definition service's own contract ("A DRAFT definition cannot
      // be executed ... publishing is a real gate") and ADR-0006, and it is
      // the same gate already enforced for agents and skills.
      //
      // The caller's own draft is a conflict they can fix; anything else
      // stays hidden behind the 404 above, so this never confirms the
      // existence of a definition the caller may not see.
      if (workflow.status !== "PUBLISHED") {
        if (workflow.scope === "WORKSPACE" && workflow.workspaceId === input.workspaceId) {
          throw new ConflictError("workflow is not published");
        }
        throw new NotFoundError("workflow");
      }
      const version = workflow.currentVersion;
      if (!version) throw new ConflictError("workflow has no version to run");

      // Re-validate on load: the row could have been edited by a migration
      // or a direct DB write since it was stored.
      const validated = validateGraph(version.graph);
      if (!validated.ok) {
        throw new ConflictError("workflow graph failed validation on load");
      }
      const { graph, order } = validated.value;

      // A novel-scoped workflow may only run against its own novel.
      const novelId = input.novelId ?? workflow.novelId ?? undefined;
      if (workflow.novelId && novelId !== workflow.novelId) {
        throw new ConflictError("workflow is bound to a different novel");
      }
      if (novelId) {
        const novel = await db.novel.findFirst({
          where: { id: novelId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!novel) throw new NotFoundError("novel");
      }

      // Fail fast: resolve every referenced definition before the first
      // model call, so a missing agent costs nothing and cannot leave a
      // half-executed run behind.
      const stepByKey = new Map(graph.steps.map((s) => [s.key, s]));
      const agents = new Map<string, ResolvedAgent>();
      const skills = new Map<string, ResolvedSkill>();
      for (const key of version.agentKeys) {
        agents.set(key, await resolveAgent(input.workspaceId, key));
      }
      for (const key of version.skillKeys) {
        skills.set(key, await resolveSkill(input.workspaceId, key));
      }
      // An agent's granted skills are resolved too, not just the ones a
      // step names directly: they are injected into that agent's prompt, so
      // an unresolvable grant must fail here rather than silently injecting
      // nothing.
      for (const agent of agents.values()) {
        for (const key of agent.skillKeys) {
          if (skills.has(key)) continue;
          skills.set(key, await resolveSkill(input.workspaceId, key));
        }
      }

      const runInput = input.runInput ?? {};
      const run = await db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          workflowVersionId: version.id,
          workflowVersionNumber: version.number,
          workspaceId: input.workspaceId,
          novelId: novelId ?? null,
          triggeredById: input.actorUserId,
          status: "RUNNING",
          input: runInput as never,
        },
        select: { id: true },
      });

      const outcomes = new Map<string, StepOutcome>();
      /** Steps whose outgoing edges are live. Entry steps always are. */
      const reachable = new Set<string>(validated.value.entryKeys);
      const executed: string[] = [];
      let sequence = 0;
      let status: "SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL" = "SUCCEEDED";
      let failure: string | null = null;
      /** The step the loop is mid-execution on, so a throw can be attributed. */
      let pendingStep: { key: string; kind: string; sequence: number; started: number } | null = null;
      /** The VALIDATOR path records its own FAILED row before throwing. */
      let stepRowWritten = false;

      // The runtime ceiling is the smaller of the declared budget and the
      // absolute cap; the graph is acyclic so this can only be exceeded by
      // a graph the validator would already have rejected.
      const budget = Math.min(graph.maxSteps, ABSOLUTE_STEP_CEILING);

      /**
       * Mark the steps downstream of a completed step as runnable.
       *
       * Called from EVERY success path — an earlier version inlined this
       * only in the AGENT and CONDITION branches, so anything following a
       * TRANSFORM or VALIDATOR was silently skipped.
       */
      const advance = (fromKey: string): void => {
        for (const edge of graph.edges) {
          if (edge.from === fromKey && edge.when === undefined) reachable.add(edge.to);
        }
      };

      try {
        for (const stepKey of order) {
          const step = stepByKey.get(stepKey);
          if (!step) continue;

          if (!reachable.has(stepKey)) {
            // A branch not taken: recorded as SKIPPED so the run shows the
            // decision rather than silently omitting the step.
            sequence += 1;
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "SKIPPED",
                completedAt: new Date(),
              },
            });
            continue;
          }

          if (executed.length >= budget) {
            throw new ConflictError(`workflow exceeded its step budget of ${budget}`);
          }
          if (!EXECUTABLE_STEP_KINDS.has(step.kind)) {
            throw new ConflictError(`step kind ${step.kind} is not executable yet`);
          }

          sequence += 1;
          const started = Date.now();
          pendingStep = { key: stepKey, kind: step.kind, sequence, started };
          stepRowWritten = false;

          // ---- CONDITION: no model call, just a branch decision ----
          if (step.kind === "CONDITION") {
            const condition = step.condition!;
            const actual = resolveReference(condition.path, runInput, outcomes);
            const taken = actual === condition.equals;
            executed.push(stepKey);
            outcomes.set(stepKey, { text: null, json: { result: taken } });
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "SUCCEEDED",
                output: { result: taken } as never,
                latencyMs: Date.now() - started,
                completedAt: new Date(),
              },
            });
            for (const edge of graph.edges) {
              if (edge.from !== stepKey) continue;
              if ((edge.when === "true") === taken) reachable.add(edge.to);
            }
            continue;
          }

          // ---- HUMAN_APPROVAL: stop and wait ----
          if (step.kind === "HUMAN_APPROVAL") {
            executed.push(stepKey);
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "AWAITING_APPROVAL",
                instruction: renderInstruction(step, runInput, outcomes),
                // No completedAt: the step is parked, not finished. There is
                // no resume path yet (see AWAITING_APPROVAL in the routes),
                // so the run stops here permanently for now.
              },
            });
            status = "AWAITING_APPROVAL";
            break;
          }

          // ---- RETRIEVAL: search the knowledge index, no model call ----
          //
          // Deliberately AUTHOR mode. A workflow runs on behalf of a
          // workspace member who already holds `workflow:run` and (via the
          // retrieval service) `reference:read`, so the caller is the
          // author of this novel, not a reader. Reader-facing retrieval
          // takes its mode from the request and is served by the search
          // route, which carries a reader position.
          //
          // ponytail: mode is fixed at AUTHOR because no graph field
          // declares one. Add a validated `mode`/`readerChapter` pair to
          // the step contract when a reader-facing workflow exists.
          if (step.kind === "RETRIEVAL") {
            if (!retrieval) {
              throw new ConflictError("retrieval is not configured on this deployment");
            }
            const query = renderInstruction(step, runInput, outcomes);
            if (query.trim().length === 0) {
              throw new ConflictError(`retrieval step "${stepKey}" has an empty query`);
            }
            const found = await retrieval.search({
              actorUserId: input.actorUserId,
              workspaceId: input.workspaceId,
              query,
              ...(novelId ? { novelId } : {}),
              mode: "AUTHOR",
              limit: 10,
            });

            // The text form is what a later AGENT step receives, so it
            // carries the citation (reference title + character span), not
            // just the prose: a model that cannot cite cannot be checked.
            const text = found.hits
              .map(
                (h, i) =>
                  `[${i + 1}] ${h.referenceTitle} (chars ${h.start}-${h.end})\n${h.text}`,
              )
              .join("\n\n");
            const json = {
              query,
              mode: found.mode,
              hits: found.hits.map((h) => ({
                chunkId: h.chunkId,
                referenceId: h.referenceId,
                referenceVersionId: h.referenceVersionId,
                referenceTitle: h.referenceTitle,
                start: h.start,
                end: h.end,
                text: h.text,
                score: h.score,
                foundBy: h.foundBy,
              })),
              withheldCount: found.withheldCount,
              retrievers: found.retrievers,
            };

            executed.push(stepKey);
            outcomes.set(stepKey, { text, json });
            const stepRow = await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "SUCCEEDED",
                instruction: query,
                output: json as never,
                latencyMs: Date.now() - started,
                completedAt: new Date(),
              },
              select: { id: true },
            });
            // Link the audit row to the step that issued it, so a run's
            // evidence is reachable from the run and not only from the
            // knowledge trail. Written after the step row exists because
            // `step_run_id` is a foreign key.
            //
            // Best-effort, and deliberately so: the step has already
            // succeeded and its row is durable. A failure here would
            // otherwise mark a good run FAILED, and the audit row itself
            // still exists under its workspace.
            try {
              await db.retrievalAudit.update({
                where: { id: found.auditId },
                data: { stepRunId: stepRow.id },
              });
            } catch (linkErr) {
              dbg?.error?.("could not link retrieval audit to workflow step", {
                runId: run.id,
                stepKey,
                linkErr,
              });
            }
            advance(stepKey);
            continue;
          }

          const instruction = renderInstruction(step, runInput, outcomes);

          // ---- VALIDATOR: no model call; check a prior step's contract ----
          if (step.kind === "VALIDATOR") {
            const target = Object.values(step.inputs ?? {})[0];
            const value = target ? resolveReference(target, runInput, outcomes) : undefined;
            let valid = true;
            let detail: string | null = null;
            if (step.outputSchema !== undefined) {
              const compiled = compileSchema(step.outputSchema);
              if (!compiled.ok) {
                valid = false;
                detail = "validator contract is invalid";
              } else {
                const failures = compiled.value.validate(value);
                if (failures.length > 0) {
                  valid = false;
                  detail = failures.map((f) => `${f.path}: ${f.message}`).join("; ");
                }
              }
            }
            executed.push(stepKey);
            outcomes.set(stepKey, { text: null, json: { valid } });
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: valid ? "SUCCEEDED" : "FAILED",
                output: { valid, detail } as never,
                latencyMs: Date.now() - started,
                completedAt: new Date(),
              },
            });
            if (!valid) {
              // The FAILED row for this step is already written above; the
              // handler must not write a second one.
              stepRowWritten = true;
              throw new ConflictError(`validator step "${stepKey}" rejected its input: ${detail}`);
            }
            advance(stepKey);
            continue;
          }

          // ---- TRANSFORM: deterministic, no model call ----
          if (step.kind === "TRANSFORM") {
            const bound: Record<string, unknown> = {};
            for (const [name, expr] of Object.entries(step.inputs ?? {})) {
              bound[name] = resolveReference(expr, runInput, outcomes);
            }
            const text = Object.values(bound)
              .filter((v) => typeof v === "string")
              .join("\n");
            executed.push(stepKey);
            outcomes.set(stepKey, { text, json: bound });
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey,
                sequence,
                kind: step.kind,
                status: "SUCCEEDED",
                output: bound as never,
                latencyMs: Date.now() - started,
                completedAt: new Date(),
              },
            });
            advance(stepKey);
            continue;
          }

          // ---- AGENT / SKILL: one model call through the Phase 3 path ----
          const agent = step.kind === "AGENT" ? agents.get(step.ref!) : undefined;
          const skill = step.kind === "SKILL" ? skills.get(step.ref!) : undefined;

          // An agent's `skillKeys` is its granted capability allowlist. It
          // is enforced deterministically by adding exactly those skills'
          // instructions to the agent's system prompt — not by inferring
          // which agent a later SKILL step "belongs to", which would make
          // the allowlist depend on execution order.
          const granted = agent
            ? agent.skillKeys
                .map((key) => skills.get(key))
                .filter((s): s is ResolvedSkill => s !== undefined)
            : [];

          const instructions = [
            agent?.instructions,
            ...granted.map((s) => s.instructions),
            skill?.instructions,
          ]
            .filter((s): s is string => typeof s === "string" && s.length > 0)
            .join("\n\n");
          // A SKILL step has no agent, so it falls back to the skill's own
          // profile; an AGENT step uses the agent's profile.
          const profile = agent?.modelProfile ?? skill!.modelProfile;
          const contract = agent?.outputSchema ?? skill?.outputSchema ?? step.outputSchema;

          const result = await ai.generate({
            actorUserId: input.actorUserId,
            workspaceId: input.workspaceId,
            ...(novelId ? { novelId } : {}),
            task: `workflow:${workflow.key}:${stepKey}`,
            profile,
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: instruction },
            ],
            ...(agent?.temperature != null ? { temperature: agent.temperature } : {}),
            ...(agent?.maxTokens != null ? { maxTokens: agent.maxTokens } : {}),
          });

          // Validate the contract here, before any later step can read it.
          let json: unknown = null;
          if (contract !== undefined && contract !== null) {
            const compiled = compileSchema(contract);
            if (!compiled.ok) {
              throw new ConflictError(`step "${stepKey}" has an invalid output contract`);
            }
            const parsed = parseJsonLoose(result.content);
            if (parsed === undefined) {
              throw new ConflictError(`step "${stepKey}" did not return JSON as its contract requires`);
            }
            const failures = compiled.value.validate(parsed);
            if (failures.length > 0) {
              throw new ConflictError(
                `step "${stepKey}" output violated its contract: ${failures
                  .map((f) => `${f.path}: ${f.message}`)
                  .join("; ")}`,
              );
            }
            json = parsed;
          }

          executed.push(stepKey);
          outcomes.set(stepKey, { text: result.content, json });
          await db.workflowStepRun.create({
            data: {
              runId: run.id,
              stepKey,
              sequence,
              kind: step.kind,
              status: "SUCCEEDED",
              ...(agent
                ? {
                    agentId: agent.id,
                    agentVersionId: agent.versionId,
                    agentVersionNumber: agent.versionNumber,
                  }
                : {}),
              ...(skill
                ? {
                    skillId: skill.id,
                    skillVersionId: skill.versionId,
                    skillVersionNumber: skill.versionNumber,
                  }
                : {}),
              generationId: result.generationId,
              instruction,
              output: (json ?? { text: result.content }) as never,
              latencyMs: Date.now() - started,
              completedAt: new Date(),
            },
          });

          // Everything downstream of this step is now reachable.
          advance(stepKey);
        }
      } catch (err) {
        status = "FAILED";
        // A client-safe summary only. The raw message can carry a Prisma
        // string, an upstream provider body, or a TypeError, and this value
        // is persisted and served by run()/getRun()/listRuns() — responses
        // that never pass through the API error handler (CLAUDE.md §15/§26).
        //
        // `GatewayError` is listed for completeness, but the error that
        // actually arrives from a provider failure is `BadGatewayError`:
        // `AiServices.generate` catches the GatewayError, records it on the
        // Generation row, and rethrows a BadGatewayError carrying the
        // classifier's already-sanitized text (`messageFor`). Omitting it
        // replaced every real gateway failure with "workflow step failed",
        // which is the common case and the one an operator needs to see.
        if (
          err instanceof GatewayError ||
          err instanceof BadGatewayError ||
          err instanceof ConflictError ||
          err instanceof NotFoundError
        ) {
          failure = err.message;
        } else {
          failure = "workflow step failed";
          // Keep the detail server-side for diagnosis.
          dbg?.error?.("workflow run failed", { runId: run.id, err });
        }

        // The failing step would otherwise leave no trace: `executed` is only
        // pushed on success, so without this row a failed run shows the steps
        // that worked and then simply stops.
        //
        // A throw here must NOT escape: this runs inside the catch, and an
        // escaping error would skip the run-status update below, leaving the
        // run stuck at RUNNING with no terminal state at all. Losing the
        // diagnostic row is survivable; losing the run's outcome is not.
        if (pendingStep && !stepRowWritten) {
          try {
            await db.workflowStepRun.create({
              data: {
                runId: run.id,
                stepKey: pendingStep.key,
                sequence: pendingStep.sequence,
                kind: pendingStep.kind,
                status: "FAILED",
                errorMessage: failure,
                latencyMs: Date.now() - pendingStep.started,
                completedAt: new Date(),
              },
            });
          } catch (rowErr) {
            dbg?.error?.("could not record failed workflow step", { runId: run.id, rowErr });
          }
        }
      }

      const output: Record<string, unknown> = {};
      for (const [key, outcome] of outcomes) {
        output[key] = outcome.json ?? outcome.text;
      }

      // A run that stopped at an approval gate has NOT completed: leaving
      // `completedAt` null keeps "unfinished" distinguishable from "done",
      // which is what a resume path will need.
      const finished = status !== "AWAITING_APPROVAL";

      await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status,
          output: output as never,
          errorMessage: failure,
          stepCount: executed.length,
          ...(finished ? { completedAt: new Date() } : {}),
        },
      });

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        // Three terminal-ish states, three actions. A run parked at an
        // approval gate is deliberately NOT complete (its `completedAt` is
        // held null above), so filing it as `workflow.run_completed` made
        // the audit trail disagree with the run row it describes.
        action:
          status === "FAILED"
            ? "workflow.run_failed"
            : status === "AWAITING_APPROVAL"
              ? "workflow.run_awaiting_approval"
              : "workflow.run_completed",
        entityType: "WorkflowRun",
        entityId: run.id,
        payload: {
          workflowKey: workflow.key,
          workflowVersion: version.number,
          status,
          steps: executed.length,
        },
      });

      const detail = await loadRun(db, run.id);
      return detail;
    },

    async listRuns(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const rows = await db.workflowRun.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        },
        include: { workflow: { select: { key: true } } },
        orderBy: { startedAt: "desc" },
        take: Math.min(input.limit ?? 50, 200),
      });
      return rows.map((r) => ({
        id: r.id,
        workflowId: r.workflowId,
        workflowKey: r.workflow.key,
        workflowVersionNumber: r.workflowVersionNumber,
        novelId: r.novelId,
        status: r.status,
        input: r.input,
        output: r.output,
        errorMessage: r.errorMessage,
        stepCount: r.stepCount,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      }));
    },

    async getRun(input) {
      await gateWorkspace(input.workspaceId, input.actorUserId, "workflow:read");
      const run = await db.workflowRun.findFirst({
        where: { id: input.runId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!run) throw new NotFoundError("run");
      return loadRun(db, run.id);
    },
  };
}

/**
 * Parse a model response that was contracted to be JSON.
 *
 * Models wrap JSON in prose or fences even when told not to, so the first
 * value that actually *parses* is taken rather than the first bracket
 * character — prose like "The [main] character: {...}" contains a bracket
 * that is not JSON at all. Returns undefined when no candidate parses, and
 * the caller turns that into a failed step rather than a silent empty
 * result.
 */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (ch !== "{" && ch !== "[") continue;
    const candidate = balancedSlice(trimmed, i);
    if (candidate === null) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Not JSON at this offset; keep scanning for one that is.
    }
  }
  return undefined;
}

/** The balanced `{...}`/`[...]` slice starting at `start`, or null. */
function balancedSlice(text: string, start: number): string | null {
  const open = text[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Load a run with its steps, in execution order. */
async function loadRun(db: NovelForgeDb, runId: string): Promise<RunView> {
  const run = await db.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      workflow: { select: { key: true } },
      steps: {
        orderBy: { sequence: "asc" },
        include: {
          agent: { select: { key: true } },
          skill: { select: { key: true } },
        },
      },
    },
  });
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowKey: run.workflow.key,
    workflowVersionNumber: run.workflowVersionNumber,
    novelId: run.novelId,
    status: run.status,
    input: run.input,
    output: run.output,
    errorMessage: run.errorMessage,
    stepCount: run.stepCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    steps: run.steps.map((s) => ({
      stepKey: s.stepKey,
      sequence: s.sequence,
      kind: s.kind,
      status: s.status,
      agentKey: s.agent?.key ?? null,
      agentVersionNumber: s.agentVersionNumber,
      skillKey: s.skill?.key ?? null,
      skillVersionNumber: s.skillVersionNumber,
      generationId: s.generationId,
      output: s.output,
      errorMessage: s.errorMessage,
      latencyMs: s.latencyMs,
    })),
  };
}

/** Re-exported so route validation and the executor agree on the shape. */
export type { WorkflowGraph };
