# Workflow step retry and brighter selection

Status: COMPLETED locally. Author requested 2026-10-23; root integrated the backend
from an isolated worktree; a separate read-only actor reviewed the exact changes.

Scope: brighten selected text in editable controls using house orange tokens;
add an explicit author action for a failed AI step, preserving successful draft
work and all approval/publication gates. Existing full-restart/reuse-settings UI
does not resume a failed step. No automatic retries added.

Observed main run eb3ed1b1-8570-4ab7-8ce2-1343faa20497 failed at review_vs after
write/validate_draft succeeded. Transport fallback succeeded, but reviewer output
violated schema; this is invalid AI output, not merely a network error. Preserve
raw failure history and successful outputs; never promote malformed review.

Design: server exposes retry eligibility {stepKey,reason} on failed run detail.
POST /api/workspaces/:workspaceId/workflow-runs/:runId/retry returns run+statusUrl,
202new/200dedup, with one deterministic child retry per failed run. Original failed
run remains immutable. Reuse safe successful prefix/outcomes and pinned definitions/
model/context; only failed AI step and remaining steps execute. Audit parent/child
and reused steps. Concurrent/repeated/uncertain submissions cannot duplicate work.
Use existing queue/executor/recovery; no parallel engine or approval bypass.

Allow manual retry for transient/rate-limited model failures and invalid generated
AI-output contracts; refuse auth/config errors, failed deterministic validators,
author rejection, missing pins, unsafe previously applied mutation/approval and
changed manuscript/outline/story source. Do not infer eligibility from a translated
error string. Preserve generation/attempt ledger, original failure and approvals.
Strict chapter workflows require current saved source validation before reuse.
No schema migration unless source evidence proves one required; escalate scope.

UI: localized reason/action adjacent to failure summary, busy/disabled state,
readable refusal, safe repeat after uncertain POST, stale-scope/unmount guards,
new run selection/polling, same action in writer and Studio where server eligible.
Text selection: brighter background/dark readable text in input/textarea/editor;
retain focus/disabled states and native selection behavior.

Allowed: workflow retry service/routes/view contracts, focused tests and frontend
consumers/locales/CSS, task/CURRENT/issues/private proof. Preserve WIP/stash and
Windows Docker/data; no commit/push/router changes, automatic canon or publication.
Proof: focused actual DB authorization/eligibility/stale/dedup/queue recovery and
successful-prefix reuse, UI EN/ID/fallback/busy/stale/error tests, actual browser
selection pixels and retry flow with real gateway on disposable copied story.
Main failed run is observational evidence; do not retry/apply/publish it silently.
Review exact changes, activate known local API/worker only as necessary, save
verified checkpoint/summary. Revert only this scoped delta for rollback; retained
parent/child runs remain auditable, no destructive rollback.

## Completion evidence — 2026-10-23

Implemented the authenticated retry endpoint and server eligibility in writer and
AI Studio. A receipt-verified deterministic child retains successful steps and
pinned inputs; uncertain repeats return the same child. Only pending children
are enqueued. Changed source, invalid configuration, deterministic validators,
author rejection and unsafe approval history remain blocked. A typed failed
generation link preserves transport classification without parsing error prose.
Future chapter sources also pin the target chapter version; legacy creation runs
use their existing authoritative creation pin and exact source comparison.

Independent UI and eight-file backend reviews APPROVE. The backend reviewer found
and the builder fixed replay ordering after a lost response and terminal requeue;
new regressions cover both. Ten actual PostgreSQL/executor/HTTP tests PASS, plus
34 existing executor regressions after integration. Web proof: 24 focused tests
PASS; the corrected retry component has 11 passing cases, with EN/ID/fallback,
busy, uncertain repeat, refusal, scope-change and unmount coverage. API/web types,
focused backend lint and changed-backend diff check passed. The integrated backend
files match the reviewed worker hashes exactly. No schema migration/dependency.

Real gateway proof used a fresh restored copy of the current story database and
previously empty Redis12. Original run eb3ed1b1-8570-4ab7-8ce2-1343faa20497 remained
FAILED and byte-equivalent in the tested projection. Retry child
3f24b1e4-46a0-4152-92f9-eb424129f900 reused all five successful prefix steps and
generation IDs. review_vs, review_final and extract completed using real gateway
attempts/fallbacks; child reached AWAITING_APPROVAL, with one retry audit and zero
author decisions. Repeated UI POST returned that same child without new work.
No author approval, draft application, canon mutation or publication was performed.

Actual browser ID1440/EN390: retry visible and usable, no page errors, native
Ctrl+A selection in textarea and search input uses #fb923c/#1c1207, screenshots
visually inspected. Main API read-back verified FAILED/review_vs eligibility after
activation with GET only; temporary session removed and absence verified. Main
API8324/ready200 and workflow worker36196 activated after queue/run idle check;
Nuxt3001/browse200. Main failed run unchanged; main queues idle after activation.

Private evidence: .nf-artifacts/workflow-retry-live-receipt.json,
workflow-retry-browser-{id,en}-receipt.json and selection/action screenshots;
fresh backup retained as workflow-retry-live.dump. Owned runtime stopped, proof
clone dropped and its exact Redis12 keys removed; DB12 verified empty. Existing
worktrees, stash, Docker data and uncommitted work retained. No commit/push.
Not checked: full repository suite, human screen-reader acceptance, or author
acceptance of AI story content. These are not implied by the technical proof.

## Follow-up: configuration failure recovery — 2026-10-23

Author supplied a new run5395b845-66d7-4e31-b4d8-3d14164e7ab3 screenshot without
retry. Actual plan failure occurred before generation creation: selected model
was not enabled/compatible. Existing direct retry appropriately refused this
configuration branch, but the writer gave no adjacent next action. Add fallback
Review settings & try again, restoring previous notes/model choices through the
existing scoped loader with no POST. Explain that reviewing settings then
Generate draft starts a new process from the beginning, preserving history.
Do not silently change model mappings or bypass validation/approval.

Implementation: optional configure action/forwarding in WorkflowRetryAction and
RunStatusPanel; expose existing GenerationPanel.prepareFailedRun to the writer
handler; restore then scroll to the form. Direct eligible-step retry unchanged.
EN/ID copy and negative no-POST/nonfailed tests; action outside step-list guard.
41 focused UI tests PASS, web types exit0, diff check0; separate review APPROVE.
Actual main browser ID1440/EN390 recovery button + settings preparation PASS,
no mutation requests/page errors; screenshots inspected. Temporary owner session
removed/absence verified. Run remains FAILED with no plan generation; no story,
configuration, approval or publication mutation. Receipt/private screenshots:
.nf-artifacts/retry-config-browser-receipt.json and retry-config-action/settings.
No commit/push or full-suite/human acceptance claim.
