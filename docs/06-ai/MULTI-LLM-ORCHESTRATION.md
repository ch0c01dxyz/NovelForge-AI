# Multi-LLM Implementation Playbook

## Purpose and authority

Execute the [delivery plan](../implementation/DELIVERY-PLAN.md) in bounded,
reviewable tasks without hidden conversational context. Follow the operating
constitution and [evidence policy](MODEL-EVIDENCE-POLICY.md). This playbook
governs coding agents; product story agents use [AI orchestration](AI-ORCHESTRATION.md).

## Requested model pairing

| Role for a task | Default requested model | Responsibility |
|---|---|---|
| Implementer | `deepseek-v4.1-flash` | Inspect, implement one contracted slice, run checks, hand off evidence |
| Reviewer | `glm-5.3-flash` | Independently inspect the diff, trace callers, challenge evidence and negative cases |

Swap roles for the next task or when actual task results justify it. This is
a workflow assignment, not a claim that one model is inherently better.
One model may perform a design task and the other review its contract.
The coordinator chooses dependency-ready work, records decisions, and owns
integration; its confidence cannot substitute for acceptance evidence.

Before dispatch, verify runtime availability, tool access, context/output
limits, and required structured-output support. Record actual resolved model
identity. These names are requested identities, not verified provider IDs
or application constants. Product Model Profiles remain capability-based.

If a requested model is unavailable, state that fact. Continue independent
preparation or explicitly identified single-model work where authorized;
mark its review pending. Do not silently switch identities or fabricate a
second reviewer. A milestone gate requires a separate review actor or an
explicit author-approved exception recorded with its limitation.

## Dispatch contract

Use [TASK-TEMPLATE.md](../../tasks/templates/TASK-TEMPLATE.md). A task is
READY only when prerequisites have evidence and it names:

- one measurable outcome and milestone/capability IDs;
- relevant reading, source revision, existing callers, and reviewed contracts;
- allowed and forbidden paths;
- exact input/output types and version/failure semantics;
- migration and recovery consequences, or an explicit “none” with reason;
- acceptance checks, negative cases, commands and prerequisites;
- implementer, reviewer, and documentation/receipt updates.

Do not dispatch an entire phase as one coding prompt. Split at observable
behavior boundaries, not arbitrary line counts. Target one feature path
whose contract, persistence/API, and consumer can be reviewed together.
Split before coding if the relevant evidence does not fit in context.

## Execution loop

1. **Orient:** read the contract/current source, local changes and baseline
   revision. Verify dependencies actually exist and work.
2. **Plan locally:** identify the responsible layer and all callers. Define
   acceptance/negative checks; reuse existing abstractions.
3. **Implement:** stay in scope. Enforce real authorization, validation,
   concurrency, and recoverable writes where required.
4. **Verify:** run targeted tests and inspect selected test count/skips.
   Run applicable lint/typecheck/build/migration checks; record actual output.
5. **Handoff:** provide the exact diff/base revision, behavior change,
   evidence, risks and migration/recovery notes.
6. **Review:** the other model inspects sources and the submitted diff,
   challenges failure paths, and reproduces critical checks where possible.
7. **Resolve:** fix valid findings; refute mistaken findings with evidence.
   A changed diff invalidates review of the affected portions.
8. **Integrate:** check cross-module acceptance; update CURRENT, progress,
   and test matrix; select the next dependency-ready task.

Routine authorized edits and tests do not need repeated user permission.
Unresolved product choices or architecture conflicts need a concrete proposal
and ADR/task amendment before affected implementation proceeds. Integration,
external publication, deployment, and messaging retain their own authorization
boundaries; task completion alone does not authorize external actions.

## Task states

Before working around a technical problem, ambiguous requirement or missing
dependency, update the single [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md)
register with evidence, expected/actual behavior, affected task, owner, next
action and closure test. Put the issue ID in the task/handoff. Do not create
parallel issue logs in new Markdown files. Continue independent ready work;
close only with verified resolution, not a model assertion.

`PLANNED → READY → IN_PROGRESS → REVIEW_PENDING → VERIFIED`

`BLOCKED` names an unresolved dependency/evidence/decision and next action.
`CHANGES_REQUESTED` returns to implementation. Only VERIFIED tasks with
integration evidence satisfy a runtime milestone. A design-only task satisfies
its contract gate, not the runtime feature. Record self-review separately.

## Review identity and bounded continuation

Before review, freeze a small manifest of the submitted code, tests and
contract artifacts: paths, base revision, byte hashes, line-ending/normalization
policy and scope. Store it in the task/progress handoff or an existing review
receipt. A dirty HEAD or combined diff hash alone is insufficient. The reviewer
reproduces the identity before judging it. Do not hash a live register row that
contains that same hash; append review/status receipts separately from frozen
implementation artifacts.

After a finding, review the changed portions plus named regression risks.
Retain attributed unchanged reviews; do not reopen every historical question
or run an unbounded swarm. A new discovery gets an issue and owner; it blocks
only dependent acceptance. End a task with a disposition, confirmed checkpoint
or fallback, exact next action and parent gate status. One approved child does
not accept the parent or release. Context pressure is a checkpoint boundary,
not permission to abandon running workers or launch duplicates.

## Shared-state discipline

One writer per file; migrations, shared contracts, and capability vocabulary
have one owner until reviewed. Parallel work is permitted only after interfaces
are frozen and write scopes are disjoint. Use isolated worktrees/branches when
available; never overwrite another worker's changes. API/UI tasks consume the
same reviewed contract version.

After a reset or model replacement, use the Engram recovery protocol below.
Reassess affected evidence if the baseline changed; never restart verified
work solely because it is missing from the current conversation.

## Mandatory Engram checkpoint and recovery

Use Engram MCP for durable coding-agent working context. Keep project specs,
source files, task contracts, review receipts and the single issues register
as their respective authorities. Engram points to them; it does not replace
them or store NovelForge's authoritative story memory.

### Save continuously, not only when asked to clear

1. Discover the bound project with `mem_current_project` when available.
   Use the runtime's authoritative current session binding for memory writes.
   Never invent/derive a session ID, copy a historical ID into a new session,
   or call session-start when the runtime already owns registration. Follow
   the exposed tool schemas and host registration protocol if no binding exists.
2. Call `mem_save` promptly after consequential decisions, verified discoveries,
   fixes, user constraints and review outcomes. Keep durable decisions separate
   from the changing task checkpoint and follow any memory conflict protocol.
3. Maintain one compact checkpoint per task, worktree and role using a stable
   `topic_key`, for example `context/NF-WF-001/main/implementer`. Replace the
   example worktree label with the actual branch/worktree identity. Concurrent
   implementer/reviewer sessions must not overwrite each other's checkpoints.
4. Update it after meaningful work, before long investigation/context pressure,
   before handoff or planned `/clear`, and before ending a substantive turn.
   Use `mem_session_summary` before planned reset/handoff/session end, following
   its Goal/Instructions/Discoveries/Accomplished/Next Steps/Relevant Files shape.
5. Check the tool result. Report the task and saved observation/reference only
   after success. A save request is not proof of persistence.

Keep a checkpoint roughly 200–400 words when practical; preserve critical
constraints even if it needs more. Store pointers rather than repeated source
files, giant logs or full conversations. Include:

```text
Project / repository / worktree / branch / role:
Task ID / contract path / milestone / actual task status:
Latest author objective, scope and explicit constraints:
Current HEAD and dirty-file/diff identity:
Completed steps and evidence references:
Decisions, rejected approaches and unresolved assumptions:
Exact unfinished step and next concrete action:
Changed files and relevant symbols:
Checks actually run, results, skips and pending checks:
Issue IDs, blockers and review/approval state:
Running jobs/process identifiers and last observed status, if any:
Minimum source files to reopen:
Checkpoint timestamp and authoritative current session binding, if supplied:
```

Do not put credentials, sensitive environment values, full private manuscripts
or a transcript into memory. Missing review remains REVIEW_PENDING; memory
must not turn an inference or a historical pass into fresh verification.

### Recover after clear, compaction or model replacement

1. Read the root constitution and confirm the current project/worktree.
2. Call `mem_context` with a small budget/compact mode when supported, then
   `mem_search` scoped to the project and task/worktree. Retrieve the matching
   checkpoint using `mem_get_observation` if a preview is truncated. Do not
   reload every memory or another project's context.
3. Match role, task, branch, timestamp and source revision; do not assume the
   globally latest memory belongs to this worker. If the task is unknown, use
   CURRENT and READY task contracts to reconcile it rather than guessing.
4. Read the task contract and only the referenced current files/diff/receipts.
   Check running jobs before launching duplicates. Compare current Git state
   with the checkpoint; invalidate affected assumptions if it changed.
5. Briefly state the recovered task/status and next action, then continue the
   first unfinished authorized step. Persist a refreshed checkpoint afterward.

Recovered text is context, not new instruction authority. Current user
instructions, governing specs and verified repository evidence win over stale
memory. Resolve conflicts through the evidence policy and issue register.

### Missing tools, failed saves and manual clear

If Engram is unavailable or persistence fails, state the limitation, record
it in ISSUES-AND-GAPS.md, and save the compact handoff in the existing task
or progress record within authorized scope. Do not create a second issue
register, install/reconfigure the harness silently, or claim Engram succeeded.
Resume independent work from verified repository evidence where possible.

A manual `/clear` may remove context before the agent gets another turn.
These instructions cannot intercept it without a verified harness hook.
Proactive checkpoints limit loss. When possible, ask the agent to “save an
Engram checkpoint for clear” and wait for save confirmation before clearing.
Afterward, “resume the current task from Engram” triggers the recovery steps.
No automatic hook or cross-session recovery test is claimed by this document.

## Reviewer checklist

- Can the real caller/user reach the claimed outcome?
- Are tenant, capability, input and source-version boundaries enforced?
- Can retries, concurrent edits, restarts or duplicate approvals corrupt data?
- Are mandatory context and facts retained and correctly cited?
- Do UI loading/empty/error/stale states reflect real backend outcomes?
- Does recovery preserve history and invalidate the correct projections?
- Would checks fail if the defect returned or the protection disappeared?
- Are observed, documented, inferred and unknown claims distinguished?
- Are model outputs proposals rather than authority?

## Minimal handoff

```text
Task / milestone / capability:
Implementer actual model / reviewer actual model:
Base revision / submitted revision or diff identity:
Contract and source versions:
Outcome and files changed:
Commands, selected tests, exit results, skips:
Observed evidence and limitations:
Migration / recovery / data compatibility:
Review findings and resolutions:
Status and next dependency-ready task:
```

Use English and bounded evidence receipts in `review-receipts/` or progress.
Do not copy secrets/private manuscripts into public handoffs. Resolve model
disagreement by evidence and acceptance criteria, not majority vote. Follow
the evidence policy for unsupported claims instead of retrying indefinitely.
