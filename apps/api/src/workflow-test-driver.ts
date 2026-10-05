/**
 * Test driver for durable workflow execution (NF-WF-004).
 *
 * The run route now enqueues (202) instead of executing synchronously, so
 * tests drive the run to completion through the shared executor — the same
 * code the worker runs — with the real AI path (fake gateway adapter) and,
 * when needed, the real shared context compiler.
 *
 * Not a test suite (no `.test.ts` suffix): imported by
 * `definitions.test.ts` and `orchestrator.test.ts`.
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import {
  createWorkflowExecutor,
  type ContextCompilerPort,
  type ExecuteRunResult,
  type WorkflowExecutor,
} from "@novelforge/workflow-executor";
import { createAuditService } from "./services/audit.ts";
import { createAiServices } from "./services/ai.ts";
import { createGatewayRegistry } from "./ai-registry.ts";
import { createRetrievalServices } from "./services/retrieval.ts";
import { createCanonServices } from "./services/canon.ts";
import { createPlanningServices } from "./services/planning.ts";
import { createCharacterServices } from "./services/characters.ts";
import { createRelationshipServices } from "./services/relationships.ts";
import { createNarrativeServices } from "./services/narrative.ts";
import { readHeadRevisionId } from "./services/revisions.ts";
import { createMemoryServices } from "./services/memory.ts";
import { createStateAssemblyServices } from "./services/state-assembly.ts";
import { resolveAgent, resolveSkill } from "./services/definition-resolution.ts";
import {
  fetchAndCompileContext,
  renderContextText,
} from "./services/context-compiler.ts";

export interface TestDriver {
  executor: WorkflowExecutor;
  /** Drive one run to its terminal state, as the worker would. */
  driveRun(runId: string): Promise<ExecuteRunResult>;
  compiler: ContextCompilerPort;
}

/**
 * Build the executor with the real service stack (fake gateway adapter).
 * Mirrors `buildApp`'s wiring so the driven run exercises the same paths
 * the worker will use in production.
 */
export function createTestDriver(
  db: NovelForgeDb,
  opts: {
    encryptionKey: string;
    createGateway: (rec: GatewayRecord) => AIGateway;
  },
): TestDriver {
  const audit = createAuditService(db);
  const aiServices = createAiServices({
    db,
    registry: createGatewayRegistry(db, opts.encryptionKey),
    encryptionKey: opts.encryptionKey,
    audit,
    createGateway: opts.createGateway,
  });
  const retrievalServices = createRetrievalServices({ db, audit, ai: aiServices });
  const canon = createCanonServices({ db, audit, retrieval: retrievalServices });
  const planning = createPlanningServices({ db, audit });
  const characters = createCharacterServices({ db, audit });
  const relationships = createRelationshipServices({ db, audit });
  const narrative = createNarrativeServices({ db, audit });
  const head = {
    readHeadRevisionId: (novelId: string) => readHeadRevisionId(db, novelId),
  };
  // NF-WF-010: the driver's compiler mirrors buildApp's wiring — the
  // workflow RETRIEVAL step consumes the state assembly (tiers 4/6) just
  // like POST /generate does (NF-WF-003 invariant 7: the two callers must
  // not drift). The memory queue is a no-op fake: recallNovel reads live
  // projections and never enqueues.
  const memoryServices = createMemoryServices({
    db,
    queue: { add: async () => ({ id: "driver-fake" }) } as never,
  });
  const stateAssemblyServices = createStateAssemblyServices({
    db,
    audit,
    memory: {
      recallNovel: (actorUserId, workspaceId, novelId, opts) =>
        memoryServices.recallNovel(actorUserId, workspaceId, novelId, opts),
    },
  });

  const compiler: ContextCompilerPort = {
    compile: async (input) => {
      const compiled = await fetchAndCompileContext(
        {
          canon,
          planning,
          characters,
          relationships,
          narrative,
          retrieval: retrievalServices,
          head,
          stateAssembly: {
            assembleStates: (i) =>
              stateAssemblyServices.assembleCharacterState(i),
            assembleRelationships: (i) =>
              stateAssemblyServices.assembleRelationships(i),
            assembleTimeline: (i) =>
              stateAssemblyServices.assembleTimeline(i),
          },
        },
        {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          ...(input.novelId ? { novelId: input.novelId } : {}),
          instruction: input.instruction,
          contextQuery: input.contextQuery,
          mode: input.mode,
          searchReferencesWithoutNovel: input.searchReferencesWithoutNovel,
        },
      );
      return {
        canDispatch: compiled.canDispatch,
        blocks: compiled.blocks.map((b) => ({
          tier: b.tier,
          status: b.status,
          provenance: b.provenance,
          rows: b.rows,
        })),
        overflow: compiled.overflow
          ? { name: compiled.overflow.name, reason: compiled.overflow.reason }
          : null,
        storyPosition: compiled.storyPosition,
        headRevisionId: compiled.headRevisionId,
        referenceMeta: compiled.referenceMeta ?? null,
        retrievalAuditId: compiled.retrievalAuditId ?? null,
        text: renderContextText(compiled),
      };
    },
  };

  const executor = createWorkflowExecutor({
    db,
    audit: {
      record: (entry) =>
        audit.record({
          actorUserId: entry.actorUserId ?? null,
          workspaceId: entry.workspaceId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          payload: (entry.payload ?? {}) as never,
        }),
    },
    resolvers: {
      resolveAgent: (workspaceId, key) => resolveAgent(db, workspaceId, key),
      resolveSkill: (workspaceId, key) => resolveSkill(db, workspaceId, key),
    },
    generate: aiServices,
    retrieval: retrievalServices,
    compiler,
  });

  return {
    executor,
    driveRun: (runId) => executor.executeRun(runId),
    compiler,
  };
}
