# Solo Leveling planning data and publication review

Status: COMPLETE, independently reviewed and locally activated. Owner: root
executor; separate read-only reviewer APPROVE (source and data application).

Scope amendment: author additionally requires automatic review on the explicit
Save button, without publication; retain saved text even when review fails.
Reuse the same guarded workflow for Save and Publish; autosave stays a text
save, with manual Save able to review already-autosaved text. Review identified
an intent race: another actor can save/review a different version before the
publication lock. Add optional expectedChapterVersionId to the native publish
route/service, compare under the existing chapter lock, and send the reviewed
ID from the writer. Other callers retain existing behavior. Include this
route/service and publication regression tests in allowed paths.

Second author amendment: show failed review findings above Generation in the
right rail, with a Show action locating verified affected text in the editor.
Reuse native findings/provenance. Only target a retained exact-version quote
whose stored span still matches and whose rendered text resolves unambiguously;
never invent line numbers for policy-only findings. Preserve failures visibly
as stale after edits and require another review before navigation. Include the
small review panel, text-location helper and focused tests in allowed paths.
Engram runtime became UNBOUND (hook ETIMEDOUT); no further attributed writes
until a fresh host confirmation. This task/CURRENT are the fallback handoff.

Runtime recovery: host subsequently reconfirmed the session; writes may resume
under that supplied identity. Visual refinement uses the Designer skill and
the exact `.prose .selected` treatment from the approved reference: orange tint,
2px inset accent edge and 0/4px radius. Tiptap decorations keep visual markers
out of manuscript HTML. No design MCP capabilities are available in this host;
use real rendered browser checks. Native decoration contract verified against
installed Tiptap and https://tiptap.dev/docs/editor/core-concepts/decorations.

Apply safety amendment: horizon PUT accepts an optional expectedUpdatedAt
precondition, tested under the existing transaction locks. null asserts no
existing policy; a competing policy returns409 without overwrite or revision.
Private application receipt is bound to the prepared plan hash. Add native
planning route/service and regression tests to allowed scope.
Goal: populate Solo Leveling's Planning > Versions and Horizon, and repair the
author's Publish workflow reporting 409 REVIEW_STALE.

Read AGENTS/START-HERE/CURRENT, existing import evidence and stored outline
nodes, planning/horizon contracts, final-text review and publication gate,
writer publish/save/selection flows and focused tests. Observed current novel:
270 DRAFT chapters, 270 retrospective outline nodes, no outline versions,
no horizon and no final-text receipts for current chapter versions. The
absence of review correctly prevents publication; do not weaken that gate.

Create one source-linked retrospective outline DRAFT from existing records
without inventing events or approving it. Author explicitly confirms Versions
means the menu adjacent to Horizon. Configure per-novel distance bands FULL
through 5 chapters, BEATS through 20, SKETCH through 60, VAGUE beyond; this
controls future planning detail, not rewriting the completed manuscript.
Preserve source text, current versions, all other novel data and pending canon.
Create/read-back native checkpoint and private DB backup before story changes.

Fix the writer publish action to resolve the server's current version, run the
native deterministic final-text review and publish only on confirmed PASS for
that exact version. Preserve server HARD/SCALE enforcement, permissions and
recovery. Refuse changed/unsaved/obsolete UI scope, no duplicate clicks, no
automatic retries or publication after failed/uncertain review. Live source
diagnostics/review do not authorize publishing imported chapters; publication
acceptance uses real APIs on disposable PostgreSQL DB only. No LLM is needed
for reusing verified outline records or deterministic review.

Allowed: writer page/focused tests, localized publish labels/messages, existing
HorizonView wrapper bug if reproduced, task/CURRENT/ISSUES and ignored receipts.
No schema/dependencies/gateway change, automatic outline/canon approval, live
publication, commit/push/deploy or data reset. One writer; retain dirty work.

Acceptance: source-linked 270-node draft and horizon read-back, source and canon
hashes unchanged, real checkpoint/backup receipt; review precedes publication,
FAIL/error/version-change/unmount prevent publish, duplicate click blocked,
EN/ID and real scratch API/browser acceptance. Run focused web/API/planning
checks, affected typecheck/lint/diff and independent final review. Rollback via
native pre-change checkpoint; code rollback never fabricates review receipts.

## Completion evidence — 2026-10-19

Observed live application: outline version 1
`bfa04a1b-f5f2-4040-b6a9-d7da13096f6e`, DRAFT, 270 frozen node/chapter links,
and horizon FULL through 5, BEATS through 20, SKETCH through 60, VAGUE tail.
Native API and database read-back match the prepared plan. Chapter 1's retained
summary explicitly flags its original/current source difference; all current
author prose and versions remain intact. No automatic outline approval.

Pre-change checkpoint `31b7c891-b2f0-4253-944b-fe71220fb925`, revision
`8716744c-a4cd-436e-8795-d8a7fbfad308`, number 2080, 6,547,479 bytes, read back.
Private backup: 124,465,593 bytes, SHA256
`079073cc1c8c66226fcd00d2654cbf7312cb258684f7db657bfa8fb0ee4dea1b`;
TOC verified, restore rehearsal NOT performed. Plan/application receipts bind
the exact source hashes and native mutation IDs; pending flags prevent blind
replay after uncertain outcomes.

42 focused web tests PASS; 26 native PostgreSQL planning/publication API tests
PASS, including reviewed-version A versus changed/reviewed B refusal and
atomic horizon absence precondition. Web/API/ai-services types, scoped TS/JS
lint and diff check PASS. Vue files are covered by Vue compilation/typecheck,
component/browser checks; repository ESLint only covers TS/JS.

Actual Chromium plus native API on `novelforge_test_solo_publish` verifies EN
desktop and ID 390px Save-review without publication, Publish-review-release,
real HARD SCALE failure, failed findings above Generation, Show selecting the
exact editor quote, reference orange decoration, direct editing clearing the
stale highlight, and Save rerunning review without publishing a failed chapter.
Persisted review/publication pins read back; no page errors/overflow. Measured
highlight: rgba(249,115,22,0.11), inset 2px #f97316, radius 0/4/4/0, matching
the foundational reference. Decorations are not serialized to manuscript HTML.

Live author UI verifies version/horizon visibility and header Save running only
the native review POST. Chapter 1 version 5 received PASS:
receipt `bc575b66-c33e-4a47-9022-89a44ac7d24d`, pinned current version
`6343998f-2594-4e15-98cb-85b3fe4b14fd`. All 270 chapters remain DRAFT and no
publication was attempted. Ordered proposal hash remains
`77bdb5429ff072c03761eaf774644f1b118455b9e86b1ec611da2027d2fa7f85`.

Independent exact-source review APPROVE; final writer hash
`defd7d4fae8d3dfdf52ad0428929914e41b01dab9178f4a18df1de8136d4e2f0`,
panel `e337b9576c11fbe90c84a8fd013c5a755e29eaa0e08c6f900da0fc3d18317cd1`.
Updated API activated after verifying 0 IN_PROGRESS generations; readiness 200
and malformed new precondition probes return 400 without data writes.

Private evidence: `.nf-artifacts/solo-planning-{plan,applied}.json`,
`solo-publish-{web,types,api-types,services-types,lint}.log`,
`solo-planning-api.log`, `solo-publish-browser-receipt.json`,
`solo-live-review-receipt.json`, screenshots, `solo-review-activation.json`
and `solo-review-design-report.json` with its verification plan.
No commit/push, schema/gateway changes, live publication, canon/outline
approval or human screen-reader acceptance. Policy-only findings and ambiguous
quotes cannot honestly jump to a text location; the UI states that limitation.
