# Canon proposal batch decisions

Status: COMPLETE, separately reviewed and locally activated. Task ID: canon-proposal-batch-decisions. Owner: root
executor; separate read-only reviewer required. The author requests multi-select
approval/rejection in Canon > Proposals, not execution of any live decisions.

Read ProposalReview, ConfirmDialog, canon routes/services, revision checkpoint
contract and world-canon/API tests. Reuse native audited proposal decisions and
checkpoints; do not replace their transactions, authorization or recovery.
Allow multiple pending proposals, select all displayed, explicit counted modal,
optional common rejection note and per-item outcomes/progress. Selection, filter
and per-row actions lock during a batch. Approval excludes conflicting selections
and repeated subject/predicate slots; those require separate review. A server
guard also refuses newly discovered live facts. New novel-scoped batch-item
routes fail closed on older backends and cross-novel IDs. Approval returns the
committed revision to chain head CAS after an explicit pre-batch checkpoint.
Both batch decisions require the expected head and return their committed
revision. Existing individual rejection retains its 204 response.

Batch processing is sequential, atomic per item, not atomic across the whole
selection. Stop on first failure/head movement or leaving the component, keep
already committed successes and label remaining items unprocessed. A network/5xx
outcome is unknown, not proof of rollback; never retry automatically. Checkpoint
failure prevents decisions. Do not approve the author's 315 live candidates during
testing; browser decisions use a dedicated disposable database and real APIs.

Allowed: ProposalReview, existing canon routes/service and regression tests,
en/id strings, this task/CURRENT/ISSUES and ignored evidence. No schema changes,
new dependencies, quota controls, semantic author approvals by the coding agent,
unrelated data changes, commit/push/deploy. Preserve existing uncommitted work.

Acceptance: counted confirm/cancel, selection of pending only, serial revision
chaining, per-item and partial/unknown results, no double dispatch, no concurrent
row/filter edits, conflict/duplicate selection refusal, stale-head/authorization/
cross-novel/checkpoint failures and both locales. Verify native transactions,
checkpoints and audit on scratch DB; read-only live UI may select/cancel only.
Run focused component/API/locale tests, API/service/web types, scoped lint and
diff checks; separately review exact final diff. No migration; rollback removes
feature code, while real decisions remain recoverable using native checkpoints.

Completion — 2026-10-19: 44 focused web tests PASS (batch, existing individual
canon flows and locale/fallback); 67 native PostgreSQL canon API tests PASS.
Web/API/ai-services typechecks, scoped TS/JS lint and git diff check PASS.
Real Chromium browser with native API on disposable
`novelforge_test_proposal_batch`: EN desktop approval, ID 390px rejection,
confirmation cancellation with no POST, and partial approval stopping on a
newly introduced live fact PASS; persisted statuses/checkpoints read back.
No page errors/overflow. Main DB retains 2 novels, 279 chapters, 315 proposals;
full ordered proposal SHA256 unchanged:
`2f1dd15ad8b49a78a7d3a2d7ac2efe946c9db8bfdc9229e175c629945614421a`.

Separate read-only reviewer APPROVE after fixes to rejection head CAS,
malformed-success unknown outcomes and required checkpoint identity. Added
unmount/malformed-receipt regressions. Reviewed source hashes:
ProposalReview `92190b451f4db08469f0a2e93cefceeb52cac9ef08a64a741b9f0545ff9ebdd8`;
canon service `f4422f459fe0df91bb954168f99ece753ca38cb9895ae811706c122e886a00f9`;
canon routes `1baeefef117e508d388870ad78e903e0bd36a8078b26bed3657525278bccb07a`.
Private evidence: `.nf-artifacts/proposal-batch-{web,api,lint}.log`,
`proposal-batch-*-types.log`, `proposal-batch-browser-receipt.json`,
screenshots and `proposal-batch-activation.json`. Existing API restarted only
after verifying 0 IN_PROGRESS generations; readiness 200 and both new routes
reject missing heads with 400, no proposal writes. No Docker/data reset,
migration, commit/push, human screen-reader acceptance or live canon approval.
