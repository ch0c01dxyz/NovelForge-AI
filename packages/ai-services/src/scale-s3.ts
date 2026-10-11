/**
 * NF-WF-050C — optional S3 SCALE proposal assistance.
 *
 * Per-novel, off-by-default AI proposals over the pinned SCALE review
 * context. Two operations:
 * - EXTRACT_CLAIM: bounded extraction proposals from the pinned chapter
 *   text, stored as INERT untrusted suggestions. Consumption is an explicit
 *   author decision through the existing 050A `appendSet` boundary (the
 *   author's own session, full pins re-read fresh); this service never
 *   writes evidence, standing, policy or any story table.
 * - MISSING_DATA_ADVICE: transient elaboration of the deterministic 050B
 *   checklist items. NEVER persisted as a row — response body only, so
 *   stale advice cannot be resurrected.
 *
 * Invariants (ADR-0016 / ADR-0015):
 * - Disabled S3 (or any precondition failure) → ZERO model calls.
 * - All model calls go through the one sanctioned `AiServices.generate`
 *   path (profile STRUCTURED_EXTRACTOR, task "scale.extract", component
 *   OTHER) so NF049 attribution is automatic.
 * - Model output is untrusted: strict validation, byte-for-byte quote/span
 *   re-verification against the pinned version content, fail-closed.
 * - `reportedModel` comes from GenerationAttempt.reportedModelId (verbatim
 *   or null) — never from generate()'s return `model`, which silently falls
 *   back to the requested model id when the gateway omits its own.
 * - No lock is held across the model call. Pins are read under the
 *   appendSet lock order (novel NO KEY UPDATE → branch UPDATE → chapter
 *   UPDATE) in transaction 1, and re-read identically in transaction 2
 *   before storing; a pin set that never coexisted is never stored.
 */
import type { InputJsonValue, NovelForgeDb } from "@novelforge/database";
import { requireCapability, type Capability } from "@novelforge/auth/authorization";
import {
  NotFoundError,
  ConflictError,
  type AuditService,
  type AiServices,
} from "@novelforge/ai-services";
import { verifySpan } from "@novelforge/story-intelligence";
import { verifyEvidenceQuote } from "./manuscript.ts";
import { fingerprintScalePolicy } from "./scale-review-types.ts";
import { ScaleS3Error } from "./scale-s3-errors.ts";
import { isRecord } from "./type-guards.ts";
import type {
  ScaleEvidenceClaim,
  NarrativeScaleInput,
  ScaleS3PinSnapshot,
} from "./scale-s3-types.ts";

// Re-declared locally to avoid importing private enums; same frozen values.
const NARRATIVE_SCALES = [
  "OBJECT",
  "PERSON",
  "FAMILY",
  "GROUP",
  "SETTLEMENT",
  "REGION",
  "KINGDOM",
  "EMPIRE",
] as const;
const CLAIM_RELEVANCE = ["ACTION", "STAKES", "CONSEQUENCE"] as const;
const MAX_CLAIMS = 100;
const MAX_EXPLANATION_LENGTH = 4000;
const MAX_QUOTE_LENGTH = 2000;
const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 50;

type PrismaInputJsonValue = InputJsonValue;

/** Transaction client surface Prisma hands to $transaction callbacks. */
export interface ScaleS3Tx {
  $queryRawUnsafe: NovelForgeDb["$queryRawUnsafe"];
  novel: NovelForgeDb["novel"];
  novelBranch: NovelForgeDb["novelBranch"];
  chapter: NovelForgeDb["chapter"];
  chapterVersion: NovelForgeDb["chapterVersion"];
  scaleEvidenceSet: NovelForgeDb["scaleEvidenceSet"];
  narrativePolicy: NovelForgeDb["narrativePolicy"];
  novelSettings: NovelForgeDb["novelSettings"];
  scaleS3Proposal: NovelForgeDb["scaleS3Proposal"];
}

export interface ScaleS3Deps {
  db: NovelForgeDb;
  audit: AuditService;
  /** Only the sanctioned non-streaming generation path is used. */
  ai: Pick<AiServices, "generate">;
}

export interface ScaleS3Expectations {
  chapterVersionId: string;
  expectedBranchId: string;
  expectedHeadRevisionId: string | null;
  expectedSetId: string | null;
  expectedPolicyFingerprint: string;
}

export interface ExtractInput extends ScaleS3Expectations {
  actorUserId: string;
  workspaceId: string;
  novelId: string;
  chapterId: string;
}

export interface ScaleS3ProposalView {
  id: string;
  chapterId: string;
  chapterVersionId: string;
  policyFingerprint: string;
  claims: ScaleEvidenceClaim[];
  generationId: string | null;
  reportedModel: string | null;
  requestedByUserId: string;
  dismissedByUserId: string | null;
  dismissedReason: string | null;
  dismissedAt: Date | null;
  createdAt: Date;
  stale: boolean;
}

export interface ScaleS3SettingView {
  enabled: boolean;
}

/**
 * Strict per-key read of the NovelSettings JSON bag. Malformed `scaleS3`
 * is treated as disabled (logged diagnostic, never a model call); unknown
 * sibling keys are never touched by the writer.
 */
export function readScaleS3Setting(settings: unknown): boolean {
  if (!isRecord(settings)) return false;
  const s3 = settings.scaleS3;
  if (s3 === undefined) return false;
  if (!isRecord(s3)) return false;
  return s3.enabled === true;
}

/** Fail-closed validation of one model-proposed claim against pinned content. */
function validateProposedClaim(
  raw: unknown,
  content: string,
  index: number,
): ScaleEvidenceClaim {
  const where = `claims[${index}]`;
  if (!isRecord(raw)) throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where} must be an object`);
  const allowedClaimKeys = new Set(["scale", "relevance", "explanation", "source"]);
  for (const key of Object.keys(raw)) {
    if (!allowedClaimKeys.has(key))
      throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where} has unknown field: ${key}`);
  }
  if (
    typeof raw.scale !== "string" ||
    !(NARRATIVE_SCALES as readonly string[]).includes(raw.scale)
  )
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.scale is not a narrative scale`);
  if (
    typeof raw.relevance !== "string" ||
    !(CLAIM_RELEVANCE as readonly string[]).includes(raw.relevance)
  )
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.relevance must be ACTION, STAKES or CONSEQUENCE`);
  if (typeof raw.explanation !== "string" || raw.explanation.trim().length === 0)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.explanation is required`);
  const explanation = raw.explanation.trim();
  if (explanation.length > MAX_EXPLANATION_LENGTH)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.explanation too long`);

  if (!isRecord(raw.source))
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source must be an object`);
  const allowedSourceKeys = new Set(["start", "end", "quote"]);
  for (const key of Object.keys(raw.source)) {
    if (!allowedSourceKeys.has(key))
      throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source has unknown field: ${key}`);
  }
  const { start, end, quote } = raw.source;
  if (typeof start !== "number" || typeof end !== "number")
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source offsets must be numbers`);
  if (!verifySpan(content, start, end))
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source offsets do not describe a range in the chapter version`);
  if (typeof quote !== "string" || quote.trim().length === 0)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source.quote is required`);
  const trimmedQuote = quote.trim();
  if (trimmedQuote.length > MAX_QUOTE_LENGTH)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source.quote too long`);
  if (!verifyEvidenceQuote(content, start, end, trimmedQuote))
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source.quote does not match the span in the chapter version`);
  const spanText = content.slice(start, end).replace(/<[^>]*>/g, "").trim();
  if (spanText.length === 0)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `${where}.source span has no prose text`);

  return {
    scale: raw.scale as NarrativeScaleInput,
    relevance: raw.relevance as ScaleEvidenceClaim["relevance"],
    explanation,
    source: { start, end, quote: trimmedQuote },
  };
}

/** Parse the model's JSON answer strictly; any deviation is 422, never stored. */
function parseModelClaims(content: string, pinnedContent: string): ScaleEvidenceClaim[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", "model output is not valid JSON");
  }
  if (!isRecord(parsed)) throw new ScaleS3Error("S3_INVALID_PROPOSAL", "model output must be an object");
  const allowed = new Set(["claims"]);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key))
      throw new ScaleS3Error("S3_INVALID_PROPOSAL", `model output has unknown field: ${key}`);
  }
  const claims = parsed.claims;
  if (!Array.isArray(claims))
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", "model output claims must be an array");
  if (claims.length > MAX_CLAIMS)
    throw new ScaleS3Error("S3_INVALID_PROPOSAL", `model output exceeds ${MAX_CLAIMS} claims`);
  return claims.map((c, i) => validateProposedClaim(c, pinnedContent, i));
}

/**
 * Read + lock the full pin set under the appendSet lock order. Returns the
 * post-lock authoritative pin snapshot. Caller must run inside a
 * RepeatableRead transaction; locks are held only for this read.
 */
async function readPinsUnderLock(
  tx: ScaleS3Tx,
  input: { workspaceId: string; novelId: string; chapterId: string; chapterVersionId: string },
): Promise<ScaleS3PinSnapshot> {
  await tx.$queryRawUnsafe(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE`, input.novelId);
  const lockedNovel = await tx.novel.findUniqueOrThrow({
    where: { id: input.novelId },
    select: { currentBranchId: true, workspaceId: true },
  });
  if (lockedNovel.workspaceId !== input.workspaceId) throw new NotFoundError("novel");
  const branch = await tx.novelBranch.findFirst({
    where: lockedNovel.currentBranchId
      ? { id: lockedNovel.currentBranchId, novelId: input.novelId }
      : { novelId: input.novelId, name: "main" },
    select: { id: true },
  });
  if (!branch) throw new ConflictError("no checked-out branch exists");
  const [lockedBranch] = await tx.$queryRawUnsafe<
    { id: string; head_revision_id: string | null }[]
  >(`SELECT id, head_revision_id FROM novel_branches WHERE id = $1 FOR UPDATE`, branch.id);
  if (!lockedBranch) throw new ConflictError("no checked-out branch exists");
  const [lockedChapter] = await tx.$queryRawUnsafe<
    { id: string; current_version_id: string | null }[]
  >(`SELECT id, current_version_id FROM chapters WHERE id = $1 FOR UPDATE`, input.chapterId);
  if (!lockedChapter) throw new NotFoundError("chapter");

  const version = await tx.chapterVersion.findFirst({
    where: {
      id: input.chapterVersionId,
      chapterId: input.chapterId,
      chapter: { novelId: input.novelId, novel: { workspaceId: input.workspaceId } },
    },
    select: { id: true },
  });
  if (!version) throw new NotFoundError("chapter version");

  const latestSet = await tx.scaleEvidenceSet.findFirst({
    where: {
      sourceBranchId: lockedBranch.id,
      chapterVersionId: input.chapterVersionId,
    },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });
  const policy = await tx.narrativePolicy.findUnique({
    where: { novelId_kind: { novelId: input.novelId, kind: "SCALE" } },
    select: { id: true, kind: true, hardness: true, hardReason: true, payload: true },
  });

  return {
    branchId: lockedBranch.id,
    headRevisionId: lockedBranch.head_revision_id,
    currentVersionId: lockedChapter.current_version_id,
    policyFingerprint: fingerprintScalePolicy(policy),
    latestSetId: latestSet?.id ?? null,
  };
}

function assertExpectations(
  pins: ScaleS3PinSnapshot,
  expected: ScaleS3Expectations,
): void {
  if (pins.currentVersionId !== expected.chapterVersionId)
    throw new ConflictError("chapter version is no longer current");
  if (pins.branchId !== expected.expectedBranchId)
    throw new ConflictError("checked-out branch changed");
  if (pins.headRevisionId !== expected.expectedHeadRevisionId)
    throw new ConflictError("branch head changed");
  if (pins.latestSetId !== expected.expectedSetId)
    throw new ConflictError("evidence set changed");
  if (pins.policyFingerprint !== expected.expectedPolicyFingerprint)
    throw new ConflictError("SCALE policy changed");
}

export function createScaleS3Services(deps: ScaleS3Deps): ScaleS3Services {
  const { db, audit, ai } = deps;

  /** Membership gate (404 non-members) + capability enforcement. */
  async function requireNovelMembership(
    workspaceId: string,
    novelId: string,
    actorUserId: string,
    capabilities: Capability[],
  ) {
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
      select: { id: true, role: true },
    });
    if (!membership) throw new NotFoundError("novel");
    for (const capability of capabilities) requireCapability(membership.role, capability);
    const novel = await db.novel.findFirst({
      where: { id: novelId, workspaceId },
      select: { id: true },
    });
    if (!novel) throw new NotFoundError("novel");
  }

  async function assertS3Enabled(tx: ScaleS3Tx, novelId: string): Promise<void> {
    const settingsRow = await tx.novelSettings.findUnique({
      where: { novelId },
      select: { settings: true },
    });
    if (!readScaleS3Setting(settingsRow?.settings))
      throw new ScaleS3Error("S3_DISABLED", "SCALE S3 assistance is not enabled for this novel");
  }

  async function assertPolicyConfigured(
    tx: ScaleS3Tx,
    novelId: string,
  ): Promise<void> {
    const policy = await tx.narrativePolicy.findUnique({
      where: { novelId_kind: { novelId, kind: "SCALE" } },
      select: { id: true },
    });
    if (!policy) throw new ScaleS3Error("S3_NOT_CONFIGURED", "no SCALE policy is configured for this novel");
  }

  return {
    /** GET setting (chapter:read AND canon:read). */
    async getSetting(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
    }): Promise<ScaleS3SettingView> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);
      const row = await db.novelSettings.findUnique({
        where: { novelId: input.novelId },
        select: { settings: true },
      });
      return { enabled: readScaleS3Setting(row?.settings) };
    },

    /** PUT setting (canon:manage, deliberately stricter than novel:update). */
    async putSetting(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      enabled: boolean;
      reason: string;
    }): Promise<ScaleS3SettingView> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "canon:manage",
      ]);
      const reason = input.reason.trim();
      if (reason.length === 0 || reason.length > 4000)
        throw new ConflictError("reason must be 1..4000 characters");
      await db.$transaction(async (tx) => {
        const existing = await tx.novelSettings.findUnique({
          where: { novelId: input.novelId },
          select: { settings: true },
        });
        const base = isRecord(existing?.settings) ? existing!.settings : {};
        const next = { ...base, scaleS3: { enabled: input.enabled } };
        await tx.novelSettings.upsert({
          where: { novelId: input.novelId },
          create: { novelId: input.novelId, settings: next },
          update: { settings: next },
        });
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "novel.scale-s3-settings-changed",
        entityType: "Novel",
        entityId: input.novelId,
        payload: { enabled: input.enabled, reason },
      });
      return { enabled: input.enabled };
    },

    /**
     * POST extract. Phase 1 transaction: gate + read pins under locks.
     * Model call OUTSIDE any transaction. Phase 2 transaction: re-validate
     * pins byte-identically, then store the inert proposal row.
     */
    async extract(input: ExtractInput): Promise<{ proposal: ScaleS3ProposalView }> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);

      // Phase 1: pins + enablement + policy presence under the lock order.
      const phase1 = await db.$transaction(async (tx) => {
        await assertS3Enabled(tx, input.novelId);
        await assertPolicyConfigured(tx, input.novelId);
        const pins = await readPinsUnderLock(tx, input);
        assertExpectations(pins, input);
        const version = await tx.chapterVersion.findUniqueOrThrow({
          where: { id: input.chapterVersionId },
          select: { content: true },
        });
        return { pins, content: version.content };
      });

      // Model call: the ONLY sanctioned path (AiServices.generate), so the
      // Generation/attempt ledger and generation:create gate are automatic.
      const result = await ai.generate({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        task: "scale.extract",
        component: "OTHER",
        artifactId: input.chapterVersionId,
        profile: "STRUCTURED_EXTRACTOR",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You extract structured narrative-scale conflict claims from a chapter. " +
              'Reply with ONLY minified JSON: {"claims":[{"scale":string,"relevance":"ACTION"|"STAKES"|"CONSEQUENCE","explanation":string,"source":{"start":int,"end":int,"quote":string}}]}. ' +
              "start/end are UTF-16 code-unit offsets into the exact provided text; quote must be the exact text between them. " +
              "Do not invent text that is not in the chapter. Do not add commentary.",
          },
          {
            role: "user",
            content: `Chapter text (offsets are into this exact string):\n${phase1.content}`,
          },
        ],
      });

      // Fail-closed validation against the pinned content.
      const claims = parseModelClaims(result.content, phase1.content);

      // reportedModel from the attempt ledger, verbatim or null — NEVER
      // result.model (request-model fallback is not reported identity).
      const attempt = await db.generationAttempt.findFirst({
        where: { generationId: result.generationId },
        orderBy: { attemptNumber: "desc" },
        select: { reportedModelId: true },
      });

      // Phase 2: re-validate pins byte-identically; store only a pin set
      // that still coexists. Any mismatch discards the row (409 stale).
      const stored = await db.$transaction(async (tx) => {
        await assertS3Enabled(tx, input.novelId);
        const pins = await readPinsUnderLock(tx, input);
        assertExpectations(pins, input);
        return tx.scaleS3Proposal.create({
          data: {
            workspaceId: input.workspaceId,
            novelId: input.novelId,
            chapterId: input.chapterId,
            chapterVersionId: input.chapterVersionId,
            sourceBranchId: pins.branchId,
            sourceRevisionId: pins.headRevisionId,
            evidenceSetId: pins.latestSetId,
            policyFingerprint: pins.policyFingerprint,
            kind: "EXTRACT_CLAIM",
            payload: { claims } as unknown as PrismaInputJsonValue,
            generationId: result.generationId,
            reportedModel: attempt?.reportedModelId ?? null,
            requestedByUserId: input.actorUserId,
          },
        });
      });

      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "novel.scale-s3-extract",
        entityType: "ScaleS3Proposal",
        entityId: stored.id,
        payload: { claims: claims.length },
      });

      return {
        proposal: {
          id: stored.id,
          chapterId: stored.chapterId,
          chapterVersionId: stored.chapterVersionId,
          policyFingerprint: stored.policyFingerprint,
          claims,
          generationId: stored.generationId,
          reportedModel: stored.reportedModel,
          requestedByUserId: stored.requestedByUserId,
          dismissedByUserId: null,
          dismissedReason: null,
          dismissedAt: null,
          createdAt: stored.createdAt,
          stale: false,
        },
      };
    },

    /**
     * Advice gate: 401/404/403 handled by requireNovelMembership; then
     * S3_DISABLED → S3_NOT_CONFIGURED → stale pins. The route runs this
     * BEFORE its receipt-INCOMPLETE check so refusal codes follow the
     * frozen gate order.
     */
    async gateAdvice(input: ExtractInput): Promise<void> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);
      await db.$transaction(async (tx) => {
        await assertS3Enabled(tx, input.novelId);
        await assertPolicyConfigured(tx, input.novelId);
        const pins = await readPinsUnderLock(tx, input);
        assertExpectations(pins, input);
      });
    },

    async advise(input: ExtractInput & { missingData: Array<Record<string, unknown>> }): Promise<{
      items: Array<Record<string, unknown>>;
    }> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);

      // Pin validation + pinned text read (no lock across the model call).
      const pinnedContent = await db.$transaction(async (tx) => {
        await assertS3Enabled(tx, input.novelId);
        await assertPolicyConfigured(tx, input.novelId);
        const pins = await readPinsUnderLock(tx, input);
        assertExpectations(pins, input);
        const version = await tx.chapterVersion.findUniqueOrThrow({
          where: { id: input.chapterVersionId },
          select: { content: true },
        });
        return version.content;
      });

      if (input.missingData.length === 0)
        throw new ConflictError("no incomplete missing-data items to advise on");

      const result = await ai.generate({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        novelId: input.novelId,
        task: "scale.extract",
        component: "OTHER",
        artifactId: input.chapterVersionId,
        profile: "STRUCTURED_EXTRACTOR",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You elaborate missing-data guidance for a SCALE evidence checklist. " +
              'Reply with ONLY minified JSON: {"items":[{"code":string,"field":string,"reason":string,"explanation":string,"example":string,"nextAction":string}]}. ' +
              "Every item must keep the SAME code and field as the input checklist. Examples are hypothetical; never state them as novel facts.",
          },
          {
            role: "user",
            content: `Checklist items:\n${JSON.stringify(input.missingData)}\n\nChapter text:\n${pinnedContent}`,
          },
        ],
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        throw new ScaleS3Error("S3_INVALID_PROPOSAL", "advice output is not valid JSON");
      }
      if (!isRecord(parsed) || !Array.isArray(parsed.items))
        throw new ScaleS3Error("S3_INVALID_PROPOSAL", "advice output must contain an items array");
      if (parsed.items.length > MAX_CLAIMS)
        throw new ScaleS3Error("S3_INVALID_PROPOSAL", `advice output exceeds ${MAX_CLAIMS} items`);
      const allowedCodes = new Set(input.missingData.map((m) => String(m.code)));
      const allowedAdviceKeys = new Set(["code", "field", "reason", "explanation", "example", "nextAction"]);
      const requiredAdviceKeys = ["code", "field", "reason", "explanation", "example", "nextAction"] as const;
      const MAX_ADVICE_FIELD = 4000;
      const items = parsed.items.map((raw: unknown) => {
        if (!isRecord(raw)) throw new ScaleS3Error("S3_INVALID_PROPOSAL", "advice item must be an object");
        if (!allowedCodes.has(String(raw.code)))
          throw new ScaleS3Error("S3_INVALID_PROPOSAL", "advice item fabricates a checklist code");
        for (const key of Object.keys(raw)) {
          if (!allowedAdviceKeys.has(key))
            throw new ScaleS3Error("S3_INVALID_PROPOSAL", `advice item has unknown field: ${key}`);
        }
        for (const key of requiredAdviceKeys) {
          const v = raw[key];
          if (typeof v !== "string" || v.trim().length === 0 || v.length > MAX_ADVICE_FIELD) {
            throw new ScaleS3Error("S3_INVALID_PROPOSAL", `advice item ${key} must be a nonempty string of at most ${MAX_ADVICE_FIELD} characters`);
          }
        }
        return raw;
      });
      return { items };
    },

    /** Paginated proposal list (chapter+version-scoped), stale-marked. */
    async list(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      chapterId: string;
      chapterVersionId: string;
      before?: string;
      beforeId?: string;
      limit?: number;
    }): Promise<{ items: ScaleS3ProposalView[]; nextBefore: string | null; nextBeforeId: string | null }> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);
      const limit = Math.min(input.limit ?? LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
      const cursorOk = input.before !== undefined && input.beforeId !== undefined;
      const rows = await db.scaleS3Proposal.findMany({
        where: {
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterVersionId: input.chapterVersionId,
          ...(cursorOk
            ? {
                OR: [
                  { createdAt: { lt: new Date(input.before!) } },
                  {
                    createdAt: { equals: new Date(input.before!) },
                    id: { lt: input.beforeId! },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];

      // Stale marking: recompute the live pin set once (read-only context,
      // no locks needed for advisory marking). ALL stored pins participate:
      // branch, head revision, version, evidence set and policy fingerprint.
      const live = await db.$transaction(async (tx) => {
        const novel = await tx.novel.findFirst({
          where: { id: input.novelId, workspaceId: input.workspaceId },
          select: { currentBranchId: true },
        });
        if (!novel) return null;
        const branch = await tx.novelBranch.findFirst({
          where: novel.currentBranchId
            ? { id: novel.currentBranchId, novelId: input.novelId }
            : { novelId: input.novelId, name: "main" },
          select: { id: true, headRevisionId: true },
        });
        if (!branch) return null;
        const latestSet = await tx.scaleEvidenceSet.findFirst({
          where: {
            sourceBranchId: branch.id,
            chapterVersionId: input.chapterVersionId,
          },
          orderBy: { sequence: "desc" },
          select: { id: true },
        });
        const policy = await tx.narrativePolicy.findUnique({
          where: { novelId_kind: { novelId: input.novelId, kind: "SCALE" } },
          select: { id: true, kind: true, hardness: true, hardReason: true, payload: true },
        });
        return {
          branchId: branch.id,
          headRevisionId: branch.headRevisionId,
          latestSetId: latestSet?.id ?? null,
          policyFingerprint: fingerprintScalePolicy(policy),
        };
      });

      const items: ScaleS3ProposalView[] = page.map((r) => ({
        id: r.id,
        chapterId: r.chapterId,
        chapterVersionId: r.chapterVersionId,
        policyFingerprint: r.policyFingerprint,
        claims: (r.payload as unknown as { claims: ScaleEvidenceClaim[] }).claims,
        generationId: r.generationId,
        reportedModel: r.reportedModel,
        requestedByUserId: r.requestedByUserId,
        dismissedByUserId: r.dismissedByUserId,
        dismissedReason: r.dismissedReason,
        dismissedAt: r.dismissedAt,
        createdAt: r.createdAt,
        stale:
          live === null ||
          r.sourceBranchId !== live.branchId ||
          r.sourceRevisionId !== live.headRevisionId ||
          r.chapterVersionId !== input.chapterVersionId ||
          r.evidenceSetId !== live.latestSetId ||
          r.policyFingerprint !== live.policyFingerprint,
      }));
      return {
        items,
        nextBefore: hasMore && last ? last.createdAt.toISOString() : null,
        nextBeforeId: hasMore && last ? last.id : null,
      };
    },

    /** POST dismiss — the recorded author rejection (idempotent). */
    async dismiss(input: {
      actorUserId: string;
      workspaceId: string;
      novelId: string;
      chapterId: string;
      proposalId: string;
      reason: string;
    }): Promise<ScaleS3ProposalView> {
      await requireNovelMembership(input.workspaceId, input.novelId, input.actorUserId, [
        "chapter:read",
        "canon:read",
      ]);
      const reason = input.reason.trim();
      if (reason.length === 0 || reason.length > 4000)
        throw new ConflictError("reason must be 1..4000 characters");
      const row = await db.scaleS3Proposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          novelId: input.novelId,
          chapterId: input.chapterId,
        },
      });
      if (!row) throw new NotFoundError("proposal");
      if (row.dismissedByUserId !== null) {
        // Idempotent: return the existing recorded decision, no second write.
        return toView(row, false);
      }
      // CAS guard: only a still-undismissed row is updated, so two
      // concurrent dismissals cannot overwrite the first recorded decision.
      const cas = await db.scaleS3Proposal.updateMany({
        where: { id: row.id, dismissedByUserId: null },
        data: {
          dismissedByUserId: input.actorUserId,
          dismissedReason: reason,
          dismissedAt: new Date(),
        },
      });
      if (cas.count === 0) {
        // Lost the race: return the winner's recorded decision.
        const winner = await db.scaleS3Proposal.findUniqueOrThrow({
          where: { id: row.id },
        });
        return toView(winner, false);
      }
      const updated = await db.scaleS3Proposal.findUniqueOrThrow({
        where: { id: row.id },
      });
      await audit.record({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "novel.scale-s3-dismissed",
        entityType: "ScaleS3Proposal",
        entityId: updated.id,
        payload: { reason },
      });
      return toView(updated, false);
    },
  };
}

function toView(
  r: {
    id: string;
    chapterId: string;
    chapterVersionId: string;
    policyFingerprint: string;
    payload: unknown;
    generationId: string | null;
    reportedModel: string | null;
    requestedByUserId: string;
    dismissedByUserId: string | null;
    dismissedReason: string | null;
    dismissedAt: Date | null;
    createdAt: Date;
  },
  stale: boolean,
): ScaleS3ProposalView {
  return {
    id: r.id,
    chapterId: r.chapterId,
    chapterVersionId: r.chapterVersionId,
    policyFingerprint: r.policyFingerprint,
    claims: (r.payload as { claims: ScaleEvidenceClaim[] }).claims,
    generationId: r.generationId,
    reportedModel: r.reportedModel,
    requestedByUserId: r.requestedByUserId,
    dismissedByUserId: r.dismissedByUserId,
    dismissedReason: r.dismissedReason,
    dismissedAt: r.dismissedAt,
    createdAt: r.createdAt,
    stale,
  };
}

export interface ScaleS3Services {
  getSetting(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<ScaleS3SettingView>;
  putSetting(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    enabled: boolean;
    reason: string;
  }): Promise<ScaleS3SettingView>;
  extract(input: ExtractInput): Promise<{ proposal: ScaleS3ProposalView }>;
  advise(
    input: ExtractInput & { missingData: Array<Record<string, unknown>> },
  ): Promise<{ items: Array<Record<string, unknown>> }>;
  gateAdvice(input: ExtractInput): Promise<void>;
  list(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    chapterVersionId: string;
    before?: string;
    beforeId?: string;
    limit?: number;
  }): Promise<{ items: ScaleS3ProposalView[]; nextBefore: string | null; nextBeforeId: string | null }>;
  dismiss(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapterId: string;
    proposalId: string;
    reason: string;
  }): Promise<ScaleS3ProposalView>;
}
