# Current Project State

## NF-WF-050C findings A–D repaired; LIVE integrated S3 acceptance witnessed — 2026-10-12

Findings A–D (recorded in ISSUES-AND-GAPS under the GAP-039 umbrella) were
repaired under frozen amendment `tasks/NF-WF-050C-amendment-1-findings-abcd.md`
(two read-only review rounds: round 1 CHANGES_REQUESTED on C+D — fixed;
round 2 APPROVE both). Repairs at working tree on top of `23d4a1a`:

- **A**: new `ScaleS3SettingToggle.vue` in the NarrativePanel Policies tab
  (discoverable per-novel enablement, reason recorded, saving/error states,
  capability mirror OWNER/ADMIN/AUTHOR, server still enforces canon:manage);
  en/id keys + toggle suite 6/6.
- **B**: `scale_evidence_sets.source_s3_proposal_id` (new additive migration
  `20261012_nf_wf_050c_evidence_s3_provenance`, bare UUID, no FK — generationId
  precedent); optional `appendSet` `sourceProposalId` validated in-transaction
  (tenant/chapter/version binding + branch/head/policy freshness; the
  proposal's `evidenceSetId` pin deliberately NOT compared to the tip —
  correction recorded after the live 409 witness); provenance select +
  add-as-evidence prefill link in the panel; scale-evidence suite 51/51.
- **C**: advice `code`+`field` PAIR validation against the server-derived
  checklist (combined-key Set.has); negative regressions in service+route
  suites (valid code + wrong field → 422).
- **D**: `list()` stale-marking transaction runs at RepeatableRead
  (read-only, verified lock-free); lock-taking transactions stay at READ
  COMMITTED (P2034 abort analysis — contract wording corrected to "same lock
  order + revalidation protocol as 050A/050B"); stale docstring fixed;
  `putSetting` takes the novel row lock (FOR NO KEY UPDATE) and writes its
  audit entry INSIDE the transaction (exactly one audit row per committed
  PUT; concurrent sibling-key preservation regression test).

Live defects found and fixed during acceptance (all deterministic tests had
missed them): (1) scale-s3 re-declared a WRONG scale vocabulary
(OBJECT/PERSON/GROUP/SETTLEMENT/REGION) instead of the canonical
@novelforge/narrative-rhythm enum (PERSONAL/FAMILY/VILLAGE/TOWN/CITY/
PROVINCE/KINGDOM/EMPIRE) — fixed by importing the canonical constant, prompt
enumeration corrected; the wrong-enum proposal row remains stored as inert
history; (2) extraction prompt did not enumerate the scale values (models
emit lowercase) — fixed; (3) the evidenceSetId pin comparison above — fixed.

Checks executed this session: scale-s3 API 25/25; scale-evidence 51/51;
scale-review/decisions/checklist/proof 85/85; platform.integration 12/12;
restore-scope 8/8; web workspace suites 178/178; toggle 6/6; parity 4/4;
api+ai-services+web typechecks exit 0; eslint exit 0; `git diff --check`
clean; new migration deployed to an owned scratch copy of the acceptance DB
(column verified, scratch dropped), then to `novelforge_acceptance_050b`
(fixture preserved).

**Post-fix independent review verdict (2026-10-12, later session):** the
re-frozen artifact `.git/nf-050c-amendment1-final-r2-20261012.patch`
(sha256 `98b2515001863913459ac9c669cff2bdbe8e4ba36aa7958beb8c98fa453ad45a`,
base `23d4a1a`) received a separate read-only review
(`agent://FinalDiffReview-r2`; not the implementer session): **APPROVE**,
zero findings — both round-1 P2s (parity guard extension; contract
isolation wording) and the round-2 P3 (duplicate-submit test) verified
fixed in actual source; toggle 7/7 + parity 4/4 rerun OBSERVED 11/11.
Technical review is therefore COMPLETE; this is distinct from author
acceptance (see Not done below). Amendment working tree still uncommitted.
Engram attributed writes remain unavailable this session (no
hook-confirmed runtime binding; GAP-021) — this paragraph is part of the
fallback handoff.

**LIVE integrated acceptance witnessed on the owned stack** (API :3000
restarted under this session's supervision to load fixes; web :3001 Nuxt dev;
real 9Router gateway :20127 serving `fable5`→`claude-fable-5-1`; labeled
API-assisted fixture prep: platform-admin registration + gateway/model/
STRUCTURED_EXTRACTOR mapping seed, authorc fixture password argon2 reset;
none printed): browser journey (id + en locales) — Policies tab toggle
renders Off → enable through UI (reason recorded, audit row) → live extract:
2× fail-closed 422 (quote mismatch; then wrong-enum proposals pre-fix) with
Generation rows SUCCEEDED (972/2708 tokens real usage, reportedModel from
attempt ledger, NO proposal row) → 201 happy path, 6 canonical claims
rendered with `Model: claude-fable-5-1` → advice 422→200, validated item
rendered alongside the deterministic checklist → accept through the 050A form
(Set #2 `source_s3_proposal_id` set) → manual alternative linked to the same
proposal (Set #3) → dismiss records actor/reason/identity → disable through
UI → AI section gone, checklist intact, proposal history preserved → stale
extract (old expectedSetId) refused 409 with zero rows. The host's previous
180 s gateway timeout model (Atria-Dawn-Preview) is gone from the gateway's
catalog; the live happy-path receipt now exists.

Not done: commit/push (author-gated); GAP-039 stays OPEN until the author
accepts integrated acceptance + human screen-reader pass; platform-admin user
and seeded gateway/model/mapping rows left in place for the author's own
re-run (removal would delete the only live-acceptance reproduction setup;
author may purge). Engram attributed writes unavailable (GAP-021): no
hook-confirmed runtime session identity this session; this entry is the
fallback handoff.

## NF-WF-050C implemented, separately reviewed, committed 7589388 — 2026-10-12

050C (optional S3 SCALE proposal assistance) is implemented on top of
b7969de and committed as `7589388` on main (author-authorized; parent
b7969de; not pushed; no deployment). Contract
`tasks/NF-WF-050C-scale-s3-assistance.md` frozen after three review rounds;
slices separately reviewed (backend 7 findings fixed, web 1 finding fixed);
final exact-diff review of freeze `.git/nf-050c-final-freeze-20261011.patch`
sha256 `c02349c5a9e561bddd88726713b7ac4c9f54cda8b7976fa12c0290196f9918cf`
verified all findings resolved (2 non-blocking P3 notes applied: advice-item
cap; payload comment corrected to write-time validation + consumption-time
050A re-validation).

Scope delivered: per-novel off-by-default S3 setting in `NovelSettings`
(`PUT/GET /scale-s3-setting`, canon:manage setter, audit
`novel.scale-s3-settings-changed`); inert untrusted extraction proposals
(`scale_s3_proposals`, single additive migration `20261011_nf_wf_050c_…`,
OPERATIONAL restore class 96→97); two-phase pin validation under the 050A
lock order with zero model calls on every pre-model refusal; fail-closed
claim validation (span/quote byte-exact vs pinned content); reportedModel
from the attempt ledger only (never request-model fallback); transient
never-persisted advice gated on INCOMPLETE; recorded dismissal
(CAS-guarded, idempotent); panel section with zero affordances when
disabled, prefills-only "Add as evidence" through the existing 050A form;
en/id keys + parity guard.

Checks executed this session (Windows, 5433): scale-s3 API suite 24/24;
platform.integration 12/12 (new S3 cascade/refusal deleteNovel test);
scale-evidence/review/decisions + restore-scope 123/123; S3 panel 11/11 +
parity 4/4; adjacent web 48/48; ai-services/api/web typechecks exit 0;
eslint on all changed files exit 0; prisma validate/generate pass; live
additive migration applied to `novelforge_acceptance_050b` (fixture
preserved; seeded gateway/model/mapping rows and diagnostic artifacts
removed after evidence; audit trail kept).

Live browser journey (owned acceptance stack, chrome-devtools, author
session; API-assisted fixture steps labeled): disabled default → section
absent, GET setting `{enabled:false}`; API-assisted enable → section
renders (id locale "Saran AI", en locale "AI suggestions"); extract click
→ real 9Router gateway → **502 BAD_GATEWAY**, deterministic checklist
intact, no proposal row, `Generation` row FAILED/TRANSIENT latency 180057
ms with NULL token counts (unknown usage recorded verbatim — NF049);
disabled again → section gone, zero affordances. **REMAINING LIVE GATE**:
the host's real gateway model (Atria-Dawn-Preview) cannot complete the
extraction prompt within 180 s (upstream TRANSIENT), so the live happy-path
extraction receipt awaits a structured-extraction-capable model profile;
deterministic coverage of the happy path is complete (fake-gateway suite).
GAP-039 remains OPEN (retains integrated acceptance + author-owned human
screen-reader pass); 050B/GAP-119/GAP-120–123 closed earlier today (see the
entry below). Engram attributed writes unavailable (GAP-021): no runtime
session identity; this entry is the fallback handoff.

## NF-WF-050B acceptance CLOSED; 050B/050C continuation — 2026-10-11, b7969de

The reviewed 050B acceptance-repair set (GAP-120/121/122/123 fixes, evidence
excerpt, scope amendments 23–25, GAP-122/123 contracts) was committed as
`b7969de` on main (parent `dcb2f49`). Verification at the committed revision:
9 affected web suites 85/85 passed (the routing regression test requires
`apps/web` as cwd — repo-root invocation misreads its path anchors, a runner
artifact, not a code defect); `vue-tsc --noEmit` exit 0; freeze patch
`.git/nf-050b-final-freeze-20261011.patch` sha256 re-verified
`66f1a3b0…f54`; GAP-123 follow-up patch `03f3f964…87d6` re-verified and its
committed blobs (`279ada86` useLocale.ts, `4ada15b0` useLocale.test.ts) match
the reviewed working-tree blobs. Backend PRODUCTION source (excluding tests)
is byte-identical from `858dafb` through `b7969de`, so the retained
backend/worker/migration receipts apply unchanged for their recorded scopes;
correction 2026-10-12: the 858dafb→dcb2f49 leg is not fully identical —
`apps/api/src/scale-evidence-migration.test.ts` changed there (+142/−21), and
that test file's own receipt is recorded at dcb2f49 (GAP-119 thirteenth
repair, 8/8). The blanket "backend byte-identical" wording originally written
here was too broad; see the scope correction in
050B-acceptance-reconciliation-2026-10-11.md.

Acceptance reconciliation complete: criterion-to-evidence matrix for the
frozen 050B contract in
[050B-acceptance-reconciliation-2026-10-11.md](050B-acceptance-reconciliation-2026-10-11.md)
— all criteria satisfied, none missing/contradictory. Disposition: **050B
child CLOSED** (implementation + live acceptance + separate reviews complete).
**GAP-120/121/122/123 CLOSED** (closure checks observed; UI surfaces close
with reviewed commit b7969de). **GAP-119 CLOSED** (its closure criteria —
real API/worker race/negative proofs, S2 recovery/migration checks, localized
author-flow acceptance, separate exact-diff review — are satisfied; umbrella
seams implemented through 050B). **GAP-039 remains OPEN** (retains 050C,
integrated author-workflow acceptance with S3, and the author-owned human
screen-reader pass). Commit is done; push/deployment remain author-gated and
were not performed.

Supersedes the "Still open: commit" note in the acceptance entry below.

## NF-WF-050B live author-workflow acceptance — 2026-10-11, dcb2f49 + uncommitted acceptance WIP

Live browser acceptance of the 050B author workflow executed on Windows 11
against the owned disposable stack (API :3000, web :3001 Nuxt dev, worker with
workflow-runs/memory-rebuild/publication/notifications queues on Redis
`nf-redis-acceptance` :6399, PostgreSQL `nf-pg-5433`/`novelforge_acceptance_050b`,
9Router gateway :20127). Baseline revision dcb2f49 (GAP-119 thirteenth repair,
committed with recorded 8/8 verification and separate APPROVE review). The
working tree additionally carries the applied stash `nf050b-acceptance-wip`:
GAP-120 (novel workspace page 500 — 12 unresolved template components) and
GAP-121 (SCALE review i18n key-path mismatch, ~100 call sites) fixes with
updated suites (web vitest green), plus a GAP-122 record and its reviewed
reader-routing repair. These changes are uncommitted. Separate exact-diff
reviews (2026-10-11): GAP-121 portion APPROVE (real-dictionary parity guard
added); GAP-120 portion CHANGES_REQUESTED on process only — the two
import-export guard files are outside the frozen allowlist and are covered
by scope-amendment proposal 23–25 (bounded re-review APPROVE; retrospective
record in GAP-119 — the amendment process requires no separate author
approval). Commit awaits the author's existing authorization
policy.

Scenario disposition (correction 2026-10-11, separate outcomes per contract;
evidence kind in parentheses — browser UI, API, worker log, runtime dictionary;
API-assisted fixture/policy setup is identified as such and is not UI
evidence; raw worker-log excerpts keep their source timestamps and are
persisted excerpts, not independently re-run checks):
1. Registration + session (fresh disposable author) — VERIFIED (browser UI).
2. Version-bound SCALE evidence entry through the SCALE review panel
   (server-validated UTF-16 span + exact saved-HTML quote) — VERIFIED
   (browser UI).
3. HARD policy init — VERIFIED (API setup: pinned API PUT with
   `authorDecision: APPROVE`, recorded as an approved standing-change
   proposal).
4. Incomplete HARD assessment renders INCOMPLETE with STALE_EVIDENCE_SET
   guidance (explanation, hypothetical example, next action) and blocks
   publication (HTTP 409 `SCALE_ASSESSMENT_INCOMPLETE`, chapter stays DRAFT)
   — VERIFIED (browser UI + API).
5. SOFT flip via full-pin CAS makes the same input advisory and publication
   succeeds — VERIFIED (browser UI + API).
6. Author decisions: approved a standing change (TOWN/55 applied), rejected
   one (no state change), recorded ALTERNATIVE (successor proposal created,
   original preserved) — VERIFIED (browser UI).
7. Exception proposal on a stale set refused 409 with no writes — VERIFIED
   (API).
8. Published chapters refuse text edits (immutable); chapter-version-scoped
   evidence/receipt recovery verified on a draft's v2 (clean slate, no stale
   inheritance, fresh NO_OPERATIVE_CONFLICT) — VERIFIED (browser UI + API).
9. Reader visibility — VERIFIED (API + browser UI; corrected 2026-10-11).
   Public API: anonymous
   `GET /api/public/novels/<slug>/chapters/N` → 200 with pinned published
   content for chapters 1–3 and 404 for unpublished/draft (API,
   independently re-runnable). Reader UI was BLOCKED at evidence time by
   GAP-122 (`NUXT_E4016`; `/read/:slug` rendered only the novel overview).
   After the contract-reviewed GAP-122 repair, scenario 9 was re-run in
   the real browser against the live acceptance stack: overview renders,
   pinned chapter bodies render (v1/v2), direct load and refresh work,
   previous/next and back navigation work, unpublished chapters show the
   localized not-found surface with no content leak, id locale renders
   localized reader chrome, console free of `NUXT_E4016` and
   component-resolution warnings. The re-run surfaced a pre-existing,
   separately-owned hydration defect, recorded as GAP-123 (out of the
   GAP-122 contract scope).
10. en/id locale switch renders localized workspace and SCALE strings with
    canonical machine values untranslated — VERIFIED (browser UI). English
    per-key fallback verified at the runtime dictionary and `t()` mechanism
    level only (`review.showFullHash` missing in `id`, resolved from `en`) —
    this is NOT a complete browser fallback journey and must not be cited as
    one. (2026-10-11 follow-up: one real browser fallback case — the id
    workspace SCALE panel rendering `Show full hash` from `en` — was later
    witnessed during the GAP-123 verification; this acceptance-time caveat
    otherwise stands.)
11. Scheduled publication through the real BullMQ worker — VERIFIED (worker
    log; the verbatim excerpt in `050B-live-acceptance-evidence-2026-10-11.md`
    is a persisted excerpt with source timestamps, not an independently
    re-run check): scheduling conservatively stales 050A data (two
    deterministic refusals `outcome:refused code:REVIEW_STALE`, no public
    flip, audit retained), then a post-schedule fresh review let the same
    publicationId publish at due time (`outcome:published` 113 ms after
    `scheduledFor`; public API serves the pinned content anonymously; draft
    chapters 404 — API checks).

Defects found during the journey: GAP-122 (recorded at evidence time as
not-repaired: `/read/:slug` did not render `<NuxtPage />`, so the nested
chapter reader route never displayed chapter bodies, `NUXT_E4016`) has
since been fixed by the separately contracted and reviewed reader-routing
repair described under scenario 9; its entry carries the browser closure
evidence. Still recorded but since REPAIRED (2026-10-11, separately contracted under
`tasks/GAP-123-ssr-safe-locale-repair.md`; final exact-diff review
**APPROVE** — frozen diff sha256 `926b5f5fb59e8b4edc9effeba77974ac7fe5198d2c011bfa5ae3e862f48e84e4`,
4 info findings, no blockers): GAP-123 — locale hydration mismatch (en server HTML vs
localStorage-selected id; `useLocale` kept the locale in localStorage,
invisible to SSR). Fix: Nuxt `useState` request-scoped locale + `nf-locale`
cookie + post-hydration localStorage migration; browser re-verified in en
and id on the reader and workspace with no hydration warnings, storage
failure hardening and the real `Show full hash` en-fallback witnessed in
the id UI. **Follow-up (2026-10-11, post-APPROVE):** an external re-review
found four defects in the applied repair (unused `ref` import failing
ESLint; legacy-`en` migration never completing because the callback
returned on `legacy === state.value`; per-consumer `onNuxtReady`
registration defeating once-per-load; a synchronous test stub masking the
hydration deferral) — recorded under GAP-123 before the workaround. The
bounded amended-contract repair is applied: once-flag
`useState("locale-migrated")` registers exactly one migration callback per
load; migration completes for both legacy values (cookie written even when
the value equals the locale); the test harness queues and explicitly
flushes `onNuxtReady` with pre-flush hydration assertions and call-count
proof. useLocale suite 18/18; ESLint exit 0 on both changed files; web
typecheck exit 0; affected reader/routing/GAP-121 suites 53/53; browser
legacy-migration path re-verified in en and id on the live stack (console
clean, cookie written for both legacy values, SSR HTML follows the
cookie). The earlier **APPROVE** covers only the earlier diff; the
follow-up got its own two-round separate review — round 1
CHANGES_REQUESTED (HIGH mechanism claim empirically disproven, fragility
accepted and fixed with an explicit `mockClear()`; LOW fixed with a
zero-legacy-reads assertion on the cookie-present path), round 2
**APPROVE** on the re-frozen diff `.git/gap123-followup-diff-20261011.patch`
(sha256 `03f3f964…387d6`, working-tree blobs `279ada86`/`4ada15b0` —
see the GAP-123 entry and contract trail); commit remains author-gated.
Raw scenario-11 worker-log excerpt and
reader-visibility
negatives persisted in
`docs/14-progress/050B-live-acceptance-evidence-2026-10-11.md` (disposition
review APPROVE; two minor findings, both addressed).

Still open: commit per
the repository authorization policy (scope
amendments 23–25 are recorded, retrospective and separately reviewed —
no amendment-level author approval applies; the GAP-123 repair carries
its own APPROVE exact-diff review). Final exact-diff review of
the frozen tree
(22 files, sha256 `66f1a3b091a80f382284b30978933cbaf3011b44d8b2f0776cd3c115a4eefb54`,
`.git/nf-050b-final-freeze-20261011.patch`): **APPROVE** (2026-10-11,
freeze_verified true; 3 info findings, no blockers); edits made after that
freeze are limited to status lines recording this verdict. GAP-119 and
GAP-039 remain OPEN with their retained closure criteria (050C, integrated
author-workflow acceptance, human screen-reader pass). Not pushed; no
production deployment.

## GAP-119 twelfth repair + fresh Windows acceptance — 2026-10-11, 858dafb

At exact e40adc9, the Windows-host acceptance rerun surfaced a deterministic
EPERM in `apps/api/src/scale-evidence-migration.test.ts` — the unrepaired
sibling of the awaited-cleanup fix committed in e40adc9. Standalone probes
measured the Prisma CLI child's ~400–500 ms cwd-handle release latency and
reproduced the failure mode exactly; the fix ports the proven sibling
pattern (awaited, symlink-guarded, transient-code retry; per-home error
collection). A separate read-only reviewer verified the frozen diff
byte-identical to the working tree and returned APPROVE_WITH_FINDINGS with
two non-blocking low findings (recorded in GAP-119). Committed as 858dafb
on main (parent e40adc9). Not pushed.

Fresh acceptance evidence at 858dafb content (= e40adc9 + this test-file
fix), Windows 11 / Node v24.14.1 / pnpm 12.5.1 / PostgreSQL 16.15 at
127.0.0.1:5433 (host/port overridden from repo .env via shell env; .env
untouched): restore-scope 8/8; SCALE core 76/76 ×2 (32+36+8); API
regression 170/170 (scale-evidence 47, manuscript 21, narrative 53,
publication 17, state-consumers 32 — the eleventh-repair fixture failures
no longer reproduce); worker trio 28/28; remaining 12 scale API files
58/58 (filename correction: `scale-context-gate-agreement.test.ts`, not
"ctx-gate-agreement"); UI ×5 39/39 (--maxWorkers 1, jsdom evidence only);
prisma generate+validate pass; all four typechecks exit 0; changed-source
ESLint exit 0 (`final-text-review-gate.ts` lives under
`packages/ai-services/src/`, correcting the earlier apps/api path);
`git diff --check` clean. Pre-fix failed runs left one temp home each; all
owned leftovers were removed only after post-fix cleanup was verified
across 5 runs with zero new leftovers.

Not yet evidenced (separate gates, unchanged): live author/browser workflow
in en/id with fallback; real isolated BullMQ queue delivery. GAP-039 and
GAP-119 remain OPEN; GAP-039 additionally retains 050C and integrated
author-workflow acceptance.

## Author-authorized 050B integration — 2026-10-09

The author authorized merging work/nf-wf-050b-scale-review through exact
800cf3707d488f88cbc2447d1d992f3aeb6d89bf into main parentd928653.
Both separate actors approve the resolved integration tree. Production/schema/
worker files match the reviewed branch; two documentation conflicts retain the
raw external acceptance receipt and accurate corrections. GAP-108 recurrence12
and13 now have distinct headings with their own historical evidence.

Fresh merged-tree proof:state-consumers32/32 and nine UI suites71/71 pass;
ai-services/API/worker/web typechecks and Prisma generation pass. The API fixture
was copied with only a unique scratch database name because its original fixed
target already exists. The owned database/copy were removed and final absence
verified; the existing database was not reset. No working migration or live
application deployment was performed. Prisma validation and corrected scoped
lint pass. Lint's first invocation failed on a nonexistent old API gate path;
GAP-119 records that command error and the successful shared-package retry.

Historical next-work list from the integration entry (superseded for item 1 by
the fresh evidence above; items 2–6 remain in dependency order):

1. Complete 050B's frozen merged-revision API/domain/worker/migration regressions
   on owned disposable targets. Record exact commands, counts and revision;
   historical external totals are not a replacement for this acceptance.
2. Verify the live SCALE author journey in en/id and fallback: evidence,
   incomplete HARD checklist, SOFT advice, approve/reject/alternative, stale
   recovery, immediate publication and isolated scheduled queue delivery.
   Close child acceptance only with the required evidence and separate review.
3. Draft and separately review 050C's optional S3 contract, then implement:
   off-by-default per-novel enablement, bounded pinned extraction/missing-data
   suggestions, structured evidence validation, author decisions and NF049
   usage/model attribution. No automatic canon/standing approval. 050C is not
   yet a dispatch-ready contract; GAP-039 stays open through integrated acceptance.
4. Perform the author-owned GAP-051 human screen-reader audit. Automated axe
   results cannot complete that gate.
5. Complete live gateway/storage/service credentials and working additive
   migration preflight, then fresh release regression/load/recovery evidence.
   Historical NF039/NF048 checks do not prove the new merged release. Record
   approved performance/resource/recovery targets; no local LLM quota enforcement.
6. Obtain the author's explicit production deployment approval after release
   gates pass. Integration is not deployment authorization.

Separate maintenance remains:GAP-029 resolver duplication/synchronization,
GAP-014 chronology attribution, GAP-013 serving-model evidence where required,
and per-host GAP-027/GAP-108 readiness/recovery. GAP-023/NF002E stays blocked on
a real consumer design; do not build a speculative event outbox. GAP-021 is
per-boundary, correcting the earlier blanket claim here: 2026-10-09
boundaries had no runtime binding (file fallbacks); 2026-10-11 boundaries
restored it and wrote attributed Engram checkpoints (GAP-122/GAP-123
APPROVE); the current GAP-123 follow-up boundary again reports no identity,
so no attributed save is claimed for it and CURRENT is its fallback
handoff. Do not redispatch integrated NF048/049 or050A/050B code.
GAP-018/GAP-117/GAP-063 retain their bounded CLOSED receipts; GAP-039/GAP-119
remain OPEN pending the retained acceptance scope. Older dispatch notes below
are historical and superseded by this integration update.

## External 050B eleventh repair re-review — 2026-10-09, 800cf37

Separate technical and recovery actors APPROVE the fixture source at exact
800cf3707d488f88cbc2447d1d992f3aeb6d89bf against 9f51c4a. Production code,
schema and worker behavior are unchanged. Valid empty access and strict fresh
review after status/head changes are preserved; negative refusal checks remain.

Fresh Windows verification: state-consumers 32/32, API typecheck, scoped ESLint,
submitted diff whitespace and Prisma generation pass. To preserve the existing
novelforge_test_stateconsumers database, a temporary copy differed only in its
database name (novelforge_test_050b_review_800cf37, verified absent before use).
The owned database and copy were removed afterward; the existing database remains.
This is namespace-adjusted fixture execution, not execution of the unchanged
fixed-name harness against the author's database.

GAP-119 below corrects two documentary defects in the submitted annotations:
putScalePolicy changed materially, and GAP-108 recurrence13 must not absorb
recurrence12's narrative. The external aggregate report remains documentary
evidence without literal execution commands. Earlier backend146/146, migration2/2
and UI71/71 receipts are historical checks, not fresh reruns for this revision.

The two previously failing fixture paths are now locally verified; no production
source blocker was found. The bounded repair can be integrated with these
documentary corrections. Full050B completion, live author/browser acceptance,
BullMQ delivery and release gates remain separate; GAP-039/GAP-119 remain OPEN.
Main/client restored at bc9a140. No implementation merge, commit or push performed.
Engram attribution unavailable (GAP-021); this record is the fallback handoff.

## External 050B tenth repair re-review — 2026-10-09, 9f51c4a

UI fixture/comment changes APPROVE on exact
9f51c4a221362aa36e037ddc103c89b6a63cc711. Both separate reviewers confirm no
backend/recovery/schema changes from approvedf0cd711. Fresh local nine-suite UI
run71/71 passes with --maxWorkers1; web typecheck, Prisma generation and submitted
diff whitespace pass. Source no longer has the two NarrativePanel fixture
failures. Main remains276c48c; no merge or full050B completion.

Overall acceptance still requests changes: the external Ubuntu report records
two failing state-consumers tests. Reviewers trace both to fixtures inconsistent
with frozen050B: empty access is valid; status head changes require fresh review.
Repair the malformed payload/required-author-context fixtures and review flow,
preserving negative error assertions. Do not enforce nonempty access, exempt
status changes from freshness or request another author product decision.
GAP-119 records exact corrections and closure checks.

The external report also needs corrected counts (exception-strict has8 active
tests, not7), reconciled totals/raw commands, clarified pre-existing scratch
ownership/recreation and correction of the false claim that narrative.ts never
changed during repairs2–10. Ubuntu results are external claims, not fresh local
DB evidence. No databases were reset in this turn; existing data preserved.
Backend tests were not rerun because backend is byte-unchanged fromf0cd711;
the previous146/146 and migration2/2 remain historical receipts.

Main checkout/client restored; no additional implementation edits. UI remains
mock/jsdom with canvas warnings, not a live browser acceptance. Queue delivery,
full frozen regression closure and release gates remain separate. GAP-039/
GAP-119 stay OPEN. Engram attribution unavailable (GAP-021); this is the fallback
handoff. No commit/push or implementation merge performed in this review.

## External 050B ninth repair re-review — 2026-10-09, f0cd711

Both independent reviewers APPROVE exact source
f0cd71123dca62883fc4981b82fe9401cf0e2a69; no remaining source blocker found in
the assigned paths. Malformed non-null proof now fails closed in gate/context;
genuine historical-null handling stays separate. Amendments21/22 and worker20
actual-byte receipts match submitted hashes. Main remainsb622607; no merge.

Overall acceptance still requests changes: expanded required UI checks expose
two stale NarrativePanel fixtures. The suite expects four tabs and selects
Readouts at index3; SCALE adds a fifth tab and moves Readouts. Select Readouts
by label, assert SCALE reachability and preserve drama payload/result checks.
Update the stale four-tab/no-SCALE header comment too. These are already allowed
paths. Reviewer verified unchanged drama handler/template against main; no
production drama regression is claimed. GAP-119 records exact failure evidence.

Fresh resumed verification:17 backend/domain/worker suites146/146 pass; isolated
migration2/2 pass with120s timeout. Expanded UI9 suites: initial run selects no
tests due nine fork-worker startup timeouts; --maxWorkers1 retry runs71 tests,
69 pass and2 stale fixtures fail. All four package typechecks, Prisma
generate/validate, explicit two-path production ESLint and submitted whitespace
pass. UI remains mock/jsdom with canvas warnings. No all-green UI or full050B
completion is claimed. Other broad DB regression targets already exist with
unverified ownership; they were not reset. Browser/queue acceptance stays separate.

Fourteen current owned scratch names were absent before resumed tests (the
interrupted owned migration scratch was first dropped), and final absence
verified after cleanup. Existing unrelated databases preserved; tracked migrations
unchanged; main/client restored. Earlier EPERM did not recur; no harness repair
claimed. GAP-039/GAP-119 stay OPEN pending fixture repair and frozen acceptance.
Login interruption lost process handles; fresh runs supply this evidence.
Engram attribution unavailable (GAP-021); this is the fallback handoff. No
commit/push or implementation merge performed in this review.

## External 050B eighth repair re-review — 2026-10-09, 97da59c

CHANGES REQUESTED by both separate reviewers on exact
97da59c1e4c5497f0329d4f9c22de837e54289d0. Main remainsaf9450c; no merge.
New no-SCALE reviews now emit pinned NOT_CONFIGURED; context errors propagate.
Both proposal/outcome workspace fields are validated. Historical null receipt
head checks and recovery/CAS remain intact. Remaining source issue: malformed
non-null proof parses to null and can enter legacy approval when no SCALE rows
exist. Reserve legacy compatibility for actually null stored proof; reject
non-null parse failure as REVIEW_STALE. GAP-119 records regression and scope
requirements, including two new test paths and a changed worker review hash.

Fresh local:17 selected backend/domain/worker suites144/144 pass; isolated
migration2/2 pass with --testTimeout120000; UI38/38 pass. All four package
typechecks, Prisma generate/validate, explicit three-path production ESLint and
submitted diff whitespace pass. Prior Windows EPERM did not recur; the migration
harness is unchanged, so this is a passing run, not proof of a portability fix.
UI remains mock/jsdom with canvas warnings; workers use direct fire calls,
without BullMQ delivery. No live browser workflow or deployment performed.

Fourteen scratch database names were absent before tests and finally absent
after cleanup (two suites self-clean). Tracked migrations unchanged; main/client
restored. External Ubuntu service-loss evidence is GAP-108, not this host's
readiness. GAP-039/GAP-119 remain OPEN. Next: malformed/non-null boundary fix,
exact scope/hash regularization and separate review. Engram attributed writes
remain unavailable (GAP-021); CURRENT is the fallback handoff. No commit/push
or implementation merge performed in this review.

## External 050B seventh repair re-review — 2026-10-09, 88883c4

CHANGES REQUESTED by both separate reviewers on exact
88883c4f589768cd45bd51bc33a70d600b833d7f. Main remains260e9a8; no merge.
Strict exception payload/coverage validation is shared by producer/gate/context.
Immediate-publication route and configured-SCALE worker positives/refusals now
have real caller tests. Recovery guarantees and earlier protocol/UI fixes remain
intact; the old worker hash is annotated and exact-artifact re-review matches.

Remaining: new no-SCALE reviews still write null (legacy) instead of pinned
NOT_CONFIGURED, allowing subsequent head changes to evade the new-proof gate.
Strict exception provenance omits proposal/outcome workspaceId. Three added test
paths lack scope amendments. GAP-119 records the source evidence and closure
tests; these source traces are not observed normal API exploits.

Fresh local selected run:137/139 backend/domain/worker tests pass; both migration
tests time out at30s. Isolated migration rerun with120s timeout:1/2 pass; populated
upgrade test fails in Windows temp cleanup with EPERM. No wholly green migration
receipt is claimed. UI38/38, ai-services/API/worker/web typechecks, Prisma
generate/validate, four changed-production-path ESLint checks and submitted diff
whitespace pass. UI remains mock/jsdom with canvas warnings. Worker tests call
the real fire function without Redis/BullMQ. Raw policy-update race evidence is
not a production S2 mutation serialization proof.

Twelve owned scratch database names were absent before testing, disconnected
and dropped; final absence and unchanged tracked migrations verified. Main/client
restored. Locked temporary directory050b-mig-89U7iM remains under this host's temp
folder; no unsafe recursive cleanup or working-data reset attempted. GAP-039/
GAP-119 stay OPEN. Next: pinned new no-SCALE receipts, workspace provenance,
scope amendments and clean migration verification, followed by exact-diff review.
Engram attribution unavailable (GAP-021); this is the fallback handoff, not a save.
No commit/push or implementation merge performed in this review.

## External 050B sixth repair re-review — 2026-10-09, 64168cd

CHANGES REQUESTED on64168cdba61cbe5c72f57739c0bf458d6c492028.
review_mutations_034 verifies the three previous repairs but finds malformed
retained exception coverage is still trusted. review_recovery_034 approves
assigned recovery source pending fresh checks. Main remains829613d; no merge.
Complete protocol recomputation is shared by gate/context, normal successful
review now refreshes coherent context, and actual status routes/save race and
scheduled worker function have new acceptance tests. Recovery/CAS remains intact.

GAP-119 records one remaining source blocker: an approved historical exception
with duplicate claimIndices:[0,0] can supply coverage because both writer and
gate resolver only check integer arrays. Use one strictly validated resolver
for producer/gate/context and reject malformed provenance/coverage. This is
source tracing of corrupted retained data, not an observed normal API exploit.
The worker-test amendment hash differs from the submitted blob; annotate and
re-review actual bytes. Immediate publication and configured-SCALE worker
positive acceptance remain unevidenced in these new suites.

Fresh local checks:123/123 backend/domain/migration tests and38/38 component/axe
tests pass without skips. ai-services/API/worker/web typechecks, Prisma
generate/validate and submitted diff whitespace pass. Explicit six-path ESLint
run has no errors, but ignores ScaleReviewPanel.vue with a configuration warning;
this is not Vue lint proof. UI remains mock/jsdom with canvas warnings. Worker
tests execute fireScheduledPublication directly, without Redis/BullMQ delivery.
No live browser workflow or immediate publication proof is claimed.

All nine scratch database names were absent before tests, disconnected and
dropped (one suite self-cleans); final absence verified. Tracked migrations
unchanged; main/client restored. GAP-039/GAP-119 remain OPEN. Next: validated
retained exception resolver, caller positives/remaining frozen acceptance and
correct exact scope receipt, followed by separate review. Engram attribution
remains unavailable (GAP-021); this is the fallback handoff, not an Engram save.
No commit/push or implementation merge performed in this review.

## External 050B fifth repair re-review — 2026-10-09, 33db685

CHANGES REQUESTED on exact33db68512d786273c5ce6c368346162fe25d48b4.
review_mutations_034 found incomplete retained-proof/live assessment validation
and two context/UI wiring defects. review_recovery_034 approves assigned recovery
source subject to fresh checks and scope acceptance. Main remains d549887; no
implementation merge. Empty access, HARD reasons, superseded mutation refresh,
context-derived checklist and two shared-gate negative cases are repaired.
Actual old-JSON restore, pre-change checkpoint contents and transactional CAS
repairs remain intact.

Remaining: a matching-pin WITHIN_REACH receipt with empty claims can pass HARD
gate checks despite absent evidence (also stale evidence/malformed standing).
This is a traced source path, not an executed exploit. Reuse one complete
deterministic producer/live protocol comparison in both gate and context
applicability instead of adding individual state exceptions. The context endpoint
currently omits even the new live-state validator. A normal successful review
also fails to refresh its receipt/checklist, retaining old ABSENT/STALE guidance.
GAP-119 records fixes and negative/deferred acceptance requirements.

Fresh local selected checks:108/108 backend/domain/migration tests and34/34
component/axe tests pass, without skips. ai-services/API/worker typechecks,
Prisma generate/validate and submitted diff whitespace pass. The DB-backed gate
suite calls the shared helper; it does not execute direct status transition,
immediate publication or scheduled worker. UI remains mock/jsdom with canvas
warnings. No web typecheck/lint or live browser acceptance is claimed.

All five owned scratch database names were absent before tests, then dropped
after connections closed; absence and unchanged tracked migrations verified.
Main/client restored. Proposed scope records now describe additions through12,
but generic actors and uncommitted input revisions do not identify exact reviewed
content; retain external attribution as a claim pending traceable review.
GAP-039/GAP-119 remain OPEN. Engram attribution is unavailable because the runtime
hook supplied no authoritative session identity (GAP-021); this is the fallback
handoff, not an Engram save. No commit/push or merge performed in this review.

## External 050B fourth repair re-review — 2026-10-09, 8ccb504

Overall CHANGES REQUESTED on exact external
8ccb504b2440febb0751e2a41555d8c6d96ebd4e. review_mutations_034 requests changes;
review_recovery_034 approves recovery/source conditionally on local checks and
scope regularization. Main remains9c1d323; no implementation merge. Actual
old-JSON STORY restore and captured pre-change checkpoint contents are now
exercised. Direct policy current-version locks, coherent RepeatableRead context,
head-scoped exceptions, stricter parsing and read-response sequencing improved.

GAP-119 records remaining empty-access UI rejection, missing HARD reason
validation, late successful mutation reconciliation, false-complete checklist,
retained state versus live evidence mismatch, and incomplete amendment coverage.
These are source findings; no executed exploit or observed HTTP500 is claimed.

Fresh local selected checks:90/90 backend/domain/migration tests and25/25 UI
component/axe tests pass without skips. ai-services/API/worker typechecks,
Prisma validation, generated client and submitted diff whitespace pass. UI
proof remains mock/jsdom; canvas warnings occurred. No web typecheck/lint,
live browser author flow or publication API/worker race proof is claimed.

All four dedicated scratch databases were absent before tests and dropped
after connections closed; absence and unchanged tracked migrations verified.
Main checkout and its generated Prisma client restored. GAP-039/GAP-119 remain
OPEN. Next: repair every remaining boundary with negative/deferred regressions,
regularize exact extra paths through separate review, and submit a new exact
revision. Engram attribution remains unavailable: the runtime hook supplied no
authoritative session identity (GAP-021). This is the fallback handoff, not a
saved Engram checkpoint.

## External 050B third repair re-review — 2026-10-09, e6b6305

CHANGES REQUESTED by separate actors review_mutations_034 and
review_recovery_034 on exact external e6b630565c59131c3035b95646fd5f0373dde480.
Main remains c45043d; no implementation merge. Transaction-bound audits,
proposal locks/current-version refusal, decision chapter scope, returned head,
receipt serialization and evidence rendering are verified repairs. GAP-119
records remaining direct-policy obsolete-version acceptance, incoherent context,
same-selection response races, incomplete retained-proof validation, raw JSON
decision authoring, and missing actual restore/pre-change snapshot evidence.

Fresh local checks: selected backend/domain/migration tests 59/59 and UI
component/axe tests 18/18 pass, without skips. ai-services/API/worker typechecks
and Prisma validation pass. Submitted whitespace check fails on four trailing
whitespace lines in the scope-amendment record. UI checks use mocks/jsdom;
canvas warnings occurred. Passing simulated restore tests do not establish
application checkpoint restoration. No web typecheck/lint, live browser flow
or API/worker publication race proof is claimed.

Both disposable database names were confirmed absent before testing, then
dropped after connections closed; absence and unchanged tracked migrations were
verified. Main checkout and its generated Prisma client are restored. Scope
amendments remain proposals requiring genuine separate review; the submitted
implementer-authored record does not independently approve them. GAP-039 and
GAP-119 remain OPEN. Engram attributed writes remain unavailable because the
runtime hook supplied no authoritative session identity (GAP-021); this record
is the fallback handoff, not a saved Engram checkpoint.

## 050B third repair dispatch — 2026-10-09

The author authorized publishing the separately reviewed761ce1d rejection
receipt and requested the next external prompt. Both technical actors request
changes; review_mutations_034 APPROVE the scoped CURRENT/GAP-119 evidence
record. Fetch this main update into work/nf-wf-050b-scale-review. Complete
serial reviewed slices: transactional/backend correctness; real recovery/race
proofs plus valid fixture repair; then coherent typed UI/API and async behavior.
Address ALL latest GAP-119 findings, not merely the two failing tests. Preserve
accepted repairs and frozen contracts, regularize scope amendments with actual
separate review, and retain historical records with explicit corrections.
No implementation merge/050C/release approval is granted. GAP-039/GAP-119 stay
OPEN. Earlier no-commit/main70c3005 notes describe the review boundary. Engram
attribution is unavailable (GAP-021); these published docs are the handoff.

## External 050B second repair re-review — 2026-10-09, 761ce1d

CHANGES REQUESTED by both separate reviewers; main remains70c3005, no merge.
HIGH standing UUID and composed data transaction, stale quiet checks, decision
current-version/exception validation, malformed route errors, branch history
and claim/vocabulary repairs improved. GAP-119 now records remaining audit
rollback escape, incomplete direct policy pins, proposal/route source scope,
real evidence UI type mismatch, busy-state races, false-fresh context, shallow
retained protocol validation, omitted receipt serialization and old response head.

Fresh local selected checks:54/56 backend/domain/migration tests pass;2 fail
before intended boundaries because fixtures have invalid source quote/span and
sequence2 predecessor. Fix fixtures without weakening production validators.
Successful HIGH standing/direct approval tests now pass. UI component/axe6/6,
Prisma generate/validate and ai-services/API/worker typechecks pass; submitted
diff whitespace passes. No skips; canvas warnings occurred in jsdom. No web
typecheck/lint, real API/worker-race, saved UI flow or old STORY restore proof
is claimed. Migration preservation is NOT application checkpoint restoration;
the external old-snapshot claim must be corrected and the real test added.

Own scratch databases cleaned and absence verified; working data and migration
source preserved. Main/client restored. No source fix, merge, commit or push.
GAP-039/GAP-119 remain OPEN; scope amendments and required acceptance proofs
remain pending. Engram attribution unavailable (GAP-021); this is the fallback.

## 050B second repair dispatch — 2026-10-09

The author authorized publishing the separately reviewed709ba66 rejection
receipt and requested the next external repair prompt. Both source reviewers
request changes; review_mutations_034 APPROVE the scoped CURRENT/GAP-119
evidence record. Fetch this main update into work/nf-wf-050b-scale-review and
repair ALL remaining findings, preserving the frozen contract and historical
receipts. Required boundary proofs include a successful HIGH standing approval,
stale quiet-evidence refusal, obsolete-version/invalid-exception refusal, atomic
direct approval and the real saved-chapter UI/API flow. Passing current selected
tests is not acceptance of those untested boundaries. No implementation merge
or050C dispatch is authorized by this publication. GAP-039/GAP-119 stay OPEN.
Prior main/no-commit statements describe the review boundary. Engram attribution
is unavailable (GAP-021); these published records are the fallback handoff.

## External 050B first repair re-review — 2026-10-09, 709ba66

CHANGES REQUESTED by both separate reviewers; do not merge. Tenant ownership,
HIGH mutation plumbing, branch-aware policy writes and review verdict/re-review
repairs improved, but GAP-119 still records invalid UUID standing change-set ID,
stale quiet-evidence bypass, obsolete-version approvals, invalid exception
approvals and non-atomic direct approval. UI evidence/decision schemas and scale
vocabulary remain wrong; selection races, context applicability, branch history
and malformed-input handling still need correction. Required restore/approval/
concurrency proofs and independent amendment attribution remain incomplete.

Fresh local selected checks at exact709ba66:44/44 decision DB/private-migration/
assessor/domain/classification tests and6/6 component/axe tests pass, no skips.
Prisma generate/validate and ai-services/API/worker typechecks pass; submitted
diff whitespace passes. Canvas warnings occurred in jsdom. These passes do not
prove real saved-chapter UI, successful HIGH standing approval, old-snapshot
restore or real route/worker races; those checks were not run. Web typecheck
and changed-source lint were also not run.

Only owned scratch databases were used; both dropped and absence verified.
Working data/migration source preserved; main/client restored to b068227. No
merge/commit/push or source repair. GAP-039/GAP-119 stay OPEN; no 050C dispatch.
Engram attribution unavailable (GAP-021); this is the repair handoff fallback.

## 050B repair dispatch authorization — 2026-10-09

The author authorized publishing the reviewed rejection receipt and requested
an external repair prompt. Both technical reviewers reject external1ad5c47;
review_mutations_034 separately APPROVE the CURRENT/GAP-119 review documentation.
The receiving coordinator must fetch the published main documentation, merge it
into work/nf-wf-050b-scale-review without losing historical evidence, then repair
ALL GAP-119 findings against the frozen 050B contract. Obtain separate review
of bounded scope amendments before out-of-contract edits; preserve required
negative tests and acceptance criteria. Do not merge the implementation or
dispatch 050C. Verify the final repaired revision locally on that host.
Engram attribution is unavailable (GAP-021); these records are the handoff
fallback. Prior no-commit/main-fed3cea statements describe the review boundary.

## External 050B review — 2026-10-09, 1ad5c47

CHANGES REQUESTED by both separate reviewers; no merge. Main remains fed3cea.
GAP-119 records tenant history exposure, missing standing checkpoint/revision,
repinnable stale proposals, direct policy bypass, inconsistent review verdict/
fresh re-review refusal, incomplete exception pins and unusable/mismatched UI.
Repair the submitted code against the unchanged frozen contract, not the gate
requirements. Missing migration/restore proof and unreviewed scope additions
also require correction. GAP-039 and GAP-119 stay OPEN; no 050C dispatch.

Local checks at exact1ad5c47: Prisma generate/validate and25/25 selected pure
assessor/domain/classification tests pass;5/5 panel/component axe tests pass
with jsdom canvas warnings. ai-services/worker typechecks pass; API typecheck
fails TS2339 in scale-decisions.test.ts554/555/558 (untyped alternative proposal).
Submitted diff whitespace passes. No DB-backed gate/decision/migration tests,
old-snapshot restore, web typecheck or full release verification was run. These
limited passes do not prove the required author/API/worker workflow.

No working database or source changes, no scratch resources created. Main
checkout restored; no merge/commit/push. Engram attribution is unavailable
(GAP-021); these local review records preserve the next repair handoff.

## 050B external dispatch preparation — 2026-10-09

The author authorized commit/push of the separately reviewed 050B contract and
requested an external implementation prompt. The accepted task/ADR manifest
below remains unchanged. Publish this documentation as the dispatch baseline;
the receiving coordinator must verify the actual fetched commit and record its
implementer/separate reviewer assignments before any code edits. Use a dedicated
050B branch, native Ubuntu preflight and the task's serial reviewed slices.
No 050B implementation, feature test or release acceptance is claimed. GAP-039
and GAP-119 remain OPEN; 050A is not redispatched and 050C remains separate.
Engram attribution is unavailable (GAP-021); this is the publication handoff
fallback. The prior no-commit note describes the earlier contract-review turn.

## 050B technical contract accepted — 2026-10-09

[NF-WF-050B](../../tasks/NF-WF-050B-scale-review-and-author-decisions.md) is READY
for runtime implementer assignment, not implemented. Both separate actors
review_mutations_034 and review_recovery_034 APPROVE the contract and reviewed
ADR-0016 amendment against baseline `a0010c2`. Their initial findings were
resolved in the design: scoped parent cleanup/required rollback proof, checked-out
branch policy revisions, explicit headless no-write refusal and independently
paginated pending proposals. No feature tests, schema changes or migration runs
occurred in this contract-review task.

Frozen review manifest (working file bytes, SHA-256; this record is outside the
artifacts it hashes):

- `tasks/NF-WF-050B-scale-review-and-author-decisions.md`: `B6A44390D2485D90A62C23B971E0B1039DB177A4F412D970D2C4A78AA78ABE45`.
- `docs/adr/ADR-0016-scale-evidence-and-author-decisions.md`: `1909A48A9B958C787F76FCBF678528E106165F079192B30D764922ECDC917C52`.

The next slice is reviewed additive storage/context interfaces, followed by S2
decisions + deterministic review/shared API-worker gates and then localized UI.
Hard incomplete data holds separately from proved violations; exceptions cannot
fill missing data or bypass canon. Preserve 050A strict head staleness, requiring
explicit fresh assessment/review after head-changing actions. 050C still owns
optional AI calls; GAP-039 and GAP-119 stay OPEN until implementation acceptance.

Documentation verification: task/ADR local links resolve, Markdown fences and
whitespace checks pass; code remains `a0010c2`. No commit/push in this turn.
Engram attribution remains unavailable (GAP-021); this is the fallback checkpoint.

## 050A integration accepted — 2026-10-09

The author authorized integration of reviewed external `d78afc3`. Merge
`843a263` includes that submission and the separately approved historical
receipt correction. Product source, schema, migrations and package configuration
are byte-identical to the reviewed submission; only evidence documentation differs.
The prior local 64/64 receipt remains scoped pre-merge evidence, not a new run.
Post-merge Prisma generation/validation, ai-services/API typechecks and 15/15
pure SCALE/restore tests pass.
No working database migration or production deployment occurred.

050A is IMPLEMENTED / REVIEWED for the S1 API/storage foundation only. GAP-118
is CLOSED for the reviewed submission defects and migration-test isolation;
GAP-039 remains OPEN. Next: draft and separately review the bounded 050B
technical contract before implementation; 050C remains subsequent optional S3.
Older no-merge/READY instructions below are historical. Engram attribution is
still unavailable (GAP-021); this is the durable fallback checkpoint.


## External 050A fourth repair verification — 2026-10-09, `d78afc3`

Separate technical reviewers APPROVE the isolation fix and unchanged service
repairs. Local parallel migration/API verification passes64/64, no skips
(API47, migration2, classification8, pure SCALE7). Prisma validate/generate,
ai-services/API typechecks, changed-source lint and diff whitespace pass.
Empty/populated upgrades use private copies;41 baseline Prisma ledger checksums
and seeded data remain unchanged when050A becomes migration42, with no backfill.

A separate private-copy fault injection reached PostgreSQL42883 in050A.
Live repository migrations remained unchanged after successful suites and
the injected failure; all owned scratch databases were removed and absence
verified. The initial standalone fault probe failed before reaching its injected
SQL and is not counted as proof; a corrected retry reached the expected failure.
Windows symlink setup was exercised successfully. Manuscript suite was not
rerun locally; its external21/21 remains reported evidence only. No working DB
migration, full-release verification or production deployment is claimed.

One documentation correction was prepared locally: restore the historical
third-repair receipt and5/5 RED to GREEN report deleted in the submitted diff.
It is archived under GAP-118 with superseded/not-local-evidence attribution.
Preserve that archive during integration. The technical submission is ready
for integration with this correction; main remains7c73a1e and no merge has
occurred. GAP-039/050B/050C remain separate. Main Prisma generation restored;
Engram attribution unavailable (GAP-021), so these records are the fallback.

## External 050A third repair review — 2026-10-09, `aab13e5`

No merge accepted; main remains `c957e99`. Both separate reviewers confirm
the predecessor checks, active held-lock regression, genuine Prisma-ledger
assertions and migration-test scope amendment address the earlier findings.
They request one remaining correction: migration-test source isolation.

Fresh local checks at the exact submitted revision:62/62 selected tests pass,
none skipped (SCALE API47, restore classification8, pure SCALE7). Prisma
validate/generate, ai-services/API typechecks, changed-source lint and submitted
diff whitespace checks pass. Manuscript suite was not rerun. The migration
suite was deliberately not executed locally: its populated proof temporarily
moves the tracked050A directory out of the shared repository migration tree.
Other suites could deploy incomplete history; interruption can leave source
files displaced. Its reported remote2/2 passes are not local migration evidence.

Next: use private temporary schema/config/migration copies for baseline and
upgrade deploys, keep repository migrations untouched, and prove concurrent
execution with the API suite plus ledger/data preservation. GAP-118 stays
OPEN / P2; GAP-039 and dependent050B/050C acceptance remain open.
The owned API scratch database was removed and absence checked; main checkout
and Prisma client generation restored. Working data preserved. Engram binding
remains unavailable (GAP-021); this record is the fallback checkpoint.

## External 050A second repair review — 2026-10-09, `e49254f`

Both separate reviewers request changes; no merge accepted. Main remains
`23261fb`. Authoritative locking reads, retained quote/span validation,
ownership404 ordering and strengthened restore/delete/parent tests are repaired.

Fresh local checks at the exact submission:58 passed/1 skipped across59 selected
tests (SCALE API41/42, migration2/2, classification8/8, pure SCALE7/7).
Prisma validate/generate, ai-services/API typechecks, changed-source lint and
diff whitespace checks pass. The required held-head-lock regression is the
skipped test; its harness creates a revision through a second connection while
holding the branch lock required by that revision's FK. This is not accepted
as proof that the repaired CAS is safe. Manuscript suite was not rerun.

Owned-scratch probe: an otherwise valid sequence2 assessment referencing
another novel's sequence1 predecessor was returned CURRENT, and append extended
that corrupt chain to sequence3. Retained predecessor validation checks only
null/non-null, not exact scope/version/sequence; GAP-118 remains OPEN.

The populated migration test compares data hashes after applying historical SQL
directly; it does not preserve/verify Prisma migration ledger checksums or prove
populated Prisma deploy. The new migration test path also needs a reviewed task
scope amendment. Neither missing proof is waived by reported remote approval.
Both owned scratch databases were dropped and absence verified; main checkout
and Prisma client generation restored. Working data preserved. Engram binding
remains unavailable (GAP-021); this record is the fallback checkpoint.

## External 050A re-review — 2026-10-09, submission `5a465a1`

Fetched the repaired branch after its merge of `209a911`. Both separate
reviewers still request changes; no merge accepted. Main remains `209a911`.
Service capabilities, original fixture errors, strict write fields, pagination,
RepeatableRead current reads and timestamp native-type parity are repaired.

Local verification at the exact submitted revision: Prisma validate/generate,
ai-services/API typechecks, changed-source lint and diff whitespace checks
passed. Scoped tests47/47 passed (SCALE API32, restore classification8,
pure SCALE7). Manuscript suite was not rerun: its fixed scratch database name
already existed on this host and was preserved. No full-release green claimed.

Additional owned-scratch probes established a waiting branch lock before
committing a new head: append accepted the stale null expectation and persisted
the old null source head. Another probe placed a schema-shaped claim with a
forged quote and out-of-bounds span into a retained row pinned to the real
head; readCurrent still returned CURRENT. Initial lock probe failed to establish
its barrier because PostgreSQL statistics were cached within the observer
transaction; clearing that statistics snapshot made the rerun deterministic.
These probes are separate from the submitted47 passing tests.

GAP-118 records remaining source and acceptance blockers. Required populated
migration proof is still missing; misleading repair-complete and after-lock
reread claims must be corrected. The owned scratch database was dropped and
absence verified; main checkout and Prisma generation restored. Working data
and the existing manuscript scratch database were preserved. Engram binding
remains unavailable (GAP-021); this/task history are the fallback checkpoint.

## External 050A submission review — 2026-10-09

Fetched `origin/work/nf-wf-050a-scale-evidence` at `80a772e`; not merged.
Separate reviewers `review_recovery_034` and `review_mutations_034` request
changes. GAP-118 records production defects and invalid acceptance fixtures;
the external assertion that only fixtures need repair is not accepted.
Main remains `0a60d4a`: READY denotes the reviewed contract, not accepted code.

Local Windows verification reused Docker PostgreSQL16.15/pgvector0.8.6 on
port5433. Prisma generation/validation, ai-services/API typechecks, changed
source lint and submitted diff whitespace checks passed. The scoped Vitest
run had37 tests:24 passed/13 failed (API9/22; domain/classification15/15).
Several expected400 tests fail to exercise the intended validator because
the fixture omits chapterVersionId. No full-platform green is claimed.

Direct probes in the owned scratch database reproduced VIEWER service writes
to an obsolete text version, history pagination returning sequences3 then1
instead of3 then2, and malformed stored evidence (`scale: ALIEN`) returned as
CURRENT. Headless multi-predecessor novel cascade cleanup passed this bounded
probe; broader populated/restore acceptance remains missing. The initial probe
setup omitted required creator fields and was corrected before these results.
One lint attempt was invalidated by checkout timing; rerun at the submitted
revision passed before returning to main. The owned scratch database was
dropped and absence verified; main Prisma client generation was restored.

Next: repair the submitted branch against the frozen contract, add missing
negative/recovery/migration proofs, obtain separate final-diff review, then
reconsider integration. 050B/050C remain dependent; GAP-039 remains OPEN.
Engram runtime attribution is unavailable (GAP-021); this is the file fallback.

## S1 technical contract — 2026-10-08

[NF-WF-050A](../../tasks/NF-WF-050A-scale-evidence-foundation.md) specifies
append-only author assessments tied to saved chapter prose, checked-out branch
and source head. Schema/API validation, independent assessment CAS, tenant/role
gates, retained recovery history and chapter-deletion conflicts are explicit.
Separate technical reviewers approved the contract, including a corrected
`/api` route prefix. 050A is READY; implementation, migration execution and
runtime tests have not started. Next: bounded 050A
implementation. GAP-039 remains OPEN; 050B owns HARD gates/UI/receipts and 050C
optional AI proposals. Engram attribution remains unavailable (GAP-021);
this record and the task are the fallback, not a claimed MCP checkpoint.

Frozen review manifest: `tasks/NF-WF-050A-scale-evidence-foundation.md`, SHA256
`0FC5FD9C9A8415BA413247119278DD07FD51A42D95F53C4CEC696C31D24E6E04`.
Separate reviewers: `review_recovery_034`, `review_mutations_034`. Scope is
technical contract acceptance only; local Markdown links and Git whitespace
checks passed. Migration and implementation need their own exact-diff review.

Architecture baseline: V2 with workflow delivery repair accepted in ADR-0013.
Implementation status: **backend/infrastructure slices across phases 0–9
exist; integrated product delivery remains PARTIAL**. Historical phase/test
results below describe their original scope, not completion of all retained
requirements. The AI Orchestrator is a milestone within Phase 3/4.

## Current dispatch — 2026-10-07 (novel-scoped workflow history repaired)

### SCALE direction recorded — 2026-10-08

Author selected S1 structured evidence as foundation, S2 author changes/
exceptions as follow-up and optional settings-enabled S3. S3 may propose;
author may approve, reject or submit an alternative. ADR-0016 and NF-WF-050
record this direction and staged implementation plan. GAP-039 stays OPEN:
no new SCALE source/schema/UI or runtime tests are claimed at this boundary.
Author clarified incomplete HARD assessment holds approval and AI should advise
on missing data with reasons, explanations and examples. Planned UI always has
an actionable checklist; AI enhancement follows S3 enablement. Pending advice
never satisfies the gate. Existing SOFT/HARD configuration remains. Initial
parent and final HARD/guidance amendment review APPROVE. At that earlier
decision boundary no child was READY; the later 050A contract receipt above
now owns S1 dispatch readiness. S1 foundation implementation remains next.
Engram runtime binding is unavailable (GAP-021); task/CURRENT are fallback.

### Usage analytics accepted locally — 2026-10-08

Author decision ADR-0015: quotas are owned by the external LLM Gateway.
NF-WF-049 implements token/model analytics without quota limits and closes
GAP-063's revised local implementation gate. [Task receipt](../../tasks/NF-WF-049-generation-usage-analytics.md)
owns exact commands, review hashes, migration and failed-attempt corrections.
Separate backend/UI reviews APPROVE; migration evidence independently verified.
245 scoped tests passed (core82, validation62, API37+15, executor22, web27),
API/worker/web/executor types and changed-TS lint passed. Aggregates cover all
matching requests rather than a recent UI window; observed attempts are counted
once, requested/reported model identities remain distinct and missing/legacy
coverage is explicit. Chapter workflow and selection callers are attributed;
novel-associated retrieval embeddings are included. AI Studio Receipts → Usage
analytics supports novel/component filters, en/id and per-attempt detail.

The additive migration passed empty/populated41-upgrade checks with old data
and40 checksums retained. No working DB migration, live gateway call, image
transport, new dependency, full release test or human accessibility approval
is claimed. Deploy the reviewed migration via environment/release preflight.
Next: separate SCALE GAP-039 author decision, human GAP-051 and live release
gates. Historical undecided GAP-063 paragraphs below are superseded.
Engram runtime attribution remains unavailable; this/task receipt is the fallback.
Cleanup verified all four owned NF049 scratch databases absent; test processes
had disconnected. No Redis worker/queue was started for this task.

### Accepted local gap verification — 2026-10-08

NF-WF-048 closes GAP-018's bounded recovered-upgrade/partial-FK-loss gate
and GAP-117's isolated worker-smoke evidence gate. Separate source/evidence
reviews APPROVE. See [local receipt](../implementation/048-local-gap-verification.md)
and [task](../../tasks/NF-WF-048-local-gap-verification.md). Product code and
historical migration files are unchanged from `c0830c7`.

Windows reused existing Docker services. Raw backup failure was reproduced;
reviewed transactional recovery restored the two evidence RESTRICT FKs before
reviewed ledger resolution. Recovered/empty/replayed schemas match, all40
migrations applied, original32 tables and ten full ledger rows preserved,
and cited-version DELETE/orphan/index negative checks passed. Three original
checksum differences are explicitly preserved; live repair is not approved.
All five workers started on owned Redis DB14: twelve attributable connections,
PID socket/disconnect evidence and a uniquely completed heartbeat. Cleanup
removed only owned resources; DB14 is empty and four scratch DBs are gone.

Scoped driver lint and diff checks passed. No new full API/web suite, live
provider test, human screen-reader result or production deployment is claimed.
Next: author-owned GAP-039/063 product decisions, human GAP-051 audit and live
release gates. Do not redispatch D/E or NF048's completed drills. Earlier
BLOCKED/OPEN paragraphs below describe their prior boundary and are superseded.
Engram runtime attribution is unavailable; this is the durable file fallback.

### Accepted isolated-smoke documentation — 2026-10-08

The author accepted `work/nf-wf047-isolated-smoke` through `9fe1443`.
Fast-forward integration changed documentation only; product/test source
still matches `87fea3c`. Separate `review_recovery_034` review APPROVE
confirmed the four revised-procedure corrections. Diff checks and D's five
required-reading links passed. No new service, worker or test run is claimed.

D's missing-input receipt and E's amended procedure/reported Ubuntu rerun
are now integrated. Do not recreate those documents or replay earlier
dispatch instructions below. GAP-018 remains BLOCKED on an authorized
sanitized source dump with its actual migration ledger preserved. GAP-117
remains OPEN pending acceptance of attributable isolation evidence; approval
of documentation corrections is not an independently repeated runtime drill.
Next: resolve those specific evidence gates and the author-owned product,
human and live release decisions. Production deployment is not approved.
Engram runtime attribution is unavailable; this is the fallback checkpoint,
not a claimed MCP save.

### Accepted external follow-up — 2026-10-08

The author accepted integration of `work/nf-wf047-external-follow-up`
through `89d57f5`. A/B audit and fixture amendments are integrated; C's
bounded three-caller parser repair received separate local source review
APPROVE. Local checks on that exact source passed: three API files32/32,
API typecheck0 and lint on the five affected source/test files0. See the
047C local acceptance receipt; this is not a fresh full release battery.
Separate integration-handoff review: `review_mutations_034` APPROVE;
documentation diff check passed and source/test blobs still match `89d57f5`.
F is an integrated proposal, not an author-selected SCALE/quota policy.
E's Ubuntu preparation receipt remains reported host evidence, not a
locally repeated drill or final release acceptance.

Next external work: create D's explicit missing-input receipt for GAP-018
if no authorized sanitized dump is available; then prepare a reviewed E
scope amendment to replace the non-isolated worker-smoke evidence
(GAP-117) with an owned isolated rerun. Do not restart completed A/B/C/F
work or migrate the remaining loader sites without a bounded new contract.
GAP-039/063 decisions, human GAP-051, live credentials/deployment and local
Engram registration remain author-owned. Runtime Engram attribution is
unavailable; this is the compact fallback checkpoint, not an MCP save.
This dispatch supersedes the initial 047 launch instructions below.

### External follow-up dispatch — NF-WF-047

The author requested a delegated workflow and prompt for remaining work.
[NF-WF-047](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md) defines six
bounded children: audit (A), GAP-042 amendment (B), GAP-081/082 diagnosis
and proven fixes (C), conditional GAP-018 populated-upgrade investigation
(D), native release preparation (E), and SCALE/quota proposals (F).
Start with A; prepare/freeze/review child contracts before dispatch.
This is a planning artifact, not evidence that any child has executed.
Separate plan review: `review_mutations_034` APPROVE; referenced links and
package commands checked, documentation diff check passed. No product code
changed and no new runtime test execution is claimed for this planning task.
The external coordinator commits/pushes a work branch for local acceptance;
it does not merge main, make product decisions or approve deployment.
Engram runtime attribution is unavailable at this boundary (GAP-021);
this record is the compact fallback checkpoint, with no MCP save claimed.

### Author-approved local/external responsibility split

External Ubuntu coding actors handle bounded implementation, regression tests,
documentation and separate review for GAP-040/043/041, followed by final automated
verification on the integrated revision. Follow native environment preflight,
reviewed task contracts, branches/file ownership and scratch-database isolation.
Their host receipts do not prove readiness of the author's Windows environment.

The author retains local ownership of SCALE/quota product decisions (GAP-039/063),
live credential provisioning, human screen-reader audit (GAP-051) and production
deployment approval. External actors may provide evidence and concrete proposals
for039/063, but must not choose unresolved product semantics or implement those
decisions before the local decision is recorded and their task contract reviewed.
After decisions are recorded here, bounded implementation may be delegated.
No external task authorizes production deployment or credential disclosure.
Screen-reader acceptance requires the author's actual human audit; an automated
axe result or an LLM report cannot close that gate. Integrate and review submitted
diffs here before treating task closures as accepted project evidence.

This author instruction is recorded locally because Engram runtime attribution
is unavailable; no attributed memory save is claimed. No credentials are stored.

NF041 is IMPLEMENTED/REVIEWED: GAP-034 novel+chapter filters before limit,
defensive UI provenance and stale history/start protection; GAP-116 downstream
detail/cancel response guards. Scoped API67 tests in two disjoint runs; web7
files44/44; API/web typechecks, lint and final Nuxt build0. Separate contract,
amendment and exact-diff review APPROVE. See tasks/NF-WF-041-novel-scoped-workflow-history.md.
Full battery below is historical evidence at712cca6, not a rerun of NF041.
Next: GAP-040/043/041 proof work is IMPLEMENTED + REVIEWED + PUSHED on
`work/gap040-gap043` (NF-WF-042/044/045; battery GREEN at `c03a171`);
post-review hardening NF-WF-046 (author's five directives + GAP-040
clarification) is VERIFIED — implemented, diff-reviewed (APPROVE),
battery GREEN on the final revision `9265822`, committed and pushed;
The author accepted integration through `ad54faa` on 2026-10-07 after
local review of the source fixes and documentation amendments. This
acceptance supersedes the earlier pending-acceptance instruction; it
does not approve production deployment. GAP-039/063 source decisions
remain with the author. The local merge verification receipt below
distinguishes current host evidence from reported Ubuntu results.

### Local integration receipt — 2026-10-07

OBSERVED: `main` fast-forwarded from `1a3452b` to the author-accepted
branch tip `ad54faa`, without conflicts. Production and test code matches
`9265822`; integration handoff edits affect documentation only.
Fresh Windows verification used the existing PostgreSQL16 Docker5433 and
Redis6379 environment, with dedicated test databases and no author-data reset.

| Command | Observed result |
| --- | --- |
| `pnpm --filter @novelforge/api exec vitest run --no-file-parallelism` | Exit0; 58 files, 1047 tests passed, including all three E2E files |
| `pnpm --filter @novelforge/web test` | Exit0; 81 files, 488 tests passed; includes axe suites |
| `pnpm lint` | Exit0 |
| `pnpm --filter @novelforge/api exec tsc --noEmit` | Exit0 |
| `pnpm --filter @novelforge/web exec vue-tsc --noEmit` | Exit0 |

Logs are retained on this host under `TEMP/novelforge-merge-ad54faa`.
The API run emitted pg query deprecation warnings; these were not test
failures. No fresh Nuxt build, live gateway/deployment or human screen-reader
acceptance is claimed. The separate `review_mutations_034` actor reviewed
the acceptance documentation; this is distinct from the previously approved
source diff. Engram runtime attribution remains unavailable; this receipt
is the fallback handoff, not a claimed Engram save.

NF-WF-035–038 are IMPLEMENTED/REVIEWED and pushed through5120f68. GAP-110
scene revisions, GAP-083 Recovery Center and GAP-111–113 integration defects
are resolved with scoped evidence. The initial36519e2 battery failed; preserve
its receipt. The68facd7 follow-up also stopped (GAP-114). Reviewed NF040 fixes
fixture EOL and GAP-044 race proof (30/30; API tsc/lint0). Previous NF039 at712cca6
is AUTOMATED GREEN: lint/API/web typechecks0; API54 non-E2E files1014/1014;
web79 files477/477; E2E3 files20/20; axe20 files91/91; additional Nuxt build0.
API inventory57 files1034 tests is covered in two runs; axe overlaps web.
See docs/implementation/039-release-verification-2026-10-07.md for exact commands.
GAP-034 is now resolved by scoped NF041 evidence above;
follow-up branch/projection evidence040/043 and UI/E2E alignment041 are
accepted through NF-WF-042/044/045/046 above.
SCALE039/quota063 require validated-source decisions. No platform completion claim.
Human GAP-051, live deployment/configuration and Engram host registration remain
open. Current host has PostgreSQL/Redis but no API/web/storage/gateway listener.
Boundary receipts at the end preserve history; this dispatch supersedes old
next-task instructions, not their historical evidence.

## Historical dispatch — 2026-10-07 (e538180 audit)

Pulled nine commits from eb065cf to e538180; task027–034 implementations are present. The prior dispatch and Ubuntu battery below are historical. GAP-109 records defects discovered despite reported closures; NF-WF-035 is the bounded repair. GAP-110 records missing scene create/update revision bookkeeping and requires a separate bounded contract.

Current next step: NF-WF-035 is included in this commit; proceed to GAP-110 and final-revision NF-WF-023. Full platform/release, live provider configuration and human GAP-051 are not accepted by these focused tests.

Windows preflight: existing nf-pg-5433 and Redis reused; frozen-lockfile dependencies restored and Prisma generated. Existing reviewed migrations deployed only to dedicated scratch databases. Real Redis checks use DB15 and unique owned queue/test metadata; no production queue consumer or flush. Engram runtime attribution unavailable (GAP-021); no checkpoint save claimed.

NF-WF-035 receipts: final restore/branch/selective/semantic/scene/planning/coherence API run113/113; worker recovery46/46; real BullMQ test1/1; additional focused receipts in the task include what-if/memory31/31, expanded API108/108, story-versioning58/58 and semantic36/36. Do not add overlapping runs into a completion percentage. Lint, workspace typecheck and final affected API/shared typechecks exit0; separate reviews APPROVE. Full release battery not run. Initial evidence: BullMQ ID regression failed before repair and passed after; Windows npx setup fixed; Prisma destructive db push refused and replaced by migrate deploy without bypass.

## Historical dispatch — 2026-10-07 (cc8d515 audit)

Pulled four commits by fast-forward from dfd87a3 to cc8d515. NF-WF-026 production worker factories are present; GAP-028 code wiring is no longer a new implementation task. Its fake-gateway AGENT evidence is not live provider/BullMQ deployment acceptance. GAP-098 removal is documented as author-directed in facac9f; this audit does not independently infer that approval from code alone.

Next: run NF-WF-023 against the final revision containing the reviewed GAP-106 repair; prepare dependency-ready GAP-100/101 contracts. GAP-094–096 and human GAP-051 remain open. The Ubuntu battery below is historical evidence for dfd87a3, not the current Windows host or extracted services.

Current host: reuse nf-pg-5433 (5433) and existing Redis; only dedicated test databases used. Worker AGENT suite 4/4 and executor 20/20 passed with an explicit host DATABASE_URL; shared architecture tests 2/2 pass in-memory. Workspace typecheck exit 0; shared package typecheck rerun after test rewrite exit 0. Initial executor connection failure and architecture-test timeout/source-file race are recorded in GAP-106. Final lint exit 0. API compiler/canon 95/95; worker lifecycle unit checks 9/9 (one real BullMQ integration deliberately filtered out; no production Redis queue used). Total focused checks: 130 passed. Separate reviewer approved the code with one stale GAP-098 documentation finding, corrected. Full API/worker/web release battery and live provider deployment were not run. Engram runtime attribution remains unavailable (GAP-021); no checkpoint save is claimed.

## Historical Ubuntu dispatch — 2026-10-07 (battery rerun)

**Historical NF-WF-023 release battery: reported GREEN on the Ubuntu host** (Ubuntu 24.04.5, revision `dfd87a3`, 2026-10-07 04:45–05:30 WIB). All 8 boxes ticked with OBSERVED evidence, strictly sequential per Invariant 4:
1. `pnpm lint` → exit 0 ✅
2. `tsc --noEmit` (api) → exit 0 ✅
3. `vue-tsc --noEmit` (web) → exit 0 ✅
4. API vitest → 53/53 files, 970/970 tests ✅
5. Web vitest → 77/77 files, 466/466 tests ✅
6. e2e (per-file sequential) → 20/20 ✅
7. Axe → 20/20 files, 91/91 tests, zero violations ✅
8. No new product-defect GAPs ✅

Environment: PostgreSQL 16.15 + pgvector 0.6.0, Redis 7.0.15 (both started manually); GAP-065 re-applied; GAP-105 (role password + DATABASE_URL export) resolved. One transient API flake observed (1/970, non-reproducing across 2 reruns).

**Historical executor recommendation: SHIP_WITH_KNOWN_GAPS; not author approval or a current release decision.** Full report: `docs/implementation/023-battery-rerun-2026-10-07.md`.

**Recommended fix order:** GAP-028 (P1, actionable) → GAP-100 (P1, BLOCKED on contract) → GAP-101 (P2, BLOCKED on contract) → GAP-094/095/096 (P3) → GAP-098 (P3, author decision). GAP-051 human gate remains OPEN.

## Previous dispatch — 2026-10-07

Synced baseline: `72b3948`, clean before this audit. Implementation commits now extend through NF-WF-024. The older entries below preserve historical evidence; their "uncommitted", "PLANNED" and "commit next" instructions are superseded by this dispatch snapshot, not current worktree state. They do not prove present-host acceptance.

Next: current-host NF-WF-023 release verification. The reviewed NF-WF-025 repair is included in this commit. GAP-099–104 record findings. Live what-if and semantic apply remain blocked on GAP-100/101; release acceptance and GAP-098 remain open. Engram hook supplies no authoritative identity; attributed saves are unavailable and this record is the fallback.

### NF-WF-025 verification receipts — current Windows host

- Existing Docker PostgreSQL `nf-pg-5433` and Redis reused; database integration used only disposable `novelforge_test_simulation_debugger`. No production database reset or Docker reinstall.
- Red before repair: semantic regression incorrectly returned S2; final-tick debugger returned PAUSED; real proposal debug-step returned 409.
- Green after repair: semantic merge 23/23; debugger HTTP/database suite 12/12; story-versioning 26/26; what-if accessibility 3/3 (mock key strings, not proof of translated en/id rendering). Lint exit 0.
- Separate reviewer: review_workflow_docs APPROVE, no blocking findings. Proposal observation is API-only; no UI completeness claim. Full release battery/e2e not run in this repair.
- `pnpm typecheck`: exit 0 across the workspace, including API/worker/web.

## Historical dispatch snapshot — 2026-10-05

| Task | Current scope/status | Next action |
|---|---|---|
| NF-WF-001 | Reviewed design | Preserve contract and historical receipts |
| NF-WF-002A/B/C | Recorded fixture/clarification/ordering reviews | Reopen only changed or refuted evidence |
| NF-WF-002D | **IMPLEMENTED / REVIEWED** (GAP-022 closed for implementation and review) | Done; accepted by 002F |
| NF-WF-002F | **VERIFIED 2026-10-04 — evidenced M1 foundation scope only** (self-verification, not independent review) | Done; full cross-domain recovery stays OPEN under GAP-004 |
| NF-WF-002E | PLANNED; actual consumer absent (GAP-023) | Revisit under NF-WF-004 consumer design |
| NF-WF-003 | **IMPLEMENTED 2026-10-05 — pending separate review** (uncommitted working tree; 197 tests green, lint + typecheck clean; 5 review findings fixed) | Separate reviewer judges the exact diff |
| NF-WF-004 | **IMPLEMENTED 2026-10-05 — review findings fixed, ready to commit** (contract APPROVE round 3; independent diff review APPROVE_WITH_FINDINGS: one P2 fixed (`@types/pg` added, all typechecks now verified clean), two P3 observations for the author; 49 API + 15 orchestrator + 14 package + 10 worker tests green, lint clean) | Commit + push |
| NF-WF-005 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE round 3; independent diff review APPROVE, no findings; 15 API + 4 executor + 2 auth tests new/green, full API 423/423, lint + all typechecks clean; migration verified from-empty/re-apply/drift-clean; GAP-003 closed with acceptance evidence; GAP-030 recorded) | Done |
| NF-WF-006 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE_WITH_FINDINGS round 2, round-2 P3s applied; independent diff review CHANGES_REQUESTED on F1 (input charset+binding) → fixed (GAP-033) + focused re-review APPROVE; full API 436/436, validation 61/61, executor 20/20, template 9/9, lint + typechecks clean; GAP-031/032/033 recorded) | Done |
| NF-WF-007 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract APPROVE_WITH_FINDINGS; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: dead `pollRun` pruned, outline start restricted to APPROVED only per author decision, newline restored; web 41/41, API 447/447, lint + vue-tsc + nuxt build clean; GAP-034 open for the server-side runs filter follow-up; no backend changes) | Done |
| NF-WF-008 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract `8d28995` reviewed CHANGES_REQUESTED, F1–F6 applied; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: STALE documented as detected-not-persisted, verdict union fixed, error table completed; API 462/462, web 48/48, story-versioning 17/17, lint clean, nuxt build succeeds; GAP-035/GAP-036 recorded) | Done |
| NF-WF-009 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `f18600f` reviewed CHANGES_REQUESTED, F1–F9 applied, Q1–Q6 adjudicated; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; new `@novelforge/memory` package, Prisma `MemoryProjection` + migration `20261006_nf_wf_009_memory_projections`, 3 routes, BullMQ `memory-rebuild` queue + worker, 003 compiler tiers 7/8 PRESENT-with-freshness/UNAVAILABLE-with-reason; API 477/477, worker 21 passed/1 skipped, lint + typechecks clean; GAP-037 recorded; F3 full-lineage follow-up OPEN) | Review |
| NF-WF-011 | **IMPLEMENTED 2026-10-05, awaiting independent diff re-review** (contract APPROVE_WITH_FINDINGS; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; author-preview E2E loop (8-step UI sequence) + bounded long-novel fixture (300ch/60char/3000facts/300 outline nodes, ~4.5k revisions) + G1-G10 gates + measurements + `pnpm e2e`; diff review round 1 CHANGES_REQUESTED (P1-1 measurements acceptance, P2-1 G1 as specified, P2-2 restore capability negative, P2-3 G10 reviewFinalText half, P2-4 progress.md accuracy, P3-1..3) — all fixed and re-verified: e2e **20/20** (loop 3/3, gates 10/10, measurements 7/7, incl. no-regression vs committed baseline), lint+typecheck clean, full API suite 530/530 on fresh VM (GAP-044 flake did not manifest; passes 11/11 alone); GAP-041/042/043/044 recorded; GAP-010 partially closes) | Review |
| NF-WF-013 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-013-public-reader-routes-ui.md` reviewed APPROVE round 2 (round 1 APPROVE_WITH_FINDINGS: wordCount empty-guard, 007 line refs, P2-1 novel-first chapter resolution, P3-1 GAP-049 additive extensions); implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 3 anonymous public routes (`GET /api/public/novels/:slug`, `/chapters/:number`, `/authors/:authorId`) with the 012 shapes verbatim + GAP-049 extensions (author byline, prev/next, author route); novel-first chapter resolution via additive `resolvePublicChapterNovelFirst` (frozen 012 `resolvePublicChapter` untouched); novel page = PUBLISHED-only list, chapter page = pinned content + PUBLISHED-only nav, author page = displayName + published novels; identical `404 {error:"NOT_FOUND"}` for all 9 invisible cases; no auth object on `/api/public/*`; no `/api/public/search`; GAP-046 migrated (007 `publish()` → `POST .../publication/publish` + 409 REVIEW_STALE/HARD_POLICY_VIOLATION en/id messages, 403 preserved); 3 Nuxt reader pages + `ReaderChapterNav` (noindex, semantic HTML, focus-visible, responsive) + en/id `reader` keys; public-routes API tests **14/14**, web reader tests **10/10** (9 files **58/58**), full API suite **561/561** (27 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-046 CLOSED; GAP-049 recorded) | Review |
| NF-WF-015 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-015-rich-editor-scenes.md` REVIEW_PENDING, round 1 APPROVE_WITH_FINDINGS applied inline, Q1–Q7 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; Tiptap **v3** (`@tiptap/core/vue-3/starter-kit@3.31.4`, `@floating-ui/dom`, `sanitize-html` Q2 pick, Invariant 2 allowlist `p,h2,blockquote,strong,em,ul,ol,li,hr,br` no attrs, `disallowedTagsMode:discard`) — 6 new components in `app/components/editor/` (RichEditor restricted StarterKit H2-only, EditorToolbar, SelectionAiMenu via `@tiptap/vue-3/menus` BubbleMenu, AiSuggestionCard, ConflictBanner `role=alert`, SceneNav); six pinned selection-AI ops (`selection.*` tasks, CREATIVE_WRITER, 2000/1000/2000 bounds, streaming card, stale-selection pin, never direct writes) via `services/selection-ai.ts` + client verbatim mirror; server-side `sanitizeChapterHtml` on saveChapter + tag-stripped wordCount + F4 publication wordCount; F2 reader dual-format; F3 409 disambiguation (PUBLISHED → `chapters.blockedPublished`, GAP-054: key did not exist, added en+id); scene CRUD routes (`chapter:update`, Zod, 404 gate, reorder-by-number, delete → 409 when outline beats reference, GAP-055); legacy plain-text chapters convert to manuscript HTML on editor load; i18n en+id; vitest-axe 0 violations en+id; API scenes **12/12**, web new **35/35**, full web **117/117**, full API **588/588** (29 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-052 stays open until verification, GAP-053 open) | Review |
| NF-WF-014 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-014-browse-search-progress.md` reviewed APPROVE_WITH_FINDINGS; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; `Novel.genres String[]` + additive migration with functional GIN indexes (tsvector title/content); 3 anonymous discovery routes (keyset-paginated listing + genre/sort filters, genre facets, published-pin-only search with bounded `<mark>` snippets, SQL-enforced visibility, no-oracle `200 { results: [] }`) + 1 member genre route (`novel:update`, Zod: known keys, dedupe, **max 5 per Klein's 2026-10-06 amendment**); frozen 18-genre taxonomy constant + en/id i18n labels; `/browse` page (search-as-section, continue-reading, facets, sort, load-more; noindex) + §15 discovery components; device-local `useReadingProgress` (`nf:reading-progress:v1`, chapter-granular, zero network); chapter page writes on 200 only, novel page "you stopped at" marker, 404 entries dropped silently; vitest-axe **0 violations** (wcag2aa+wcag22aa, en+id) + `AUDIT-014.md` manual checklist (screen-reader pass honestly pending human verification); discovery API **15/15**, web new **24/24**, full web **82/82**, full API **576/576** (013's 14/14 incl. updated search-route assertion), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-050 recorded) | Review |
| NF-WF-012 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract APPROVE round 3, Q1–Q6 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; `Publication` model + migration `20261006_nf_wf_012_publications` (idempotent enum DO-block, pre-existing PUBLISHED backfill), 7 publication routes + novel archive/unarchive (real capabilities `chapter:publish`/`chapter:update`/`novel:archive`, typed 409s ALREADY_PUBLISHED/NOT_SCHEDULED/NOVEL_ARCHIVED), BullMQ `publication` queue + worker fire (fire-time Invariant-3 recheck; deterministic refusal → UNPUBLISHED) + startup reconciliation (missing/failed → remove-first + re-enqueue; live jobs left alone), 013 handoff shapes `isPubliclyVisible`/`resolvePublicChapter` (no public routes), COVERED_TABLES `{publications, restoreTarget: false}` (Invariant 8); API **17/17**, worker **11/11**, backfill **8/8**, lint + all typechecks clean; full API suite **547/547** green; `pnpm e2e` **20/20** no-regression green (BASELINE-OK); GAP-045/046/047/048 recorded) | Review |
| NF-WF-016 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-016-authoring-workspace.md` REVIEW_PENDING, round 1 APPROVE_WITH_FINDINGS, 5 findings fixed, Q1–Q8 decided; implementer actor separate from author/contract-reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; the only permitted backend addition `POST .../canon/facts/:factId/sources` (Q2: `canon:manage` gate, pinned span validation, `advanceForMutation` tables `["canon_fact_sources"]`, audit `canon.fact-source-added`, 409 retracted, 404 cross-tenant; additive, no schema change); nine drawer panels on the writer page (story entities, canon facts with ≥1-citation UI rule Q8, references CRUD+publish+ingest, outline nodes/versions with `canon:approve` approval visually separated, characters create/delete NO update GAP-058 + `storyEntityId` read-only GAP-060, relationships/bonds, story state threads/promises event↔thread linking deferred GAP-056, narrative DNA/policies/antagonists, health & memory); per-claim proposal approve/reject bulk list, workspace-scoped paths (F4), `mode=AUTHOR` on canon calls (F5); i18n en+id 572 `workspace.*` keys; vitest-axe 0 violations across 4 panel groups; web **244/244** (37 files), API **592/592** (29 files, incl. 4 new add-source tests), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-057 CLOSED; GAP-059/GAP-060 recorded; GAP-039/040/055/056/058 remain open) | Review |
| NF-WF-017A | **IMPLEMENTED + COMMITTED 2026-10-06** (diff review APPROVE, no findings; GAP-061 CLOSED; commit `576cb86`) (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017A child scope = import normalization only — 017B export and 017C GAP-053 closure are separate actors, NOT touched; implementer actor separate from contract author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; unified pipeline `src/services/import-normalize.ts`: TXT/Markdown/PDF/DOCX → sanitized HTML exactly per 015 Invariant 2 (frozen md/txt split rules byte-identical; md allowlist h2/strong/em/blockquote/ul/ol/li/hr; magic-byte format detection; zip-bomb guard before decompression; PDF via unpdf per-page, scanned → IMPORT_NO_TEXT; DOCX via mammoth with Heading1/2→h1/h2, images/tables/footnotes/comments dropped with skip notices); GAP-061 CLOSED — `importChapters` writes through the exact saveChapter sanitize→strip→count sequence; multipart `POST .../chapters/import/file` (15 MB, server-side validation authoritative); `ImportDialog.vue` on the writer page (file + paste tabs, typed 400 → localized errors, success report with skip notices, axe 0 violations en+id); i18n `importExport.import` en+id; real per-format fixtures in-repo; imports land as DRAFT, never canon; API new **45/45** (import-normalize 34, import-chapters 11), full API **638/638** (31 files), web new **8/8** (component 6 + axe 2 files), full web **252/252**, `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean) | Review |
| NF-WF-017B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017B child scope = export formats only — 017A import pipeline and 017C GAP-053 closure are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the 017A/017C implementers; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; new `src/services/export-render.ts`: TXT (F1 setext `{n}. {title}` + `===`, no `---`), Markdown (F1 `# N. Title`, prose h2 → `**bold**` never `## `, chapters blank-line separated), DOCX (docx 9.5.1, Heading styles), PDF (pdf-lib 1.17.1, chapter-per-section), EPUB (hand-built jszip: mimetype first + stored, OPF + NCX, one XHTML/chapter); pinned Q8 sync byte cap 15M (pre-render estimate + post-render guard → typed `ExportError` 413 EXPORT_TOO_LARGE via the platform typed-error branch); `docx`/`pdf-lib` moved to runtime deps; `GET .../export?format=` (Zod enum, unknown → 400, `md` default backward compatible); `chapter:read` scope incl. drafts, tenant isolation unchanged, no new capabilities, no schema changes; plain-text rows follow the 013 dual-format rule; `ExportPicker.vue` on the writer page (5 formats, sync download, Esc + focus return, axe 0 violations en+id) + i18n `importExport.export` en+id; real per-format fixtures in-repo (`test-fixtures/export/`); API new **22/22** (export-render 14, export-chapters 8), full API **660/660** (33 files), web new **8/8** (component 6 + axe 2), full web **260/260** (41 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; round-trip export→frozen `splitImportBlocks` verified (order, titles, prose); no new GAPs) | Review |
| NF-WF-017C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017C child scope = GAP-053 closure only — 017A import pipeline and 017B export renderer are separate actors, NOT touched; implementer actor separate from contract author/reviewer, the 017A/017B implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; offset-mapping rule for the frozen strip rule in `services/manuscript.ts` (`stripHtmlWithOffsetMap`: byte-identical stripped output, tag interiors map to the replacement space, monotone; `verifyEvidenceQuote` exact-first then whitespace-normalized fallback; `strippedContentIncludes`); `resolveSourceEvidence` verifies quotes on stripped text (spans stay raw offsets, frozen `verifySpan` bounds first, both 409 messages verbatim); 008 fact-source pin strip-aware; chapter search builds `to_tsvector`/`ts_headline` on SQL-side `regexp_replace(cv.content, '<[^>]*>', ' ', 'g')` once per published version (Q7 decision of record; stored column = 023/024 follow-up, ADR); no schema changes, no new capabilities, `story-intelligence` untouched; API new **33/33** (html-strip-map 25, canon +4, canon-application +1, public-discovery +3), full API **693/693** (34 files), full web **260/260** (41 files, no-regression), `pnpm e2e` **20/20** exit 0, lint + tsc + vue-tsc clean; GAP-053 CLOSED on this evidence; no new GAPs) | Review |
| NF-WF-018A | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS (F1 `?status=` filter, F2 line refs), Q1–Q6 decided; 018A child scope = AI Studio only — 018B platform admin and 018C receipts are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; the F1-owned `?status=` filter on the run list (`z.nativeEnum(WorkflowRunStatus).optional()`, `workflow:read` gate unchanged) + three additive read-only `GET /api/{agents,skills,workflows}/:id/versions` routes (GAP-064 workaround, same read gates as the detail routes, ascending — the diff reviewer rules whether the fifth additive item is APPROVE_WITH_FINDINGS or CHANGES_REQUESTED); `/workspaces/:workspaceId/ai-studio` page with Definitions/Runs/Approvals tabs (data-driven, 018C's receipts tab has a marked extension point), DefinitionList/Detail/VersionHistory, RunList + RunGraph (steps with status/outcome/error, pinned version numbers, list = screen-reader text equivalent), ApprovalsInbox (parked via `?status=AWAITING_APPROVAL`, frozen 005 approve/reject with verbatim snapshotHash, 409 codes → actionable messages, reject requires reason); capability matrix VIEWER-nothing / AUTHOR view+decide-no-manage / ADMIN+OWNER-manage enforced server-side and pinned client-side; writer page gains one additive AI Studio link (hidden for VIEWER), 007 components untouched; i18n `aiStudio.*` en+id 91/91; API new **6/6**, web new **30/30** (incl. axe **10/10** zero violations en+id), full API **699/699** (35 files), full web **290/290** (46 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-064/GAP-065 recorded, GAP-013 unchanged) | Review |
| NF-WF-018B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS, Q1–Q6 decided; 018B child scope = platform admin only — 018A studio and 018C receipts are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend only, no schema change, no new capabilities, `packages/auth/authorization.ts` + `packages/ai-core/crypto.ts` + `apps/api/src/ai-registry.ts` untouched: `GET /api/auth/session` gains additive `platformRole: "SUPER_ADMIN" | null` (Invariant 1(c)), `GET /api/admin/audit-log` (SUPER_ADMIN, `gateway:read` gate, pinned 8-action Zod filter, non-allowlisted → 400 INVALID_INPUT, limit 1–200), `GET /api/admin/routing-strategy` (GAP-066 additive read — no frozen route served the deployment strategy; the diff reviewer rules conformance); `/admin` page (SUPER_ADMIN-gated shell, `admin-forbidden` panel for others): GatewayList (masked `hasCredential` badges only), GatewayForm (create/edit/rotate dialog, `apiKey` write-only never prefilled, wiped after submit, Esc + focus return), ModelCatalog, ProfileMappings, RoutingOverview (strategy read-only honestly labeled "deployment config", GAP-063 no-quota note); delete=revoke confirm dialog; writer page gains one additive admin NuxtLink (`v-if` SUPER_ADMIN, next to the 018A studio link); i18n `platformAdmin.*` en+id 72/72; API new **9/9**, web new **22/22** (incl. axe **10/10** zero violations en+id), full API **708/708** (36 files), full web **312/312** (50 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-066 recorded before the workaround, GAP-063 stays open, GAP-013 unchanged; procedural note recorded: never run the API suite and `pnpm e2e` concurrently) | Review |
| NF-WF-018C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS, Q1–Q6 decided; 018C child scope = receipts only — 018A studio and 018B platform admin are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend only, no schema change, no new capabilities, `packages/auth/authorization.ts` untouched: `GET /api/workspaces/:workspaceId/audit-log` (membership + `workflow:manage`, `?action=` pinned to the 10-action AI-infrastructure allowlist, non-allowlisted → 400 INVALID_INPUT, platform-scoped `model-profile.mapped` excluded, identity-only rows) + `GET /api/workspaces/:workspaceId/novels/:novelId/final-text-reviews` (GAP-067 additive read for the pinned "FinalTextReview rows per chapter version" acceptance — no frozen route served it; novel-scoped, membership + `canon:read`, the identical gate as the frozen POST route; the diff reviewer rules conformance); AI Studio receipts tab on the 018A shell (the marked 018C extension point) with capability-gated sub-tabs: GenerationLedger (honest "tokens and latency only — no cost accounting" label, no cost column anywhere, per-attempt detail) `generation:read`, FailureLog (FAILED filter + documented no-model 409 category, GAP-028 surfaced not fixed) `generation:read`, EvaluationReceipts (durable FinalTextReview rows: verdict/violations/revision pin + health as labeled live computation, never persisted) `canon:read`, AuditTrail `workflow:manage` (server enforces; UI gating is progressive enhancement); i18n `receipts.*` en+id 68/68; API new **7/7**, web new **23/23** (incl. axe **8/8** zero violations en+id), full API **715/715** (37 files), full web **335/335** (55 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-067 recorded before the workaround, GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019A | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019A child scope = reader engagement only — 019B/C/D are separate actors, NOT touched (their files are separate uncommitted work by parallel actors in the same tree); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `Bookmark`/`NovelFollow`/`AuthorFollow`/`ChapterLike` (dedup unique constraints; chapter likes anchor to chapter identity `(novelId, chapterNumber)`) + `Novel.followerCount` + `Chapter.likeCount` (+ `Chapter.commentCount` shared with 019B per GAP-071, both `ADD COLUMN IF NOT EXISTS`); idempotent migration `20261006_nf_wf_019a_engagement`; 13 routes `/api/reader/*` (bookmarks/follows/author-follows/likes CRUD + engagement + engagement/author state), all authenticated by construction (`requireActor` → 401 `UNAUTHENTICATED`); visibility IN THE QUERY (014 predicate; invisible → 404 no-oracle); `INSERT ... ON CONFLICT DO NOTHING` + conditional counter `UPDATE` in one transaction (concurrent writers cannot double-count; decrements `GREATEST(n-1, 0)`); author identity = 013 public-author predicate; self-follow → 400; lists return the caller's rows only with keyset cursor pagination; the `novel` sub-object is additively enriched with the published-visible 014 card fields (GAP-074 — the diff reviewer rules); Q8/GAP-068 additive counts on the frozen 013 shapes (`followerCount` novel, `likeCount`/`commentCount` chapter) + GAP-070 (`followerCount` author — the diff reviewer rules), served only on visible reads, no auth object in `/api/public/*`; web `useSession` probe + `useEngagement` client, `LikeButton`/`BookmarkButton`/`FollowButton`/`FollowAuthorButton` (optimistic UI + rollback, `aria-pressed`, session-gated; anonymous sees Q8 counts as static text) on the novel/chapter/author pages + private `/read/library` (anonymous → sign-in redirect; reuses the 014 `NovelCard`; fallback card for novels with no currently-published chapters); i18n `social.*` en+id 19/19; API new **31/31**, `public-routes.test.ts` **14/14** (one exact-shape assertion updated for the additive GAP-070 field), web new **15/15** (social 10 + library 3 + axe 2, zero violations en+id); `npx tsc --noEmit` clean for 019A files, `vue-tsc` clean, `pnpm lint` clean for 019A files; full API/web suites + `pnpm e2e` pending (parallel actors' files have type errors); GAP-069 (services not running — CLOSED), GAP-070/GAP-074 OPEN for the diff reviewer, GAP-071 shared-column coordination noted) | Review |
| NF-WF-019B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019B child scope = comments + moderation only — 019A/C/D are separate actors, NOT touched; implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities): schema `Comment`/`CommentReport` + `CommentStatus`/`ReportReason` enums + `Chapter.commentCount` (GAP-071: the column is ALSO pinned in the 019A migration block — both migrations `ADD COLUMN IF NOT EXISTS`, converging); idempotent migration `20261006_nf_wf_019b_comments`; 8 routes `/api/reader/comments*` (post/list/reply/edit/delete/reports/hide/unhide + staff report queue) with visibility IN THE QUERY (ACTIVE novel + PUBLISHED publication, 014 precedent; invisible → 404 no-oracle); per-route burst limiter 1/10s/user keyed on the session cookie (auth register/login precedent); daily limits 100 comments / 20 reports per 24h per user as typed `RateLimitError` → 429 (additive `platform-routes.ts` branch); staff = membership + EXISTING `novel:update` (Klein Q2 — no platform team), actions audit-logged; `?status=` on the report queue filters the COMMENT status (GAP-072 interpretation for the reviewer); web `CommentThread.vue` on the public chapter page (anonymous list, session-gated composer/reply/edit/delete/report, depth ≤ 1, escaped-text rendering) + staff `moderation.vue` queue page (counts only, hide/unhide/delete) with role-gated header link; i18n `comments.*` en+id 56/56; API new **16/16**, web new **13/13** (incl. axe **4/4** zero violations en+id); full API suite 38/38 non-e2e files green (771 passed | 17 skipped; the 3 e2e files fail only when run inside the API glob — via the proper `pnpm e2e`: 20/20 BASELINE-OK), full web suite 356/364 (8 failures all outside 019B scope: 3x reader.test.ts from 019A/019D's uncommitted `onUnmounted` in the chapter page, 4x 019D's reader-progress-sync axe missing a `useRoute` stub, 1x platform-admin axe timeout under load), API tsc EXIT 0, web vue-tsc EXIT 0, eslint clean on 019B files, i18n `comments.*` 56/56 en+id leaf parity; GAP-071/GAP-072 recorded, GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019C child scope = notifications + privacy only — 019A/B/D are separate actors, NOT touched except two additive shared-file hooks (noted); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `Notification`/`NotificationPreference` + `NotificationType` enum (`NEW_CHAPTER`, `COMMENT_REPLY`, `MODERATION_NOTICE` — Klein Q5, all default ON, absent row = ON); idempotent migration `20261006_nf_wf_019c_notifications`; 5 routes `/api/reader/notifications*` (inbox with cursor pagination + unreadCount, mark-read/read-all, preferences GET/PUT accepting only pinned types → 400 otherwise; master switch is UI-only — OFF writes all three false, ON writes all three true), all authenticated by construction (requireActor → 401), own-rows-only (404 on others' ids — no oracle), rows carry IDs + type only (no email/credential material); pinned event-emission API for the 019B call sites (`emitCommentReplied`/`emitCommentModerated` — preference-honoring, self-reply suppressed); `novel.chapter_published` fan-out via the one shared `notifications` BullMQ queue — emitted from BOTH the 012 worker fire and the API immediate-publish path (GAP-073 interpretation for the reviewer: the contract names only the worker, but immediate publish is the primary author flow); the worker resolves novel followers ∪ author followers (019A pinned tables) deduped, skips NEW_CHAPTER opt-outs at insert time, inserts in bounded batches ≤ 500, no-ops unless the chapter is PUBLISHED (Invariant 7 — never fabricated); publish latency never grows with follower count (only the enqueue is awaited); web `NotificationBell.vue` (session-gated, unread badge, polling only) + `/read/notifications` inbox page (list/mark-read/read-all/empty state/pagination, preferences toggles with `role="switch"`, privacy "what's private" panel — informational, no toggles) + bell on both read pages; i18n `notifications.*` en+id 35/35 (top-level, following 019B's `comments:` precedent); API new **16/16**, worker new **8/8**, web new **17/17** (incl. axe **6/6** zero violations en+id); full-suite/e2e/lint/tsc/vue-tsc evidence pending in the handoff; GAP-073 recorded, GAP-065 note (binaries absent at session start — reinstalled, CLOSED), GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019D | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019D child scope = synced reading progress only — 019A/B/C are separate actors, NOT touched (their files are separate uncommitted work by parallel actors in the same tree); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `ReadingProgress` (`@@unique([userId, novelId])`, `updatedAt` = winning client timestamp, not `@updatedAt`) + `User.readingProgress`/`Novel.readingProgress` relations; idempotent migration `20261006_nf_wf_019d_reading_progress`; 3 routes `/api/reader/progress*` (PUT LWW by client clock — newer overwrites, older/equal → 200 stored row, deterministic tie; engageable check IN the SQL, invisible → 404 no-oracle; GET own-row-only; DELETE 204 idempotent), all authenticated by construction (`requireActor` → 401 `UNAUTHENTICATED`); web `useSyncedReadingProgress` (session probe, max(updatedAt) merge, idempotent write-back, debounced PUT, offline queue + reconnect flush, honest syncState) + reader-page integration (014 `markRead` unchanged, novelId via `/public/novels/:slug`, scroll seeding, "synced" indicator); i18n `progressSync.*` en+id 2/2; API new **11/11**, web new **10/10** (composable 6 + axe 4, zero violations en+id), `vue-tsc` clean, API `tsc` zero errors in 019D files (2 errors in 019A's `reader-engagement.ts` — parallel actor's scope); no new GAPs; GAP-013/GAP-028/GAP-051 unchanged) | Review |
| NF-WF-020A | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-020-advanced-recovery-branches.md` §020A; implementer actor separate from contract author/amendment author/contract reviewer, the 020B/020C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; lifts the `selective restore is not implemented` refusal: DOMAIN/ENTITY/SELECTIVE preview + apply with dependency analysis; 42-edge FK table + 9 pinned semantic edges in `packages/story-versioning/dependency-edges.ts`; surgical apply (UPDATE-in-place for retained rows, DELETE only for rows absent from payload, INSERT for new rows — Restrict-safe); ORPHAN_REFERENCE/STALE_DEPENDENT conflicts; ENTITY closure informational (no gate); DOMAIN/SELECTIVE 409 UNACKNOWLEDGED_CONFLICTS without `acknowledged: true`; selection stored in operation `preview` JSON (no migration); 33-table domain vocabulary pinned, 3 unmapped tables never rewound; `SelectiveRestoreError` typed 400/409; revision `origin=RESTORE` with scope + acknowledgment in change set; `revision:manage` enforced; UI `SelectiveRestorePanel.vue` (scope picker, conflict list, acknowledgment checkbox gating apply) + en/id `recovery.*` (95/95 parity) + vitest-axe zero violations; API **12/12** selective-restore, **52/52** revision (011 no-regression), story-versioning **26/26** (9 new edge pins + 17 existing); GAP-080/081 recorded for concurrent-work interference) | Review |
| NF-WF-020B | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-020-advanced-recovery-branches.md` §020B; implementer actor separate from contract author/amendment author/contract reviewer, the 020A/020C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; branch create/list/switch, branch-scoped history, temporal model (Invariant 5), `Novel.currentBranchId`, Invariant 9 publish guard (409 NOT_ON_MAIN_BRANCH), DIRTY_SWITCH (409), branch-aware as-of closing GAP-040; migration `20261006_nf_wf_020b_branches/`; RecoveryCenter.vue UI + en/id + axe; API branches **9/9**, revision **52/52**, publication **17/17**, memory **16/16**, web RecoveryCenter **5/5**; GAP-078/079 recorded) | Review |
| NF-WF-021C | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021C; implementer actor separate from contract author/contract reviewer, the 021A/021B implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 'The Irrigation Decision' as deterministic pure functions in `packages/story-simulation/` (NO LLM calls): 20 ticks, drought at tick 5 (food_security -0.3), irrigation proposal at tick 10 (021B OUTCOME_FORK → PAUSED_PROPOSAL → decision → resume); pinned 021A/021B shapes consumed (SimulationEntity kinds SETTLEMENT/POPULATION/RESOURCE/KNOWLEDGE/INFRASTRUCTURE, CausalLink DIRECT/ENABLING/PREVENTING, SimulationProposal); no new API surface; no new tables; pop 398 without irrigation (target 380 ±10%), pop 491 + foodSecurity 0.7 with irrigation (targets 480/0.7 ±10%); drought causal chain queryable; byte-identical determinism; canon isolation by purity; story-simulation **16/16**, tsc + eslint clean; GAP-085 recorded (walkthrough UI deferred pending 021A Simulation Center)) | Review |
| NF-WF-021A | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021A; implementer actor separate from contract author/contract reviewer, the 021B/021C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 5 primitives: SimulationRun (status enum incl. PAUSED_PROPOSAL per F2), SimulationScenario, SimulationTick, SimulationEntity (kind enum SETTLEMENT/POPULATION/RESOURCE/KNOWLEDGE/INFRASTRUCTURE per F5), SimulationEvent, NovelModule; additive idempotent migration `20261006_nf_wf_021a_simulation`; 4 prerequisites ALL REQUIRED (branch → 400 NO_BRANCH per F3, checkpoint snapshot → 400 NO_SNAPSHOT, canon pin, module activation → 400 MODULE_NOT_ENABLED per F4); run lifecycle API (create/start/step/pause/resume/abort/complete via maxTicks, 409 INVALID_STATUS_TRANSITION); `simulation:read`/`simulation:manage` capabilities verified (F1/Q7: OWNER/ADMIN/AUTHOR both, EDITOR read-only, VIEWER neither — added by 021B per GAP-084, no duplicate); 10 routes; i18n `simulation.*` en+id; concept→computational mapping documented; simulation.test.ts **18/18** (primitives, 4 prerequisite 400s, lifecycle, determinism re-run, canon isolation after 100 ticks, capabilities); tsc + eslint clean for 021A files; GAP-065 note (VM replaced, services reinstalled)) | Review |
| NF-WF-021B | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021B; implementer actor separate from contract author/contract reviewer, the 021A/021C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; CausalLink DIRECT/ENABLING/PREVENTING with causeStateRef for scenario links; F6 divergence triggers (THRESHOLD_SPAN, NO_DOMINANT_OUTCOME ≥0.7, COUNTERFACTUAL_UNCERTAINTY <0.8) — reports only, never auto-resolves; ANY divergence → SimulationProposal (distinct from CanonProposal, never enters canon pipeline); run → PAUSED_PROPOSAL on proposal, → RUNNING on decide; `simulation:read`/`simulation:manage` capabilities (Q7 role mapping); additive idempotent migration `20261006_nf_wf_021b_causality`; 6 routes; i18n en+id; simulation-causality **19/19**, authorization **18/18** (3 new capability tests), tsc + eslint clean; GAP-084 (capabilities), GAP-086 (DB password, resolved)) | Review |
| NF-WF-021D | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021D (amended per Klein's option-1 decision); implementer actor separate from contract author/contract reviewer, the 021A/021B/021C implementers, all prior reviewers, and the future 021D diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; unified Simulation Center UI: `simulation.vue` page (Runs/Walkthrough tabs) + 7 components (RunList with status filter, RunCreate dialog, RunDetail with tick history + lifecycle controls, CausalChainView recursive with kind badges + counterfactuals, ProposalReview side-by-side with explicit-choice-required decide, CivilizationWalkthrough 5-step guided demo driving 021C domain functions directly in-browser via `@novelforge/story-simulation` workspace dep); no new API routes (consumes 021A/021B); ~40 new i18n keys en+id parity; §15 design tokens; web **15/15** (9 component + 6 axe zero violations), full web **421/421** no-regressions, vue-tsc + eslint clean; GAP-085/GAP-087 UI scope now addressed) | Review |
| NF-WF-010 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `d309c52` reviewed CHANGES_REQUESTED, P1/P2/P3 applied, Q1+Q3 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; state assembly (memory-vs-live corroboration), `reviewFinalText` + receipts + `setStatus` gate (author-decided behavior change), `evaluateHealth` all 7 categories, 3 routes, SCALE schema on write (GAP-012), typed `PolicyError` → 409, 003 compiler tiers 4/6 integration; 32/32 new tests, full API 510/510, story-versioning 17/17, lint + typechecks clean; GAP-038 fixed, GAP-039 open) | Review |

Current sequence: [DELIVERY-PLAN](../implementation/DELIVERY-PLAN.md).
Current assignment policy (author, 2026-10-05): model-neutral. Use the model
chosen by the author at runtime with a separate reviewer actor; prior model
names below attribute historical receipts only. No new reviewer was dispatched.
NF-WF-003 remains PLANNED after GAP-026 contract repairs; the refreshed review
manifest replaces the old round-3 artifact. Review before coding.
Current Engram hook has no authoritative registered session identity (GAP-021).
Reads are available; attributed saves are blocked. Progress holds the fallback.
Fresh bounded checks are recorded in the 2026-10-05 progress/test-matrix entry;
counts below are historical, not new full-platform verification.
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) is now
**IMPLEMENTED / REVIEWED**: the four HIGH mutation routes
(`proposal.approve`, `outlineVersion.approve`, `outline.supersede`,
`chapters.import`) accept the optional `expectedHeadRevisionId` with the §C12.1
tri-state, a mismatch is a 409 carrying `currentHeadRevisionId`, and both the
unlocked pre-check and the locked CAS are in place. Checks rerun at this
boundary against the scratch DB: targeted 145/145, story-versioning 17/17, full
API 365/365, root `pnpm test` 823 passed | 1 skipped, lint and typecheck clean.
The four per-route locked-CAS probes were falsified against a pre-check-only
build (200/200/204/201 with the locked comparison disabled) and pass restored.
The independent `glm-5.3-flash` review returned **APPROVE** on the production
diff — authorization precedes every head disclosure, generic 409s stay bare, the
tri-state is not collapsed — and one **MAJOR** test-fidelity defect: the probe's
`waitForBlocked` matched any lock waiter in the test database, so a foreign
waiter could release the probe before the request had parked. Fixed by pinning
the match to the parking backend's pid via `pg_blocking_pids`, re-falsified on
all four routes, and re-reviewed **APPROVE**. Reviewer backend is
MODEL_UNVERIFIED, so GAP-013 stays open.
[002F](../../tasks/NF-WF-002F-foundation-acceptance.md)
ran the parent gate and returned **VERIFIED 2026-10-04 for the evidenced M1
foundation scope only**. It reran every gate against the NF-WF-002 tree green
(story-versioning 17/17, constraints 8/8, targeted API 137/137, full API
365/365, root 823 passed | 1 skipped, lint, typecheck, build), exercised the
empty upgrade (all 20 migrations from empty) and the populated upgrade, and
corrected GAP-018: a failed `migrate deploy` is **partially applied** — its two
leading `DROP CONSTRAINT`s commit before `CREATE INDEX` fails, so the
documented `migrate resolve --applied` workaround is what strips the two
`canon_fact_sources` RESTRICT FKs, and a `DELETE FROM chapter_versions` for a
cited version then succeeds and orphans the citation. Accepted: revision,
snapshot, checkpoint, non-destructive restore, rebuild intent, tenant
isolation, the C3 `PRE_MUTATION` payload at all four HIGH sites, the 002D
tri-state with authorization before head disclosure, and atomicity. **Not**
accepted: full cross-domain recovery (GAP-004 stays OPEN at P1). GAP-017 and
GAP-025 closed; GAP-013 stays OPEN because **this verdict is
self-verification by the implementing model, not an independent review** — the
only independent verdict remains 002D's `glm-5.3-flash` APPROVE on a
MODEL_UNVERIFIED backend. NF-WF-003 (shared chapter context compiler) is the
next queue row and has **no contract file yet**; authoring and reviewing that
bounded contract is the next action.
This boundary's SessionStart hook confirmed an authoritative Engram identity
(`fae4b412-db3a-4ddc-a052-cfda214cfa9d`), distinct from the `0238856e…` binding
recorded at the 002D boundary; GAP-021 remains a per-boundary observation, not a
standing state.

**Reviewer transport note (2026-10-04).** `POST /v1/messages` with
`"model":"bansosmontera/glm-5.3-flash"` succeeded, but several attempts returned
`upstream_error` after emitting reasoning and before any content. A silent empty
answer from this gateway means "retry", not "no findings". The
`glm-cn/glm-5.3-flash` and `cl/z-ai/glm-5.3-flash` routes both returned HTTP 503
`429 ... balance/credit exhausted`, so only the `bansosmontera` route is usable.

## Attributed foundation implementation narrative

[NF-WF-002 revision foundation](../../tasks/NF-WF-002-revision-foundation.md)
is **IMPLEMENTED_WITH_GAPS** (2026-10-02, baseline `5b5f139`): the M1
migration, `@novelforge/story-versioning`, the revision service/routes and
the head CAS across all C3 mutations are delivered; own suites are green
(package 17, HTTP 25, constraints 8) and lint/typecheck/build pass. Its one
red gate — 123 pre-existing API tests failing because the new C8 head CAS
refused seeds that created a novel with no `novel_branches` row
(**GAP-017**) — is now repaired by
[NF-WF-002A](../../tasks/NF-WF-002A-fixture-compatibility.md), which converted
all 12 valid-fixture creation sites across the ten affected suites to the
production `createNovel` path. Actual reruns on the preserved diff: targeted
ten suites `288 passed (288)`, `revision.test.ts` `25 passed (25)`, full API
`338 passed (338)`, root `pnpm test` `796 passed | 1 skipped (797)`, lint and
typecheck clean (receipts in `test-matrix.md` G-01). The independent
exact-diff review returned **APPROVE** from two separate reviewer workers; its
two non-blocking findings were fixed in `narrative.test.ts` (final diff
`sha256 d775ad1f…`, 439 lines). GAP-017 therefore stays VERIFY_PENDING only on
NF-WF-002 / G-01 parent acceptance; no
production service was changed. Lazy baseline initialization remains
forbidden. Contract questions **GAP-019** are now disposed by
[NF-WF-002B](../../tasks/NF-WF-002B-contract-clarification.md) in
`STORY-VERSIONING.md` §C12, and that clarification is now **reviewed and
APPROVED** — receipt is the three reviewed artifacts
(`docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`,
`tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…`,
`tasks/NF-WF-002D-mutation-head-expectation.md` `sha256 640f9698…`), not a
combined-diff hash (those are milestones, and a register row cannot cite one
that includes itself); the reviewer's backend is MODEL_UNVERIFIED, so GAP-013
stays open. That review found a real recovery
defect rather than only clarifying prose: four HIGH call sites capture their
`PRE_MUTATION` snapshot *after* the mutation's writes, so the checkpoint an
author restores from holds the post-mutation image and the "step back from this
decision" operation is a no-op (**GAP-024**, measured by probe, P1). The same
review named two previously unowned requirements: no mutation route accepts a
client head expectation, so C4's optimistic-concurrency guarantee is unreachable
for callers (**GAP-022**), and `domainEventSchema.revisionId` has no producer or
consumer at all (**GAP-023**). The three have bounded owners —
[002C](../../tasks/NF-WF-002C-premutation-ordering.md) (**complete** 2026-10-02 —
round-1 review CHANGES_REQUESTED, dispositions recorded; round-2 re-review APPROVE, no findings),
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) and
[002E](../../tasks/NF-WF-002E-domain-event-producer.md) (both PLANNED, blocked on
a decision rather than on capacity — **002D's decision landed 2026-10-03** and
it is now READY, with the four-route scope, tri-state body field and
409-body recovery recorded in `decisions.md`; 002E remains blocked on a consumer
design). **002C's production fix is in place**: all
four HIGH sites now call `advanceForMutation` before their first covered-table
write, each gained the payload-content assertion C12.6 asked for, and each was
proven to fail against the old ordering and pass against the new (four receipts
in `progress.md`). **GAP-024 is CLOSED.** Next execution is **002D** — not a
restart of 001, and not 003: G-01 acceptance must first close or explicitly
accept GAP-022 (GAP-024 is now closed).
**GAP-018/020** require
verified isolated test prerequisites; **GAP-021** records the missing Engram
runtime attribution handling — re-observed at the 002A, 002B, 002C-preparation
and 002C-execution boundaries, so each boundary's checkpoint is the fallback
handoff in `progress.md`, not an MCP write.
Its predecessor [NF-WF-001](../../tasks/NF-WF-001-revision-contract.md) is
DESIGN_COMPLETE / **VERIFIED**: three independent reviews ran
(`ctx_c4dcc5969164`, `ctx_db14a16c6968`, `ctx_a28a8bb47dc7`); rounds 1–2
returned CHANGES_REQUESTED, round 3 returned VERIFIED with all five round-2
corrections confirmed and every regression check passing. The contract is
frozen and NF-WF-002 is unblocked. The reviewer role never resolved to a
proven `glm-5.3-flash`: rounds 1–2 self-reported harness tier aliases, and
round 3 correctly returned `MODEL_UNVERIFIED` despite being dispatched with
the explicit id (GAP-013). M1–M9 runtime
gates are OPEN. This documentation repair implements
no runtime features. Record all live technical issues, uncertainty and gaps in
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md). The sections below
are the detailed baseline snapshot, not a competing issue queue.

Historical entries include October-dated claims relative to the 2026-09-30
review. Preserve dates pending receipt/commit attribution (GAP-014); they do
not prove that checks were newly executed.

- **Phase 0** — monorepo, Docker Compose (Postgres+pgvector, Redis),
  shared config, module boundaries, CI skeleton, Nuxt web shell, Fastify
  API health, worker + BullMQ bootstrap.
- **Phase 1** — auth, workspaces, memberships, novels, capability-based
  permissions (ADR-0004), audit log.
- **Phase 2** — chapters, immutable versions, autosave, editor shell,
  import/export.
- **Phase 3** — AIGateway/OmniRoute adapter, gateway + model registry,
  model profiles, logical requests/attempts, bounded retry/fallback,
  error classification, generation history, platform-admin authorization.
- **Phase 4** — versioned agents, skills, workflows; fail-closed
  structured-output contracts; validated acyclic graphs; deterministic
  multi-agent execution; run history.
- **Phase 5** — references with append-only versions, citable chunk spans,
  pgvector embeddings, hybrid lexical+vector retrieval (RRF), tenant and
  spoiler predicates in SQL, per-search provenance, `RETRIEVAL` workflow
  steps.
- **Phase 6** — canon facts with a DB-enforced one-live-value constraint,
  non-destructive supersede chain, candidate canon that cannot be silently
  committed, citable evidence spans; Story Brain answering FACT, STATE,
  EVENT, CAUSAL, UNRESOLVED, PROMISES with evidence; reader spoiler
  boundary on every read path. Independent adversarial audits found and
  fixed ten defects behind a green gate (details in `progress.md`).
  Slice 3 (2026-09-30) added the **write surface** the Brain had been
  reading without: events, timeline, threads, promises and causal edges are
  now authorable through the API, and the three pure rules that had no
  production caller (`canPromiseTransition`, `findCausalCycle`,
  `isChronological`) are enforced — two on the request, the third by the
  `(novel, order)` unique index.
- **Phase 7** — planning: synopses, sagas, outline nodes, outline versions,
  planning horizon; delete routes (planning entities, novels, canon
  entities, workflows) with FK hardening so refusals are legible 409s and
  canon/run history is never silently destroyed.
- **Phase 8** — character state, knowledge boundary, arcs, relationship
  stances, bonds (groups/agreements), transitions, meaningful
  interactions. Overlap is refused by three `btree_gist` EXCLUDE
  constraints, not only by the domain validators — each confirmed
  load-bearing by dropping it and retrying the refused statement. The
  roadmap exit criterion (monogamy/harem/polygamy and enemy-to-ally)
  is tested at the HTTP boundary in `apps/api/src/character.test.ts`.
- **Phase 9** — narrative DNA, drama windows, cooldown, antagonist
  lifecycle, pattern detection, scale appropriateness. The five rules are
  pure (`packages/narrative-rhythm`); persistence is three tables
  (migrations `20261004_phase9_narrative_dna` + `20261005_phase9_blank_reason_fix`);
  the surface is 12 routes in
  `apps/api/src/narrative-routes.ts`. Only the cooldown is HARD; the rest
  advise. Both roadmap exit halves are asserted at the HTTP boundary, and
  "non-mechanical" is asserted at the **word** level — a guidance string
  containing an imperative fails, because a state-only assertion would
  stay green while the soft preference became a schedule. The three
  hand-written CHECKs were each confirmed load-bearing by a drop-and-retry
  probe. A deep adversarial audit of this surface (2026-09-30, four rounds)
  found thirteen defects behind a green gate — six logic defects, three in the
  cooldown path — plus a missing `bodyLimit` on two routes, a JSONB `null`
  band and an unguarded `access` list that each threw a 500 where a 409
  was owed, and a check-then-act race in the stage advance — with seven
  coverage holes, all fixed with a regression
  test each; three further findings were confirmed as already-recorded
  accepted deviations rather than defects. Round four re-verified round
  three's refutations and found two of them wrong, which is recorded in
  `progress.md` rather than quietly dropped. Details in `progress.md`.
- **AI Orchestrator (milestone, 2026-10-03)** — one `ai.generate`
  lifecycle entry point that resolves the agent/skill definitions the
  workflow executor also resolves (shared `definition-resolution.ts`),
  compiles context under a char budget with persisted provenance ids,
  assembles the prompt, and runs the generation through the SAME Phase 3
  path a direct request uses — plus fail-closed structured-output
  contracts and an SSE route whose refusals are real status codes, not
  error events.

Historical reported gate (not rerun by this documentation repair): lint 0;
typecheck clean in every workspace (including
`apps/web`); `pnpm test` 35 files, 746 passed / 1 skipped on vitest
5.0.2; 18 migrations applying from empty (both test databases, 0 failed or
rolled back);
`pnpm -r build` green. Phase 8's eight new constraints and Phase 9's three
CHECKs were each confirmed load-bearing by a drop-and-retry probe, and
Phase 6 slice 3's six CHECKs were confirmed the same way. Two of Phase 9's
CHECKs had been probed only with spaces while being *named*
"whitespace-only"; `20261005_phase9_blank_reason_fix` replaced the
space-only `btrim(x) <> ''` test with a POSIX class over the full blank set
and both suites now probe all 19 shapes.

First run against a **real 9Router deployment** (2026-09-30) is recorded in
`progress.md` Round 9: gateway stored through the CRUD API (credential
encrypted at rest), 1 957 models synced, and the three-model chain
(`cbai/deepseek-v4.1-flash` → `…/DeepSeek-V4-Flash-0731` →
`…/MiniMax-M2.7`) verified end to end by disabling each tier in turn. It
found four defects the fixture-based suite could not: a start script that
could not run the app, a capability map hitting a `String[]` column, a
model sync outliving Prisma's transaction default, and an upstream SSE
sentinel on a non-streaming body stopping the fallback chain.

See `docs/implementation/progress.md` (round-by-round record),
`docs/implementation/test-matrix.md`, `docs/implementation/decisions.md`,
and `docs/adr/`.

## Next milestone

**M1 — Revision and context foundation**, followed by M2 (complete author
chapter loop) and M3 (state/memory for the next chapter). Pull forward the
minimum Phase 11 slice before expanding optional Phase 10 simulation.
The simulation validation scenario remains required for that later capability.

An earlier version of this file named "Phase 9 — Reader Platform". That
matched no phase in this repo's roadmap — it came from a different
numbering scheme — and has been corrected. Reader-facing access is tracked
under Phase 13/M4–M5 below; its runtime gap remains open.

Contracted extraction application is implemented (NF-WF-008, pending
separate diff review): the 006 template's extraction feeds a
contract-then-validate-then-approve canon application flow with
deterministic evidence validation, head pinning, and atomic apply.

## Known gaps carried forward

### Character & relationship (Phase 8)

- **The blueprint's other tables are deferred by name**, in the schema
  docstring: `character_state_events`, `character_beliefs`,
  `relationship_events`, `relationship_groups`,
  `relationship_group_members`, `relationship_agreements`,
  `relationship_arcs`, and structured reputation / possessions /
  development-milestone columns. Each earns a table when a consumer asks
  for one (ADR-0008 §5's posture).
- **`characters` is standalone**, not a `StoryEntity` of kind CHARACTER.
  A link can be added when a consumer needs canon claims *about a
  character*; nothing in Phase 8 reads one.
- **No character UI.** The Phase 8 surface is API-only; the writer
  workspace still does not show character or relationship state.
- **The overlap EXCLUDEs are per-table, not global.** A `character_states`
  row and a `relationship_stances` row may name the same chapters — the
  constraints govern each table's own windows.
- **Stances are directional and unpaired.** `A→B ENEMY` with `B→A
  FRIENDLY` is representable and correct; nothing derives a "mutual"
  reading, because the one-sided feud is the case the direction exists
  for.
- **No retention or pruning** on any Phase 8 table; `meaningful_interactions`
  grows per recorded scene.

### Narrative DNA & rhythm (Phase 9)

- **`NarrativeDnaProfile.dna` has no field inventory.** The schema comment
  says the shape is validated in `packages/narrative-rhythm`; that is true
  of the POLICY payloads and aspirational for DNA. No rule consumes a DNA
  field yet, so `putDna` accepts any JSON object. Pinning a list now would
  make the service a second, drift-prone schema (ADR-0009).
- **A `SCALE` policy is stored unvalidated.** `assessScaleAppropriateness`
  takes the protagonist's standing, not the novel's preference, so no rule
  can probe a scale payload. `DRAMA_GAP` and `COOLDOWN` are probed on write.
- **No narrative UI.** The Phase 9 surface is API-only; the writer
  workspace shows no DNA, policy, or antagonist state.
- **`density` is validated but has no behaviour.** A value outside
  `DRAMA_DENSITIES` is refused, but no rule varies its bands by density —
  the author's `typicalGap` / `extendedGap` numbers are the whole policy.
  Deliberate: a density→band mapping would be the universal default ladder
  the spec's Principle forbids.
- **`hardness` gates writes but no rule branches on it.** HARD without a
  reason is refused (ADR-009), so the column is load-bearing, but nothing
  yet reads it to decide whether a finding refuses or advises. The one rule
  that hard-refuses (`checkCooldown`) does so unconditionally.
- **`Antagonist` has no delete or correction path.** Append-and-advance
  only, as Phase 6 slice 3's five tables are. (Policies do have one:
  `DELETE .../policies/:kind`.)
- **`Antagonist.workspaceId` is denormalised** as the tenant boundary,
  alongside `novelId`. Nothing enforces the two agree; the service derives
  both from the stored novel, so a mismatch would take a direct DB write.
- **`advanceAntagonistStage` reconstructs the progression as
  `[current, next]`.** The row keeps only the current stage, so there is no
  stored history of how an antagonist got there — the pair is the honest
  reconstruction, and a full lifecycle log would need its own table.
- **The drama-window assessment is stateless.** `chaptersSinceDrama` is
  supplied by the caller; nothing derives it from chapters or beats, so a
  caller can pass any number.
- **The stage advance refuses a lost race rather than retrying it.** Two
  concurrent advances are resolved by a `stage` predicate on the write; the
  loser gets a 409 and must re-read. A retry-on-conflict loop was not added —
  nothing drives this route concurrently yet, and a silent retry would hide
  the fact that the caller's plan was built on a stale stage.
- **`access` and the drama bands are guarded, not validated.** A `null` or
  non-array `access` and a `null` band now produce a verdict instead of a
  `TypeError`, but nothing pins the *shape* of a `SCALE` payload the way
  `DRAMA_GAP` and `COOLDOWN` are pinned on write — see the `SCALE` entry
  above. The guards keep the failure a 409/verdict instead of a 500; they do
  not make an unvalidated payload valid.

### Canon / knowledge

- **Canon has no `revision_id` column, but its C3 mutations now participate in
  the revision/checkpoint model**: `proposal.approve` advances a revision and
  captures a `PRE_MUTATION` snapshot covering `canon_facts` and
  `canon_proposals` (NF-WF-002, accepted 002F 2026-10-04 for that scope).
  Non-destructive correction still relies on the supersede chain alone, and
  full cross-domain recovery is not accepted (GAP-004). ADR-0013 supersedes
  ADR-0008 §4's scheduling deferral.
- A canon fact's chapter citation is a historical pin — resolvable forever,
  but not "the current version" once the chapter is saved again.
- **LLM fact extraction is not implemented.** Canon is author-authored only;
  extraction would be candidate canon needing approval (§2.13).
- Chapter prose is not searchable (no chapter tsvector, no chapter chunks),
  so prose recall reaches reference material only.
- `available_from_chapter` is a chapter number, so a chapter reorder must
  recompute authored boundaries or the spoiler filter drifts.
- **No ANN index on embeddings.** Exact scan over a workspace's vectors;
  revisit with a raw-SQL migration when measurably slow (ADR-0007 §2).
- Retrieval quality is bounded by the chunker's paragraph/line/sentence
  heuristics.
- Ingestion is synchronous within the request; embeddings should move to
  the worker queue when documents are large enough to time out (CLAUDE.md
  §24).
- Only text ingestion exists; PDF/DOCX/TXT/Markdown extraction is not
  implemented (§32). `ReferenceKind.IMPORTED` is reserved for it.

### Reader-facing access (Phase 13, M4/M5; runtime gap remains)

- **Phase 13 now owns reader-facing delivery.** `READER_MODE` and the
  spoiler boundary exist (Phases 5/6) and are enforced on every read path,
  but reader-facing publishing, chapter access control for non-members and
  a reader UI still require implementation. An earlier
  `CURRENT.md` called this "Phase 9 — Reader Platform"; the roadmap's
  Phase 9 is Narrative DNA & Rhythm. The capability is real and partial —
  completion is assigned to NF-WF-012–014 and NF-WF-019.
- `Chapter` has a publication state, but there is no route that serves a
  published chapter to an unauthenticated reader, and no reader-facing UI.

### Story intelligence (Phase 6 slice 3)

- **Hierarchical memory (L0–L6) is not materialised**, among the remaining
  Phase 6 integration deliverables. ADR-0008 originally rejected it for this
  phase by name: summaries are rebuildable projections (§2.2), and
  materialising them without a `built_from_revision` FK was the original
  reason for deferral — a projection with no recorded source revision cannot be
  invalidated when its canon changes (§2.14). The rule lives in
  `docs/03-domain/STORY-INTELLIGENCE.md`. ADR-0013 moves the revision
  foundation to M1 and consolidation to M3; do not pre-create seven tables.
- **No delete routes on any of the five tables.** `causal_edges` cascade
  from `story_events`, so deleting an event would silently take its causal
  claims with it (CLAUDE.md §9). A correction path needs a supersede chain
  before a delete is safe; the surface is append-and-transition only.
- **`story_thread_events` has no API.** The thread↔event join is
  schema-present and unused; it earns a route when something needs to
  render a thread's event history.
- **No timeline reorder.** `appendTimelineEvent` assigns the next slot and
  there is no way to move an entry — renumbering a timeline the reader has
  already seen is a deliberate non-goal, but insert-in-the-middle will need
  a design (likely explicit gaps, not renumbering).
- **The concurrent-append 409 has no covering test.** Prisma serialises
  injects on one connection, so the race cannot be forced deterministically;
  the branch is documented race defence.
- **No story-intelligence UI.** Events, threads, promises and causal edges
  are API-only; the writer workspace still shows none of them.
- **Timeline and story events are separate tables with no link.** A
  `timeline_events` row carries no `chapter_id` and no relation to a
  `story_event`; in-story time and reading order are not yet reconciled.
- **The Brain's EVENT/CAUSAL legs are unbounded lists** (the audit row caps
  provenance at 100). Pagination arrives when a novel's event count makes
  it matter.

### Delete semantics (settled 2026-10-02, migrations 20261002 / 20261002b)

- `canon_facts.entity_id`, `canon_facts.object_entity_id` and
  `canon_facts.novel_id` are `ON DELETE RESTRICT`: a canon fact is the
  record and survives every parent delete; the refusing route (entity or
  novel delete) answers 409. The block is PERMANENT — retraction withdraws
  a claim but keeps the row, so only unreferenced entities (and fact-free
  novels) delete.
- `workflow_runs.workflow_id` / `.workflow_version_id` are RESTRICT: run
  history is the execution audit trail; a workflow with runs (or a novel
  that has any) refuses with 409.
- `canon_proposals` FKs stay CASCADE — proposals are uncommitted candidate
  canon and die with their subject.
- Delete routes live for planning entities, novels, canon entities, and
  workflows; a novel-delete route test pins both refusal paths.

### Workflows

- A `RETRIEVAL` workflow step always searches in AUTHOR mode; the step
  contract has no `mode`/`readerChapter` field.
- Workflow runs execute synchronously within the request. Durable execution
  is now NF-WF-004/M2 work, not a late Phase 13 deferral.
- An `AWAITING_APPROVAL` run stops but cannot yet be resumed. Its
  `completedAt` is deliberately null so a resume path can distinguish it
  from a finished run.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); no
  per-workspace override and no operator UI.

### Ops / editor

- **No retention or pruning on the audit tables.** `retrieval_audits`
  (now wider — one row per Brain ask too) and `Generation` rows grow
  unbounded. Needs a TTL, partition, or archive job before the tables are
  large — Phase 13 concern.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and Ubuntu.
# Boundary update — NF-WF-036, 2026-10-07

NF-WF-035 pushed at 3086e7c. NF-WF-036 IMPLEMENTED/REVIEWED: GAP-110
scene create/edit/reorder now records checkout revision/change set and rebuild
intent atomically. No-op timestamps stay unchanged. Sibling manuscript and
publication locks follow novel/branch/chapter order. Scene20/20; expanded
API58/58; worker publication21/21; API typecheck/lint exit0. Separate reviewer
APPROVE; no full release proof. NF-WF-037 Recovery Center wiring under review,
GAP-111/112 recorded. Engram attribution remains unavailable; this is fallback
working context, not an attributed MCP save.
# Boundary update — NF-WF-037, 2026-10-07

NF-WF-036 pushed at2479696. NF-WF-037 IMPLEMENTED/REVIEWED: recovery header
link/page, server checkpoint/branch choices, manual checkpoint, all4 real
components, mutation refresh and preview/request pinning. Autosave newer edits,
failed/in-flight chapter switching and route leave now preserve the buffer.
GAP-083/111/112 resolved within the bounded scope. Focused web27/27; en/id page
axe zero in jsdom; web typecheck/lint and Nuxt production build exit0. Separate
review_mutations_034 APPROVE. Next: sequential NF-WF-023 on the final revision;
no live browser/manual screen-reader proof. Engram attribution unavailable per
runtime hook; this file/task is the fallback checkpoint, no MCP save claimed.
# Boundary update — NF-WF-038, 2026-10-07

NF-WF-037 pushed at36519e2. Initial final battery stopped/invalid: temporary
PowerShell driver argument splat failed; actual E2E failed before collection
because agent-template parser rejected WindowsCRLF. GAP-113 repaired in separately
reviewed NF-WF-038: template10/10, package typecheck/targeted lint exit0, reviewer
APPROVE. Failed attempt retained in039 release report. Next: fresh NF-WF-039
sequential battery on post038 commit. Live API/web/storage/gateway listeners absent;
no live deployment or manual accessibility proof. Engram attribution unavailable;
this record is fallback only.

## 050A repair in progress — 2026-10-09 02:38 WIB

Branch `work/nf-wf-050a-scale-evidence` merged origin/main `209a911`
(commit `3054cc3`); GAP-118 conflict resolved (coordinator's P1 kept,
fixture-only diagnosis marked SUPERSEDED with provenance note).

Two separate implementers dispatched (MODEL_UNVERIFIED per GAP-013):
- Service repair: capability enforcement, re-read after lock, RepeatableRead,
  pagination cursor, stored-data validation, strict schemas
- Test repair: versionId source, expectedVersion, actor 400, validator targeting

Schema: `@db.Timestamptz(6)` added to ScaleEvidenceSet.createdAt to match
applied migration (no migration rewrite). Prisma validate passes.

GAP-118 repair plan recorded in ISSUES-AND-GAPS.md.

## 050A repair complete — 2026-10-09 03:13 WIB

All GAP-118 defects fixed. 32/32 scale-evidence tests pass (22 original + 10
evidence). Manuscript 21/21, restore-scope 8/8. Typechecks, lint, diff-check clean.

Evidence: simultaneous appends, lock/read races, historical-version refusal,
direct-service role denial, pagination integrity, checkout/headless, FULL/selective
restore, malformed stored evidence, deletion/create race, parent cleanup.

GAP-108 8th recurrence during repair (VM reset); environment restored.
Final diff review dispatched; awaiting verdict before commit/push.
GAP-039 remains OPEN.

## 050B implementation started — 2026-10-09

Branch `work/nf-wf-050b-scale-review` created from `fed3cea` (frozen 050B contract).
Frozen hashes verified:
- Task: B6A44390D2485D90A62C23B971E0B1039DB177A4F412D970D2C4A78AA78ABE45
- ADR-0016: 1909A48A9B958C787F76FCBF678528E106165F079192B30D764922ECDC917C52

**Assignments (2026-10-09):**
- Implementer: coordinator (this session; backends MODEL_UNVERIFIED per GAP-013)
- Separate slice reviewers: to be dispatched per slice (MODEL_UNVERIFIED per GAP-013)
- Contract reviewers (prior): review_mutations_034, review_recovery_034 (APPROVE)

**Execution order (serial reviewed slices):**
1. Additive storage, migration proofs, frozen context interfaces
2. Author decisions, deterministic SCALE review, shared API/worker gate
3. English/Indonesian UI and real author-flow acceptance

GAP-039 remains OPEN; 050C separate. Engram unavailable (GAP-021); this file is fallback.

## 050B repair scope amendments — 2026-10-09

Bounded amendments to the frozen contract's allowed paths:

1. **`packages/ai-services/src/scale-review-types.ts`** (NEW): Contains the frozen protocol 1 types (`ScaleReviewPins`, `ScaleReviewClaim`, `ScaleReviewProtocol`) required by the contract's "freeze exported context/pin/gate shapes". Within the allowed `packages/ai-services/src/` package. No contract violation.

2. **`apps/api/src/scale-evidence-migration.test.ts`** (MODIFIED): Baseline now excludes post-050A migrations (e.g., 050B) to prevent FK failures. The 050A test is 050A-focused; 050B has its own migration test. Bounded test-only change.

3. **`packages/ai-services/src/policy-errors.ts`** (MODIFIED): Added `SCALE_ASSESSMENT_INCOMPLETE` to `PolicyErrorCode` union. Required for the contract's distinct frozen error code (not mapping incomplete to HARD_POLICY_VIOLATION).

4. **`packages/database/prisma/migrations/20261008_nf_wf_050b_scale_decisions/migration.sql`** (DOCUMENTED): Uses TIMESTAMPTZ(3) not TIMESTAMP(3). The schema explicitly declares `@db.Timestamptz(3)`, which selects TIMESTAMPTZ(3) — this is NOT Prisma's default mapping (plain DateTime maps to TIMESTAMP). Precision (3) matches the contract; timezone-awareness is additive and does not change contract semantics. Same pattern as 050A's explicit `@db.Timestamptz(6)`.

**Review status (honest record):** These 4 amendments have NOT received a standalone independent scope-amendment review with a separate recorded receipt. They were included in the repaired diff reviewed by the independent repair reviewer (verdict: APPROVE_WITH_FINDINGS, 2026-10-09), whose report noted them as "bounded, documented, do not weaken the contract" — but that was part of the overall diff review, not a dedicated scope-amendment approval. A separate recorded scope review is still owed per the contract's amendment procedure.

All amendments are bounded, documented, and do not weaken the contract.

## Migration preservation proof (relabeled 2026-10-09) — was "Old-snapshot restore proof"

**Historical note:** This section was originally titled "Old-snapshot restore
proof" (2026-10-09). That title was misleading: the evidence below proves
pre-upgrade receipt preservation through the additive 050B migration, NOT a
STORY checkpoint restore via NovelForge's restore path. The title is corrected
here; the original evidence and provenance are preserved unchanged below.

`apps/api/src/scale-review-migration.test.ts` proves migration preservation (OBSERVED 2/2 pass):

- **What was tested:** A genuine `FinalTextReview` row (verdict, hardViolations, advisory, evaluatedPolicies — no `scale_review` column existing) is inserted into the BASELINE database BEFORE the 050B migration runs. This baseline represents a pre-upgrade database.
- **After upgrade:** The receipt is re-read and verified field-by-field identical (verdict, hardViolations, advisory, evaluatedPolicies all preserved). The new `scale_review` column reads NULL for the legacy row — NULL denotes legacy receipt, never fabricated proof of SCALE completeness.
- **What this proves:** Pre-upgrade data is preserved through the additive migration; legacy receipts are not rewritten or fabricated; the nullable column correctly defaults to NULL.
- **What this does NOT prove:** An actual `pg_restore` of a production snapshot binary, or restore of a snapshot taken from a different Prisma version. The restore-scope classification (both tables OPERATIONAL, never rewound) is unit-tested in `restore-scope.test.ts` (8/8 pass), not via a live restore operation.

## STORY checkpoint restore proof — 2026-10-09 (Slice 2, superseded 2026-10-09 Slice 2 fourth repair)

**Historical annotation (2026-10-09):** The evidence below was simulation and
classification, NOT an actual application STORY restore. The test inserted a
NULL receipt, asserted coverage constants, and manually advanced the head — it
never constructed old snapshot JSON or invoked NovelForge's restore path
(`previewRestore`/`applyRestore`). The claim "exercises the STORY restore
semantics" is retained here for provenance but annotated as UNSUPPORTED as a
restore proof. See the replacement below.

`apps/api/src/scale-decisions.test.ts` → "STORY restore with old snapshot JSON
lacking scale_review" (OBSERVED pass) exercises the STORY restore semantics:

- **Legacy receipt handling:** A `FinalTextReview` with `scaleReview: null`
  (simulating a pre-050B snapshot JSON lacking `scale_review`) is returned by
  `listFinalTextReviews` without crashing, with `scaleReview: null` — null
  denotes legacy, never fabricated proof.
- **Retained OPERATIONAL S2 history:** `scale_decision_proposals` and
  `scale_decision_outcomes` are NOT in `COVERED_TABLE_NAMES` (verified in-test);
  STORY restore never rewinds them. S2 proposal+outcome created before the
  simulated restore remain intact.
- **Stale applicability:** After the head advances (as a restore would), the
  receipt's `revisionId` pin no longer matches the current head → the receipt
  is stale (does not reflect current state).

## ACTUAL STORY restore proof — 2026-10-09 (Slice 2, fourth repair)

`apps/api/src/scale-decisions.test.ts` →
"ACTUAL STORY restore with old snapshot JSON lacking scale_review: invokes
previewRestore/applyRestore" (OBSERVED 2026-10-09, 32/32 file pass) invokes
NovelForge's REAL restore path:

- **Old snapshot JSON constructed:** the PRE_MUTATION checkpoint's snapshot
  payload (captured by the HIGH VILLAGE→TOWN standing change) is read;
  `scale_review` is stripped from every `final_text_reviews` row — the
  pre-050B format. Sanity assertions prove the stripped payload lacks the key
  and still pins the VILLAGE standing.
- **Real restore invoked:** `previewRestore` + `applyRestore` (FULL scope) via
  `createRevisionServices` — the actual application code path (delete covered
  rows, re-insert from the old payload, rewind the branch head, record the
  RESTORE revision). Not a simulation: `applyRestore` returns APPLIED with a
  new revision ID.
- **Standing rewind proven:** policy standing reverts TOWN → VILLAGE (the old
  snapshot's value), verified by reading the live policy after restore.
- **Legacy receipt handling proven:** restored `final_text_reviews` rows have
  `scaleReview: NULL` (old JSON had no key); readable without crashing; the
  pre-restore legacy receipt's verdict survives.
- **Retained S2 history proven:** the proposal + outcome (OPERATIONAL tables,
  outside restore scope) survive the FULL restore intact.
- **Stale applicability proven:** the restore advances the head to a new
  revision; all restored receipts pin older revisions → stale.

`apps/api/src/scale-decisions.test.ts` →
"PRE_MUTATION checkpoint snapshot captures the pre-change standing" (OBSERVED
2026-10-09) inspects the successful HIGH mutation's checkpoint:

- **Source revision:** `checkpoint.revisionId` equals the pre-decision head
  revision ID — the snapshot is pinned to the pre-change revision.
- **Snapshot content:** the `narrative_policies` SCALE row in the snapshot
  payload carries `standing.scale: "VILLAGE"` (the pre-change value) while the
  live policy reads `"TOWN"` — proving the snapshot captured the pre-change
  standing, not a copy of post-decision state.
