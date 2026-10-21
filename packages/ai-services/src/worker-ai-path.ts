/**
 * @novelforge/ai-services — worker AI path assembly (NF-WF-026, GAP-028).
 *
 * Assembles the `{ generate, retrieval, compiler }` ports the production
 * worker needs for AGENT/SKILL/RETRIEVAL steps, mirroring
 * `apps/api/src/workflow-test-driver.ts`'s `createTestDriver` assembly.
 *
 * The factory *code* lives here; the *configuration* (gateway records,
 * encryption key) remains deployment-specific, sourced from environment
 * variables in the worker's startup (mirroring the API's `buildApp`
 * wiring). The contract does not specify production gateway credentials
 * (author's deployment concern).
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { AIGateway, GatewayRecord } from "@novelforge/ai-core";
import type {
  ContextCompilerPort,
  StepGenerator,
  StepRetriever,
} from "@novelforge/workflow-executor";
import { createAuditService } from "./audit.ts";
import { createAiServices } from "./ai.ts";
import { createGatewayRegistry } from "./ai-registry.ts";
import { createRetrievalServices } from "./retrieval.ts";
import { createCanonServices } from "./canon.ts";
import { createPlanningServices } from "./planning.ts";
import { createCharacterServices } from "./characters.ts";
import { createRelationshipServices } from "./relationships.ts";
import { createNarrativeServices } from "./narrative.ts";
import { readHeadRevisionId } from "./revisions.ts";
import { createMemoryServices } from "./memory.ts";
import { createStateAssemblyServices } from "./state-assembly.ts";
import {
  fetchAndCompileContext,
  renderContextText,
} from "./context-compiler.ts";

export interface WorkerAiPath {
  generate: StepGenerator;
  retrieval: StepRetriever;
  compiler: ContextCompilerPort;
}

/**
 * Build the worker-side AI path with real service factories.
 *
 * Mirrors `createTestDriver`'s assembly so the worker exercises the same
 * paths the API's test driver does. The `createGateway` callback and
 * `encryptionKey` are deployment-supplied (env vars in worker startup).
 */
export function createWorkerAiPath(
  db: NovelForgeDb,
  opts: {
    encryptionKey: string;
    createGateway?: (rec: GatewayRecord) => AIGateway;
  },
): WorkerAiPath {
  const audit = createAuditService(db);
  const aiServices = createAiServices({
    db,
    registry: createGatewayRegistry(db, opts.encryptionKey),
    encryptionKey: opts.encryptionKey,
    audit,
    ...(opts.createGateway ? { createGateway: opts.createGateway } : {}),
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
  // The memory queue is a no-op fake: recallNovel reads live projections
  // and never enqueues (mirrors createTestDriver).
  const memoryServices = createMemoryServices({
    db,
    queue: { add: async () => ({ id: "worker-fake" }) } as never,
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
          planning: input.chapterCreation ? { ...planning, getStoryPosition: async () => input.chapterCreation!.chapterNumber } : planning,
          characters,
          relationships,
          narrative,
          retrieval: retrievalServices,
          head,
          memory: {
            recallNovel: (args: {
              actorUserId: string;
              workspaceId: string;
              novelId: string;
              chapter: number;
            }) =>
              memoryServices.recallNovel(args.actorUserId, args.workspaceId, args.novelId, {
                chapter: args.chapter,
              }),
          },
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
          ...(input.chapterCreation ? { expectedHeadRevisionId: input.chapterCreation.headRevisionId } : {}),
          contextQuery: input.contextQuery,
          mode: input.mode,
          searchReferencesWithoutNovel: input.searchReferencesWithoutNovel,
        },
      );
      if (input.chapterCreation) {
        const outline = compiled.blocks.find(block => block.tier === 2)?.provenance as { outlineVersionId?: string } | undefined;
        if (outline?.outlineVersionId !== input.chapterCreation.outlineRef || compiled.headRevisionId !== input.chapterCreation.headRevisionId || compiled.storyPosition !== input.chapterCreation.chapterNumber) throw new Error("AI chapter context source changed before dispatch");
      }
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

  return {
    generate: aiServices,
    retrieval: retrievalServices,
    compiler,
  };
}
