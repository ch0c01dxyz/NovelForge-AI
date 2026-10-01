# Technical Issues and Implementation Gaps

Single authoritative register for unresolved technical problems, ambiguous
contracts, unsupported claims, missing product paths and environment blockers.
Applies to deepseek-v4.1-flash, glm-5.3-flash, the coordinator and reviewers.
CURRENT and task handoffs summarize/link IDs here; do not create competing
issue files. Historical progress/test receipts remain evidence, not live queues.

## Recording and resolution rules

1. Before a workaround or an affected completion claim, create/update an
   entry. Search existing IDs first and consolidate duplicates by linking.
2. Record exact symptom, source revision/diff, file/symbol or command/output,
   expected versus observed result, and reproducibility. Redact secrets.
3. Distinguish OBSERVED, DOCUMENTED, INFERRED and UNKNOWN. A suspected root
   cause stays a hypothesis until a check supports it.
4. Name affected invariant/capability, severity, owner task, dependency,
   attempted checks, recommended next action and closure test.
5. Block only dependent work. Do not hide the issue with skipped tests,
   hardcoded success, relaxed authorization/validation or fabricated evidence.
6. Record architectural choices in an ADR and link it here. Routine fixes
   within authorization do not require another permission request.
7. Close only after a fix/contract resolution and relevant verification plus
   reviewer evidence. A diagnosis, planned fix or new doc is not a runtime fix.
8. Keep entries and status history. Reopen on regression; never delete an
   inconvenient finding or overwrite an older failure receipt.

States: OPEN, INVESTIGATING, BLOCKED, FIX_READY, VERIFY_PENDING, CLOSED,
DEFERRED_BY_AUTHOR_DECISION. The last state requires the decision reference,
remaining impact and a revisit condition; it is not a successful acceptance.

Severity: P0 data loss/security/canonical authority breach; P1 blocked core
workflow or invariant; P2 limited capability/operability; P3 polish. An open
P0/P1 blocks the affected release gate. Any promised capability, even P2,
still blocks a claim that the full capability is complete.

## Entry template

```text
ID / title:
Status / severity / first observed / last updated:
Reporter actual model / owner task / reviewer:
Source revision or diff identity:
Capability / invariant / blocked tasks or milestone:
Expected:
Observed (file:line, command/result, bounded receipt link):
Evidence class and unknowns:
Reproduction / environment:
Cause: verified or hypothesis:
Checks attempted and actual results:
Proposed remedy / architectural decision needed:
Safe independent work:
Closure acceptance and required regression check:
Resolution receipt / reviewer / residual limitations:
Status history:
```

## Initial register — 2026-09-30

These entries were seeded from local documentation and static source
inspection during the workflow comparison. No runtime tests were rerun.
Baseline is the local working tree at this documentation revision; a fixing
worker must record its actual git revision/diff and reproduction. Requested
model names are not evidence that those models performed this inspection.

| ID | Status / severity | Evidence and expected outcome | Owner / closure proof |
|---|---|---|---|
| GAP-001 Chapter context incomplete | OPEN / P1 | OBSERVED: services/orchestrator.ts compile reads facts/references, not approved outline and chapter-consumed state. Expect shared version-pinned chapter context | NF-WF-003; prompt provenance and outline/state/temporal negative tests |
| GAP-002 Canon selection unbounded and oldest-first | OPEN / P1 | OBSERVED: canon.ts listFacts AUTHOR uses createdAt asc without take; compiler stops at 6,000 chars. Expect relevant bounded selection retaining mandatory task constraints | NF-WF-003; relevant late fact and query/context budget tests |
| GAP-003 Approval cannot resume | OPEN / P1 | OBSERVED: workflow-runs.ts HUMAN_APPROVAL parks permanently; no decision/resume routes. Expect authorized same-run continuation | NF-WF-005; restart, rejection, stale and duplicate decision tests |
| GAP-004 Cross-domain revision/checkpoint absent | OPEN / P1 | DOCUMENTED: CURRENT and ADR-0008 defer revision/checkpoint participation. Supersede history is not consistent restore | NF-WF-001/002; populated baseline, atomic checkpoint/restore and failure tests |
| GAP-005 AI extraction/consolidation absent | OPEN / P1 | DOCUMENTED: CURRENT says author-authored canon and no materialized L0–L6. Expect final-version proposals then approved revision-derived memory | NF-WF-008/009; rejected proposal excluded and chapter N→N+1 E2E |
| GAP-006 Workflow jobs are request-bound | OPEN / P1 | OBSERVED/DOCUMENTED: synchronous executor; inspected worker provides heartbeat. Expect durable resumable execution | NF-WF-004; process restart/queue outage/duplicate delivery/cancel tests |
| GAP-007 Writer integration and rich editing incomplete | OPEN / P1 | OBSERVED: workspace page uses textarea and basic chapter panel; CURRENT records API-only intelligence. Expect usable review/apply and state/evidence UI | NF-WF-007/015/016; browser journey and concurrent-edit tests |
| GAP-008 Reader release path missing | OPEN / P1 | DOCUMENTED: CURRENT records no non-member public chapter API/UI. Expect published-version access and server spoiler boundaries | NF-WF-012–014; anonymous/member/draft/unpublish/search tests |
| GAP-009 Completion labels overstate integrated delivery | VERIFY_PENDING / P2 | OBSERVED: previous CURRENT headline said phases 0–9 COMPLETE while listing missing deliverables. This documentation revision separates slices/gates; no runtime feature fixed | M0 documentation task; consistency/link review and phase-to-milestone mapping |
| GAP-010 Automated workflow E2E and scale evidence missing | OPEN / P1 | DOCUMENTED: CURRENT says no automated E2E runner. Expect real writer/reader loop and measured bounded 2,500-chapter operation | NF-WF-007/011/023; actual selected E2E tests and load receipts |
| GAP-011 Timeline/event and character/canon identity joins unresolved | OPEN / P1 | DOCUMENTED: CURRENT lists separate unlinked timeline/events and standalone characters. Shared context/restore requires explicit stable joins and temporal semantics | NF-WF-001/003/010; reviewed identities, migration and temporal/cross-domain tests |
| GAP-012 Narrative policy semantics incomplete | OPEN / P2 | DOCUMENTED: CURRENT records arbitrary DNA JSON, stored SCALE policy and hardness not consumed consistently. Expect validated consumed fields and explicit soft/hard behavior | NF-WF-010; policy-to-review integration and no forced drama tests |
| GAP-013 Requested coding models not fully runtime-verified | OPEN / P2 | OBSERVED: read-only Claude smoke through configured `bansoskenari/deepseek-v4-1-flash` gateway alias called Engram/Ruflo successfully. Claude warns unrecognized model; backend identity/context/token metadata remain unverified. 2026-10-01: the reviewer worker's gateway (localhost:20127) returned HTTP 500 with no body on all 10 retries, twice, so no independent review ran. **Later the same day the gateway recovered** (`POST /v1/messages` → 200 SSE; `/api/health` `ok:true`, `failedProviders:[]`) and the review ran as dispatch `ctx_c4dcc5969164`. The worker self-reported `bansosmontera/deepseek-v4.1-flash` from `ANTHROPIC_DEFAULT_HAIKU_MODEL` — **not the `glm-5.3-flash` the contract requested**, so the reviewer role is still not the requested model and no backend identity is proven for either role. GLM runtime remains UNKNOWN. The round-2 re-review (`ctx_db14a16c6968`) self-reported `glm-5.3-flash` from `ANTHROPIC_DEFAULT_FABLE_MODEL` — a different env var, still a self-report, and still not proof that the requested model ran | Coordinator before each role dispatch; actual backend identity/tool/capability record for both roles, or explicit unavailable/alternative decision. See [harness receipt](CLAUDE-CODE-CONFIGURATION.md) |
| GAP-014 Historical chronology needs attribution | OPEN / P2 | OBSERVED: progress/CURRENT contain October-dated claims relative to 2026-09-30 session. Preserve history; verify commit/receipt provenance before using chronology | Next evidence-maintenance task under M0; source attribution or explicit unresolved dates, not invented replacements |
| GAP-015 Remaining retained capability gaps | OPEN / P2 | DOCUMENTED: formats, reader social/admin, advanced recovery/simulation/endgame/operations still need integration. CAP-12–20 enumerate scope | NF-WF-015–024; expand into specific entries when investigated and close only against capability receipts |
| GAP-016 NF-WF-001 contract defects | RESOLVED_PENDING_REREVIEW / P1 | OBSERVED: two independent reviews ran (`ctx_c4dcc5969164`, then `ctx_db14a16c6968`), both verdict CHANGES_REQUESTED. Round 1 raised 3 P1 + 3 P2 + 3 P3; round 2 VERIFIED all eight round-1 corrections and re-confirmed C1/C4/C8/C6, then raised 1 P1 + 1 P2 + 3 P3 of its own. All five round-2 findings are corrected. The corrected diff has not been re-reviewed, so NF-WF-002 must not be called VERIFIED on it | NF-WF-001; re-review of the round-2-corrected diff, then NF-WF-002. See detail below |

## GAP-016 detail — NF-WF-001 contract defects

Two passes, both against source, neither a substitute for re-review.

**Pass 1 — coordinator self-review** (before any independent review could run;
recorded here because it is the reason the artifacts changed before review).
Reporter: coordinator (`bansoskenari/deepseek-v4-1-flash` per harness config;
backend identity unverified, GAP-013). Source revision:
`cfe762a5cfed6f44d80af16ad3c5fd008188ae95` + dirty documentation set. Five
claims refuted and corrected: `novels` unclassified in C1 (55/56); C4 ordered
the head `UPDATE` before the `INSERT` that its FK requires; C7 deleted
`chapters` rows and cascaded into immutable `chapter_versions`; C7 named a
column that exists in no table; four wrong table/enum/row counts.

**Pass 2 — independent review**, dispatch `ctx_c4dcc5969164`, terminal
`term_a1458038-9230-4bb2-abab-074018b8bc35`, verdict **CHANGES_REQUESTED**.
Reviewer resolved model `bansosmontera/deepseek-v4.1-flash` (self-reported; the
requested `glm-5.3-flash` did not run — GAP-013). It confirmed C1 coverage
(56/56, zero missed, zero invented), the C4 CAS order, the C8 baseline split
and C6 dedup as VERIFIED, and raised the following. Every row below was
re-verified against the cited source by the coordinator before the fix.

| # | Sev | Location | Defect | Resolution |
|---|---|---|---|---|
| 1 | P1 | C7, C5 | A payload `chapters.id` absent live with its `number` **free** (plain `deleteChapter`, no re-create) was undefined: step 3's in-place update has no row, step 4 finds no pointer, content is unrecoverable — and re-inserting its `scenes`/`outline_nodes` violates their `ON DELETE CASCADE` FKs, dying on an unmapped Prisma error. `deleteChapter` hard-deletes non-PUBLISHED chapters (`manuscript.ts`); `ChapterVersion.chapter`, `Scene.chapter`, `OutlineNode.chapter` are all `onDelete: Cascade` | C7 now refuses by name for **any** absent live chapter id, whatever the number holds, in a new step 0 that runs before the first write; the number-reuse and number-free shapes are both spelled out; C5's row reworded |
| 2 | P1 | NF-WF-002 scope | The task wrapped only the HIGH-impact operations, but C3/C10 require LOW operations such as `saveChapter` to record a revision — the C10 worked example was unimplementable as scoped | C3 now states both classes cross the boundary and the class decides only the checkpoint/snapshot; NF-WF-002 scope and invariant reworded to route every covered C3 operation through the CAS |
| 3 | P1 | C8 | No owner created `novel_branches` rows for novels created after deploy: `createNovel` (`platform.ts`) knows nothing of branches and NF-WF-002 excluded `platform.ts`, so the first covered mutation would `FOR UPDATE` a nonexistent row → 404/500 instead of the promised CAS | C8 names `createNovel` as the creation point, in the novel's own transaction; `platform.ts` added to NF-WF-002 scope; C4's ordering rationale gained the missing-row reason |
| 4 | P2 | C2 | `restore_operations` was declared immutable while preview→apply transitions its `status` | C2 now lists `status`/`target_revision_id`/`applied_at` as the mutable fields of that row, keeping the rest write-once |
| 5 | P2 | C5 vs C7.4 | PUBLISHED pointer: C5 promised a 409 while C7.4 says skip-and-surface; the two could not both be satisfied, and NF-WF-002's acceptance asserted the 409 | C5's row removed (it is not a failure) and replaced with prose pointing at C7.4/ADR-0014 §5; NF-WF-002's negative test now asserts skip-and-surface succeeds |
| 6 | P2 | C2 | `checkpoints.kind` was not among the five listed enums, so the "five enums" count only held if it reused `RevisionOrigin` — unstated | C2 states `checkpoints.kind` reuses `RevisionOrigin`; the counts now hold as written |
| 7 | P3 | C9, NF-WF-002 | The `UNIQUE`-where-non-null on `characters.story_entity_id` needs a partial index Prisma cannot express, and the migration description named only "two nullable columns" | C9 names the partial unique index as raw SQL (Phase 6–9 pattern); NF-WF-002's migration scope, outputs and rollback sections updated |
| 8 | P3 | C7 | Retained post-boundary chapters coexist with rewound canon/state, stated only as generic "compatibility review" — the contract never said their `outline_nodes`/`scenes`/`story_events` **are** rewound | C7 gained a sentence: the `chapters` row and its versions survive, all their covered relational state rewinds |
| 9 | P3 | NF-WF-002 header | "recorded at execution" dispatch-time fields, per TASK-TEMPLATE | No change required (reviewer's own conclusion) |

Consequence carried forward: the corrected contract is still not VERIFIED. Per
CLAUDE.md §11 an edit invalidates the review tied to the previous version, so
the corrected diff owes its own review before NF-WF-002 is called VERIFIED.

**Pass 3 — re-review of the round-1 corrections**, dispatch `ctx_db14a16c6968`,
task `task_ac1e018f9e8d`, verdict **CHANGES_REQUESTED** after ~3h43m. Reviewer
self-reported `glm-5.3-flash` from `ANTHROPIC_DEFAULT_FABLE_MODEL` — a
different self-report from round 1's `bansosmontera/deepseek-v4.1-flash`, and
still an environment variable read, not backend proof (GAP-013). It **VERIFIED
all eight round-1 corrections** and independently re-confirmed C1 coverage
(56/56), the C4 CAS order, the C8 baseline split and C6 dedup, then raised five
new defects. Every row below was re-verified against the cited source by the
coordinator before the fix.

| # | Sev | Location | Defect | Resolution |
|---|---|---|---|---|
| 10 | P1 | NF-WF-002 scope | Allowed paths listed only `{canon,planning,manuscript}.ts`, but C3's LOW operations span `story.ts`, `characters.ts`, `relationships.ts`, `narrative.ts` — so the invariant was unimplementable as scoped | Scope line expanded to `{canon,planning,manuscript,story,characters,relationships,narrative}.ts`, with the C3 ownership named per service |
| 11 | P2 | C7 | Step 2 deletes post-boundary covered rows; `change_set_items` store no before-image and audit payloads hold only ids/predicate, so that content survives only in later snapshots — the contract never told the author | C7 gained "Restore discards post-boundary state content, and the author must be told."; C7 Preview gained the "removed counts are load-bearing" paragraph |
| 12 | P3 | C2 | "the enum's values minus `RESTORE`" miscounted: `RevisionOrigin` has nine values and the text itself names `BASELINE` | Reads "nine values minus `RESTORE` and `BASELINE`" |
| 13 | P3 | C2 | The `String`+CHECK rationale claimed Prisma cannot express a single-column closed set; this schema has 44 Prisma enums | Rationale rewritten on Postgres-enum-churn and load-bearing grounds; no impossibility claim |
| 14 | P3 | test-matrix.md | G-01 row still said "REVIEW_PENDING — reviewer gateway unavailable", predating both reviews | Row updated to "first review ran (CHANGES_REQUESTED); corrected diff re-review owed" |

Round-2 findings 10–14 are corrected. The same consequence applies one level
down: those corrections are themselves unreviewed, so the contract remains
**not VERIFIED** and NF-WF-002 stays gated.

## Linked evidence

- [Comparison report](workflow-comparison-analysis.md) — historical analysis;
  later accepted decisions supersede its proposed-only status.
- [CURRENT](../14-progress/CURRENT.md) — detailed implementation snapshot.
- [Delivery plan](DELIVERY-PLAN.md) — capability owners and dependencies.
- [Test matrix](test-matrix.md) — executed and pending verification.

For each active investigation, expand its row into the entry template below
in this same file. Keep the table as an index; link its detail rather than
maintaining a second description elsewhere.
