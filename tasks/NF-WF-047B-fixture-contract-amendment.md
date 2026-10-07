# Task NF-WF-047B: GAP-042 Fixture Contract Amendment

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE, 2 P3 observations non-blocking)
Milestone / capability IDs: M3/M8 (contract accuracy, CAP-20)
Implementer role / requested and resolved model: (to be assigned — separate actor from contract author and reviewer)
Reviewer role / requested and resolved model: (to be assigned — separate actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-047A audit confirmed GAP-042 remains OPEN/unresolved (disposition: PROCEED). Parent: 047-coordinator; acceptance: local author.
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: `work/nf-wf047-external-follow-up` branch; do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Goal and reason

Amend the frozen NF-WF-011 contract (`tasks/NF-WF-011-author-preview-e2e.md`)
so Invariant 3 no longer pins an exact, unattainable revision count.
The amendment explicitly supersedes the exact-30 claim with "at least 30
revisions" (a normative floor), preserves attribution of every measured row
through real mutations, and requires recording the actual revision count.
No fixture semantics change: the fixture builder, the dataset size, and the
revision floor all stay exactly as they are.

This closes GAP-042 as a contract defect (the product behavior was always
correct; only the contract's claim was wrong).

## Required reading

- [Operating constitution](../../AGENTS.md) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [NF-WF-047 workflow](../../docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md), 047B section.
- [GAP-042 entry](../../docs/implementation/ISSUES-AND-GAPS.md).
- NF-WF-011 contract: `tasks/NF-WF-011-author-preview-e2e.md`, Invariant 3
  (lines ~282–312), and the existing "## Amendments (2026-10-07, NF-WF-045)"
  section (amendment-appendix pattern).
- `apps/api/src/e2e/long-novel.fixture.ts` (GAP-042 header comment lines
  1–16; `FIXTURE_REVISIONS = 30` line 37; floor guard lines 449–453).
- `apps/api/src/e2e/long-novel.measure.test.ts` (consumers of the counts).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Ubuntu: native PostgreSQL/Redis; no Docker. This task is documentation-only;
the long-novel measure test is re-run only if the implementer judges fresh
runtime fixture evidence is required (per the workflow's conditional check).
If run: disposable scratch database, `DATABASE_URL` explicit export, suites
using the same scratch DB serialized.

## Dependencies and evidence

- NF-WF-047A (audit) — READY; disposition for GAP-042: PROCEED (remains
  unresolved, contract defect only).
- GAP-042 (`docs/implementation/ISSUES-AND-GAPS.md`) — OPEN; implementer
  deviation recorded BEFORE the workaround (fixture asserts `>= 30`).
- No code changes authorized. A code change needs a separately reviewed
  scope amendment.

## Scope

Allowed paths:
- `tasks/NF-WF-011-author-preview-e2e.md` — append-only amendment section.
- This task's contract file.

Forbidden paths: everything else, including `apps/api/src/e2e/long-novel.fixture.ts`
(no fixture changes), `apps/api/src/e2e/long-novel.measure.test.ts` (no test
changes), production code, migrations, and all shared records
(ISSUES-AND-GAPS.md, CURRENT.md, DELIVERY-PLAN.md, START-HERE.md —
coordinator-owned).

Inputs: NF-WF-011 Invariant 3 exact text (quoted verbatim in the amendment);
the GAP-042 register entry; the fixture's observed behavior (`~4,000`
revisions through real service paths; floor guard at line 449–453).
Outputs: a dated amendment section appended to the NF-WF-011 contract.

Out of scope: changing the fixture builder, lowering the floor, reducing the
dataset, inventing a revision count, or weakening temporal/recovery evidence.
Follow-up owner for retained requirements: 047-coordinator (GAP-042 closure
in the register after this amendment is reviewed).

## Behavior and invariants

The amendment MUST:

1. **Supersede, not rewrite.** Quote the original Invariant 3 exact-30 text
   verbatim with SUPERSEDED markers (per AGENTS.md §10: annotate superseded
   decisions, never silently rewrite). The original text stays in place.
2. **State the floor semantics.** `FIXTURE_REVISIONS = 30` is a normative
   minimum: the fixture MUST produce at least 30 revisions; the existing
   guard (`revisionCount < FIXTURE_REVISIONS` → throw) is the enforcement,
   and it is unchanged by this amendment.
3. **Preserve attribution.** Every measured row is written through real
   service paths (`advanceForMutation` → `advanceHead`, one revision per
   covered mutation); no revision-less bulk inserts for measured tables.
   The amendment re-affirms Invariant 4's normative requirement.
4. **Record actual counts.** The measurement receipt records the actual
   revision count observed (currently ~4,000); the amendment names the
   mechanism that produces it (every covered-table mutation advances the
   head by exactly one revision).
5. **Reconcile the misleading ratios.** The original "(10 chapters per
   revision)" parenthetical is superseded: with ~4,000 revisions for 300
   chapters, the actual ratio is roughly 13 revisions per chapter, and the
   exact ratio is a product-semantics artifact, not a fixture choice. The
   "30 revisions × 7 scopes" rationale is superseded by minimum semantics:
   the floor guarantees the rebuild has multi-revision work; the observed
   count exceeds it.
6. **Not weaken evidence.** The amendment must not reduce the dataset,
   lower the floor, remove revision writes, or alter what the temporal
   ceiling / recovery paths prove. The separate reviewer explicitly
   confirms this.

## Acceptance and verification

- [ ] The NF-WF-011 contract gains a dated "## Amendments (2026-10-07, NF-WF-047B)"
  section; original Invariant 3 text untouched (0 deletions — verify with
  `git diff --stat`).
- [ ] The amendment supersedes the exact-30 claim with "at least 30 revisions",
  quotes the original text verbatim with SUPERSEDED markers, and covers all
  six behavior items above.
- [ ] `git diff --check` clean.
- [ ] The existing floor guard is verified by source inspection
  (`long-novel.fixture.ts:449-453` refuses `revisionCount < 30`); no guard
  change, no fixture change.
- [ ] Separate review of the exact submitted diff confirms the amendment
  does not weaken temporal/recovery evidence.
- [ ] If the long-novel measure test is re-run: record command, revision,
  exit code, revision count observed, and prerequisites. (Conditional per
  the workflow; source-only amendment needs no re-run.)

Record actual results separately from expectations. Zero selected tests or
skipped integration checks do not pass a capability gate.

## Migration and rollback

None. Documentation-only change to a frozen contract's appendix. Rollback:
revert the commit. No schema, data, or production-code effects.

## Documentation and handoff

The implementer's handoff includes: the exact amendment text location
(file + line range), the `git diff --stat` proving append-only (0
deletions), the floor-guard source verification (file + lines), the
separate reviewer's verdict, and any deviation from this contract with
reasons. The coordinator records GAP-042's closure in ISSUES-AND-GAPS.md
(coordinator-owned); the implementer does not close the gap.

Update affected specs and CURRENT/progress/test-matrix with verified scope
(coordinator-owned wording). Use the
[playbook handoff](../../docs/06-ai/MULTI-LLM-ORCHESTRATION.md).
List unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task. Do not claim full platform completion.
