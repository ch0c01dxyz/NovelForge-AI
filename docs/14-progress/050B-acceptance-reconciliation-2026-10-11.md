# NF-WF-050B acceptance reconciliation — criterion-to-evidence matrix — 2026-10-11

Purpose: reconcile the frozen 050B contract acceptance criteria against retained
evidence, after the reviewed acceptance-repair set was committed as `b7969de`
(parent `dcb2f49`, main, not pushed). Historical acceptance ran at content
`dcb2f49 + applied stash nf050b-acceptance-wip`; that working-tree content is
byte-identical to the `b7969de` source files for all 19 `apps/web` paths
(retained freeze patch `.git/nf-050b-final-freeze-20261011.patch`
sha256 `66f1a3b0…f54`, freeze-verified, final exact-diff review **APPROVE**).
Evidence kind abbreviations: B = real browser UI, A = API, W = worker log,
D = runtime dictionary/静态 check, R = rerun this session.

## Criterion-to-evidence matrix

| # | Criterion (frozen 050B contract) | Coverage | Evidence kind | Status |
|---|---|---|---|---|
| 1 | ScaleReviewPanel: evidence entry with server-validated UTF-16 span + exact saved-HTML quote | NarrativePanel/ScaleReviewPanel + 050A append route | B (scenario 2) | satisfied |
| 2 | HARD policy init via explicit approved standing-change proposal | pinned API PUT `authorDecision: APPROVE` | A (scenario 3) | satisfied |
| 3 | Incomplete HARD renders INCOMPLETE + STALE_EVIDENCE_SET guidance (explanation/example/nextAction) and blocks publication 409 SCALE_ASSESSMENT_INCOMPLETE, chapter stays DRAFT | reviewFinalText + checkFinalTextReviewGate + setStatus | B+A (scenario 4) | satisfied |
| 4 | SOFT advisory: same input, flip via full-pin CAS, publication succeeds | narrative policy CAS | B+A (scenario 5) | satisfied |
| 5 | Approve standing change (applied), reject (no state change), alternative (successor proposal, original preserved) | scale-decisions.ts S2 service | B (scenario 6) | satisfied |
| 6 | Stale-set exception refused 409, no writes | decideProposal pin checks | A (scenario 7) | satisfied |
| 7 | Published chapters immutable; version-scoped evidence recovery on draft v2 clean-slate, fresh NO_OPERATIVE_CONFLICT | setStatus/publish gates | B+A (scenario 8) | satisfied |
| 8 | Reader visibility: public API 200 published / 404 draft; reader UI renders bodies | public API + reader pages | A+B (scenario 9, post-GAP-122 re-run) | satisfied |
| 9 | en/id localization with English missing-key fallback | i18n dicts + useLocale | B (scenario 10; real `Show full hash` en-fallback witnessed under GAP-123 verification) | satisfied |
| 10 | Scheduled publication through real BullMQ worker: conservative stale → deterministic refusals → post-fresh-review publish; no public flip on refusal; audit retained | publication-jobs worker | W (persisted verbatim excerpt) | satisfied |
| 11 | GAP-120: novel page renders 200 (runtime component imports + SSR guards) | index.vue, ExportPicker, ImportDialog | B (scenarios 2–11 reachable) | satisfied |
| 12 | GAP-121: SCALE strings resolve from real dicts; parity guard test | call-site rewrite + scale-review-i18n-parity.test.ts | B + D (86 keys, 0 missing en/id) | satisfied |
| 13 | GAP-122: reader routing sibling pages; no NUXT_E4016 / unresolved components | pages/read restructure + routing.test.ts | B (scenario 9 re-run) | satisfied |
| 14 | GAP-123: SSR-safe locale (cookie), no hydration mismatch, legacy migration completes once | useLocale.ts rewrite + follow-up repair | B + suites (18/18) | satisfied |
| 15 | Separate review of exact final diff | final freeze review + GAP-121/122/123 exact-diff reviews + follow-up two-round review | review receipts | satisfied |
| 16 | Scale suites green at committed revision | 9 affected web suites | R (this session: 85/85 passed after correcting the routing-test cwd artifact; the suite anchors on `process.cwd()` = apps/web, run from repo root it misreads paths — runner artifact, not code defect); `vue-tsc --noEmit` exit 0 | satisfied |

Backend/migration/worker regression battery: retained evidence at 858dafb and
dcb2f49 (restore 8/8, SCALE core 76/76, API regression 170/170, worker trio
28/28, remaining scale API files 58/58, UI 39/39, typechecks ×4 exit 0,
prisma generate+validate pass). Backend source is byte-identical from 858dafb
through b7969de (`git diff dcb2f49 b7969de -- packages apps/api apps/worker`
is empty), so those receipts apply unchanged to the committed tree; not rerun.

## Status summary and disposition

- All 050B frozen acceptance criteria: **satisfied**. No missing, contradictory
  or superseded criterion remains open.
- GAP-120, GAP-121, GAP-122: closure checks OBSERVED (browser evidence recorded
  in their entries); UI surfaces close with the reviewed commit b7969de.
- GAP-123: repair + follow-up both reviewed (round-2 APPROVE on frozen diff
  `.git/gap123-followup-diff-20261011.patch` sha256 `03f3f964…87d6`; committed
  blobs `279ada86`/`4ada15b0` match); browser re-verified.
- 050B child: acceptance evidence complete + separately reviewed → closure is
  warranted. GAP-119 applicable criteria (implementation proofs, live author
  flow, scheduled queue delivery, review of exact diff) are satisfied; GAP-119
  closes with 050B. GAP-039 stays OPEN (retains 050C + integrated acceptance +
  human screen-reader pass).
- Commit/push remain author-gated per the repository authorization policy
  (b7969de committed; push/deploy not authorized by this prompt).

## Focused checks run this session (R)

- `pnpm exec vitest run` 9 affected web suites at b7969de: 85/85 passed
  (routing.test.ts initially mis-ran from repo root — its cwd anchor requires
  `apps/web`; correct invocation passes).
- `pnpm --filter @novelforge/web exec vue-tsc --noEmit`: exit 0.
- Freeze patch hash re-verified: `66f1a3b091a80f382284b30978933cbaf3011b44d8b2f0776cd3c115a4eefb54`.
- GAP-123 follow-up patch hash re-verified: `03f3f964b6cf50d0a36ec4445464b069c199280940c82c5b8bf36eeefef387d6`;
  committed blob ids `279ada868ebb2fb2da40d90de622422f44a956be` (useLocale.ts)
  and `4ada15b0fdd2f55381acdc8144a45856b2f6d81a` (useLocale.test.ts) match the
  reviewed working-tree blobs.
- `git diff dcb2f49 b7969de -- packages apps/api apps/worker`: empty (backend
  byte-identical; retained backend receipts apply).
