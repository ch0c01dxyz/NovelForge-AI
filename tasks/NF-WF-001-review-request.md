# Review request — NF-WF-001 revision/recovery design contract

You are the **independent reviewer**. Do not edit files. Do not implement
anything. Read and judge only.

## Step 0 — report your identity first

Before any other work, run exactly this and print the raw output:

```
git rev-parse HEAD
orca status --json
```

Then state, in your first output line, the model identifier you are actually
running as (check `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*` env or your own
system context). If you cannot determine it, say `MODEL_UNVERIFIED`. This is
required evidence: the task contract requests `glm-5.3-flash` as reviewer and
the coordinator must know whether that is what actually ran.

## What to review

The submitted design contract for task NF-WF-001:

- `docs/03-domain/STORY-VERSIONING.md` — the contract. §Contract (C1–C11) is
  the substantive artifact.
- `docs/adr/ADR-0014-revision-checkpoint-model.md` — the architectural decision.
- `docs/04-data/DATA-MODEL-BLUEPRINT.md` — §Versioning and §Operations edits.
- `docs/13-decisions/ADR-INDEX.md`, `docs/implementation/DELIVERY-PLAN.md` —
  index/plan consistency edits.
- `tasks/NF-WF-002-revision-foundation.md` — the follow-on implementation task.

Context you may read but must not change: `CLAUDE.md` (constitution),
`AGENTS.md`, `docs/adr/ADR-0013-workflow-delivery-and-recovery-foundation.md`,
`docs/07-workflows/CORE-WORKFLOWS.md`, `docs/10-testing/TESTING.md`,
`docs/implementation/ISSUES-AND-GAPS.md`, and the real source under
`apps/api/src/services/` and `packages/database/prisma/schema.prisma`.

Use `git diff --stat` and `git diff -- docs/` to see exactly what changed.

## Judge these, with evidence

For each, answer VERIFIED / REFUTED / UNCERTAIN and cite file:line.

1. **Coverage completeness.** Does the C1 covered set name every table a
   chapter-consumed workflow actually reads? Check against `schema.prisma`
   and the services. Name any table that is read but not covered, or covered
   but never read.
2. **No invented transaction semantics.** Does the C4 head-CAS +
   snapshot + rebuild-intent single-transaction design hold in PostgreSQL as
   written? Specifically: is `IS NOT DISTINCT FROM` the right operator for a
   nullable head? Can the described statement order deadlock or violate a
   constraint? Compare against the real patterns in
   `apps/api/src/services/manuscript.ts` (FOR UPDATE) and
   `apps/api/src/services/narrative.ts` (predicate CAS).
3. **Restore correctness.** C7: does delete-in-reverse-FK-order /
   insert-in-FK-order actually satisfy every FK and CHECK in the covered set?
   Name any constraint it would violate. Is the PUBLISHED-chapter carve-out
   sufficient, or does it leave an inconsistent state?
4. **Baseline migration.** C8: is the "BASELINE revision with empty change
   set and no snapshot, then an explicit baseline checkpoint" split sound?
   Does anything break between migration and first checkpoint?
5. **Rebuild intent.** C6: is `UNIQUE (projection, source_revision_id)`
   sufficient deduplication? What happens on a second mutation before the
   first intent is consumed — is a stale intent detected?
6. **Identity joins.** C9: is the `(novel_id, key)` backfill for
   `characters.story_entity_id` actually safe given the real data model? Is
   leaving `timeline_events.story_event_id` unbackfilled defensible?
7. **Names vs reality.** Does the contract clearly distinguish proposed names
   from observed existing symbols? Cite any place it presents a proposed name
   as if it existed.
8. **Links and consistency.** Do all relative links in the changed files
   resolve? Does `tasks/NF-WF-002-revision-foundation.md` contain any
   unresolved contract field or placeholder?
9. **Constitution compliance.** Does anything violate `CLAUDE.md` §9
   (versioning/recovery), §2.11–2.15, or `docs/10-testing/TESTING.md` G-01?

## Output format

```
REVIEWER MODEL: <id or MODEL_UNVERIFIED>
HEAD: <sha>
VERDICT: APPROVE | APPROVE_WITH_FINDINGS | CHANGES_REQUESTED
```

Then a numbered findings list. Each finding:
`severity (P0/P1/P2/P3) | file:line | claim | evidence | required change`.

Then a short "checks run" section listing the exact commands you ran and their
results. Then "unknowns".

If you find nothing in a category, say so explicitly. Do not pad. A refutation
with evidence is more valuable than agreement.
