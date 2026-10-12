# NF-WF-050C contract amendment 1 — findings A–D repairs (2026-10-12)

Baseline: HEAD `23d4a1a` (main; 050C committed `7589388`). Findings record:
`docs/implementation/ISSUES-AND-GAPS.md` "NF-WF-050C remaining findings record —
2026-10-12". This amendment freezes the smallest complete repairs BEFORE any
schema/shared-interface change, per the frozen 050C contract's amendment rule.

## Amendment A — author-facing S3 enablement UI

Problem: the per-novel S3 setting is backend-complete (GET/PUT
`/scale-s3-setting`, `canon:manage` setter, audit entry) but no web surface
issues the PUT; enablement is API-only. ADR-0016 requires author-facing
optional enablement.

Change (web only; no API/schema change):
- New component `apps/web/app/components/workspace/ScaleS3SettingToggle.vue`,
  mounted in the NarrativePanel POLICIES tab beside `PolicyList` (the existing
  per-novel narrative configuration surface), NOT inside ScaleReviewPanel
  (the panel stays a pure consumer).
- Toggle renders current state from GET `/scale-s3-setting`; switching issues
  PUT `{enabled, reason}`. Reason: required nonempty 1..4000 text field with
  a pre-filled suggested reason the author may edit (matches the API
  contract; explains WHY the toggle needs a reason: audit trail).
- Saving/error states: disabled button + in-flight label while PUT runs;
  inline error on 403 (`FORBIDDEN`) / 409 / network failure with retry; the
  toggle reverts to the server state on failure (re-GET).
- Copy states explicitly that enabling authorizes AI processing of the
  chapter text and that proposals are untrusted suggestions needing author
  decisions; disabling preserves all proposal/dismissal history (server
  never deletes rows on disable).
- Capability-aware rendering (progressive enhancement only): toggle enabled
  for roles holding `canon:manage` (OWNER/ADMIN/AUTHOR); read-only badge for
  others. GET 403/401 → treat as disabled absence (consistent with the panel
  behavior: VIEWER sees no AI affordances, no error banner).
- Server stays the enforcer; the client role check mirrors
  `ROLE_CAPABILITIES` like `canManageDefinitions` does.
- i18n: new keys under `workspace.narrative.scaleReview.s3.setting.*` in
  BOTH `en.ts` and `id.ts`; parity-guard test extended to the new family.
- Tests: new `ScaleS3SettingToggle.test.ts` (load, toggle success, 403
  error+revert, in-flight duplicate-submit blocked); parity guard updated;
  manual en/id + English-fallback verification at acceptance.

Out of scope: no change to capability requirements, gate order, audit shape,
or server behavior.

## Amendment B — proposal provenance for accept/alternative (smallest contract)

Problem: accept ("Add as evidence") and author-alternative authoring produce
050A evidence sets with no recorded link to the source S3 proposal; ADR-0016
requires a traceable outcome for all three decisions.

Constraint from the author dispatch: reuse existing infrastructure where
semantics fit; do not assume a new table; freeze the smallest complete
contract BEFORE schema/shared-interface change.

Change (no new table; one additive nullable column):
- Add `source_s3_proposal_id UUID NULL` to `scale_evidence_sets` — ONE new
  reviewed additive migration (050A table, additive column, no backfill).
  The column is a BARE UUID with NO FK (repo precedent:
  `ScaleS3Proposal.generationId`, schema.prisma "NF049 linkage; null when
  usage is unknown") — integrity is validated at write time (see below),
  never by a cross-table FK, avoiding cleanup-order hazards between the two
  deletion mechanisms (S3 rows: novel/chapter cascade + explicit cleanup;
  evidence sets: novel cascade only). Cleanup is unchanged: the nullable
  column needs no deleteNovel/restore change.
  Rationale: the 050A evidence set IS the author's approved-evidence record;
  linking set→proposal records accept AND alternative (an alternative is an
  author-authored set that cites the proposal it replaces) with a single
  nullable FK, reusing the existing appendSet boundary. Rejection needs no
  schema change (dismiss record already stores actor/reason/proposal
  identity).
- `appendSet` input gains OPTIONAL `sourceProposalId?: string`:
  [Disposition note 2026-10-12] The "audit payload" requirement is satisfied
  by the retained set row itself: `scale_evidence_sets` IS append-only
  OPERATIONAL audit history, and the new `sourceProposalId` column plus the
  returned `ScaleEvidenceSetRecord.sourceProposalId` field carry the
  provenance durably. Introducing a new AuditService dependency into the
  050A service would have expanded the frozen 050A interface for no added
  traceability, so no separate audit call is added.
  - When present: server verifies the proposal row exists in the same
    workspace/novel/chapter/chapterVersion and its pins match the set being
    appended (else 409 STALE/404). This verification runs INSIDE the existing
    appendSet transaction, under its established locks (novel NO KEY UPDATE →
    branch → chapter), so the check and the set creation share one snapshot.
    Stores the id in the new column. Audit
    payload for the set records `{sourceProposalId}`.
    [Correction 2026-10-12, live acceptance] The "pins match" check is
    bounded to branch + head revision + policy fingerprint + tenant/context
    binding. The proposal's `evidenceSetId` pin is deliberately NOT compared
    against the current tip: the author's own accept legitimately advances
    the tip between extract and a second accept or an alternative, and
    requiring that pin to match made both flows impossible (witnessed live:
    409 with currentHeadRevisionId identical to the expectation). Tip
    freshness of the SET itself remains enforced by the existing
    `expectedSetId` check.
  - The proposal row itself is NOT mutated by appendSet (stays inert; its
    dismiss columns remain null on accept). Provenance is read by joining
    sets on the new column; pending/rejected proposals never invalidate
    complete S1 evidence (unchanged invariant).
  - Null/absent preserves existing 050A behavior byte-for-byte (pure S1
    authoring).
- No AI approval path is added: appendSet still runs in the AUTHOR's session
  with author capabilities; the model never calls it.
- Version pins, authorization, CAS sequence allocation, stale refusal: all
  unchanged (the new column rides the existing transaction).
- UI: "Add as evidence" passes the proposal id; a proposal whose claims were
  fully added shows a "linked evidence" note via the set listing; an author
  crafting an alternative via the existing S1 form may optionally select the
  proposal it responds to (simple select of pending proposals for the same
  version) — if none selected, behaves as plain S1.
- Tests: provenance stored on accept; alternative linkage; wrong-chapter /
  stale-proposal refusal; null path unchanged (050A suites must stay green
  unchanged); migration upgrade on owned scratch DB.

Forbidden: new table; new decision service; changes to
`scale-decisions.ts` semantics; any automatic proposal state transition.

## Amendment C — advice field validation + negative regression

Problem: `advise()` validates `code` against the server-derived checklist but
accepts any nonempty `field`, so a valid code with a mismatched/fabricated
field mapping is returned.

Change (service-level, `scale-s3.ts` advise() only):
- Build the allowed pairs from the input checklist:
  `allowedPairs = new Set(input.missingData.map((m) => \`${String(m.code)}\u0000${String(m.field)}\`))`
  (each server-derived item carries its `code` and `field`). Each returned
  item must satisfy
  `allowedPairs.has(\`${String(raw.code)}\u0000${String(raw.field)}\`)`
  — the COMBINED key, never a two-argument `Set.has` (which silently ignores
  the second argument and would reproduce the code-only check); else
  `S3_INVALID_PROPOSAL` 422 ("advice item maps code to a field outside the
  server checklist"). Existing `code`-only check stays as the first check
  (better error message precedence).
- Retain explanation/example/nextAction nonempty ≤4000 validation and the
  item cap, unchanged.
- The checklist source is unchanged: the route derives `missingData` from the
  pinned receipt server-side; the client never supplies codes/fields.
- Stale-while-advising: no post-call revalidation gate is added — advice is
  transient (never persisted), the panel's late-response guard already drops
  stale responses, and the contract explicitly refuses to persist advice, so
  nothing stale can be resurrected. This disposition is recorded rather than
  silently skipped.
- Negative regression: valid code + wrong field → 422, in BOTH
  `packages/ai-services/src/scale-s3.test.ts` (service, fake generate) and
  `apps/api/src/scale-s3.test.ts` (route mapping).

## Amendment D — transaction isolation alignment

Problem: the contract claims RepeatableRead for the S3 transactions; the
implementation uses default READ COMMITTED (DB default confirmed
`read committed`). Two defects with different fixes:

D1. Pin transactions — RR is added ONLY to the read-only list()
stale-marking transaction (~line 657). The four LOCK-TAKING transactions
(extract phase 1 ~409, phase 2 ~461, gateAdvice ~523, advise ~540) stay at
READ COMMITTED: under RR their `SELECT … FOR UPDATE` pin reads can abort
with SQLSTATE 40001 / Prisma P2034 on a concurrently-advanced head/version,
surfacing as an unmapped 500 where RC today yields the intended 409 stale
via assertExpectations. Contract wording amended to state the ACTUAL
protocol: RC isolation + explicit row locks (appendSet order) +
byte-identical phase-2 re-check — the contract's "same RepeatableRead
isolation as 050B review" phrase is corrected to "same lock order +
revalidation protocol as 050A/050B" (scale-evidence.ts and
scale-decision-routes.ts keep their own RR usage untouched; this amendment
changes only scale-s3.ts). Safety analysis (corrected per review):
correctness is guaranteed by locks + re-check under RC; RR on the read-only
list() transaction adds snapshot stability with no new failure mode (no
locks taken; read-only snapshot reads of committed data cannot abort).
Regression: existing two-phase concurrency tests must stay green; add one
assertion that a pin change between phase 1 and phase 2 still discards
(already covered — rerun, do not weaken).

D2. Settings-bag concurrent write — `putSetting` read-modify-upserts the
whole JSON bag with no lock; two concurrent PUTs can lose sibling keys. Fix
(smallest, inside the same transaction): take the novel row lock FIRST
(`SELECT id FROM novels WHERE id = $1 FOR NO KEY UPDATE` — the same lock the
extract path uses, so settings writes serialize against extract phase-1
enablement reads consistently), then read-modify-upsert. This guarantees:
unknown sibling keys preserved under concurrent writes; audit entry exactly
one per successful PUT; concurrent disable + in-flight extract unchanged
(phase 2 re-checks enablement; disable wins → 409 or harmless inert row per
the frozen contract). Negative regression: two concurrent PUTs with
different sibling keys → both keys survive; audit row count exactly 1 per
PUT.

NOT changed: model calls stay outside transactions (all paths OBSERVED
compliant); no DB default change; no Prisma retry policy addition.

## Verification plan (Phase 2 gates, per amendment)

- A: toggle component tests + parity guard; en/id manual; zero-model-call
  invariant untouched (disabled S3 still makes no calls — existing suite).
- B: new migration upgrade on owned scratch DB; provenance service/route
  tests; 050A/050B suites unchanged-green; platform.integration S3 cleanup
  still green (new column is nullable, no cleanup change needed).
- C: wrong-field negative tests (service + route); existing advice suites
  green.
- D: concurrency assertions rerun; new sibling-key preservation test; typecheck
  + eslint on changed files; `git diff --check`.

Scope note: schema change is LIMITED to Amendment B's one additive nullable
column + its migration. All other changes are service/UI/test-level.

## Independent amendment review — 2026-10-12 (round 1)

Separate read-only reviewer (scout actor, never the implementer session).
Artifact: this file as first written; verdicts recovered at
`agent://AmendmentReview1`. Verdicts: A APPROVE; B APPROVE (2 P3 applied:
bare-UUID no-FK statement; in-transaction verification placement);
C CHANGES_REQUESTED (1 P2: two-argument Set.has pseudocode defect — fixed to
combined-key form above); D CHANGES_REQUESTED (1 P2: RR-on-locked-tx
P2034/40001 abort analysis — fixed by narrowing RR to the read-only list()
transaction and correcting the contract wording above; D2 APPROVED as
written, deadlock-free). Round-2 re-review of the corrected C/D text is
required before implementation freeze.

## Independent amendment review round 2 — 2026-10-12

Separate read-only reviewer (scout actor; `agent://AmendmentReview2`).
C **APPROVE** (combined-key pseudocode correct and complete; no coercion
asymmetry; separator collision-safe). D **APPROVE** (verified the list()
stale-marking transaction takes no locks and no writes, so RR there is
safe; lock-taking transactions correctly stay RC; P2034 exposure
eliminated). One P3 applied at implementation time: update the stale
docstring at scale-s3.ts:221-222 ("Caller must run inside a
RepeatableRead transaction" → the actual RC + locks protocol).
**AMENDMENT FROZEN** — implementation may proceed.

## Final exact-diff review — 2026-10-12 + disposition of its findings

Separate read-only reviewer (scout actor; `agent://FinalDiffReview-2`) over
the frozen artifact `.git/nf-050c-amendment1-final-20261012.patch`
(sha256 `4bf15d51fd6965eb0c6f9ec813dd167a0e461180d25e027aa53afeb0b2dde9ef`,
1818 lines, base HEAD `23d4a1a`). Verdict: **CHANGES_REQUESTED** — core
repairs correct, migration-safe, secret-free, no weakened assertions; two P2
findings, both applied after the review:

1. (P2, applied) The i18n parity guard was not extended to the new
   `s3.setting.*` family — fixed: `ScaleS3SettingToggle.vue` added to the
   guard's COMPONENTS and its three dynamic `t(errorKey)` strings pinned
   (`reasonInvalid`, `forbidden`, `saveFailed`).
2. (P2, applied) The frozen contract's RepeatableRead phrase at
   `NF-WF-050C-scale-s3-assistance.md` §Staleness/concurrency had not been
   corrected — fixed: the paragraph now states the RC + locks + revalidation
   protocol and the D2 putSetting lock.

P3 findings and their recorded disposition:

- Service-level wrong-field regression lives only at the route suite
  (`apps/api/src/scale-s3.test.ts`, real service wired through
  `buildTestApp`): DEVIATION RECORDED, not fixed — the original 050C
  implementation has no `packages/ai-services/src/scale-s3.test.ts`
  (structure predates the amendment); duplicating the case at package level
  would test the same service twice through the same fake seam.
- "Linked evidence" display note on fully-added proposals: DEFERRED —
  durable provenance exists server-side (column + API record) and the
  form-level provenance select shows linkage at authoring time; a
  read-back display affordance is a UX nicety recorded here as open.
- In-flight duplicate-submit assertion: FIXED (7th toggle test proves one
  PUT while a request is in flight).
- Toggle 403 test's state-reversion assertion: covered by the same test
  ("Off" remains after refused PUT).

## Final exact-diff review round 2 — post-fix refreeze

The two P2 findings were applied and the P3 test fix added; parity 4/4 +
toggle 7/7 re-run green after the fixes. Re-frozen exact diff:
`.git/nf-050c-amendment1-final-r2-20261012.patch` sha256
`98b2515001863913459ac9c669cff2bdbe8e4ba36aa7958beb8c98fa453ad45a`
(1921 lines). The round-1 verdict covered the earlier artifact
(`4bf15d51…`); it does not extend to this refreeze — its remaining P3
deviations are recorded above and no new code changed beyond the listed
fixes (parity guard COMPONENTS + three pinned keys; contract paragraph;
one added toggle test).

## Final post-fix review round 3 — 2026-10-12 (this refreeze)

Separate read-only reviewer (scout actor; `agent://FinalDiffReview-r2`),
never the implementer session, over exactly this refreeze
(`.git/nf-050c-amendment1-final-r2-20261012.patch`, sha256 verified
`98b2515001863913459ac9c669cff2bdbe8e4ba36aa7958beb8c98fa453ad45a`,
base HEAD `23d4a1a`). Verdict: **APPROVE** — zero findings. Checks executed
against actual source (not patch text): real parity guard extension verified
(additive, real en/id imports, nothing weakened); contract §Staleness
wording verified to match scale-s3.ts (lock-taking txs at READ COMMITTED
with novel→branch→chapter locks, putSetting FOR NO KEY UPDATE + in-tx
audit, list() the only RepeatableRead occurrence, read-only); 7th toggle
duplicate-submit test verified with the component's `saving` guard in .vue
source; delta confirmed free of new correctness/authorization issues;
C combined-key Set.has + wrong-field 422 regression and B one-statement
additive migration spot-verified in source. Retained (not rerun):
API/DB/live-acceptance receipts per CURRENT 2026-10-12. Both round-1 P2s
and the round-2 P3 confirmed resolved.
