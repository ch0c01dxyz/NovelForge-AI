# NF-WF-049: Generation usage analytics

Status: IMPLEMENTED / REVIEWED (2026-10-08), bounded local verification.
Contract and final backend review APPROVE by review_mutations_034;
UI review APPROVE by review_workflow_docs; migration proof by review_recovery_034.
Separate documentation review APPROVE by review_sync_026 after rechecking
superseded GAP-039/063 dispatch pointers and completed scratch cleanup.
Baseline: `830961f`.
Author decision: ADR-0015, 2026-10-08. Owner/implementer: local coordinator.
Separate contract/source reviewer: review_mutations_034; separate migration/
evidence reviewer: review_recovery_034. Model identity remains unasserted.
Capabilities CAP-06/14; owner gap GAP-063. SCALE GAP-039 remains independent.
Engram attribution unavailable (GAP-021); this task/CURRENT are the fallback.

Read START-HERE, both constitutions, CURRENT, DELIVERY-PLAN, ADR-0015,
MODEL-EVIDENCE-POLICY, ENVIRONMENT-PREFLIGHT, NF-WF-047F, existing AI services,
registry/manager/adapter, workflow generator ports, generation callers and
AI Studio receipt components. Follow writer-workspace/DESIGN-TOKENS for UI.

## Scope and contracts

Allowed: AGENTS.md, CLAUDE.md, START-HERE.md; this task and ADR-0015;
docs/implementation/{ISSUES-AND-GAPS,DELIVERY-PLAN,EXTERNAL-FOLLOW-UP-WORKFLOW}.md,
docs/14-progress/CURRENT.md; docs/06-ai/{AI-ORCHESTRATION,OMNIROUTE-INTEGRATION}.md;
packages/database/prisma/schema.prisma and new migration
20261008_nf_wf_049_usage_analytics/migration.sql (generated client via existing
generator); packages/ai-core/{types,manager,omniroute,ai-core.test,omniroute.test}.ts;
packages/ai-services/src/{ai,ai-registry,usage-analytics,usage-analytics.test}.ts;
apps/api/src/{ai-routes,orchestrator-routes,ai.test,orchestrator.test}.ts and
apps/api/src/services/{orchestrator,selection-ai}.ts;
packages/workflow-executor/{ports,executor,executor.test}.ts;
packages/validation/{workflow-graph,validation.test}.ts for explicit component
validation; packages/ai-services/src/worker-ai-path.ts;
apps/web/app/composables/{useReceipts,useChapterGeneration}.ts;
apps/web/app/components/ai-studio/{GenerationLedger,UsageAnalytics,UsageAnalytics.test}.vue
(test uses .test.ts); apps/web/app/pages/workspaces/[workspaceId]/ai-studio/index.vue;
apps/web/app/i18n/{en,id}.ts and scoped receipt accessibility tests.
Private scratch drivers/logs under task TEMP are allowed. Freeze additional
paths before writes. Forbidden: historical migrations, gateway quota/budget
enforcement, SCALE behavior, new generation providers, live credentials,
working DB mutation/reset, unrelated UI and manuscript content.

Frozen caller amendment (2026-10-08): also allow
packages/ai-services/src/retrieval.ts, apps/web/app/composables/useSelectionAi.ts
and useSelectionAi.test.ts, and the existing writer novel index.vue solely to
forward explicit CHAPTER/artifact attribution and stored novel ownership to
embedding receipts. This closes the inspected caller omission; no retrieval
ranking, editor behavior or new provider is in scope.

Add nullable per-attempt input/output token counters, requested model snapshot
and response-reported model. Existing modelId has mixed historical semantics:
success may be reported or adapter fallback; failure is requested. Preserve
it as legacy metadata, never label old values requested/reported or backfill
them from current mappings. New reported model must never use request fallback.
Add explicit component
and optional artifact UUID on Generation, default OTHER for historical rows.
Use known callers' CHAPTER and explicit validated generic component labels;
never guess classification/model/usage from prompt strings or agent names.
The existing installed chapter-generation-review workflow has an explicit
CHAPTER default; per-step usageComponent can override this classification.
Extend StreamChunk with optional usage/response model; preserve text-only
consumers, incomplete outcomes and no retry after emitted text. Validate
nonnegative safe integer reported counters, null otherwise. Capture metadata
without emitting empty text events or treating metadata as generated prose.
Record observed metadata even on partial/abandoned streams where available.
Repeated usage frames update one attempt's cumulative snapshot, never sum frames.
Quota removal does not remove context-window, per-request output or retry bounds.

GET workspace generation usage analytics accepts optional novelId, validated
component/time filters, bounded pagination for task/component/model breakdown.
Authorize generation:read and novel ownership before querying. Aggregate on
the server over all matching records, not a recent200-row UI window. Count
observed attempt usage once; use historical generation usage only when no
attempt has observed usage. Mark partial coverage and unknown model explicitly.
Do not combine unseen token counters with zeros. Include failed/retried
observed attempts. Requested and reported model identities remain distinct.
Read-only analytics uses existing ledger and does not create canonical revisions.

AI Studio receipts show novel selection, recorded totals, coverage and
component/task/model breakdown plus existing request/attempt detail. Use en/id
keys with English fallback, loading/empty/error states and existing tokens.
Unsupported image transports remain unsupported; analytics attribution is
ready for COVER requests but no new cover generator is claimed.

## Verification, migration and rollback

Windows reuses nf-pg-5433 and existing Redis; no replacement/restart/reset.
Use unique nf049_* disposable DBs and task TEMP logs. Node24.14.1/pnpm12.5.1
are available; recheck host/service prerequisites before runtime tests.
Migration is additive; historical rows retain unknown usage and OTHER. Review
new SQL before application, verify empty+populated upgrade/old receipt retention.
Rollback code may ignore additive fields; do not delete audit history or run
destructive down SQL on a working DB. No live deployment is authorized.

Negative proofs: no-usage vs true zero, invalid counts, retry totals without
double count, gateway-reported model differs from requested, streaming usage
only frame/partial/abandon, historical fallback, >200 generations, filters,
cross-workspace/novel refusal, component validation, pagination and stale UI
responses, en/id/fallback and accessibility. Run meaningful scoped Vitest,
API/worker/web typechecks and changed-source lint. Record commands/exits, not
expected results. Separate exact-diff review precedes acceptance/commit.
Update shared pointers and GAP-063 with actual evidence; decision alone does
not close implementation. Commit/push only after review and verification.

## Acceptance receipt — 2026-10-08

The additive migration and instrumentation implement ADR-0015. AI Studio
Receipts now has Usage analytics, with full filtered totals and paginated
component/task/artifact/reported-model rows. Stream receipts are authoritative
at attempt level; older top-level streaming counters remain null. Novel-linked
retrieval embeddings and chapter selection requests retain their ownership.
Generic callers must explicitly set component/artifact; historical records are
not guessed. No quota fields, billing engine, provider or dependency was added.

| Actual check | Result |
| --- | --- |
| ai-core: `vitest run ai-core.test.ts omniroute.test.ts` | 82/82 |
| validation: `vitest run validation.test.ts` | 62/62 |
| API: `vitest run src/ai.test.ts` | 37/37, owned nf049_20261008_ai |
| API: `vitest run src/orchestrator.test.ts` | 15/15, owned nf049_20261008_orchestrator |
| workflow-executor: `vitest run executor.test.ts` | 22/22, owned nf049_20261008_workflow |
| web: UsageAnalytics, GenerationLedger, receipts.axe, useSelectionAi, useLocale | 27/27 across5 files; en/id, English fallback, stale responses, localized ApiError, retry and automated accessibility |
| API, worker, web, workflow-executor `typecheck` | Each exit0 after fixture literal correction |
| Installed ESLint CLI via node, changed tracked TS + both new TS files | Exit0; no findings |
| Normal repository `git diff --check` | Exit0; core.autocrlf=true retained |
| Prisma generate through database exec | Exit0 |

245 scoped tests passed. This is not a full repository/e2e release battery,
real-browser visual approval, human screen-reader audit or live gateway proof.
The jsdom axe runs emit the existing canvas getContext warning; all selected
accessibility assertions passed. No canvas dependency was installed.

Migration reviewer ran the current41 migrations on an empty owned scratch,
then historical40 in a private copy, seeded legacy receipts using parameterized
SQL and applied41. Legacy fields and all40 checksums survived unchanged;
new fields default OTHER/null. CHECK constraints rejected invalid component
and negative attempt counters (23514), accepted zero/all6 components; probes
rolled back. Scratch nf049_20261008_upgrade was dropped and absence verified.
Private evidence directory: TEMP/novelforge-nf049-review-f7da29414006461a85d3f825eaa08507.
New SQL SHA256: `2B2F5E97CFC3F682CFC3C7AEF010ABD52A93C1B56225F66B03933C6E1B288ED5`.

Coordinator cleanup: verified41 applied migrations and zero active connections
in each of nf049_20261008_ai, nf049_20261008_orchestrator and
nf049_20261008_workflow, then dropped only those owned scratch databases.
Final pg_database query returned0 for all four NF049 targets. No workers or
Redis queues were started, and no working database was altered.

Exact worktree diff approvals: backend source/tests and amended callers by
review_mutations_034, UI/callers by review_workflow_docs. The final one-line
test literal correction was separately re-approved. Key final SHA256 receipts:

| File | SHA256 |
| --- | --- |
| ai-core/manager.ts | 6007E86A3C6C0568A413D20B75C15DA1F35D26562A76DF6C483CA0A270E67576 |
| ai-services/src/usage-analytics.ts | F76991FD8D9915130576E640D870C731F561B52D22DC339129819598357CE95F |
| api/src/ai.test.ts | 6E6ECF9065DC9FA27B59F900337E95F78B1F9E5A8BF20E11081F34ABE36DCDF4 |
| workflow-executor/executor.test.ts | 8B7A76AC62A35CAD1D5EBBBEA27E6AD3C6DB00818818D37B1196CF0AECA5F641 |
| web UsageAnalytics.vue | A8ADE696EC06FD37D9FAD586CF19C490FD883DAF82D0C42F3286D1B306630E48 |
| web UsageAnalytics.test.ts | 0B14B03ED3BF1D0B6E88C911524B906A6D940C288404FCF870106DCBC9FAFA9C |

GAP-063 findings and failed fixture/tool attempts are retained in the single
register, corrected and verified. GAP-039/GAP-051/live deployment remain open.
Working database migration was not applied; deploy the reviewed additive
migration through normal environment/release preflight before using the new
endpoint on that database. Rollback keeps all receipt data/columns.
Engram attribution remains unavailable under the runtime hook (GAP-021): no
memory write or invented session ID. This receipt and CURRENT are the fallback.
