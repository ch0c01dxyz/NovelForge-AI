# Workflow Structured Output Repair

Status: implemented and technically verified; author acceptance remains separate.
Owner: root, sole writer. Reviewer: separate read-only actor before handoff.

## Scope and evidence

User reports chapter-creation-review plan contract rejection. Main run
7561725d-499e-4ac7-a454-31b6e0235dad: MiniMax/deepseek transport failures followed
by successful Agnes fallback; all eight required plan fields rejected. Original
failed output is unavailable because the executor discards it and its generation
link on validation failure. Actual pinned planner/step schemas inspected; no
Agent schema override. Existing template includes a contract in user instruction,
but the executor does not request the adapter's existing JSON mode. Its parser
also takes the first syntactically valid JSON fragment without contract selection.
Actual scratch replay of the pinned request against Agnes returned a fenced,
schema-valid plan; this does not prove the lost original response's exact shape.

## Bounded repair

Use existing gateway JSON-object mode for object contracts, with the resolved
effective contract stated authoritatively in the system instruction. Preserve
array/no-contract workflows, definition pins, capability checks and all required
fields. Compile before dispatch. Do not fabricate fields, silently unwrap arbitrary
provider envelopes or blindly retry deterministic schema failures. Retain rejected
responses/instruction/generation link on FAILED steps for authorized diagnosis;
they never enter successful outcomes, approval, manuscript or canon.

Also provide explicit failed-run setup reuse on the same existing chapter. Restore
notes/word target/requested models, refresh current model/outline previews, retain
the workflow identity and strict chapter ID, and require an explicit Start. Never
auto-dispatch, mutate a failed historical run or create another chapter. Fence
foreign/stale responses and unresolved start journals.

Allowed: workflow executor/ports and focused tests, generation panel/run DTO/en-id
resources and focused component tests, required shared validation
helper only if observed evidence justifies it; docs CURRENT/issues/ledger/contract.
No migrations/dependencies, historical template/version rewrites, automatic main
run replay, chapter duplication, main story test writes, commit/push or stack reset.
Read AGENTS/START-HERE/CURRENT, affected callers and existing A3 contract/evidence.

Acceptance: native RED/GREEN tests for object JSON mode + exact contract, effective
definition override, invalid output retained but FAILED/no successor, unchanged
array/plain-text flows and no automatic repeat. Reuse existing dependency/recovery
proof. Actual configured-gateway scratch proof uses the observed fallback model
and pinned bounded input, then end-to-end corrected executor; provider success is
not author acceptance. Independent exact-source review, relevant types/lint,
idle worker activation/read-back and verified Engram checkpoint before handoff.
Historical failed run stays FAILED; author may deliberately retry its existing
chapter after repair. Rollback code only, retain all diagnostic/history data.

## Completion evidence — 2026-10-20

Resolved object contracts now request existing gateway JSON-object mode and state
the effective schema plus required root keys in the system instruction. Compile
before dispatch; retain definition precedence and strict validation. Rejected
responses retain diagnostic output/instruction/generation attribution on FAILED
steps, never successful outcomes. Explicit same-chapter setup reuse is available
in run history; a separate deliberate Generate action starts a new run.

Executor29PASS and GenerationPanel17PASS (46 focused tests); worker/web types,
scoped TS lint and diff check exit0. Array/plain output paths remain covered.
Native main read-only EN1440/ID390 proof restores notes/word target/model setup,
with explicit Start ready, page errors0/mutating requests0; main story/run hashes
unchanged and temporary session removed. Screenshots inspected; Indonesian notice
corrected to match the actual Buat draf action. Initial browser harness failures
were readiness/5-second assertion timing and a wrong localized button selector,
not successful product evidence; corrected assertions completed successfully.

Actual Agnes corrected-executor run61cf36b9-c9d7-48b8-9adf-fc41049b6e1c in the
dedicated test DB passed all eight required fields and the following validator,
then parked AWAITING_APPROVAL (one actual attempt). No main replay, application,
publication or author approval. Private receipts: plan-executor-live-receipt.json,
plan-retry-ui-receipt.json, plan-worker-activation-receipt.json in .nf-artifacts.
Only idle workflow worker34804 was refreshed to34364; API10396 unchanged,
readiness/Nuxt200, one worker, main story/run hashes unchanged. Notification wait2
preserved; no queue flush, Docker reset, migration, dependency, commit or push.

Independent read-only eight-file APPROVE followed by localized notice review;
final source hash04fb1784c85d9489101d40e34c4bf2a9936416dd92a9e30637ef32ca84b0d98f.
HEAD282983f and existing WIP/stash retained. Original failed output shape remains
unknown; JSON mode does not guarantee schema compliance, and future invalid model
responses still fail explicitly. Full novel generation was not rerun in main.
