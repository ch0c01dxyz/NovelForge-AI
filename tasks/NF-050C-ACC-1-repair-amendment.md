# NF-050C-ACC-1 repair — bounded task amendment (2026-10-12)

Defect: `docs/implementation/ISSUES-AND-GAPS.md` — "NF-050C-ACC-1"
(SCALE panel never issues the S3 proposals list on page load; proposals
never render on a fresh session with S3 enabled) + the related
`loadS3Setting` stale-selection finding recorded in the same entry.

Base: commit `50609c0d2704380ac2b48fa5eb01164fe8e858ca` + working tree
(CURRENT.md handoff, ISSUES-AND-GAPS.md defect record — uncommitted).

## Allowed paths (exhaustive)

- `apps/web/app/components/workspace/ScaleReviewPanel.vue` — the fix.
- `apps/web/app/components/workspace/ScaleReviewPanel.s3.test.ts` —
  regression tests for the fix.
- `docs/implementation/ISSUES-AND-GAPS.md` — close/update NF-050C-ACC-1.
- `docs/14-progress/CURRENT.md` — session record update.
- `tasks/NF-050C-ACC-1-repair-amendment.md` — this file.

Everything else: FORBIDDEN. No backend changes, no new dependency, no
stale-guard removal, no timeouts, no version hardcoding.

## Round 2 (retry/failure paths — same bounded scope, same allowed paths)

Round-2 findings A (retry never loads proposals) and B (failed context with
non-null version still fires the list) are recorded in
ISSUES-AND-GAPS under NF-050C-ACC-1. Required behavior additions:

- R1 `retryLoad()` and `reconcileSelection()`: after a SUCCESSFUL context
  reload (+ evidence), load S3 proposals with the same operation identity —
  so a page that recovered via Retry gets its proposal cards without any
  extraction.
- R2 `loadContext` must report success/failure to its callers; the S3
  proposals continuation (initial chain, retry, reconcile) fires ONLY on a
  successful, accepted context — a failed context with a non-null
  `chapterVersionId` prop must NOT trigger a list request.
- R3 Both initial response orders keep working; exactly one list request
  per successful chain; no duplicate list requests; no timeouts, no
  hardcoded versions, no new async framework.

Round-2 acceptance checks (all with deferred/pending control where needed):

- T8 initial context failure (null version prop) → Retry succeeds → exactly
  one `GET …/scale-s3?chapterVersionId=<server version>`; proposals render;
  no extract call.
- T9 context failure with NON-null `chapterVersionId` prop → no list
  request.
- T10 pending old setting/context responses from a superseded selection
  resolve after recovery → they cannot alter the recovered state or add a
  duplicate list request.

## Round 3 (retry setting-prerequisite recovery — same bounded scope, same allowed paths)

Round-3 reproduced finding: with the initial setting request still pending
when Retry runs, the original setting response is discarded as stale and
`retryLoad` fetches no replacement — `s3Enabled` stays false and the S3
section never recovers (recorded in ISSUES-AND-GAPS; the earlier P3
"clean-absence" deferral is superseded by this evidence). Required:

- R4 `retryLoad()` and `reconcileSelection()` each obtain their own setting
  prerequisite under the recovery operation's identity (fresh
  `loadS3Setting` alongside the context reload), then load proposals only
  when context succeeded AND the (replacement) setting is enabled.
- R5 Stale-response rejection, selection isolation and unmount handling
  are preserved: the dropped initial setting response can never win over
  the replacement; a superseded recovery writes nothing.
- R6 Disabled/403/404/failed replacement setting → no list request.
- R7 Exactly one list request per successful recovery; both
  replacement-setting/context completion orders work.

Round-3 acceptance checks (deferred-promise controlled):

- T11 the reproduced sequence: initial setting pending → initial context
  fails → Retry succeeds → original setting released → exactly one list
  request with the recovered version; proposals render; no extract call.
  (Must FAIL pre-fix — it did, exit 1.)
- T12 replacement setting disabled / 403 → recovery completes contextually
  (no error banner change) but NO list request.
- T13 old setting (disagreeing, enabled:false) released after Retry →
  cannot beat the replacement (enabled:true): list fires exactly once.
- T14 unmount during recovery → no list request afterwards.

## Required behavior

1. The S3 proposals list loads only after BOTH prerequisites are ready:
   (a) the per-novel setting resolved with `enabled === true`, and
   (b) `loadContext` resolved `effectiveVersionId` (server-derived when
   the incoming `chapterVersionId` prop is null).
2. Both response orders work (setting first or context first).
3. Exactly one proposals list request per readiness; no duplicate list
   request when both prerequisites resolve at once; list must NOT depend
   on a successful extraction.
4. Stale responses must not write state across selection changes: both
   `loadS3Setting` and the proposals loader check `selSeq`/`opSeq` before
   every state write (same guard pattern as `loadContext`/`loadEvidence`);
   unmount prevents all later state writes.
5. Disabled / 403 / 404 / failed prerequisites: zero AI affordances, no
   proposal-list request issued, no error banner change to existing
   behavior; context failure must not fire a list request.
6. Existing loading/error surfaces, deterministic guidance, advice, extract
   pins and dismiss behavior are unchanged.

## Acceptance checks (tests, deterministic, deferred-promise controlled)

- T1 setting-before-context, initial `chapterVersionId=null` → exactly one
  `GET …/scale-s3?chapterVersionId=<server-resolved>` and proposals render.
- T2 context-before-setting → same result, still exactly one list request.
- T3 proposals render without any extract call.
- T4 selection changes while an old setting/context promise is pending →
  old responses write nothing into the new selection's state.
- T5 unmount before completion → no later state writes / no list request
  after unmount.
- T6 disabled setting or context failure → no list request.
- T7 a failed extract (422) leaves already-loaded proposals rendered.

## Verification

- Targeted: `ScaleReviewPanel.s3.test.ts` (new + existing, all green).
- Adjacent: the other ScaleReviewPanel suites + i18n parity test.
- `vue-tsc --noEmit` (web typecheck) exit 0; eslint on changed paths.
- Fresh-page manual verification against the existing acceptance fixture
  (DB `novelforge_acceptance_050b`, unmodified): proposal cards render on
  load with no model call; the list request URL carries the resolved
  chapter version id.

## Out of scope

Backend routes/services/schema, authorization, extraction validation,
migration, the author's unperformed acceptance decisions (steps 5–7 stay
PENDING until actually observed), commit/push/deploy (author-gated).
