/**
 * Contracted extraction applications (NF-WF-008).
 *
 * Closes the M2 canon loop: the NF-WF-006 template's `extract` stage ends at
 * extraction — proposals are CANDIDATES ONLY ("nothing here writes canon").
 * This service contracts each extract claim (binding it to
 * `(entity, predicate, object, validFromChapter)` with deterministically
 * validated evidence), checks conflicts against live canon, and applies
 * approved claims atomically through the existing revision machinery.
 *
 * "Contracted" means every claim passes through an explicit, auditable
 * contract before it becomes story truth. An unsupported claim is BLOCKED
 * with reasons — never silently dropped, never silently committed.
 * Simulations never enter this pipeline (Invariant 8).
 *
 * The pure rules (span location, object sameness, classification) live in
 * @novelforge/story-intelligence and are imported, never reimplemented.
 * This module is the IO half: it resolves scope from stored rows, runs the
 * transactions, and writes the audit trail.
 */
import { randomUUID } from "node:crypto";
import type { NovelForgeDb } from "@novelforge/database";
import {
  requireCapability,
  type Capability,
} from "@novelforge/auth/authorization";
import {
  canonicalSubjectKey,
  classifyProposal,
  locateQuote,
  resolveObject,
  sameObject,
  type ClaimObject,
} from "@novelforge/story-intelligence";
import { STORY_ENTITY_KINDS } from "./canon.ts";
import { ConflictError, NotFoundError } from "./platform.ts";
import type { AuditService } from "./audit.ts";
import {
  advanceForMutation,
  assertHeadExpectation,
  readHeadRevisionId,
} from "./revisions.ts";

/**
 * Typed refusal from the application pipeline, carrying the
 * machine-readable code the API serves as `{error: CODE}`.
 *
 * The shared handler maps a plain ConflictError to `{error: "CONFLICT"}`,
 * which cannot carry codes like STALE_APPLICATION — hence the dedicated
 * branch in platform-routes.ts, following the ApprovalDecisionError
 * precedent (NF-WF-005).
 */
export class CanonApplicationError extends Error {
  readonly currentHeadRevisionId?: string | null;
  constructor(
    readonly statusCode: 400 | 404 | 409,
    readonly code: string,
    message: string,
    head?: { currentHeadRevisionId?: string | null },
  ) {
    super(message);
    this.name = "CanonApplicationError";
    if (head) this.currentHeadRevisionId = head.currentHeadRevisionId;
  }
}

export type ApplicationVerdict =
  | "APPLICABLE"
  | "CONFLICT"
  | "DUPLICATE"
  | "UNSUPPORTED";

export interface ApplicationItemContracting {
  claimIndex: number;
  entity: { id: string } | { kind: (typeof STORY_ENTITY_KINDS)[number]; name: string };
  predicate: string;
  object: { entityId: string } | { text: string };
  validFromChapter?: number | null;
}

interface ValidatedEvidence {
  inputName: string;
  quote: string;
  start: number;
  end: number;
}

export function createCanonApplicationServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}) {
  const { db, audit } = deps;

  /**
   * Membership gate. Missing membership is a 404, not a 403 — the caller
   * must not learn whether a foreign workspace exists (ADR-0004). Same
   * shape as the canon service's gate.
   */
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

  /**
   * Scope an application through its stored row, never through the URL.
   * Same 404 for "missing", "another workspace", and "another novel":
   * a distinct error would confirm the row exists somewhere.
   */
  async function gateApplication(
    workspaceId: string,
    novelId: string,
    applicationId: string,
    userId: string,
    cap: Capability,
  ) {
    const application = await db.canonApplication.findFirst({
      where: { id: applicationId, workspaceId },
    });
    if (!application || application.novelId !== novelId) {
      throw new CanonApplicationError(404, "APPLICATION_NOT_FOUND", "application not found");
    }
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw new CanonApplicationError(404, "APPLICATION_NOT_FOUND", "application not found");
    }
    requireCapability(membership.role, cap);
    return application;
  }

  /** Load an entity, proving it belongs to this novel. */
  async function entityOr404(entityId: string, novelId: string) {
    const entity = await db.storyEntity.findFirst({
      where: { id: entityId, novelId },
      select: { id: true, key: true, name: true, kind: true },
    });
    if (!entity) throw new NotFoundError("entity");
    return entity;
  }

  /** The live fact for a subject and predicate, if any. */
  async function liveFactFor(novelId: string, entityId: string, predicate: string) {
    const row = await db.canonFact.findFirst({
      where: { novelId, entityId, predicate, status: "ACTIVE" },
      select: {
        id: true,
        statement: true,
        objectEntityId: true,
        objectText: true,
        validFromChapter: true,
        validUntilChapter: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      statement: row.statement,
      validFromChapter: row.validFromChapter,
      validUntilChapter: row.validUntilChapter,
      object: (row.objectEntityId !== null
        ? { objectEntityId: row.objectEntityId }
        : { objectText: row.objectText ?? "" }) as ClaimObject,
    };
  }

  /** The run's NF-WF-005 text decision, read-only context (Invariant 5). */
  async function readTextDecision(runId: string): Promise<string | null> {
    const decision = await db.workflowApprovalDecision.findFirst({
      where: { runId },
      orderBy: { decidedAt: "desc" },
      select: { decision: true },
    });
    return decision ? String(decision.decision) : null;
  }

  interface ExtractArtifact {
    proposals: Array<{
      kind: string;
      text: string;
      citations: Array<{ source: string; span: string }>;
    }>;
    /** Bound input name -> "$steps.<key>.json" reference, from the graph. */
    boundInputs: Record<string, string>;
  }

  /**
   * Load the immutable extraction artifact: the extract step's proposals
   * plus the step's bound input names (from the executed workflow version's
   * graph — the definition the run actually ran, not the current one).
   */
  async function loadExtractArtifact(
    workspaceId: string,
    runId: string,
    extractStepKey: string,
  ): Promise<{ novelId: string; runInput: Record<string, unknown>; artifact: ExtractArtifact }> {
    const run = await db.workflowRun.findFirst({
      where: { id: runId, workspaceId },
      select: { id: true, novelId: true, input: true, workflowVersionId: true },
    });
    if (!run || !run.novelId) {
      throw new CanonApplicationError(404, "EXTRACTION_NOT_FOUND", "extraction not found");
    }
    const runInput = (run.input ?? {}) as Record<string, unknown>;
    // Invariant 8: simulations never enter this pipeline. No schema change —
    // the flag lives in the run input, produced by the what-if idea's owner.
    if (runInput.simulation === true) {
      throw new CanonApplicationError(
        400,
        "SIMULATION_REFUSED",
        "extractions from simulation runs cannot be applied to canon",
      );
    }

    const version = await db.workflowVersion.findUnique({
      where: { id: run.workflowVersionId },
      select: { graph: true },
    });
    const steps = (version?.graph as { steps?: Array<{ key?: string; inputs?: Record<string, string> }> } | null)?.steps;
    const extractStep = steps?.find((s) => s.key === extractStepKey);
    if (!extractStep || typeof extractStep.inputs !== "object" || extractStep.inputs === null) {
      throw new CanonApplicationError(404, "EXTRACTION_NOT_FOUND", "extraction not found");
    }

    const stepRun = await db.workflowStepRun.findFirst({
      where: { runId, stepKey: extractStepKey },
      select: { status: true, output: true },
    });
    const output = (stepRun?.output ?? null) as { json?: unknown } | null;
    const proposals = (output?.json as { proposals?: unknown } | null)?.proposals;
    if (!Array.isArray(proposals)) {
      throw new CanonApplicationError(404, "EXTRACTION_NOT_FOUND", "extraction not found");
    }
    return {
      novelId: run.novelId,
      runInput,
      artifact: {
        proposals: proposals as ExtractArtifact["proposals"],
        boundInputs: extractStep.inputs as Record<string, string>,
      },
    };
  }

  /**
   * Validate one citation against the immutable extraction artifact
   * (Invariant 2): the source must name a bound input of the extract step,
   * and the span must be a verbatim substring of that input's `prose`.
   */
  async function validateCitation(
    runId: string,
    boundInputs: Record<string, string>,
    citation: { source: string; span: string },
  ): Promise<{ evidence?: ValidatedEvidence; reason?: string }> {
    const ref = boundInputs[citation.source];
    if (typeof ref !== "string") {
      return { reason: `citation source "${citation.source}" is not a bound input of the extract step` };
    }
    // Bound inputs on the extract step are "$steps.<key>.json" references.
    const m = /^\$steps\.([a-z0-9_-]{1,64})\.json$/.exec(ref);
    if (!m) {
      return { reason: `citation source "${citation.source}" does not resolve to a draft step` };
    }
    const draftStepKey = m[1];
    const draftStepRun = await db.workflowStepRun.findFirst({
      where: { runId, stepKey: draftStepKey },
      select: { output: true },
    });
    const prose = ((draftStepRun?.output ?? null) as { json?: { prose?: unknown } } | null)?.json?.prose;
    if (typeof prose !== "string" || prose === "") {
      return { reason: `draft step "${draftStepKey}" has no stored prose to cite` };
    }
    const located = locateQuote(prose, citation.span);
    if (!located.ok) {
      return {
        reason:
          located.reason === "EMPTY"
            ? `citation span is empty`
            : `citation span not found verbatim in "${citation.source}"`,
      };
    }
    return {
      evidence: {
        inputName: citation.source,
        quote: citation.span,
        start: located.start,
        end: located.end,
      },
    };
  }

  interface ClassifiedItem {
    claimIndex: number;
    kind: string;
    text: string;
    entityId: string | null;
    entityKey: string | null;
    entityName: string | null;
    entityKind: string | null;
    inlineEntityKind: string | null;
    inlineEntityName: string | null;
    predicate: string;
    object: ClaimObject;
    objectEntityName: string | null;
    validFromChapter: number | null;
    evidence: ValidatedEvidence[];
    verdict: ApplicationVerdict;
    verdictReasons: string[];
    conflictsWithFactId: string | null;
    conflictsWithStatement: string | null;
  }

  /**
   * Contract one claim: bind it to (entity, predicate, object,
   * validFromChapter), validate evidence, classify against live canon.
   * Pure IO; used by both create and revalidate.
   */
  async function classifyItem(
    novelId: string,
    runId: string,
    boundInputs: Record<string, string>,
    claim: { kind: string; text: string; citations: Array<{ source: string; span: string }> },
    contracting: ApplicationItemContracting,
  ): Promise<ClassifiedItem> {
    // Object must be well-formed (400 at the boundary, like the canon routes).
    const resolvedObject = resolveObject(
      "entityId" in contracting.object
        ? { objectEntityId: contracting.object.entityId }
        : { objectText: contracting.object.text },
    );
    if (!resolvedObject.ok) {
      throw new CanonApplicationError(400, "INVALID_INPUT", `claim object is ${resolvedObject.reason.toLowerCase()}`);
    }
    const object = resolvedObject.object;
    let objectEntityName: string | null = null;
    if (object.objectEntityId !== undefined) {
      const objEntity = await entityOr404(object.objectEntityId, novelId);
      objectEntityName = objEntity.name;
    }

    // Entity binding: existing id, or an inline {kind, name} naming a new one.
    let entityId: string | null = null;
    let entityKey: string | null = null;
    let entityName: string | null = null;
    let entityKind: string | null = null;
    let inlineEntityKind: string | null = null;
    let inlineEntityName: string | null = null;
    if ("id" in contracting.entity) {
      const entity = await entityOr404(contracting.entity.id, novelId);
      entityId = entity.id;
      entityKey = entity.key;
      entityName = entity.name;
      entityKind = entity.kind;
    } else {
      const name = contracting.entity.name.trim();
      const key = canonicalSubjectKey(name);
      if (key === "") {
        throw new CanonApplicationError(400, "INVALID_INPUT", "inline entity name yields an empty key");
      }
      const existing = await db.storyEntity.findUnique({
        where: { novelId_key: { novelId, key } },
        select: { id: true, key: true, name: true, kind: true },
      });
      if (existing) {
        // Idempotent, like createEntity: naming what is already named binds
        // to it — but a kind collision is a contracting error, not a silent
        // rebinding.
        if (existing.kind !== contracting.entity.kind) {
          throw new CanonApplicationError(
            400,
            "INVALID_INPUT",
            `"${key}" already exists as a ${existing.kind.toLowerCase()}`,
          );
        }
        entityId = existing.id;
        entityKey = existing.key;
        entityName = existing.name;
        entityKind = existing.kind;
      } else {
        inlineEntityKind = contracting.entity.kind;
        inlineEntityName = name;
      }
    }

    // Evidence validation (Invariant 2).
    const evidence: ValidatedEvidence[] = [];
    const verdictReasons: string[] = [];
    for (const citation of claim.citations ?? []) {
      const source = typeof citation?.source === "string" ? citation.source : "";
      const span = typeof citation?.span === "string" ? citation.span : "";
      const result = await validateCitation(runId, boundInputs, { source, span });
      if (result.evidence) evidence.push(result.evidence);
      else verdictReasons.push(result.reason ?? "citation unresolvable");
    }

    let verdict: ApplicationVerdict;
    let conflictsWithFactId: string | null = null;
    let conflictsWithStatement: string | null = null;
    if (evidence.length === 0) {
      verdict = "UNSUPPORTED";
      if (verdictReasons.length === 0) verdictReasons.push("claim carries no citations");
    } else if (entityId === null) {
      // Inline-new entity: no live fact can exist for it yet.
      verdict = "APPLICABLE";
    } else {
      const live = await liveFactFor(novelId, entityId, contracting.predicate);
      const classification = classifyProposal(object, live);
      if (classification.class === "NEW") {
        verdict = "APPLICABLE";
      } else if (classification.class === "DUPLICATE") {
        verdict = "DUPLICATE";
        conflictsWithFactId = classification.liveFactId;
        verdictReasons.push("identical claim is already canon");
      } else {
        verdict = "CONFLICT";
        conflictsWithFactId = classification.liveFactId;
        const liveFact = live!;
        conflictsWithStatement = liveFact.statement;
        verdictReasons.push(`live canon for this subject and predicate says otherwise`);
      }
    }

    return {
      claimIndex: contracting.claimIndex,
      kind: claim.kind,
      text: claim.text,
      entityId,
      entityKey,
      entityName,
      entityKind,
      inlineEntityKind,
      inlineEntityName,
      predicate: contracting.predicate,
      object,
      objectEntityName,
      validFromChapter: contracting.validFromChapter ?? null,
      evidence,
      verdict,
      verdictReasons,
      conflictsWithFactId,
      conflictsWithStatement,
    };
  }

  function itemToReviewState(item: {
    id: string;
    claimIndex: number;
    kind: string;
    text: string;
    entityId: string | null;
    inlineEntityKind: string | null;
    inlineEntityName: string | null;
    predicate: string;
    objectEntityId: string | null;
    objectText: string | null;
    validFromChapter: number | null;
    evidence: unknown;
    verdict: string;
    verdictReasons: string[];
    conflictsWithFactId: string | null;
    entity?: { id: string; key: string; name: string; kind: string } | null;
    objectEntity?: { id: string; key: string; name: string } | null;
    conflictsWithFact?: { id: string; statement: string } | null;
  }) {
    return {
      id: item.id,
      claimIndex: item.claimIndex,
      kind: item.kind,
      text: item.text,
      entityId: item.entityId,
      entityName: item.entity?.name ?? item.inlineEntityName ?? null,
      entityKind: item.entity?.kind ?? item.inlineEntityKind ?? null,
      inlineEntity:
        item.inlineEntityKind && item.inlineEntityName
          ? { kind: item.inlineEntityKind, name: item.inlineEntityName }
          : null,
      predicate: item.predicate,
      object:
        item.objectEntityId !== null
          ? {
              entityId: item.objectEntityId,
              entityName: item.objectEntity?.name ?? null,
            }
          : { text: item.objectText },
      validFromChapter: item.validFromChapter,
      evidence: item.evidence as ValidatedEvidence[],
      verdict: item.verdict as ApplicationVerdict,
      verdictReasons: item.verdictReasons,
      conflictsWith: item.conflictsWithFactId
        ? {
            factId: item.conflictsWithFactId,
            statement: item.conflictsWithFact?.statement ?? null,
          }
        : null,
    };
  }

  return {
    /**
     * Create an application from one extraction: contract each claim,
     * validate evidence, classify against live canon, pin the head.
     * Validation runs synchronously; the row is born VALIDATED.
     */
    async createApplication(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      runId: string;
      extractStepKey?: string;
      items: ApplicationItemContracting[];
    }) {
      const { actorUserId, workspaceId, novelId, runId } = input;
      const extractStepKey = input.extractStepKey ?? "extract";
      await gate(workspaceId, novelId, actorUserId, "canon:manage");

      if (input.items.length === 0) {
        throw new CanonApplicationError(400, "INVALID_INPUT", "at least one item is required");
      }
      const seenClaimIndexes = new Set<number>();
      for (const item of input.items) {
        if (seenClaimIndexes.has(item.claimIndex)) {
          throw new CanonApplicationError(
            400,
            "INVALID_INPUT",
            `duplicate claimIndex ${item.claimIndex} in one application`,
          );
        }
        seenClaimIndexes.add(item.claimIndex);
      }

      const { novelId: runNovelId, artifact } = await loadExtractArtifact(
        workspaceId,
        runId,
        extractStepKey,
      );
      if (runNovelId !== novelId) {
        throw new CanonApplicationError(404, "EXTRACTION_NOT_FOUND", "extraction not found");
      }

      const classified: ClassifiedItem[] = [];
      for (const contracting of input.items) {
        const claim = artifact.proposals[contracting.claimIndex];
        if (!claim) {
          throw new CanonApplicationError(
            400,
            "INVALID_INPUT",
            `claimIndex ${contracting.claimIndex} is out of range`,
          );
        }
        classified.push(
          await classifyItem(novelId, runId, artifact.boundInputs, claim, contracting),
        );
      }

      const headRevisionId = await readHeadRevisionId(db, novelId);
      const textDecision = await readTextDecision(runId);

      const application = await db.canonApplication.create({
        data: {
          workspaceId,
          novelId,
          runId,
          extractStepKey,
          status: "VALIDATED",
          headRevisionId,
          textDecision,
          createdById: actorUserId,
          items: {
            create: classified.map((c) => ({
              claimIndex: c.claimIndex,
              kind: c.kind,
              text: c.text,
              ...(c.entityId ? { entityId: c.entityId } : {}),
              ...(c.inlineEntityKind ? { inlineEntityKind: c.inlineEntityKind } : {}),
              ...(c.inlineEntityName ? { inlineEntityName: c.inlineEntityName } : {}),
              predicate: c.predicate,
              ...(c.object.objectEntityId !== undefined
                ? { objectEntityId: c.object.objectEntityId }
                : {}),
              ...(c.object.objectText !== undefined ? { objectText: c.object.objectText } : {}),
              ...(c.validFromChapter !== null ? { validFromChapter: c.validFromChapter } : {}),
              evidence: c.evidence as never,
              verdict: c.verdict,
              verdictReasons: c.verdictReasons,
              ...(c.conflictsWithFactId ? { conflictsWithFactId: c.conflictsWithFactId } : {}),
            })),
          },
        },
        include: {
          items: {
            include: {
              entity: { select: { id: true, key: true, name: true, kind: true } },
              objectEntity: { select: { id: true, key: true, name: true } },
              conflictsWithFact: { select: { id: true, statement: true } },
            },
            orderBy: { claimIndex: "asc" },
          },
        },
      });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.application-created",
        entityType: "CanonApplication",
        entityId: application.id,
        payload: {
          novelId,
          runId,
          extractStepKey,
          itemCount: classified.length,
          verdicts: classified.map((c) => c.verdict),
        },
      });

      return {
        id: application.id,
        status: application.status,
        headRevisionId: application.headRevisionId,
        textDecision: application.textDecision,
        items: application.items.map(itemToReviewState),
      };
    },

    /**
     * Full review state: the application, its items, per-item impact
     * (which live fact would be superseded), the run's text decision as
     * context, and — once decided — the audit trail (Invariant 7).
     */
    async getApplication(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      applicationId: string;
    }) {
      const { actorUserId, workspaceId, novelId, applicationId } = input;
      const application = await gateApplication(
        workspaceId,
        novelId,
        applicationId,
        actorUserId,
        "canon:read",
      );
      const items = await db.canonApplicationItem.findMany({
        where: { applicationId },
        include: {
          entity: { select: { id: true, key: true, name: true, kind: true } },
          objectEntity: { select: { id: true, key: true, name: true } },
          conflictsWithFact: { select: { id: true, statement: true } },
          canonFact: {
            select: {
              id: true,
              supersededById: true,
              sources: {
                select: { quote: true, start: true, end: true, chapterVersionId: true },
              },
            },
          },
        },
        orderBy: { claimIndex: "asc" },
      });

      // Audit trail for applied items (Invariant 7): the previous live
      // value for supersedes is read from the superseded fact row, which
      // the supersede chain keeps; the head revision at apply time is
      // recovered from the change set that minted the fact.
      let audit: unknown = null;
      if (application.status === "APPLIED") {
        const factIds = items
          .map((i) => i.canonFactId)
          .filter((id): id is string => id !== null);
        const minted = await db.changeSetItem.findMany({
          where: { entityType: "CanonFact", entityId: { in: factIds }, operation: "CREATE" },
          include: { changeSet: { select: { revisionId: true } } },
        });
        const revisionByFact = new Map(minted.map((m) => [m.entityId, m.changeSet.revisionId]));
        const predecessors = await db.canonFact.findMany({
          where: { supersededById: { in: factIds } },
          select: {
            id: true,
            supersededById: true,
            objectEntityId: true,
            objectText: true,
            validFromChapter: true,
            validUntilChapter: true,
          },
        });
        const predecessorBySuccessor = new Map(
          predecessors.map((p) => [p.supersededById as string, p]),
        );
        audit = {
          decidedById: application.decidedById,
          decidedAt: application.decidedAt,
          items: items
            .filter((i) => i.canonFactId !== null)
            .map((i) => {
              const predecessor = predecessorBySuccessor.get(i.canonFactId as string) ?? null;
              return {
                itemId: i.id,
                claimIndex: i.claimIndex,
                kind: i.kind,
                text: i.text,
                entityId: i.entityId,
                predicate: i.predicate,
                object:
                  i.objectEntityId !== null
                    ? { entityId: i.objectEntityId }
                    : { text: i.objectText },
                evidence: (i.evidence as unknown as ValidatedEvidence[]).map((e) => ({
                  ...e,
                  artifact: {
                    runId: application.runId,
                    stepKey: application.extractStepKey,
                    inputName: e.inputName,
                  },
                })),
                previousValue: predecessor
                  ? {
                      factId: predecessor.id,
                      object:
                        predecessor.objectEntityId !== null
                          ? { entityId: predecessor.objectEntityId }
                          : { text: predecessor.objectText },
                      validFromChapter: predecessor.validFromChapter,
                      validUntilChapter: predecessor.validUntilChapter,
                    }
                  : null,
                canonFactId: i.canonFactId,
                headRevisionId: revisionByFact.get(i.canonFactId as string) ?? null,
              };
            }),
        };
      }

      const appliedItems = items
        .filter((i) => i.canonFactId !== null)
        .map((i) => ({
          itemId: i.id,
          factId: i.canonFactId as string,
          entityId: i.entityId as string,
          supersededFactId: i.canonFact?.supersededById ?? null,
        }));
      const invalidatedScopes = [...new Set(appliedItems.map((i) => i.entityId))];

      return {
        id: application.id,
        status: application.status,
        runId: application.runId,
        extractStepKey: application.extractStepKey,
        headRevisionId: application.headRevisionId,
        textDecision: application.textDecision,
        createdById: application.createdById,
        decidedById: application.decidedById,
        decidedAt: application.decidedAt,
        decisionNote: application.decisionNote,
        createdAt: application.createdAt,
        items: items.map(itemToReviewState),
        impact: items.map((i) => ({
          itemId: i.id,
          supersedesFactId: i.conflictsWithFactId,
        })),
        appliedItems,
        invalidatedScopes,
        audit,
      };
    },

    /**
     * Re-run evidence + conflict checks against the current head.
     * VALIDATED → VALIDATED (refresh) or STALE → VALIDATED. Decided
     * applications cannot be revalidated.
     */
    async revalidateApplication(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      applicationId: string;
    }) {
      const { actorUserId, workspaceId, novelId, applicationId } = input;
      const application = await gateApplication(
        workspaceId,
        novelId,
        applicationId,
        actorUserId,
        "canon:manage",
      );
      if (application.status === "APPLIED" || application.status === "REJECTED") {
        throw new CanonApplicationError(409, "ALREADY_DECIDED", "application is already decided");
      }

      // The extract artifact is immutable; re-read it for the re-run.
      const { artifact } = await loadExtractArtifact(workspaceId, application.runId, application.extractStepKey);
      const storedItems = await db.canonApplicationItem.findMany({
        where: { applicationId },
        orderBy: { claimIndex: "asc" },
      });

      await db.$transaction(async (tx) => {
        for (const stored of storedItems) {
          const claim = artifact.proposals[stored.claimIndex];
          if (!claim) {
            throw new CanonApplicationError(400, "INVALID_INPUT", "extract artifact changed");
          }
          const contracting: ApplicationItemContracting = {
            claimIndex: stored.claimIndex,
            entity: stored.entityId
              ? { id: stored.entityId }
              : {
                  kind: stored.inlineEntityKind as (typeof STORY_ENTITY_KINDS)[number],
                  name: stored.inlineEntityName as string,
                },
            predicate: stored.predicate,
            object:
              stored.objectEntityId !== null
                ? { entityId: stored.objectEntityId }
                : { text: stored.objectText ?? "" },
            ...(stored.validFromChapter !== null ? { validFromChapter: stored.validFromChapter } : {}),
          };
          // classifyItem reads through `db`; inside the transaction the
          // re-run must see the transaction's snapshot — but revalidation
          // performs no writes before the updates below, and each update is
          // predicated on the application id, so reading via db is safe.
          const classified = await classifyItem(
            novelId,
            application.runId,
            artifact.boundInputs,
            claim,
            contracting,
          );
          await tx.canonApplicationItem.update({
            where: { id: stored.id },
            data: {
              evidence: classified.evidence as never,
              verdict: classified.verdict,
              verdictReasons: classified.verdictReasons,
              conflictsWithFactId: classified.conflictsWithFactId,
              // The entity binding may have resolved differently (an inline
              // name may now match an existing entity).
              entityId: classified.entityId,
              inlineEntityKind: classified.inlineEntityKind,
              inlineEntityName: classified.inlineEntityName,
            },
          });
        }
        const headRevisionId = await readHeadRevisionId(db, novelId);
        await tx.canonApplication.update({
          where: { id: applicationId },
          data: { status: "VALIDATED", headRevisionId },
        });
      });

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.application-revalidated",
        entityType: "CanonApplication",
        entityId: applicationId,
        payload: { novelId },
      });

      const refreshed = await db.canonApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: {
          items: {
            include: {
              entity: { select: { id: true, key: true, name: true, kind: true } },
              objectEntity: { select: { id: true, key: true, name: true } },
              conflictsWithFact: { select: { id: true, statement: true } },
            },
            orderBy: { claimIndex: "asc" },
          },
        },
      });
      return {
        id: refreshed.id,
        status: refreshed.status,
        headRevisionId: refreshed.headRevisionId,
        items: refreshed.items.map(itemToReviewState),
      };
    },

    /**
     * Approve selected items and apply them to canon atomically
     * (Invariant 6): one transaction mints all facts (plus inline
     * entities), supersede links, item/application transitions, the
     * revision row, and audit rows. Any failure rolls back everything.
     */
    async approveApplication(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      applicationId: string;
      itemIds: string[];
      confirmConflicts?: boolean;
      expectedHeadRevisionId?: string | null;
    }) {
      const {
        actorUserId,
        workspaceId,
        novelId,
        applicationId,
        itemIds,
        confirmConflicts,
        expectedHeadRevisionId,
      } = input;
      const application = await gateApplication(
        workspaceId,
        novelId,
        applicationId,
        actorUserId,
        "canon:approve",
      );
      if (application.status === "APPLIED" || application.status === "REJECTED") {
        throw new CanonApplicationError(409, "ALREADY_DECIDED", "application is already decided");
      }
      if (application.status === "STALE") {
        throw new CanonApplicationError(
          409,
          "STALE_APPLICATION",
          "canon head moved since validation — revalidate first",
          { currentHeadRevisionId: await readHeadRevisionId(db, novelId) },
        );
      }

      const items = await db.canonApplicationItem.findMany({
        where: { applicationId },
        include: {
          entity: { select: { id: true, key: true, name: true, kind: true } },
        },
      });
      const byId = new Map(items.map((i) => [i.id, i]));
      const selected: typeof items = [];
      for (const id of itemIds) {
        const item = byId.get(id);
        if (!item) {
          throw new CanonApplicationError(400, "INVALID_INPUT", "unknown item id in selection");
        }
        selected.push(item);
      }
      if (selected.length === 0) {
        throw new CanonApplicationError(400, "INVALID_INPUT", "at least one item must be selected");
      }

      // Per-item selection gates (before any write).
      for (const item of selected) {
        if (item.verdict === "UNSUPPORTED") {
          throw new CanonApplicationError(
            409,
            "UNSUPPORTED_ITEM_SELECTED",
            "unsupported claims cannot be approved",
          );
        }
        if (item.verdict === "DUPLICATE") {
          throw new CanonApplicationError(
            409,
            "DUPLICATE_ITEM_SELECTED",
            "claims already canon cannot be approved",
          );
        }
        if (item.verdict === "CONFLICT" && !confirmConflicts) {
          throw new CanonApplicationError(
            409,
            "CONFLICT_NOT_CONFIRMED",
            "conflicting claims require explicit confirmation",
          );
        }
        // The existing window rule is not relaxed: a supersede needs a
        // date, or the replaced value cannot be reconstructed as-of.
        if (item.verdict === "CONFLICT" && item.validFromChapter === null) {
          throw new CanonApplicationError(
            409,
            "VALID_FROM_CHAPTER_REQUIRED",
            "a superseding claim needs validFromChapter",
          );
        }
        if (!item.entityId && !(item.inlineEntityKind && item.inlineEntityName)) {
          throw new CanonApplicationError(400, "INVALID_INPUT", "item has no entity binding");
        }
        if (item.objectEntityId === null && item.objectText === null) {
          throw new CanonApplicationError(400, "INVALID_INPUT", "item has no object");
        }
      }

      // Advisory pre-check before the transaction: a stale plan does no
      // work. The locked CAS inside `advanceForMutation` is authoritative.
      const currentHead = await readHeadRevisionId(db, novelId);
      if (currentHead !== application.headRevisionId) {
        throw new CanonApplicationError(409, "STALE_APPLICATION", "canon head moved since validation", {
          currentHeadRevisionId: currentHead,
        });
      }
      try {
        await assertHeadExpectation(db, { novelId, expectedHeadRevisionId });
      } catch (e) {
        if (e instanceof ConflictError) {
          throw new CanonApplicationError(409, "STALE_APPLICATION", e.message, {
            currentHeadRevisionId: e.currentHeadRevisionId,
          });
        }
        throw e;
      }

      // Mint ids up front: the advance below names them in the change set
      // (same reason approveProposal mints the fact id client-side).
      const plan = selected.map((item) => ({
        item,
        factId: randomUUID(),
        entityId:
          item.entityId ??
          randomUUID(), // inline entity, created in the transaction
      }));

      let result: {
        newHeadRevisionId: string;
        appliedItems: Array<{
          itemId: string;
          factId: string;
          entityId: string;
          supersededFactId: string | null;
        }>;
        invalidatedScopes: string[];
      };
      try {
        result = await db.$transaction(async (tx) => {
          // The locked CAS is authoritative: the head is compared under the
          // branch lock before any write. advanceForMutation also captures
          // the PRE_MUTATION checkpoint + snapshot (HIGH operation) and
          // queues the derived-rebuild intents for NF-WF-009 — canon and
          // invalidation intent commit atomically (Invariant 9).
          const advanced = await advanceForMutation(tx, {
            workspaceId,
            novelId,
            expectedHeadRevisionId: application.headRevisionId,
            operation: "canon.application.approve",
            origin: "MANUAL",
            actorUserId,
            tables: [
              "canon_facts",
              "canon_fact_sources",
              "canon_applications",
              "canon_application_items",
              "story_entities",
            ],
            items: [
              { entityType: "CanonApplication", entityId: applicationId, operation: "UPDATE" },
              ...plan.flatMap((p) => [
                { entityType: "CanonFact", entityId: p.factId, operation: "CREATE" as const },
                { entityType: "CanonApplicationItem", entityId: p.item.id, operation: "UPDATE" as const },
                ...(p.item.entityId
                  ? []
                  : [{ entityType: "StoryEntity", entityId: p.entityId, operation: "CREATE" as const }]),
              ]),
            ],
          });

          const appliedItems: Array<{
            itemId: string;
            factId: string;
            entityId: string;
            supersededFactId: string | null;
          }> = [];

          // Deterministic order: claimIndex asc — the apply is a replay of
          // the contracted batch.
          const ordered = [...plan].sort((a, b) => a.item.claimIndex - b.item.claimIndex);
          for (const p of ordered) {
            const item = p.item;

            // Resolve the entity (inline entities are created here, inside
            // the transaction — never at application creation).
            let entityId: string;
            if (item.entityId) {
              const entity = await tx.storyEntity.findFirst({
                where: { id: item.entityId, novelId },
                select: { id: true },
              });
              if (!entity) {
                throw new CanonApplicationError(404, "APPLICATION_NOT_FOUND", "application not found");
              }
              entityId = entity.id;
            } else {
              const kind = item.inlineEntityKind as (typeof STORY_ENTITY_KINDS)[number];
              const name = (item.inlineEntityName as string).trim();
              const key = canonicalSubjectKey(name);
              const existing = await tx.storyEntity.findUnique({
                where: { novelId_key: { novelId, key } },
                select: { id: true, kind: true },
              });
              if (existing) {
                if (existing.kind !== kind) {
                  throw new CanonApplicationError(
                    409,
                    "INLINE_ENTITY_KIND_MISMATCH",
                    `"${key}" already exists as a ${existing.kind.toLowerCase()}`,
                  );
                }
                entityId = existing.id;
              } else {
                const created = await tx.storyEntity.create({
                  data: {
                    id: p.entityId,
                    novelId,
                    kind,
                    key,
                    name,
                    createdById: actorUserId,
                  },
                  select: { id: true },
                });
                entityId = created.id;
              }
            }

            const object: ClaimObject =
              item.objectEntityId !== null
                ? { objectEntityId: item.objectEntityId }
                : { objectText: item.objectText ?? "" };

            // Re-classify against canon as it stands NOW (the
            // approveProposal rationale: a fact created after validation is
            // exactly what validation could not see). The locked CAS above
            // already guarantees no canon write landed since the pin; this
            // is the second layer — any deviation aborts the whole
            // application.
            const priorLive = await tx.canonFact.findFirst({
              where: { novelId, entityId, predicate: item.predicate, status: "ACTIVE" },
              select: {
                id: true,
                validFromChapter: true,
                validUntilChapter: true,
                objectEntityId: true,
                objectText: true,
              },
            });
            let supersededFactId: string | null = null;
            if (priorLive) {
              const liveObject: ClaimObject =
                priorLive.objectEntityId !== null
                  ? { objectEntityId: priorLive.objectEntityId }
                  : { objectText: priorLive.objectText ?? "" };
              if (sameObject(object, liveObject)) {
                throw new CanonApplicationError(
                  409,
                  "STALE_APPLICATION",
                  "a selected claim became duplicate after validation",
                );
              }
              // A newly-conflicting item the validation did not see.
              if (item.verdict !== "CONFLICT" || priorLive.id !== item.conflictsWithFactId) {
                throw new CanonApplicationError(
                  409,
                  "STALE_APPLICATION",
                  "canon changed after validation — revalidate first",
                );
              }
              supersededFactId = priorLive.id;

              // Close the old fact's window (approveProposal's closeAt
              // rule, verbatim): max(replacement start, old start),
              // never lengthening an authored end.
              const startClose =
                item.validFromChapter === null
                  ? priorLive.validFromChapter
                  : priorLive.validFromChapter === null
                    ? item.validFromChapter
                    : Math.max(item.validFromChapter, priorLive.validFromChapter);
              const closeAt =
                priorLive.validUntilChapter === null
                  ? startClose
                  : startClose === null || startClose > priorLive.validUntilChapter
                    ? priorLive.validUntilChapter
                    : startClose;
              const superseded = await tx.canonFact.updateMany({
                where: { id: priorLive.id, status: "ACTIVE" },
                data: { status: "SUPERSEDED", validUntilChapter: closeAt },
              });
              if (superseded.count === 0) {
                throw new CanonApplicationError(
                  409,
                  "STALE_APPLICATION",
                  "the fact this claim supersedes changed during apply",
                );
              }
            }

            // Resolve the manuscript chapter version the draft was applied
            // to, for the fact source pin (contract: else null, run ref in
            // the audit payload).
            const evidence = item.evidence as unknown as ValidatedEvidence[];
            const firstQuote = evidence[0]?.quote;
            const chapterVersionId =
              firstQuote !== undefined
                ? await (async () => {
                    const run = await tx.workflowRun.findUnique({
                      where: { id: application.runId },
                      select: { input: true },
                    });
                    const chapterNumber = (run?.input as { chapterNumber?: unknown } | null)
                      ?.chapterNumber;
                    if (typeof chapterNumber !== "number" || !Number.isInteger(chapterNumber)) {
                      return null;
                    }
                    const chapter = await tx.chapter.findFirst({
                      where: { novelId, number: chapterNumber },
                      select: { id: true },
                    });
                    if (!chapter) return null;
                    const version = await tx.chapterVersion.findFirst({
                      where: { chapterId: chapter.id },
                      orderBy: { number: "desc" },
                      select: { id: true, content: true },
                    });
                    return version && version.content.includes(firstQuote) ? version.id : null;
                  })()
                : null;

            // Mint the fact.
            const statement = item.text;
            await tx.canonFact.create({
              data: {
                id: p.factId,
                workspaceId,
                novelId,
                entityId,
                predicate: item.predicate,
                objectEntityId: item.objectEntityId,
                objectText: item.objectText,
                statement,
                status: "ACTIVE",
                validFromChapter: item.validFromChapter,
                createdById: actorUserId,
                ...(supersededFactId ? { supersededById: supersededFactId } : {}),
              },
            });

            // Evidence source on the minted fact (contract: quote/start/end
            // from validated evidence; chapterVersionId when the draft was
            // applied to a manuscript version, else no source row — the
            // CHECK requires exactly one of the version FKs, and the run
            // reference travels in the audit payload).
            if (chapterVersionId && firstQuote) {
              const first = evidence[0] as ValidatedEvidence;
              await tx.canonFactSource.create({
                data: {
                  canonFactId: p.factId,
                  sourceKind: "CHAPTER",
                  chapterVersionId,
                  quote: first.quote,
                  start: first.start,
                  end: first.end,
                  createdById: actorUserId,
                },
              });
            }

            // The item decision is a compare-and-set, atomic with the fact
            // it mints (approveProposal's rationale, verbatim).
            const decided = await tx.canonApplicationItem.updateMany({
              where: { id: item.id, canonFactId: null },
              data: { canonFactId: p.factId },
            });
            if (decided.count === 0) {
              throw new CanonApplicationError(409, "ALREADY_DECIDED", "item was already decided");
            }

            appliedItems.push({
              itemId: item.id,
              factId: p.factId,
              entityId,
              supersededFactId,
            });
          }

          // The application decision is a compare-and-set on VALIDATED, so a
          // racing reject cannot land after the facts were minted.
          const decidedApp = await tx.canonApplication.updateMany({
            where: { id: applicationId, status: "VALIDATED" },
            data: {
              status: "APPLIED",
              decidedById: actorUserId,
              decidedAt: new Date(),
            },
          });
          if (decidedApp.count === 0) {
            throw new CanonApplicationError(409, "ALREADY_DECIDED", "application was already decided");
          }

          return {
            newHeadRevisionId: advanced.revisionId,
            appliedItems,
            invalidatedScopes: [...new Set(appliedItems.map((i) => i.entityId))],
          };
        });
      } catch (e) {
        // The locked CAS reports a plain stale-revision ConflictError; the
        // contract names it STALE_APPLICATION.
        if (
          e instanceof ConflictError &&
          !(e instanceof CanonApplicationError) &&
          e.message.startsWith("stale revision")
        ) {
          throw new CanonApplicationError(409, "STALE_APPLICATION", e.message, {
            currentHeadRevisionId: e.currentHeadRevisionId,
          });
        }
        throw e;
      }

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.application-approved",
        entityType: "CanonApplication",
        entityId: applicationId,
        payload: {
          novelId,
          runId: application.runId,
          extractStepKey: application.extractStepKey,
          headRevisionId: result.newHeadRevisionId,
          appliedItems: result.appliedItems,
          invalidatedScopes: result.invalidatedScopes,
          confirmConflicts: confirmConflicts ?? false,
        },
      });

      return {
        applicationId,
        status: "APPLIED" as const,
        headRevisionId: result.newHeadRevisionId,
        appliedItems: result.appliedItems,
        invalidatedScopes: result.invalidatedScopes,
      };
    },

    /**
     * Reject an application. Decided applications cannot be re-decided.
     * Rejection changes no story truth — a status CAS, no revision.
     */
    async rejectApplication(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      applicationId: string;
      note?: string;
    }) {
      const { actorUserId, workspaceId, novelId, applicationId, note } = input;
      const application = await gateApplication(
        workspaceId,
        novelId,
        applicationId,
        actorUserId,
        "canon:approve",
      );
      if (application.status === "APPLIED" || application.status === "REJECTED") {
        throw new CanonApplicationError(409, "ALREADY_DECIDED", "application is already decided");
      }
      const rejected = await db.canonApplication.updateMany({
        where: { id: applicationId, status: { in: ["VALIDATED", "STALE"] } },
        data: {
          status: "REJECTED",
          decidedById: actorUserId,
          decidedAt: new Date(),
          ...(note !== undefined ? { decisionNote: note } : {}),
        },
      });
      if (rejected.count === 0) {
        throw new CanonApplicationError(409, "ALREADY_DECIDED", "application is already decided");
      }

      await audit.record({
        actorUserId,
        workspaceId,
        action: "canon.application-rejected",
        entityType: "CanonApplication",
        entityId: applicationId,
        payload: { novelId, note: note ?? null },
      });
    },
  };
}

export type CanonApplicationServices = ReturnType<typeof createCanonApplicationServices>;
