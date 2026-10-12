# Task NF-WF-050C: optional S3 SCALE proposal assistance (AI extraction + missing-data advice)

Project language: English for all authored/revised artifacts; UI uses `en`/`id`
locale keys with English fallback.
Model selection: author-selected at runtime; runtime model identity recorded
only from actual gateway responses (`reportedModel`), never asserted.

Status: IMPLEMENTED / SEPARATELY REVIEWED / LIVE ACCEPTANCE WITNESSED —
2026-10-12. Contract frozen after three review rounds (round-1
CHANGES_REQUESTED 1 P1 + 3 P2 + 5 P3; round-2 CHANGES_REQUESTED 1 P1 + 3 P3;
round-3 all_addressed, two named scenarios added per its minor note). Slices
implemented at b7969de + working tree; backend slice review (7 findings, all
fixed), web slice review (1 finding, fixed), final exact-diff review of freeze
`.git/nf-050c-final-freeze-20261011.patch`
sha256 c02349c5a9e561bddd88726713b7ac4c9f54cda8b7976fa12c0290196f9918cf:
all prior findings verified resolved, two non-blocking P3 notes applied
(advice-item cap; payload comment corrected to write-time validation +
consumption-time 050A re-validation). COMMITTED as `7589388`
(author-authorized 2026-10-12; push and deployment remain author-gated).
2026-10-12 amendment 1 (findings A–D, separately reviewed, two rounds) repaired
the remaining findings at working tree; the earlier REMAINING GATE (live
extraction through a structured-extraction-capable model profile) is now
CLOSED: the 9Router catalog replaced Atria-Dawn-Preview with capable models
(`fable5`→`claude-fable-5-1`), and the live happy-path receipt was witnessed
through the real author UI on the owned acceptance stack (extraction 201,
advice 200, accept/alternative provenance, dismiss, disable, en/id). See
CURRENT 2026-10-12 and the amendment file for the exact evidence and the two
further live-found defects fixed (scale vocabulary; prompt enumeration).
Commit/push/deploy of the amendment working tree: not committed (author-gated).
Milestone / capability IDs: M3/M8; CAP-06; parent NF-WF-050; issue GAP-039 (parent gap); GAP-021 (Engram binding, fallback handoff if unavailable).
Implementer role: the dispatching controller session (one writer per file; worktree-local).
Reviewer role: separate read-only reviewer actor per slice (never the implementer session).
Readiness evidence: 050A/050B implemented, integrated, accepted (b7969de); infra inspected at b7969de (evidence below); author product decisions frozen in ADR-0016 and the parent plan.
Frozen review manifest: this file; per-slice exact-diff patches recorded in CURRENT at review time.
Baseline revision: b7969de (main). Unrelated work, `output.txt`, and stash `nf050b-acceptance-wip` (already integrated; do not reapply) preserved.
Engram checkpoint topic key: `checkpoint/nf-wf-050c/s3-assistance`. Attributed writes only under the authoritative runtime hook; otherwise fallback handoff in this task + CURRENT (GAP-021).

## Goal and reason

An author with a configured SCALE policy who enables S3 for a specific novel
gets bounded, untrusted AI proposals: (a) extraction proposals suggesting
SCALE evidence claims against the pinned chapter text, and (b) explanatory
missing-data advice for an incomplete HARD assessment. Proposals never modify
approved state; every consumption is an explicit author decision through the
existing S2/S1 boundaries. With S3 disabled (the default for every novel),
zero model calls occur and the deterministic 050B behavior is byte-identical.
This completes the retained NF-WF-050 stage 3 scope (parent plan §050C) and
is the last implementation gate GAP-039 retains before integrated acceptance.

## Required reading

- AGENTS.md; docs/06-ai/MODEL-EVIDENCE-POLICY.md; docs/06-ai/MULTI-LLM-ORCHESTRATION.md.
- ADR-0016 (author decision; S3 boundaries); ADR-0015 (usage analytics owns quota — no local enforcement); ADR-0004 (capabilities).
- tasks/NF-WF-050-scale-evidence-workflow.md §050C; tasks/NF-WF-050A/050B contracts.
- Existing implementation inspected at b7969de (all paths verified present):
  - `packages/ai-core/types.ts`: `ModelProfile` (union incl. `STRUCTURED_EXTRACTOR`), `AIGateway`, `GenerateResult` (`reportedModel`, nullable token counts).
  - `packages/ai-services/src/ai.ts`: `AiServices.generate(input)` — already writes the `Generation` row (task/component/attribution) before transport, records attempts, preserves unknown usage; callers supply `profile`, `messages`, `task`, `component`, `novelId`. This is the ONLY sanctioned model-call path.
  - `packages/ai-services/src/usage-analytics.ts` + prisma `Generation`/`GenerationAttempt`: NF049 attribution; `GENERATION_COMPONENTS` = CHAPTER|COVER|LORE|OUTLINE|EMBEDDING|OTHER — S3 uses `OTHER` + `task: "scale.extract"` unless a separately reviewed taxonomy amendment happens (parent decision: no extension needed).
  - `packages/ai-services/src/scale-evidence.ts`: `readScaleContext(tx, input)` (transaction-compatible SCALE context reader; returns `chapterVersion{id,content}`, `currentVersionId`, `branch{id,headRevisionId}`, `latestSet`, `policy`, `policyFingerprint`); `appendSet` (S1 authoring, full-pin CAS, lock order novel→branch→chapter); `ScaleEvidenceValidationError`; `SCALE_CLAIM_RELEVANCE`; `SCALE_EVIDENCE_SCALES`.
  - `packages/ai-services/src/scale-decisions.ts`: `createScaleDecisionServices` — `createProposalTx`/`decideProposalTx`, sequences, stored-pin matching, `checkCapability` (chapter:update AND canon:manage; decision adds canon:approve).
  - `packages/ai-services/src/scale-review-types.ts` (protocol 1 receipt JSON).
  - `apps/api/src/scale-decision-routes.ts`: `registerScaleDecisionRoutes` — existing context/decisions endpoints, membership-before-diagnostics, RepeatableRead snapshot for context.
  - `packages/database/prisma/schema.prisma`: `NovelSettings { novelId PK, settings Json @default("{}"), updatedAt }` — per-novel JSON settings bag (classified `CONFIGURATION` in restore-scope; excluded from snapshots as not consumed by chapter context). `ScaleDecisionProposal`/`ScaleDecisionOutcome` (050B, OPERATIONAL).
  - `packages/ai-services/src/revisions.ts`: `COVERED_TABLES`, `advanceForMutation`.
  - UI: `apps/web/app/components/workspace/ScaleReviewPanel.vue` (1376 lines; sections for checklist, evidence, decisions); i18n convention `workspace.narrative.scaleReview.*` in `apps/web/app/i18n/{en,id}.ts` (parity guard: `apps/web/app/components/workspace/scale-review-i18n-parity.test.ts`).
- `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` (Windows: reuse running Docker stack/data).

## Environment prerequisites

Windows 11 host; reuse the running Docker services (nf-pg-5433, Redis) without
reset or reinstall. Tests use owned disposable scratch databases / isolated
Redis namespaces only. Gateway: live model calls require an enabled gateway
plus author-authorized test endpoint; unit/integration coverage uses a fake
`AiServices.generate` (service seam), so live credentials are NOT a
prerequisite for deterministic gates. Record actual readiness at dispatch.

## Dependencies and evidence

- Depends on: 050A (S1 authoring, validated), 050B (S2 + context reader + receipts, accepted at b7969de), NF-WF-049 analytics (implemented), ADR-0015 (no local quota logic).
- Active issues: GAP-039 (parent; stays OPEN until integrated acceptance), GAP-021 (session binding fallback), GAP-051 (human screen-reader pass — author-owned, out of scope).
- Evidence links: docs/14-progress/050B-acceptance-reconciliation-2026-10-11.md; CURRENT.

## Scope

Allowed paths (only these; anything else requires a separately reviewed amendment recorded in ISSUES-AND-GAPS before editing):

- `packages/database/prisma/schema.prisma` + ONE new migration `packages/database/prisma/migrations/<timestamp>_scale_s3_assistance/`.
- `packages/ai-services/src/scale-s3.ts` (NEW — S3 proposal/advice service).
- `packages/ai-services/index.ts` (export the new S3 service factory only).
- `packages/ai-services/src/scale-s3.test.ts` (NEW). `packages/ai-services/src/revisions.ts` is expected to need NO change (new tables stay OUTSIDE COVERED_TABLES like 050B S2 rows); it is allowed only for a comment-level annotation if the amendment-free proof requires one.
- `packages/story-versioning/restore-scope.ts` (new OPERATIONAL classification for the new table) and `packages/story-versioning/restore-scope.test.ts` (classification-count update; behavior-preserving).
- `apps/api/src/scale-s3-routes.ts` (NEW) + registration line in `apps/api/src/app.ts`.
- `apps/api/src/scale-s3.test.ts` (NEW).
- `apps/api/src/services/platform.integration.test.ts`: ONLY S3 deleteNovel cleanup success/refusal assertions (same bounded allowance as 050B).
- `apps/web/app/components/workspace/ScaleReviewPanel.vue` (S3 suggestions section), `apps/web/app/components/workspace/ScaleReviewPanel.s3.test.ts` (NEW).
- `apps/web/app/i18n/en.ts`, `apps/web/app/i18n/id.ts` (new keys only).
- This task, parent plan annotation, ADR-0016 technical amendment, CURRENT, DELIVERY-PLAN, ISSUES-AND-GAPS, docs/03-domain/NARRATIVE-RHYTHM.md (if domain wording changes).

Forbidden: any change to `scale-decisions.ts`/`scale-evidence.ts` services' behavior (S3 is additive and calls them as-is); any new gateway/adapter; any change to `useLocale`, reader pages, publication/worker paths; any automatic approval, standing/canon write, quota math, provider/model hardcode; whole-manuscript scans; deterministic-guidance removal.

Inputs:
- Novel settings read/write through the existing `NovelSettings.settings` JSON bag. S3 key: `scaleS3: { enabled: boolean }` (absent = disabled; strict per-key validation on read; unknown keys preserved untouched).
- Pinned chapter context via `readScaleContext` (already version/branch/head/set/policy pinned; the pinned `chapterVersion.content` is the ONLY prose input — no whole-manuscript, no outline, no canon dump; bounded prompt assembly caps injected prose at the single chapter version).

Outputs:
- `ScaleS3Proposal` rows (new prisma model, below) surfaced through API + panel.
- Advice object (transient, returned by API, NOT persisted as evidence) with fields mirroring 050B `missingData` shape: `{items: [{code, field, reason, explanation, example, nextAction}]}` — examples explicitly hypothetical.

### New schema (single migration, additive)

```prisma
/// NF-WF-050C: untrusted AI-extracted SCALE claim proposals (S3).
/// Append-only OPERATIONAL audit history, like 050B S2 rows; never canon,
/// never a story-head participant, never snapshot-covered.
model ScaleS3Proposal {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId       String   @map("workspace_id") @db.Uuid
  novelId           String   @map("novel_id") @db.Uuid
  chapterId         String   @map("chapter_id") @db.Uuid
  chapterVersionId  String   @map("chapter_version_id") @db.Uuid
  sourceBranchId    String   @map("source_branch_id") @db.Uuid
  sourceRevisionId  String?  @map("source_revision_id") @db.Uuid
  evidenceSetId     String?  @map("evidence_set_id") @db.Uuid
  policyFingerprint String   @map("policy_fingerprint")
  kind              String   // EXTRACT_CLAIM (single stored kind; advice is transient and never persisted)
  payload           Json     // strictly validated on write and read
  generationId      String?  @map("generation_id") @db.Uuid  // NF049 linkage; null when usage unknown
  reportedModel     String?  @map("reported_model")          // serving evidence only; never asserted
  requestedByUserId String   @map("requested_by_user_id") @db.Uuid
  // Recorded author rejection (ADR-0016 decision recording; approval is the
  // author-applied 050A evidence set). Null = pending/unused.
  dismissedByUserId String?  @map("dismissed_by_user_id") @db.Uuid
  dismissedReason   String?  @map("dismissed_reason") @db.VarChar(4000)
  dismissedAt       DateTime? @map("dismissed_at") @db.Timestamptz(3)
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([novelId, chapterId, createdAt])
  @@map("scale_s3_proposals")
}
```

FK policy mirrors 050B: FKs only to Restrict-retained rows (chapter versions,
actors) via workspace/novel cascade from parent cleanup; NO FK to
NarrativePolicy or ScaleEvidenceSet (mutable/rewound); stored pins validated on
read. `platform.deleteNovel` cleanup gains explicit S3-row deletion (ordered
before versions/actors) inside the existing novel-scoped transaction — same
pattern as 050B S2 cleanup. Not in COVERED_TABLES; restore/rebuild ignores it.

## Behavior and invariants

### S3 setting (enablement)
- GET `GET /api/workspaces/:wid/novels/:nid/scale-s3-setting` → `{enabled}`; requires `chapter:read` AND `canon:read`.
- PUT same path body `{enabled: boolean, reason: string(1..4000)}`; requires `canon:manage`; writes settings JSON, records an AuditLog entry (`action: "novel.scale-s3-settings-changed"`, entityType `"novel"`, payload `{enabled, reason}`). History preserved in audit; disabling never erases stored proposals. Capability is DELIBERATELY `canon:manage`, stricter than the `novel:update` used by other per-novel configuration, so EDITOR cannot enable AI processing of chapter text (ADR-0016: a workflow/coding actor cannot silently enable it); do not "fix" this to novel:update.
- Default absent = disabled. Strict JSON read: malformed `scaleS3` value → treated as disabled, logged diagnostic, never a model call.

### Extraction proposals (kind EXTRACT_CLAIM)
- POST `.../chapters/:chapterId/scale-s3/extract` with REQUIRED full-pin expectations (same shape as 050A `appendSet`: `chapterVersionId, expectedBranchId, expectedHeadRevisionId, expectedSetId, expectedPolicyFingerprint`). Requires `chapter:read` AND `canon:read` (proposal creation, not approval) — the model proposes, the author decides. NOTE: `AiServices.generate` internally also gates `generation:create` (unbypassable); today every role holding `canon:read` also holds `generation:create`, so behavior is as intended, and the API test asserts the composed effective gate with a real-gate-path fake (not a gate-bypassing spy) so a future role-ledger change cannot silently break this matrix.
- Gate order: 401 unauthenticated → 404 foreign → 403 insufficient capability → 400 invalid shape → **409 S3_DISABLED** when disabled → **409 S3_NOT_CONFIGURED** when no SCALE policy is configured (extraction deliberately serves SCALE assessment; without a policy there is nothing to assess against — the stored fingerprint of explicit absence makes a later policy change stale any hypothetical rows anyway) → 409 stale pins → model call. Advice additionally requires the latest deterministic assessment INCOMPLETE.
- Zero-model-call invariant: when disabled or any precondition fails BEFORE the model call, `AiServices.generate` is never invoked (test-proven with a throwing fake).
- Model call: `ai.generate({profile: "STRUCTURED_EXTRACTOR", task: "scale.extract", component: "OTHER", novelId, artifactId: chapterVersionId, messages})`. System prompt: return ONLY JSON matching the schema; every claim must cite exact source span/quote from the provided chapter text; explicitly instructed that unsupported text is invalid.
- Output validation (fail-closed, like 050A): strict schema; every claim's `scale` ∈ SCALE_EVIDENCE_SCALES, `relevance` ∈ SCALE_CLAIM_RELEVANCE; source span/quote re-verified against the PINNED version content byte-for-byte (span bounds, exact quote match). Any failure (malformed JSON, unknown scale, quote mismatch, hallucinated span) → proposal NOT stored; response 422 `S3_INVALID_PROPOSAL` with sanitized reason; a `Generation` row still records the failed request (attribution honesty).
- Success: store `ScaleS3Proposal` row (payload = validated claims array; `generationId` from result). `reportedModel` MUST come from the latest `GenerationAttempt.reportedModelId` of that `generationId` (nullable, verbatim) — NEVER from `AiServices.generate`'s return `model`, which silently falls back to the requested model id when the gateway omits its own (omniroute `body.model ?? req.model`); a request-model fallback is not reported identity (ADR-0015). Negative test: fake gateway omits model → stored `reportedModel` is null, not the requested id.
- Invariants: the proposal row is inert data. It does not call `appendSet`, `createProposalTx`, or any standing/policy write. Consumption path: the author clicks "Add as evidence" per claim in the UI → UI calls the EXISTING 050A `appendSet` with the author's own session, full pins re-read fresh; per-claim authoring keeps the 050A validators authoritative. Rejected/unused proposals never invalidate complete S1 evidence (they are not evidence and not pins).

### Missing-data advice (transient; never persisted)
- POST `.../chapters/:chapterId/scale-s3/advice` with same full-pin expectations. Same gating; additionally refused 409 when the latest deterministic assessment is not INCOMPLETE (no advice for complete/quiet assessments — deterministic checklist already suffices).
- Builds the bounded prompt from the current deterministic `missingData` items (050B checklist) + pinned text; asks the model to elaborate reasons/explanations/examples/nextActions. Output validated: same item shape, each item must map to one of the input checklist codes; fabricated codes rejected → 422, no persistence of bad advice (still persisted as a failed-generation audit trail; advice requests do NOT store proposal rows on success — response body only, so stale advice cannot be resurrected later).
- Failure (gateway error, timeout, malformed): 502/422 mapped response; the deterministic 050B checklist remains fully rendered in the UI. Advice failure NEVER blocks or releases the gate; assessment state is untouched.

### Staleness, idempotency, concurrency
- Stored proposals carry the full pin set; list/read responses mark `stale: true` when any pin mismatches the live context (computed at read via `readScaleContext`; no silent repinning). UI shows stale proposals read-only with explanation.
- No deduplication claim is made: repeated extract calls may produce repeated proposals (bounded by rate of author action); listing is descending, paginated `?before=<createdAt>&beforeId=<id>&limit<=50` — cursor is `(createdAt, id)` lexicographic descending so equal-millisecond rows are never skipped.
- Concurrent PUT setting + extract call: extract reads settings and ALL pins inside ONE transaction under the `appendSet` lock order (novel NO KEY UPDATE → branch UPDATE → chapter UPDATE — locks held only for the pin read, then released before the model call; no lock is ever held across the model call). Amendment D1 correction (2026-10-12, reviewed round 2): the lock-taking transactions run at the database default READ COMMITTED — the safety property comes from the explicit row locks plus the byte-identical phase-2 re-check (the same lock order + revalidation protocol as the 050A/050B services), NOT from snapshot isolation; RepeatableRead on the locked reads would turn a concurrent head advance into an unmapped serialization abort (SQLSTATE 40001 / P2034) instead of the intended 409. Only the read-only `list()` stale-marking transaction runs at RepeatableRead. Amendment D2: `putSetting` takes the novel row lock (FOR NO KEY UPDATE) inside its transaction and writes its audit entry with the transaction client, so concurrent PUTs never lose sibling JSON keys and exactly one audit row exists per committed PUT. The model call runs outside any transaction; a short second transaction then re-reads the SAME pin set under the same lock order/isolation and stores the row ONLY if every pin is byte-identical to the first snapshot (pin combination that never coexisted can never be stored); mismatch → row discarded, 409 stale returned. A disable racing an in-flight generation leaves a completed row (harmless inert data); a post-disable response is refused before the model call.
- `reportedModel` is stored verbatim as observed or null; missing usage metadata (`generationId` null path never occurs for `AiServices.generate` — it always creates the row — but `inputTokens/outputTokens` may be null) is recorded as unknown by NF049 as-is; no double counting, no fabrication, no quota computation.

### UI (ScaleReviewPanel)
- New "AI suggestions" section, rendered ONLY when `scaleS3.enabled` for the novel: enablement never appears as a hidden call — the section explains proposals are untrusted suggestions. Enablement source: the panel calls GET `scale-s3-setting` once per chapter selection (the already-allowed endpoint; no change to scale-review-context). Any 403/404 on that fetch (e.g. VIEWER below `canon:read`) is treated as disabled absence — clean "zero AI affordances", never an error banner for the AI section.
- S3 disabled: section renders the deterministic checklist exactly as today; zero AI affordances.
- States: loading / empty ("No suggestions requested yet") / error (with retry) / stale (read-only banner) / 403/404/409 mapping; disabled duplicate submit while a request is in flight.
- Actions per extracted claim: "Add as evidence" (calls existing 050A flow with fresh pins; server re-validates), "Dismiss" — a recorded author DECISION, not client-side only: POST `.../scale-s3/:proposalId/dismiss` (same route family; requires `chapter:read` AND `canon:read`; idempotent; appends `dismissedByUserId`/`dismissedAt`/`dismissedReason` columns to the proposal row — additive fields in the same migration). ADR-0016 requires approve/reject/alternative recording with actor and reason: approval = author-applied evidence set (050A, audited), rejection = the dismiss record above. S3 proposals have no alternative flow (an author who wants a different claim authors it directly through S1); this narrowing is stated, not silent.
- Advice panel: renders validated advice items alongside (never replacing) the deterministic checklist; failure banner keeps checklist primary.
- i18n: all new strings under `workspace.narrative.scaleReview.s3.*` in BOTH en and id; canonical scale machine values untranslated; parity-guard test extended to the new families.
- Late-response guard: selection/request-generation binding identical to existing panel behavior (ignore stale selections).

### Explicit non-goals
- No bulk/import extraction; no cross-chapter analysis; no proposal auto-aging; no S3 for evidence sets other than the latest; no score/threshold that substitutes for author decisions; no provider/model pinning; no stream usage (non-streaming `generate` only).

## Acceptance and verification

Expected (not yet executed) commands:

```text
pnpm --filter @novelforge/database generate && pnpm --filter @novelforge/database exec prisma validate
pnpm exec vitest run packages/ai-services/src/scale-s3.test.ts
pnpm exec vitest run apps/api/src/scale-s3.test.ts
pnpm --filter @novelforge/api typecheck && pnpm --filter @novelforge/ai-services typecheck
pnpm --filter @novelforge/web exec vitest run app/components/workspace/ScaleReviewPanel.s3.test.ts app/components/workspace/scale-review-i18n-parity.test.ts
pnpm --filter @novelforge/web exec vue-tsc --noEmit
pnpm exec vitest run packages/story-versioning/restore-scope.test.ts
pnpm exec vitest run apps/api/src/scale-evidence.test.ts apps/api/src/scale-review.test.ts apps/api/src/scale-decisions.test.ts apps/api/src/services/platform.integration.test.ts
git diff --check
```

Named negative scenarios (red proof before nontrivial code):
- Disabled S3 → POST extract/advice returns 409 S3_DISABLED and the fake `generate` records ZERO calls (service-level spy).
- Unauthorized (no membership / 403 capability) and foreign-novel/proposal access → 404/403, zero model calls, zero writes.
- Malformed model JSON / unknown scale / quote not found in pinned text → 422, no proposal row, generation row retained with error.
- Changed chapterVersion / head / set / policy fingerprint between call and store → 409 stale, row discarded.
- S3 setting malformed JSON → treated disabled; unknown settings keys preserved on PUT.
- Gateway response with null/absent usage or model metadata → stored/recorded as unknown verbatim (`reportedModel` null; NF049 unknown counters), nothing fabricated and no request-model fallback recorded (ADR-0015 core).
- Extract-path gateway failure (BadGatewayError) → 502 response, no proposal row, Generation row FAILED with error category.
- Duplicate/concurrent decisions not applicable (S3 stores no decisions) — instead: concurrent disable + in-flight extract serializes to refusal or harmless inert row (asserted).
- Concurrent pin change between the two extract transactions (branch head or version pointer advances between pin read and store) → row discarded, 409; stored rows never encode a pin combination that never coexisted.
- Advice for non-INCOMPLETE assessment → 409; advice failure leaves checklist (UI test) and gate state untouched (API test asserts receipt unchanged).
- S3 enabled but no SCALE policy → POST extract/advice 409 S3_NOT_CONFIGURED, zero model calls.
- Panel test: GET scale-s3-setting returns 403 → AI section absent, no error banner.
- Approved-state invariance: after extract + author add-as-evidence via existing 050A route, S2 receipts/standing byte-unchanged by S3 itself (assert S2 tables empty of S3 side effects).
- Dismissal recorded: POST dismiss appends actor/reason/time once (idempotent repeat accepted, no second write); unauthorized dismiss → 403/404.
- deleteNovel with S3 rows: cleanup succeeds in dependency order; canon-restricted cleanup rolls back leaving S3 rows intact (platform.integration.test.ts).
- Existing 050A/050B suites unchanged and green with S3 absent (no regression; settings key absent path).

## Migration and rollback

- Additive: one new table + one migration; no COVERED_TABLES entry; no backfill; empty and populated upgrades both trivially safe (validated on a private scratch copy with genuine Prisma ledger like 050B slice 1).
- `platform.deleteNovel` gains explicit S3 cleanup before versions/actors; existing canon/workflow restriction still rolls back ALL cleanup (assert both paths).
- Rollback: application binary without S3 ignores the table; settings key inert. No destructive down migration; no live deployment.
- Restore: S3 rows are not snapshot-covered; restore leaves them (inert audit history) — assert old snapshots restore without S3 interaction.

## Documentation and handoff

Engram: save compact checkpoints at slice boundaries under
`checkpoint/nf-wf-050c/s3-assistance` when the runtime hook provides an
authoritative identity; otherwise record the limitation under GAP-021 and keep
this task + CURRENT as the fallback handoff (no invented session IDs).
CURRENT/DELIVERY-PLAN updated at acceptance time with verified scope only.
Slice sequence (one writer, each slice separately reviewed before the next):
1. Schema + migration + service (`scale-s3.ts`) with settings/extract/advice + negative tests.
2. Routes + app registration + API tests (auth/tenant/stale/zero-call).
3. UI section + i18n + panel tests + parity guard extension; integrated en/id evidence.
Record unknowns, blocked checks and next dependency-ready work per the playbook.
