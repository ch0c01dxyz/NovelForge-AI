/**
 * @novelforge/ai-services — shared AI service factories (NF-WF-026, GAP-028).
 *
 * Moved verbatim from `apps/api/src` so the production worker
 * (`apps/worker`) can construct the real AI path (generate / retrieval /
 * compiler) without importing from `apps/api/src` (NF-WF-004 forbidden
 * path).
 *
 * Dependency direction: ai-services → database, ai-core, auth,
 * retrieval, shared, story-*, workflow-executor, memory, planning,
 * character-intelligence, relationship-intelligence, narrative-rhythm.
 * Never the reverse. This package must not import from `apps/api/src`.
 */

// Core AI path
export {
  createAiServices,
  type AiServices,
  PLATFORM_AUDIT_ACTIONS,
  WORKSPACE_AUDIT_ACTIONS,
} from "./src/ai.ts";
export { createRetrievalServices, type RetrievalServices } from "./src/retrieval.ts";
export {
  fetchAndCompileContext,
  renderContextText,
  compileContext,
  emptyCompilerRows,
  CAST_LIMIT,
  FACT_LIMIT,
  TIERS,
  HeadConflictError,
  type CompiledContext,
  type CompilerInput,
  type ResolvedCompilerInput,
  type CompilerPorts,
  type CompilerCanonPort,
  type CompilerCharacterPort,
  type CompilerHeadPort,
  type CompilerNarrativePort,
  type CompilerPlanningPort,
  type CompilerRelationshipPort,
  type CompilerRetrievalPort,
  type CompilerStateAssemblyPort,
} from "./src/context-compiler.ts";

// Transitive dependencies
export { createGatewayRegistry } from "./src/ai-registry.ts";
export {
  BadGatewayError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createPlatformServices,
  type PlatformServices,
} from "./src/platform.ts";
export { createAuditService, type AuditService } from "./src/audit.ts";
export {
  BranchError,
  PublicationError,
  RateLimitError,
} from "./src/policy-errors.ts";
export { ScaleS3Error, type ScaleS3ErrorCode } from "./src/scale-s3-errors.ts";
export {
  type EvidenceFinding,
  type FindingEvidence,
  assertFindingEvidence,
} from "./src/evidence-findings.ts";
export { birthRevisionNumbers } from "./src/revision-birth.ts";

// Tier-reader factories for the compiler
export { createCanonServices, STORY_ENTITY_KINDS, type CanonServices } from "./src/canon.ts";
export { createPlanningServices, type PlanningServices } from "./src/planning.ts";
export { createCharacterServices, type CharacterServices } from "./src/characters.ts";
export { createRelationshipServices, type RelationshipServices } from "./src/relationships.ts";
export {
  createNarrativeServices,
  type NarrativeServices,
  isValidCooldownPayload,
  isValidScalePayload,
  scaleStandingOf,
} from "./src/narrative.ts";
export { createMemoryServices, type MemoryServices, MemoryError } from "./src/memory.ts";
export {
  createArcSummarizer,
  createDbArcSummarizer,
  ARC_SUMMARY_MODEL_PROFILE,
} from "./src/arc-summarizer.ts";
export { createStateAssemblyServices } from "./src/state-assembly.ts";

// Extracted helpers (see module docstrings for provenance)
export {
  readHeadRevisionId,
  checkedOutBranchId,
  assertHeadExpectation,
  advanceForMutation,
  createWithRevision,
  type RevisionTx,
  type AdvanceHeadInput,
  type AdvanceHeadResult,
} from "./src/revisions.ts";
export { verifyEvidenceQuote } from "./src/manuscript.ts";
export { appendVersionWithRetry, prismaCode } from "./src/definitions.ts";
export { PolicyError } from "./src/policy-errors.ts";

// Worker wiring
export { createWorkerAiPath, type WorkerAiPath } from "./src/worker-ai-path.ts";

// NF-WF-050A: version-bound SCALE evidence foundation
export {
  createScaleEvidenceServices,
  SCALE_EVIDENCE_SCALES,
  SCALE_CLAIM_RELEVANCE,
  ScaleEvidenceValidationError,
  type ScaleEvidenceServices,
  type ScaleEvidenceDeclaration,
  type ScaleClaimRelevance,
  type ScaleEvidenceClaim,
  type ScaleEvidenceClaimSource,
  type ScaleEvidenceSetRecord,
  type ScaleEvidenceStatus,
  type ScaleEvidenceStaleReason,
} from "./src/scale-evidence.ts";

// NF-WF-050B Slice 1: frozen SCALE review context interfaces, context reader
// and policy fingerprint
export {
  fingerprintScalePolicy,
  type ScaleReviewPins,
  type ScaleReviewClaim,
  type ScaleReviewProtocol,
  type ScalePolicySnapshot,
} from "./src/scale-review-types.ts";
export {
  readScaleContext,
  type ScaleReviewContext,
  type ScaleReviewContextTx,
} from "./src/scale-evidence.ts";

// NF-WF-050B Slice 2: S2 decision service, deterministic assessment, shared gate
export {
  assessScaleDeterministic,
  createScaleDecisionServices,
  type ScaleDecisionServices,
  type ScaleDecisionDeps,
  type AssessmentClaimInput,
  type CreateProposalInput,
  type DecideProposalInput,
  type ScaleDecisionTx,
} from "./src/scale-decisions.ts";

// NF-WF-050C: optional S3 SCALE proposal assistance
export {
  createScaleS3Services,
  readScaleS3Setting,
  type ScaleS3Services,
  type ScaleS3Deps,
  type ScaleS3Expectations,
  type ScaleS3ProposalView,
  type ScaleS3SettingView,
} from "./src/scale-s3.ts";
export {
  checkFinalTextReviewGate,
  parseScaleReviewProtocol,
  isProtocolLiveConsistent,
  isProtocolLiveStateConsistent,
  computeExpectedScaleProtocol,
  diffRetainedProof,
  checkRetainedProofCompleteness,
  resolveApplicableExceptionStrict,
  type StrictExceptionResolution,
  type GateCode,
  type GateResult,
  type ReviewGateTx,
  type ProofCompletenessResult,
} from "./src/final-text-review-gate.ts";
