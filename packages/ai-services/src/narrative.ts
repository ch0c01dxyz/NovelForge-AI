/**
 * Narrative DNA & rhythm services (Phase 9) — the write surface behind
 * @novelforge/narrative-rhythm.
 *
 * Phase 9's first wave shipped the five pure rules and the three tables, but
 * nothing could reach either outside a test: the rules had no production
 * caller and `narrative_dna_profiles` / `narrative_policies` / `antagonists`
 * had no route. This service is the missing half — the same gap Phase 6
 * slice 3 closed for `services/story.ts`.
 *
 * Rules are imported from the domain package and never re-implemented. Three
 * of the five now run on the request that would violate them; the other two
 * (`detectRepeatedSequence`, `assessScaleAppropriateness`) are advisory by
 * design and are returned rather than enforced — a repeated beat sequence is
 * a finding, not a refusal (ADR-012), and a conflict beyond the protagonist's
 * reach is a planner note, not an illegal row.
 *
 * Two deliberate asymmetries, both from ADR-009:
 *
 *  - **A soft finding is returned, a hard one is refused.** For a TEMPORARY
 *    antagonist, a missing PURPOSE is refused (the migration CHECK refuses it
 *    too) while a span outside 5-20 chapters is reported in the response and
 *    stored anyway — the migration comment says the span bound is "a pacing
 *    note, not an unrepresentable row". Turning the soft half into a 409
 *    would make the soft constraint a schedule, which is what the ADR forbids.
 *  - **No policy is never a default.** `assessWindow` refuses when the novel
 *    has no DRAMA_GAP policy rather than inventing a ladder, matching
 *    `getHorizon`'s posture (ADR-0011 §2).
 *
 * Known gap (CLOSED in NF-WF-010, GAP-012): the SCALE policy kind was
 * stored but not shape-validated, because no rule consumes a scale
 * *policy* — `assessScaleAppropriateness` takes the protagonist's
 * standing, not the novel's preference. NF-WF-010 added the SCALE
 * payload schema (`isValidScalePayload`, probed on write via the typed
 * `PolicyError` → 409 MALFORMED_POLICY) and the malformed-on-read
 * fail-open rule. The schema comment's "shape validated in
 * packages/narrative-rhythm" remains aspirational for that one kind —
 * the shape lives in this service file, and the Prisma schema comment
 * now says so.
 */
import {
  assessDramaWindow,
  assessScaleAppropriateness,
  checkCooldown,
  detectRepeatedSequence,
  validateAntagonistProgression,
  NARRATIVE_SCALES,
  type AntagonistOutcome,
  type AntagonistProblem,
  type AntagonistRole,
  type AntagonistStage,
  type BeatRecord,
  type CooldownDecision,
  type DramaBeat,
  type DramaType,
  type DramaWindow,
  type NarrativeScale,
  type NarrativePolicyKind,
  type PolicyHardness,
  type RhythmFinding,
  type ScaleAssessment,
} from "@novelforge/narrative-rhythm";
// Re-exported so a consumer has one import site; declared in the domain
// package, not here — a second hand-maintained copy is what the vocabulary
// pin test exists to prevent.
export type { NarrativePolicyKind, PolicyHardness };
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import type { InputJsonValue, NovelForgeDb } from "@novelforge/database";
import { ConflictError, NotFoundError } from "./platform.ts";
import { PolicyError } from "./policy-errors.ts";
import { MemoryError } from "./memory.ts";
import type { AuditService } from "./audit.ts";
// Head CAS for every covered mutation (STORY-VERSIONING.md C3/C4).
import { advanceForMutation, createWithRevision, type RevisionTx } from "./revisions.ts";
// NF-WF-050B: policy fingerprint for branch/head/policy CAS on SCALE writes.
import { fingerprintScalePolicy } from "./scale-review-types.ts";

/**
 * NF-WF-010 (GAP-012): the SCALE payload schema, in one place because it
 * is applied twice — on write (putPolicy refuses a bad shape with 409
 * MALFORMED_POLICY via PolicyError) and on read (evaluation treats a
 * malformed row as "no policy configured" and emits an UNRESOLVED
 * MALFORMED_POLICY finding — fail-open, never a silent pass).
 *
 * Shape: { standing: { scale: NarrativeScale, access: NarrativeScale[],
 * reputation: number } } — every scale a member of NARRATIVE_SCALES
 * (pinned by the domain-package test), access non-empty, reputation an
 * integer 0–100.
 */
export function isValidScalePayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const standing = (payload as { standing?: unknown }).standing;
  if (standing === null || typeof standing !== "object" || Array.isArray(standing)) {
    return false;
  }
  const s = standing as { scale?: unknown; access?: unknown; reputation?: unknown };
  if (!NARRATIVE_SCALES.includes(s.scale as NarrativeScale)) return false;
  if (
    !Array.isArray(s.access) ||
    s.access.length > 8 ||
    !s.access.every((a) => NARRATIVE_SCALES.includes(a as NarrativeScale)) ||
    new Set(s.access).size !== s.access.length
  ) {
    return false;
  }
  if (!Number.isInteger(s.reputation) || (s.reputation as number) < 0 || (s.reputation as number) > 100) {
    return false;
  }
  return true;
}

/** Extract the validated standing, or null when the payload is malformed. */
export function scaleStandingOf(payload: unknown): {
  scale: NarrativeScale;
  access: NarrativeScale[];
  reputation: number;
} | null {
  if (!isValidScalePayload(payload)) return null;
  const standing = (payload as { standing: { scale: NarrativeScale; access: NarrativeScale[]; reputation: number } }).standing;
  return { scale: standing.scale, access: [...standing.access], reputation: standing.reputation };
}

/**
 * The COOLDOWN payload predicate, hoisted to module scope (NF-WF-010) so
 * read-side evaluation (final-text review, health) can apply the same
 * predicate putPolicy applies on write. checkCooldown has no problem
 * channel, so a bad window reads as "no cooldown configured" — the
 * fail-OPEN posture — and this predicate is what names a malformed row.
 */
export function isValidCooldownPayload(payload: unknown): boolean {
  const window = (payload as { windowChapters?: unknown } | null)?.windowChapters;
  return Number.isInteger(window) && (window as number) > 0;
}

// --- Views ---

export interface NarrativeDnaView {
  novelId: string;
  dna: unknown;
  updatedAt: Date;
}

export interface NarrativePolicyView {
  id: string;
  novelId: string;
  kind: NarrativePolicyKind;
  hardness: PolicyHardness;
  hardReason: string | null;
  payload: unknown;
  updatedAt: Date;
}

export interface AntagonistView {
  id: string;
  novelId: string;
  characterId: string;
  role: AntagonistRole;
  stage: AntagonistStage;
  outcome: AntagonistOutcome | null;
  purpose: string | null;
  fromChapter: number;
  toChapter: number | null;
}

// --- Service contract ---

/** Tenant scope every method takes. */
export interface NarrativeScope {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
}

/**
 * NF-WF-050B: required SCALE context pins for direct SCALE PUT/DELETE.
 * Every pin is REQUIRED at runtime (a missing pin is a 400); the nullable
 * pins accept explicit null but never undefined. No pin may be defaulted or
 * inferred — a SCALE write without them is refused, never applied globally.
 */
export interface ScalePolicyContextPins {
  chapterId: string;
  chapterVersionId: string;
  expectedBranchId: string;
  expectedHeadRevisionId: string | null;
  expectedSetId: string | null;
  expectedDecisionId: string | null;
  expectedPolicyFingerprint: string;
  reason: string;
}

/**
 * A hard problem refuses the write; an advisory one is reported and the row
 * still lands. The split is the ADR-009 line, and it is the reason
 * `validateAntagonistProgression` returns a list instead of a boolean.
 */
export interface AntagonistWriteResult {
  antagonist: AntagonistView;
  /** Soft findings the author should see — never a refusal. */
  advisory: { problem: AntagonistProblem; message: string }[];
}

export interface NarrativeServices {
  getDna(input: NarrativeScope): Promise<NarrativeDnaView | null>;
  putDna(input: NarrativeScope & { dna: unknown }): Promise<NarrativeDnaView>;

  listPolicies(input: NarrativeScope): Promise<NarrativePolicyView[]>;
  putPolicy(input: NarrativeScope & {
    kind: NarrativePolicyKind;
    hardness: PolicyHardness;
    hardReason: string | null;
    payload: unknown;
    /**
     * NF-WF-050B: REQUIRED at runtime when kind === "SCALE" (400 when a pin
     * is missing). Non-SCALE requests retain their existing schema and ignore
     * these fields.
     */
    chapterId?: string;
    chapterVersionId?: string;
    expectedBranchId?: string;
    expectedHeadRevisionId?: string | null;
    expectedSetId?: string | null;
    expectedDecisionId?: string | null;
    expectedPolicyFingerprint?: string;
    reason?: string;
    /**
     * Required to be "APPROVE" when a SCALE standing changes or the SCALE
     * policy is initialized. A standing-changing direct call without it is
     * refused 400. Hardness-only SCALE changes must not send this field.
     */
    authorDecision?: "APPROVE";
  }): Promise<NarrativePolicyView>;

  /**
   * Unserts a policy. putPolicy upserts, so without this a policy is permanent.
   * NF-WF-050B: when kind === "SCALE" the context/reason pins are REQUIRED at
   * runtime (400 when missing) — there is no unpinned empty-body deletion.
   */
  deletePolicy(input: NarrativeScope & { kind: NarrativePolicyKind } & Partial<ScalePolicyContextPins>): Promise<void>;

  /** Loads this novel's DRAMA_GAP policy; no policy is a refusal, not a default. */
  assessWindow(input: NarrativeScope & { chaptersSinceDrama: number }): Promise<DramaWindow>;

  /** Loads this novel's COOLDOWN policy and decides the candidate beat. */
  checkBeat(input: NarrativeScope & {
    candidate: { id: string; type: DramaType; chapter: number };
    history: readonly DramaBeat[];
  }): Promise<CooldownDecision>;

  createAntagonist(input: NarrativeScope & {
    characterId: string;
    role: AntagonistRole;
    stage: AntagonistStage;
    outcome: AntagonistOutcome | null;
    purpose: string | null;
    fromChapter: number;
    toChapter: number | null;
  }): Promise<AntagonistWriteResult>;

  listAntagonists(input: NarrativeScope): Promise<AntagonistView[]>;

  /** Forward-only through the lifecycle; a backward or repeated stage is refused. */
  advanceAntagonistStage(input: NarrativeScope & {
    antagonistId: string;
    stage: AntagonistStage;
    /** Omitted leaves the stored outcome alone; null clears it. */
    outcome?: AntagonistOutcome | null;
  }): Promise<AntagonistWriteResult>;

  /** Evidence-backed repetition finding, or null below the threshold. */
  detectPattern(input: NarrativeScope & {
    beats: readonly BeatRecord[];
    sequence: readonly string[];
    minOccurrences?: number;
  }): Promise<RhythmFinding | null>;

  assessScale(input: NarrativeScope & {
    proposal: { id: string; scale: NarrativeScale; summary?: string | null };
    standing: {
      scale: NarrativeScale;
      access: readonly NarrativeScale[];
      reputation: number;
    };
  }): Promise<ScaleAssessment>;
}

/**
 * The problems that refuse a write. MISSING_SPAN and SPAN_OUT_OF_BOUNDS are
 * absent on purpose — see the file comment.
 */
const HARD_ANTAGONIST_PROBLEMS: readonly AntagonistProblem[] = [
  "UNKNOWN_STAGE",
  "REPEATED_STAGE",
  "BACKWARD_STAGE",
  "MISSING_PURPOSE",
];

// --- Implementation ---

export function createNarrativeServices(deps: {
  db: NovelForgeDb;
  audit: AuditService;
}): NarrativeServices {
  const { db, audit } = deps;
  // Bound once so each call site stays a five-argument call (see revisions.ts).
  const withRevision = createWithRevision(db);

  /** Tenant gate: membership + novel resolved server-side, missing either is the SAME 404 (no leak); capability granular (ADR-0004). */
  async function gate(
    actorUserId: string,
    workspaceId: string,
    novelId: string,
    capability: Capability,
  ): Promise<void> {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { role: true },
    });
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!membership || !novel) throw new NotFoundError("novel");
    requireCapability(membership.role, capability);
  }

  async function requireAntagonist(antagonistId: string, novelId: string, workspaceId: string) {
    const row = await db.antagonist.findFirst({
      where: { id: antagonistId, novelId, workspaceId },
      select: {
        id: true, novelId: true, characterId: true, role: true, stage: true,
        outcome: true, purpose: true, fromChapter: true, toChapter: true,
      },
    });
    if (!row) throw new NotFoundError("antagonist");
    return row;
  }

  function toAntagonistView(row: {
    id: string; novelId: string; characterId: string; role: string; stage: string;
    outcome: string | null; purpose: string | null; fromChapter: number; toChapter: number | null;
  }): AntagonistView {
    return {
      id: row.id,
      novelId: row.novelId,
      characterId: row.characterId,
      role: row.role as AntagonistRole,
      stage: row.stage as AntagonistStage,
      outcome: row.outcome as AntagonistOutcome | null,
      purpose: row.purpose,
      fromChapter: row.fromChapter,
      toChapter: row.toChapter,
    };
  }

  /**
   * Split the rule's findings into the half that refuses and the half that is
   * reported, so the caller sees a pacing note instead of a 409.
   */
  function splitFindings(result: ReturnType<typeof validateAntagonistProgression>) {
    const hard = result.errors.filter((e) => HARD_ANTAGONIST_PROBLEMS.includes(e.problem));
    const advisory = result.errors.filter((e) => !HARD_ANTAGONIST_PROBLEMS.includes(e.problem));
    return { hard, advisory };
  }

  /**
   * A TEMPORARY antagonist's span is inclusive chapters; a null `toChapter`
   * means "still in play", so the span is unknown rather than zero.
   */
  function spanOf(fromChapter: number, toChapter: number | null): number | null {
    return toChapter === null ? null : toChapter - fromChapter + 1;
  }

  function policyRow(novelId: string, kind: NarrativePolicyKind) {
    return db.narrativePolicy.findUnique({ where: { novelId_kind: { novelId, kind } } });
  }

  function toPolicyView(row: {
    id: string; novelId: string; kind: string; hardness: string;
    hardReason: string | null; payload: unknown; updatedAt: Date;
  }): NarrativePolicyView {
    return {
      id: row.id,
      novelId: row.novelId,
      kind: row.kind as NarrativePolicyKind,
      hardness: row.hardness as PolicyHardness,
      hardReason: row.hardReason,
      payload: row.payload,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * NF-WF-050B: every SCALE context pin is REQUIRED. A missing pin is a 400 —
   * never a silent default, never an unpinned global mutation. The nullable
   * pins accept explicit null; only undefined counts as missing.
   */
  function requireScalePins(input: {
    chapterId?: string;
    chapterVersionId?: string;
    expectedBranchId?: string;
    expectedHeadRevisionId?: string | null;
    expectedSetId?: string | null;
    expectedDecisionId?: string | null;
    expectedPolicyFingerprint?: string;
    reason?: string;
  }): ScalePolicyContextPins {
    const missing: string[] = [];
    if (!input.chapterId) missing.push("chapterId");
    if (!input.chapterVersionId) missing.push("chapterVersionId");
    if (!input.expectedBranchId) missing.push("expectedBranchId");
    if (input.expectedHeadRevisionId === undefined) missing.push("expectedHeadRevisionId");
    if (input.expectedSetId === undefined) missing.push("expectedSetId");
    if (input.expectedDecisionId === undefined) missing.push("expectedDecisionId");
    if (!input.expectedPolicyFingerprint) missing.push("expectedPolicyFingerprint");
    if (input.reason === undefined) missing.push("reason");
    if (missing.length > 0) {
      throw new MemoryError(
        400,
        "INVALID_INPUT",
        `SCALE policy write requires context pins: missing ${missing.join(", ")}`,
      );
    }
    return {
      chapterId: input.chapterId!,
      chapterVersionId: input.chapterVersionId!,
      expectedBranchId: input.expectedBranchId!,
      expectedHeadRevisionId: input.expectedHeadRevisionId ?? null,
      expectedSetId: input.expectedSetId ?? null,
      expectedDecisionId: input.expectedDecisionId ?? null,
      expectedPolicyFingerprint: input.expectedPolicyFingerprint!,
      reason: input.reason!,
    };
  }

  /** Standing comparison for the approve-path decision. Access is a set. */
  function standingsEqual(
    a: { scale: NarrativeScale; access: NarrativeScale[]; reputation: number },
    b: { scale: NarrativeScale; access: NarrativeScale[]; reputation: number },
  ): boolean {
    if (a.scale !== b.scale || a.reputation !== b.reputation) return false;
    if (a.access.length !== b.access.length) return false;
    const set = new Set(a.access);
    return b.access.every((s) => set.has(s));
  }

  /**
   * NF-WF-050B: lock order novel NO KEY UPDATE -> checked-out branch UPDATE.
   * The branch is resolved server-side from Novel.currentBranchId (falling
   * back to main); the client never names it.
   */
  async function lockCheckedOutBranch(
    tx: RevisionTx,
    workspaceId: string,
    novelId: string,
  ): Promise<{ id: string; name: string; headRevisionId: string | null }> {
    await tx.$queryRawUnsafe(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`, novelId);
    const novel = await tx.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { currentBranchId: true },
    });
    if (!novel) throw new NotFoundError("novel");
    let branch: { id: string; name: string; headRevisionId: string | null } | null = null;
    if (novel.currentBranchId) {
      branch = await tx.novelBranch.findFirst({
        where: { id: novel.currentBranchId, novelId },
        select: { id: true, name: true, headRevisionId: true },
      });
    }
    if (!branch) {
      branch = await tx.novelBranch.findFirst({
        where: { novelId, name: "main" },
        select: { id: true, name: true, headRevisionId: true },
      });
    }
    if (!branch) throw new NotFoundError("novel");
    await tx.$queryRawUnsafe(`SELECT id FROM novel_branches WHERE id = $1 FOR UPDATE`, branch.id);
    return branch;
  }

  /**
   * NF-WF-050B: branch-aware revision wrapper for policy mutations.
   * Replaces the main-only createWithRevision for policies: locks novel ->
   * checked-out branch, runs the write, then advances THAT branch's head.
   * A non-SCALE HARD edit on branch B must advance B; advancing main would
   * leave a false fresh PASS on B.
   */
  async function withCheckedOutBranchRevision<T extends object>(
    scope: { workspaceId: string; novelId: string; actorUserId: string },
    operation: string,
    entityType: string,
    tables: readonly string[],
    write: (tx: RevisionTx) => Promise<T>,
    options?: {
      entityId?: string;
      itemOperation?: "CREATE" | "UPDATE" | "DELETE";
      expectedHeadRevisionId?: string | null;
    },
  ): Promise<T> {
    return db.$transaction(async (tx) => {
      const branch = await lockCheckedOutBranch(tx, scope.workspaceId, scope.novelId);
      const row = await write(tx);
      const entityId = options?.entityId ?? (row as { id?: string }).id;
      if (!entityId) {
        throw new Error(
          `withCheckedOutBranchRevision: ${entityType} has no id — pass options.entityId`,
        );
      }
      await advanceForMutation(tx, {
        workspaceId: scope.workspaceId,
        novelId: scope.novelId,
        expectedHeadRevisionId: options?.expectedHeadRevisionId,
        branchName: branch.name,
        operation,
        origin: "MANUAL",
        actorUserId: scope.actorUserId,
        tables,
        items: [{ entityType, entityId, operation: options?.itemOperation ?? "CREATE" }],
      });
      return row;
    });
  }

  /**
   * NF-WF-050B: direct SCALE policy write safeguards.
   *
   * Two paths, decided by whether the standing changes:
   *
   * - Standing change or initialization: requires explicit
   *   authorDecision: "APPROVE" (400 otherwise) and rides the S2 approve
   *   service — same caps, reason/expectations, atomically recorded
   *   proposal + outcome, HIGH checkpoint + revision + rebuild intent.
   * - Hardness-only change: requires reason plus branch/head/policy CAS and
   *   a branch-aware revision under the novel -> branch lock order.
   */
  async function putScalePolicy(input: NarrativeScope & {
    hardness: PolicyHardness;
    hardReason: string | null;
    payload: unknown;
    chapterId?: string;
    chapterVersionId?: string;
    expectedBranchId?: string;
    expectedHeadRevisionId?: string | null;
    expectedSetId?: string | null;
    expectedDecisionId?: string | null;
    expectedPolicyFingerprint?: string;
    reason?: string;
    authorDecision?: "APPROVE";
  }): Promise<NarrativePolicyView> {
    const { actorUserId, workspaceId, novelId, hardness, hardReason, payload } = input;

    const pins = requireScalePins(input);
    const reason = pins.reason.trim();
    if (reason.length < 1 || reason.length > 4000) {
      throw new MemoryError(400, "INVALID_INPUT", "reason must be 1..4000 characters");
    }

    // The payload shape was already probed by putPolicy (409 MALFORMED_POLICY);
    // re-derive here so the S2 payload carries the validated standing.
    const newStanding = scaleStandingOf(payload);
    if (!newStanding) {
      throw new PolicyError(
        "MALFORMED_POLICY",
        "scale policy invalid: standing must be { scale, access, reputation } with valid narrative scales and reputation an integer 0-100",
      );
    }

    const existing = await db.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId, kind: "SCALE" } },
    });
    const oldStanding = existing ? scaleStandingOf(existing.payload) : null;
    const standingChanged =
      !existing || !oldStanding || !standingsEqual(oldStanding, newStanding);

    if (standingChanged) {
      if (input.authorDecision !== "APPROVE") {
        throw new MemoryError(
          400,
          "INVALID_INPUT",
          "a SCALE standing change or policy initialization requires authorDecision: \"APPROVE\"",
        );
      }
      // Same caps as the approve service, checked BEFORE the transaction
      // so a refused decision leaves no orphan pending proposal behind.
      // canon:manage is also required (createProposal/decideProposal enforce it).
      await gate(actorUserId, workspaceId, novelId, "chapter:update");
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      await gate(actorUserId, workspaceId, novelId, "canon:approve");
      // Lazy import: scale-decisions.ts imports isValidScalePayload from this
      // module; a dynamic import keeps module evaluation order out of the
      // picture entirely (usage is deferred to call time either way).
      const { createScaleDecisionServices } = await import("./scale-decisions.ts");
      const decisions = createScaleDecisionServices({ db, audit });
      // ATOMIC: the entire explicit operation (proposal + approval + policy
      // update + checkpoint + revision + outcome + rebuild intent) runs in a
      // SINGLE transaction. If the approval fails (stale, checkpoint failure,
      // etc.), the proposal is also rolled back — zero partial effects.
      await db.$transaction(async (tx) => {
        const created = await decisions.createProposalTx(tx as import("./scale-decisions.ts").ScaleDecisionTx, {
          actorUserId,
          workspaceId,
          novelId,
          chapterId: pins.chapterId,
          chapterVersionId: pins.chapterVersionId,
          expectedBranchId: pins.expectedBranchId,
          expectedHeadRevisionId: pins.expectedHeadRevisionId,
          expectedSetId: pins.expectedSetId,
          expectedDecisionId: pins.expectedDecisionId,
          expectedPolicyFingerprint: pins.expectedPolicyFingerprint,
          kind: "STANDING_CHANGE",
          payload: { standing: newStanding, hardness, hardReason },
          reason,
        });
        await decisions.decideProposalTx(tx as import("./scale-decisions.ts").ScaleDecisionTx, {
          actorUserId,
          workspaceId,
          novelId,
          chapterId: pins.chapterId,
          proposalId: created.proposal.id,
          action: "APPROVE",
          reason,
          expectedBranchId: pins.expectedBranchId,
          expectedHeadRevisionId: pins.expectedHeadRevisionId,
          expectedDecisionId: pins.expectedDecisionId,
          expectedPolicyFingerprint: pins.expectedPolicyFingerprint,
          expectedVersionId: pins.chapterVersionId,
          expectedSetId: pins.expectedSetId,
        });
      });
      const row = await db.narrativePolicy.findUnique({
        where: { novelId_kind: { novelId, kind: "SCALE" } },
      });
      if (!row) throw new NotFoundError("narrative policy");
      return toPolicyView(row);
    }

    // Hardness-only change: reason + branch/head/policy CAS + branch-aware
    // revision under the novel -> branch lock order.
    // GAP-119: validate ALL context pins (not just branch/policy).
    const updated = await db.$transaction(async (tx) => {
      const branch = await lockCheckedOutBranch(tx, workspaceId, novelId);
      if (pins.expectedBranchId !== branch.id) {
        throw new ConflictError("policy branch changed while this request was in flight");
      }
      // Validate head pin against live head.
      if ((branch.headRevisionId ?? null) !== pins.expectedHeadRevisionId) {
        throw new ConflictError("head changed while this request was in flight");
      }
      // Validate chapter/version ownership.
      const version = await tx.chapterVersion.findFirst({
        where: {
          id: pins.chapterVersionId,
          chapterId: pins.chapterId,
          chapter: { novelId, novel: { workspaceId } },
        },
        select: { id: true },
      });
      if (!version) {
        throw new ConflictError("chapter version changed while this request was in flight");
      }
      // Validate evidence set pin against live latest set.
      // GAP-119: scope evidence lookup to the EXACT chapter version.
      const latestSet = await tx.scaleEvidenceSet.findFirst({
        where: { novelId, sourceBranchId: branch.id, chapterVersionId: pins.chapterVersionId },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });
      if ((latestSet?.id ?? null) !== pins.expectedSetId) {
        throw new ConflictError("evidence set changed while this request was in flight");
      }
      // Validate decision head pin.
      const latestOutcome = await tx.scaleDecisionOutcome.findFirst({
        where: {
          novelId,
          sourceBranchId: branch.id,
          chapterVersionId: pins.chapterVersionId,
        },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });
      if ((latestOutcome?.id ?? null) !== pins.expectedDecisionId) {
        throw new ConflictError("decision head changed while this request was in flight");
      }
      const current = await tx.narrativePolicy.findUnique({
        where: { novelId_kind: { novelId, kind: "SCALE" } },
      });
      if (!current) throw new NotFoundError("narrative policy");
      const currentFingerprint = fingerprintScalePolicy({
        id: current.id,
        kind: current.kind,
        hardness: current.hardness,
        hardReason: current.hardReason,
        payload: current.payload,
      });
      if (currentFingerprint !== pins.expectedPolicyFingerprint) {
        throw new ConflictError("policy changed while this request was in flight");
      }
      // The standing must still be unchanged under the lock; a concurrent
      // standing change belongs on the approve path, not this one.
      const lockedStanding = scaleStandingOf(current.payload);
      if (!lockedStanding || !standingsEqual(lockedStanding, newStanding)) {
        throw new ConflictError(
          "policy standing changed while this request was in flight; use the approve path",
        );
      }
      const row = await tx.narrativePolicy.update({
        where: { id: current.id },
        data: { hardness, hardReason },
      });
      await advanceForMutation(tx, {
        workspaceId,
        novelId,
        expectedHeadRevisionId: pins.expectedHeadRevisionId,
        branchName: branch.name,
        operation: "policy.write",
        origin: "MANUAL",
        actorUserId,
        tables: ["narrative_policies"],
        items: [{ entityType: "NarrativePolicy", entityId: row.id, operation: "UPDATE" }],
      });
      return row;
    });
    await audit.record({
      actorUserId,
      workspaceId,
      action: "narrative.policy-set",
      entityType: "NarrativePolicy",
      entityId: updated.id,
      payload: { kind: "SCALE", hardness },
    });
    return toPolicyView(updated);
  }

  /**
   * NF-WF-050B: direct SCALE policy deletion safeguards. The context/reason
   * body is REQUIRED — no unpinned empty-body deletion. Branch/head/policy
   * CAS under the novel -> branch lock order, then a branch-aware revision.
   */
  async function deleteScalePolicy(
    input: NarrativeScope & Partial<ScalePolicyContextPins>,
  ): Promise<void> {
    const { actorUserId, workspaceId, novelId } = input;
    const pins = requireScalePins(input);
    const reason = pins.reason.trim();
    if (reason.length < 1 || reason.length > 4000) {
      throw new MemoryError(400, "INVALID_INPUT", "reason must be 1..4000 characters");
    }
    let deletedId: string;
    await db.$transaction(async (tx) => {
      const branch = await lockCheckedOutBranch(tx, workspaceId, novelId);
      if (pins.expectedBranchId !== branch.id) {
        throw new ConflictError("policy branch changed while this request was in flight");
      }
      // Validate chapter/version ownership (pins are required; do not ignore them).
      const versionRow = await tx.chapterVersion.findFirst({
        where: { id: pins.chapterVersionId },
        select: {
          id: true,
          chapterId: true,
          chapter: { select: { novelId: true } },
        },
      });
      if (
        !versionRow ||
        versionRow.chapterId !== pins.chapterId ||
        versionRow.chapter.novelId !== novelId
      ) {
        throw new NotFoundError("chapter version");
      }
      // Validate evidence-set and decision-head expectations against current
      // context so a stale client view cannot delete under changed state.
      // GAP-119: scope evidence lookup to the EXACT chapter version.
      const latestSet = await tx.scaleEvidenceSet.findFirst({
        where: { novelId, sourceBranchId: branch.id, chapterVersionId: pins.chapterVersionId },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });
      if ((latestSet?.id ?? null) !== pins.expectedSetId) {
        throw new ConflictError("evidence set changed while this request was in flight");
      }
      const latestOutcome = await tx.scaleDecisionOutcome.findFirst({
        where: {
          novelId,
          sourceBranchId: branch.id,
          chapterVersionId: pins.chapterVersionId,
        },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });
      if ((latestOutcome?.id ?? null) !== pins.expectedDecisionId) {
        throw new ConflictError("decision head changed while this request was in flight");
      }
      const existing = await tx.narrativePolicy.findUnique({
        where: { novelId_kind: { novelId, kind: "SCALE" } },
      });
      if (!existing) throw new NotFoundError("narrative policy");
      const currentFingerprint = fingerprintScalePolicy({
        id: existing.id,
        kind: existing.kind,
        hardness: existing.hardness,
        hardReason: existing.hardReason,
        payload: existing.payload,
      });
      if (currentFingerprint !== pins.expectedPolicyFingerprint) {
        throw new ConflictError("policy changed while this request was in flight");
      }
      // Novel-scoped predicate; count 0 = lost a concurrent-delete race.
      // The count check is INSIDE the transaction (C4).
      const deleted = await tx.narrativePolicy.deleteMany({
        where: { id: existing.id, novelId },
      });
      if (deleted.count === 0) throw new NotFoundError("narrative policy");
      deletedId = existing.id;
      await advanceForMutation(tx, {
        workspaceId,
        novelId,
        expectedHeadRevisionId: pins.expectedHeadRevisionId,
        branchName: branch.name,
        operation: "policy.write",
        origin: "MANUAL",
        actorUserId,
        tables: ["narrative_policies"],
        items: [{ entityType: "NarrativePolicy", entityId: existing.id, operation: "DELETE" }],
      });
    });
    await audit.record({
      actorUserId,
      workspaceId,
      action: "narrative.policy-deleted",
      entityType: "NarrativePolicy",
      entityId: deletedId!,
      payload: { kind: "SCALE", reason },
    });
  }

  /**
   * The COOLDOWN payload predicate, in one place because it is applied twice:
   * on write (putPolicy refuses a bad shape) and on read (checkBeat refuses a
   * row that reached the table some other way). checkCooldown has no problem
   * channel, so a bad window there reads as "no cooldown configured" — a
   * fail-OPEN on the only HARD rule in Phase 9.
   */
  return {
    // --- Narrative DNA ----------------------------------------------------

    async getDna({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const row = await db.narrativeDnaProfile.findUnique({ where: { novelId } });
      if (!row) return null;
      return { novelId: row.novelId, dna: row.dna, updatedAt: row.updatedAt };
    },

    async putDna({ actorUserId, workspaceId, novelId, dna }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      // Trust-boundary shape check: the column is JSONB, so a scalar or array
      // would store happily and every later reader would have to defend
      // against it. The FIELD inventory is not validated here — no rule in
      // @novelforge/narrative-rhythm consumes one yet, and inventing a field
      // list would make this file a second, drift-prone schema.
      if (dna === null || typeof dna !== "object" || Array.isArray(dna)) {
        throw new ConflictError("narrative DNA must be a JSON object");
      }
      // The profile is a per-novel singleton with no `id` column, so the
      // change-log entity id is the novelId and the item is UPDATE (the C2
      // vocabulary has no UPSERT; every caller after the first is an update).
      const row = await withRevision(
        { workspaceId, novelId, actorUserId },
        "dna.write",
        "NarrativeDnaProfile",
        ["narrative_dna_profiles"],
        (tx) => tx.narrativeDnaProfile.upsert({
          where: { novelId },
          update: { dna: dna as InputJsonValue },
          create: { novelId, dna: dna as InputJsonValue },
        }),
        { entityId: novelId, itemOperation: "UPDATE" },
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "narrative.dna-updated",
        entityType: "NarrativeDnaProfile",
        entityId: novelId,
        payload: {},
      });
      return { novelId: row.novelId, dna: row.dna, updatedAt: row.updatedAt };
    },

    // --- Policies ---------------------------------------------------------

    async listPolicies({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.narrativePolicy.findMany({
        where: { novelId },
        orderBy: { kind: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        novelId: row.novelId,
        kind: row.kind as NarrativePolicyKind,
        hardness: row.hardness as PolicyHardness,
        hardReason: row.hardReason,
        payload: row.payload,
        updatedAt: row.updatedAt,
      }));
    },

    async putPolicy({ actorUserId, workspaceId, novelId, kind, hardness, hardReason, payload, ...scaleCtx }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // NarrativePolicy_hard_requires_reason, stated at the boundary so the
      // caller gets a sentence instead of a 23514. The CHECK stays as the
      // backstop for a write that does not come through here. JS trim covers
      // the full blank set (incl. U+3000) that the CHECK's POSIX class does
      // not, so the two agree wherever the CHECK is the looser of the pair.
      const reason = hardness === "HARD" ? hardReason?.trim() ?? "" : null;
      if (hardness === "HARD" && reason === "") {
        throw new ConflictError("a HARD narrative policy must state why it binds");
      }

      // Probe with the rule that will consume the payload, so a malformed
      // policy is refused on write rather than discovered on read — the
      // putHorizon posture (ADR-0011 §3).
      if (kind === "DRAMA_GAP") {
        const probe = assessDramaWindow({ policy: payload as never, chaptersSinceDrama: 0 });
        if ("problem" in probe) {
          throw new ConflictError(`drama gap policy invalid: ${probe.problem}`);
        }
      } else if (kind === "COOLDOWN") {
        // checkCooldown has no problem channel — a bad window reads as "no
        // cooldown configured", which is a silent pass, so the shape is
        // checked here instead. Same predicate checkBeat re-applies on read.
        if (!isValidCooldownPayload(payload)) {
          throw new ConflictError("cooldown policy invalid: windowChapters must be a positive integer");
        }
      } else if (kind === "SCALE") {
        // NF-WF-010 (GAP-012): SCALE was stored unvalidated (see the file
        // comment). It now rides the new typed PolicyError — 409
        // MALFORMED_POLICY — not the generic ConflictError path, which can
        // only emit CONFLICT. The existing DRAMA_GAP/COOLDOWN refusals keep
        // their ConflictError behavior (unchanged).
        if (!isValidScalePayload(payload)) {
          throw new PolicyError(
            "MALFORMED_POLICY",
            "scale policy invalid: standing must be { scale, access, reputation } with valid narrative scales and reputation an integer 0-100",
          );
        }
        // NF-WF-050B: direct SCALE writes carry explicit author-decision
        // safeguards (pins, approve routing, CAS) — see putScalePolicy.
        return putScalePolicy({
          actorUserId, workspaceId, novelId, hardness, hardReason: reason, payload,
          ...scaleCtx,
        });
      }

      // NF-WF-050B: ALL policy puts — including non-SCALE — lock and advance
      // the CHECKED-OUT branch, not main. A non-SCALE HARD edit on branch B
      // must advance B; the old main-only wrapper would leave a false fresh
      // PASS on B. Non-SCALE payload/capability/error semantics unchanged.
      const row = await withCheckedOutBranchRevision(
        { workspaceId, novelId, actorUserId },
        "policy.write",
        "NarrativePolicy",
        ["narrative_policies"],
        (tx) => tx.narrativePolicy.upsert({
          where: { novelId_kind: { novelId, kind } },
          update: { hardness, hardReason: reason, payload: payload as InputJsonValue },
          create: { novelId, kind, hardness, hardReason: reason, payload: payload as InputJsonValue },
        }),
        { itemOperation: "UPDATE" },
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "narrative.policy-set",
        entityType: "NarrativePolicy",
        entityId: row.id,
        payload: { kind, hardness },
      });
      return toPolicyView(row);
    },

    async deletePolicy({ actorUserId, workspaceId, novelId, kind, ...scaleCtx }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      // NF-WF-050B: direct SCALE deletion carries the same context/reason
      // safeguards as SCALE PUT (minus payload/authorDecision) — no
      // novel-global deletion via an unpinned empty-body request.
      if (kind === "SCALE") {
        return deleteScalePolicy({ actorUserId, workspaceId, novelId, ...scaleCtx });
      }
      // Read the id first: audit_log.entity_id is @db.Uuid, so the composite
      // (novelId, kind) this row is keyed by cannot be the audit reference.
      const existing = await db.narrativePolicy.findUnique({
        where: { novelId_kind: { novelId, kind } },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError("narrative policy");
      // NF-WF-050B: ALL policy deletes — including non-SCALE — lock and
      // advance the CHECKED-OUT branch. The old path advanced main with no
      // branch lock, so a non-SCALE HARD delete on branch B kept a false
      // fresh PASS on B. deleteMany with the novel-scoped predicate: count 0
      // = lost a concurrent-delete race, which is the same 404 (and P2025
      // impossible). The count check is INSIDE the transaction: a 404 thrown
      // after the commit would leave a revision for a delete that deleted
      // nothing (C4).
      await withCheckedOutBranchRevision(
        { workspaceId, novelId, actorUserId },
        "policy.write",
        "NarrativePolicy",
        ["narrative_policies"],
        async (tx) => {
          const deleted = await tx.narrativePolicy.deleteMany({
            where: { id: existing.id, novelId },
          });
          if (deleted.count === 0) throw new NotFoundError("narrative policy");
          return { id: existing.id };
        },
        { entityId: existing.id, itemOperation: "DELETE" },
      );
      await audit.record({
        actorUserId,
        workspaceId,
        action: "narrative.policy-deleted",
        entityType: "NarrativePolicy",
        entityId: existing.id,
        payload: { kind },
      });
    },

    // --- Rhythm rules -----------------------------------------------------

    async assessWindow({ actorUserId, workspaceId, novelId, chaptersSinceDrama }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const row = await policyRow(novelId, "DRAMA_GAP");
      // No row = no agreed pacing. Inventing one would plan distant chapters
      // at a detail level the author never chose (ADR-0011 §2).
      if (!row) throw new ConflictError("this novel has no DRAMA_GAP policy");
      const result = assessDramaWindow({ policy: row.payload as never, chaptersSinceDrama });
      if ("problem" in result) throw new ConflictError(`drama gap policy invalid: ${result.problem}`);
      return result;
    },

    async checkBeat({ actorUserId, workspaceId, novelId, candidate, history }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const row = await policyRow(novelId, "COOLDOWN");
      // No row = the author never set a window. Defaulting to 0 would report
      // "allowed" for a rule that was never agreed — the same silent
      // substitution assessWindow refuses (ADR-0011 §2).
      if (!row) throw new ConflictError("this novel has no COOLDOWN policy");
      // The payload column is JSONB with no CHECK, so a row written out of
      // band can carry any shape. checkCooldown reads a bad window as "no
      // cooldown configured" — a fail-OPEN on the one HARD rule — so the same
      // predicate putPolicy applies is re-applied here, and a malformed row
      // is a 409 on read rather than a silent allow.
      if (!isValidCooldownPayload(row.payload)) {
        throw new ConflictError("cooldown policy invalid: windowChapters must be a positive integer");
      }
      return checkCooldown(candidate, history, row.payload as never);
    },

    // --- Antagonists ------------------------------------------------------

    async createAntagonist({
      actorUserId, workspaceId, novelId,
      characterId, role, stage, outcome, purpose, fromChapter, toChapter,
    }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");

      // The FK alone would accept a character from another novel.
      const character = await db.character.findFirst({
        where: { id: characterId, novelId, workspaceId },
        select: { id: true },
      });
      if (!character) throw new NotFoundError("character");

      // Antagonist_chapter_span_valid, stated at the boundary. The CHECK stays
      // as the backstop.
      if (!Number.isInteger(fromChapter) || fromChapter < 1) {
        throw new ConflictError("an antagonist must start at chapter 1 or later");
      }
      if (toChapter !== null && toChapter < fromChapter) {
        throw new ConflictError("an antagonist cannot end before it starts");
      }

      const { hard, advisory } = splitFindings(
        validateAntagonistProgression({
          role,
          stages: [stage],
          purpose,
          spanChapters: spanOf(fromChapter, toChapter),
        }),
      );
      if (hard.length > 0) throw new ConflictError(hard.map((e) => e.message).join("; "));

      let created;
      try {
        created = await withRevision(
          { workspaceId, novelId, actorUserId },
          "antagonist.create",
          "Antagonist",
          ["antagonists"],
          (tx) => tx.antagonist.create({
            data: {
              workspaceId, novelId, characterId, role, stage, outcome,
              purpose: purpose?.trim() || null, fromChapter, toChapter,
              createdById: actorUserId,
            },
          }),
        );
      } catch (error) {
        // antagonists_novel_id_character_id_key.
        if ((error as { code?: string })?.code === "P2002") {
          throw new ConflictError("this character is already cast as an antagonist in this novel");
        }
        throw error;
      }
      await audit.record({
        actorUserId,
        workspaceId,
        action: "narrative.antagonist-cast",
        entityType: "Antagonist",
        entityId: created.id,
        payload: { characterId, role, fromChapter, toChapter },
      });
      return { antagonist: toAntagonistView(created), advisory };
    },

    async listAntagonists({ actorUserId, workspaceId, novelId }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      const rows = await db.antagonist.findMany({
        where: { novelId, workspaceId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toAntagonistView);
    },

    /**
     * Move the antagonist one stage forward.
     *
     * The stored row keeps only the CURRENT stage, so the check runs over
     * `[current, next]` — which is exactly what makes a backward or repeated
     * move visible. A progression that arrived as a list would hide it; the
     * database cannot hold a list, so the pair is the honest reconstruction.
     */
    async advanceAntagonistStage({ actorUserId, workspaceId, novelId, antagonistId, stage, outcome }) {
      await gate(actorUserId, workspaceId, novelId, "canon:manage");
      const current = await requireAntagonist(antagonistId, novelId, workspaceId);

      const { hard, advisory } = splitFindings(
        validateAntagonistProgression({
          role: current.role as AntagonistRole,
          stages: [current.stage as AntagonistStage, stage],
          purpose: current.purpose,
          spanChapters: spanOf(current.fromChapter, current.toChapter),
        }),
      );
      if (hard.length > 0) throw new ConflictError(hard.map((e) => e.message).join("; "));

      // The stage guard is the concurrency control, not decoration. The read
      // above and this write are not atomic, so two concurrent advances both
      // see the same `current.stage` and both pass the forward-only check;
      // without the predicate the loser's write lands on top of the winner's
      // and stores a BACKWARD transition the rule exists to reject. Pinning
      // `stage` to the value the check actually ran against makes the second
      // writer a no-op, and its count says so.
      // The stage guard and the revision share ONE transaction: the revision
      // must not commit for an advance the guard refused, and the guard must
      // not pass while the revision it describes rolls back (C4).
      await db.$transaction(async (tx) => {
        const { count } = await tx.antagonist.updateMany({
          where: { id: antagonistId, novelId, workspaceId, stage: current.stage },
          // Only touch outcome when the caller said something about it: an
          // omitted field must not wipe an outcome already recorded.
          data: { stage, ...(outcome === undefined ? {} : { outcome }) },
        });
        if (count === 0) {
          throw new ConflictError(
            `antagonist stage changed while this request was in flight; it is no longer ${current.stage}`,
          );
        }
        await advanceForMutation(tx, {
          workspaceId,
          novelId,
          operation: "antagonist.advance",
          origin: "MANUAL",
          actorUserId,
          tables: ["antagonists"],
          items: [{ entityType: "Antagonist", entityId: antagonistId, operation: "UPDATE" }],
        });
      });

      const updated = {
        ...current,
        stage,
        outcome: outcome === undefined ? current.outcome : outcome,
      };
      await audit.record({
        actorUserId,
        workspaceId,
        action: "narrative.antagonist-stage-advanced",
        entityType: "Antagonist",
        entityId: antagonistId,
        payload: { from: current.stage, to: stage, outcome: updated.outcome },
      });
      return { antagonist: toAntagonistView(updated), advisory };
    },

    // --- Advisory rules ---------------------------------------------------

    async detectPattern({ actorUserId, workspaceId, novelId, beats, sequence, minOccurrences }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      return detectRepeatedSequence(beats, sequence, minOccurrences);
    },

    async assessScale({ actorUserId, workspaceId, novelId, proposal, standing }) {
      await gate(actorUserId, workspaceId, novelId, "canon:read");
      return assessScaleAppropriateness(proposal, standing);
    },
  };
}
