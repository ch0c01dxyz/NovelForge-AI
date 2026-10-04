# Review request — NF-WF-003 chapter context compiler contract

You are the **independent reviewer**. Do not edit files. Do not implement
anything. Read and judge only.

## Step 0 — report your identity first

Print, as your first output line, the model identifier you are actually
running as (check `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*` or your own system
context). If you cannot determine it, say `MODEL_UNVERIFIED`. This is required
evidence: the contract requests `glm-5.3-flash` and the coordinator must know
whether that is what actually ran.

## Artifact under review — frozen

- `tasks/NF-WF-003-chapter-context-compiler.md`
- Base revision `991de23`, blob `470e4244e9518eabf58aa4a5b2450cd19a049b75`,
  21,037 bytes.
- Reproduce the identity before judging: `git rev-parse HEAD` and
  `git rev-parse HEAD:tasks/NF-WF-003-chapter-context-compiler.md`. If either
  differs, say so and stop.

This is a **contract review, not a code review**. Nothing in the contract is
implemented. Judge whether the contract is safe and correct to dispatch.

## Context you may read but must not change

`CLAUDE.md` / `AGENTS.md` (constitution, §7, §2.16, §9, §10, §11, §12),
`docs/06-ai/MULTI-LLM-ORCHESTRATION.md`, `docs/06-ai/MODEL-EVIDENCE-POLICY.md`,
`docs/10-testing/TESTING.md` (G-02 row),
`docs/implementation/ISSUES-AND-GAPS.md` (GAP-001, GAP-002, GAP-004, GAP-011,
GAP-013, GAP-018, GAP-023), `docs/03-domain/STORY-VERSIONING.md` §C12,
`tasks/NF-WF-002F-foundation-acceptance.md`, and the real source named below.

## The contract's central factual claims — verify or refute each

Every line number in the contract was checked by the author against the tree at
`991de23` and matched. Re-verify independently; a wrong citation in a contract
becomes a wrong assumption in the implementation.

1. `compile()` at `apps/api/src/services/orchestrator.ts:135` is a closure
   inside `createOrchestratorServices` (`:101`), is not exported, and is called
   only from `:294` and `:349` in the same file.
2. `compile` reads **only** `canon.listFacts` (`:156`) and `retrieval.search`
   (`:180`) — no outline, chapter, story position, horizon, DNA, character,
   relationship, timeline or revision read.
3. `apps/api/src/services/canon.ts` contains **no** `take:` or `limit:` at all,
   so `listFacts` (`:1415`) reads every matching fact; its two `findMany`
   branches (`:1445-1449` AUTHOR, `:1473` READER) both order
   `{ createdAt: "asc" }` (`:1447`, `:1475`).
4. `compile` walks that list with `break` on `FACT_BUDGET_CHARS = 6_000`
   (`orchestrator.ts:28`, loop `:165`, `break` `:167`) — so under pressure the
   budget keeps the **oldest** facts and drops the newest.
5. The workflow `RETRIEVAL` step (`apps/api/src/services/workflow-runs.ts:460`,
   `retrieval.search` at `:468`) is a second, divergent selection path with its
   own `limit: 10` and no budget.
6. `retrieval.search` is **not** the defect: it ranks by relevance and clamps
   `limit` to 1..100 (`retrieval.ts:848`, `:857`), and the two callers pass
   different bounds (`orchestrator.ts:186` uses `REF_LIMIT = 8`).

**If any of claims 1–6 is wrong, the contract's problem statement is wrong and
the verdict must say so.** This is the highest-value thing you can check.

## The §7 tier table — the part most likely to be wrong

The contract claims a 10-tier table in which **eight** tiers have a backing
store today and **two** (recent memory, historical memory) do not. The author
has already corrected one overstatement here, so treat this as the weak point.

Verify, against real source, that each of these actually exists and does what
the table says:

- tier 2: `outline_versions` / `outline_nodes` / `scenes` — and that **no**
  "current approved outline" resolver exists (`getApprovedOutline`,
  `resolveOutline`, `currentOutline`, or equivalent).
- tier 4: `characters.stateAt(chapter)`, `relationships.stanceAt(chapter)`,
  `bondStageAt(chapter)` — and that they genuinely take a **chapter number**
  (the contract's invariant 5 depends on this).
- tier 5: `canon.ask({kind:"UNRESOLVED"})` and `{kind:"PROMISES"}` over
  `story_threads` / `story_promises`, ranked by narrative debt.
- tier 6: `canon.ask({kind:"EVENT"})` and `{kind:"CAUSAL"}` over `story_events`
  / `causal_edges`.
- tier 9: `narrative_dna_profiles` read at `narrative.ts:287`.
- tiers 7 and 8: that **no** memory/summary/recall service exists anywhere.

Name any tier whose backing is claimed but absent, or absent but claimed.

## Judge these, with evidence

For each, answer VERIFIED / REFUTED / UNCERTAIN and cite file:line.

1. **Is the problem statement true as written?** Claims 1–6 above.
2. **Is the scope decision coherent?** The author chose "full tiered compiler":
   select across every backed tier, route both callers through one compiler, fix
   the defect. Does the contract's `## Scope` allowed-path list actually suffice
   for that, and is anything required-but-forbidden (a schema change, a new
   package, a file outside the list)?
3. **Is invariant 10 enforceable?** Tiers 7 and 8 must be *declared
   unavailable*, never an empty block. Is that distinguishable in the output
   shape the contract specifies, or would an implementer plausibly emit an empty
   block and call it done?
4. **Is invariant 5 testable?** Tier 4 must resolve at the story position, not
   the latest row. The contract admits **no story-position model exists**. Is
   deriving it from `chapters` well enough specified for an implementer to build
   it without guessing, and can the negative test in the acceptance list
   actually fail against a "latest row" implementation?
5. **Does the acceptance list prove the task, or only the tests?** Check the
   bounded-read test in particular: the contract asserts a test that only
   reverses the sort must not count. Does the list as written actually exclude
   that? Is any acceptance item unobservable or unfalsifiable?
6. **Constitution compliance.** Does anything here violate §7 (context rules),
   §2.16 (no full-manuscript scan), §9 (versioning/recovery), §10 (module
   boundaries — the new module must not import HTTP or a provider), or §11?
   Does it respect GAP-004 (must not claim to close), GAP-011 (explicit named
   joins only, never a name match), GAP-013 (no review claim on an unverified
   backend) and GAP-023 (no event producer)?
7. **Is the "Known unknowns" section honest?** It claims there is no chapter
   generation entry point, no approved-outline resolver, no story-position
   model, and no memory service. Verify or refute each. Name any *additional*
   unknown the contract fails to disclose that a naive implementer would hit.
8. **Links and internal consistency.** Do all relative links resolve? Is any
   section left stale from the earlier "open decision" state?
9. **Is it dispatchable?** If you were the implementer, name the first thing you
   could not do without asking a question. That is a contract defect.

## Output format

```
REVIEWER MODEL: <id or MODEL_UNVERIFIED>
HEAD: <sha>
CONTRACT BLOB: <sha>
VERDICT: APPROVE | APPROVE_WITH_FINDINGS | CHANGES_REQUESTED
```

Then a numbered findings list. Each finding:
`severity (P0/P1/P2/P3) | file:line | claim | evidence | required change`.

Then a "checks run" section listing the exact commands you ran and their
results. Then "unknowns".

If a category is clean, say so explicitly. Do not pad. A refutation with
evidence is more valuable than agreement — the author has already found and
corrected two of their own errors in this contract, so a third is likely.
