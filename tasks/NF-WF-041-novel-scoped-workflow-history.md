# NF-WF-041 — Novel-scoped chapter workflow history and approvals

Status: IMPLEMENTED / REVIEWED. Baseline: 198e883.
Owner: current Codex implementer. Reviewer: separate review_mutations_034 actor.
Goal: close GAP-034; same-number chapters in different novels must never share
history or a parked approval warning, even after rapid navigation.
Reading: constitution, GAP-034, workflow-runs service/definition routes,
GenerationPanel/useWorkflowRuns, writer-ui and generation panel tests.
Dependencies: current API/web tests and build green at712cca6;198e883 docs only.
Allowed: definition-routes.ts, services/workflow-runs.ts, writer-ui.test.ts;
GenerationPanel.vue, useWorkflowRuns.ts and related generation tests; task/progress
and the single issue register. Forbidden: approval authorization changes, schema
migrations, global inbox narrowing, workflow cancellation, provider/queue changes.
Inputs/outputs: optional novelId UUID and chapterNumber positive integer query
filters. chapterNumber requires novelId (400 otherwise). Legacy unfiltered lists
and optional workflow/status/limit remain compatible. PostgreSQL filters numeric
input.chapterNumber and novelId before order/limit; workspace authorization stays.
Unknown/foreign-workspace novel filter yields no rows, not foreign run information.
UI requests current novel+chapter, preserves novelId, checks both fields when
displaying history/parked approval, and ignores responses from an older selection.
Late start responses must not select an old novel's run in a newly selected novel.
Invariants: one bounded task; exact numeric JSON matching; filter before take;
no silent canon, manuscript or approval mutations; independent workspace inbox.
Acceptance: same workspace/two novels/same chapter, wrong chapter and >100 newer
unrelated runs, status/workflow/limit combinations, cross-workspace and unauthorized
negatives, malformed query400; UI defensive filtering, stale response/navigation,
normal matching approval selection/start, no chapter clearing. Capture regression
failure before repair and pass after; separate exact-diff review.
Commands: scoped API writer-ui/definitions/ai-studio and web generation tests;
API tsc, web vue-tsc, lint; Nuxt build if SFC changes require it.
Prerequisites: existing Windows Docker PostgreSQL5433; only owned dedicated scratch
databases, no overlapping API suites. No new service/install or Docker data reset.
Migration/rollback: none; optional API extension, revert matching UI/API together.
Handoff: counts/commands, reviewed diff and CURRENT; no full release reacceptance.
Engram host registration unavailable (GAP-021); task/CURRENT remain fallback.

Scope amendment separately APPROVED: include RunStatusPanel.vue and its
focused test. GAP-116 records missing response guards in initial detail loading
and cancellation; old detail/cancel responses must never repopulate a different
selection or an unmounted panel. Preserve server cancellation/approval policy;
existing polling already checks stopped/sequence. Add exact delayed-response
regressions and workspace/run selection changes to the UI proof.

## Verification and handoff — 2026-10-07

Observed RED: GenerationPanel3 failed/1 passed (missing filters, late history,
late start). Corrected API fixture failed on wrong returned run ID. Initial
fixture validation error is not product RED. RunStatusPanel4 failed/2 passed
before repair; unmount/normal cancellation controls were already passing.
First expanded API run66/67 failed only a mistaken outsider403 assertion; source
authorization hides nonmembers with404. Corrected assertion preserves policy.

Final scoped proof: writer-ui12/12; unchanged definitions+ai-studio55/55 in the
expanded run, combined disjoint coverage67 tests across3 files in two runs.
Web generation+global ApprovalsInbox7 files44/44 including late cancellation
cleanup while a newer cancellation remains busy. API tsc, final web vue-tsc,
final pnpm lint and Nuxt production build exit0. No full battery rerun claimed;
NF039's all-suite receipt remains pinned to712cca6. Build log retained at host
TEMP/novelforge-nf041-final-build.log; existing import/dependency warnings remain.

Separate review_mutations_034 actor APPROVE for contract, amendment and exact
final diff. Server list filters run before take; UI checks provenance, invalidates
older loads/start results, and guards downstream detail/cancel success/errors/
cleanup. Global workspace inbox remains intact. No migrations or author data reset.
GAP-034 and bounded GAP-116 resolved; human/live/other gaps remain open.
Engram runtime hook has no authoritative binding: no attributed save attempted
or claimed. This task and CURRENT preserve the fallback checkpoint.
