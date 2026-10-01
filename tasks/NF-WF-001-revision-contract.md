# Task NF-WF-001: Specify the minimum consistent story revision contract

Status: DESIGN_COMPLETE / **VERIFIED** — three independent review rounds.
Round 1 raised 3 P1, 3 P2, 3 P3; round 2 (`ctx_db14a16c6968`) VERIFIED all eight
round-1 corrections and re-confirmed C1/C4/C8/C6, then raised 1 P1, 1 P2, 3 P3
of its own; round 3 (`ctx_a28a8bb47dc7`, task `task_52d7a3338dbb`) **VERIFIED
all five round-2 corrections and every regression check**, verdict VERIFIED at
HEAD `45d2035`. The reviewed artifact is frozen at that revision. Not runtime
implementation.
Milestone: M1. Capabilities: CAP-02, CAP-03, CAP-04, CAP-08.
Requested implementer: deepseek-v4.1-flash. Requested reviewer: glm-5.3-flash.
Resolved implementer: coordinator on `bansoskenari/deepseek-v4-1-flash`
(harness alias; backend identity unverified, GAP-013). Resolved reviewer:
`bansosmontera/deepseek-v4.1-flash` for round 1, a worker self-reporting
`glm-5.3-flash` for round 2, and for round 3 the dispatch passed
`--model bansosmontera/glm-5.3-flash` explicitly, which the gateway catalog
lists. **Backend identity is still unproven for all three** — the env values
are tier aliases, not per-request backend proof; round 3 correctly returned
`MODEL_UNVERIFIED` (GAP-013). Repository revision at execution:
`cfe762a5cfed6f44d80af16ad3c5fd008188ae95` + the M0 documentation set.
Review dispatches: `ctx_c4dcc5969164` (round 1), `ctx_db14a16c6968` (round 2)
and `ctx_a28a8bb47dc7` (round 3) on `run_183a5c2db65c`, after two earlier
dispatches died on a gateway HTTP 500 (GAP-013).

## Goal

Produce a reviewed implementation contract for consistent revisions,
checkpoints, optimistic head checks, canonical commit, and rebuild intent
over the chapter workflow's domains. Expand NF-WF-002 from that contract;
its implementer must not invent cross-domain recovery semantics.

## Required reading and dependencies

- AGENTS.md and docs/06-ai/MODEL-EVIDENCE-POLICY.md.
- docs/adr/ADR-0013-workflow-delivery-and-recovery-foundation.md.
- docs/03-domain/STORY-VERSIONING.md and docs/04-data/DATA-MODEL-BLUEPRINT.md.
- docs/07-workflows/CORE-WORKFLOWS.md and docs/implementation/DELIVERY-PLAN.md.
- packages/database/prisma/schema.prisma and relevant existing migrations.
- apps/api/src/services/: inspect canon, planning, character, narrative,
  manuscript and story-write services, actual transaction callers and tests.
- Existing story-versioning package, if present, and contracts/architecture.json.

ADR-0013 is accepted for planning. No checkpoint implementation is assumed.
Inspect current source and local modifications before designing.
Track GAP-004, GAP-011 and model availability GAP-013 in the single
docs/implementation/ISSUES-AND-GAPS.md register. Record new technical ambiguity
there before adopting a workaround; do not create another gap file.

## Scope

Allowed: docs/03-domain/STORY-VERSIONING.md; versioning/invalidation sections
of docs/04-data/DATA-MODEL-BLUEPRINT.md; new
tasks/NF-WF-002-revision-foundation.md; this task's status; design-only
evidence in docs/implementation/{progress,test-matrix}.md and CURRENT.
May update docs/implementation/ISSUES-AND-GAPS.md for findings/status evidence.
A new architectural choice requires a new ADR and index entry, named in
the handoff before the affected contract is finalized.

Forbidden: application code, packages, migrations, root constitutions,
historical archives, unrelated specs and credentials. These are read-only.

Inputs: current schema/callers, immutable versions, canon supersede history,
accepted scope and invariants of ADR-0013.

## Required output contract

Specify without placeholder fields:

1. Exact proposed Revision/head/Checkpoint types, keys, ownership, source/base
   relationships and immutable versus mutable fields.
2. Coverage for every existing chapter-consumed state table and manuscript
   version pin; creation/change/removal and reference integrity on restore.
3. Low/high-impact mutation boundaries, impact classification, expected-head
   compare-and-set, validation order, and failure/status mapping.
4. Atomic rebuild intent, deduplication identity, source revision, stale read
   policy, retry and recovery when Redis is unavailable.
5. Consistent baseline migration on populated data without invented history;
   write control during capture and compatible deployment sequence.
6. Restore preview/apply, unsupported-scope refusal, new revision creation,
   and exclusion of accounts, permissions, credentials and publication pointers.
7. Stable joins between character records and canon subjects; no implicit
   name matching or guessed identity backfills.
8. NF-WF-002 with exact paths, schema/service interfaces, named executable
   tests/commands, migration constraints and bounded scope.

## Acceptance and verification

- [x] Every chapter-consumed domain has explicit recovery treatment.
      MET — C1 classifies all 56 schema tables: 31 covered, 25 outside with a
      reason each. Verified by set-diff against `schema.prisma` `@@map` names.
- [x] Worked example changes canon and character state, restores both to
  one boundary, and preserves later history.
      MET — C10 steps 4–7.
- [x] Examples cover concurrent heads, partial failure, duplicate rebuild,
  failed checkpoint, pre-baseline history and stale generated text.
      MET — C10 adversarial list. Chapter-number reuse was added as a further
      refusal case during self-review.
- [x] Proposed names/paths are distinguished from observed existing symbols.
      MET — the header states the convention and `(proposed)` marks every new
      table, enum and capability.
- [ ] Reviewer confirms implementation needs no invented transaction semantics.
      **NOT MET** — reviewer could not be invoked (GAP-016). The coordinator
      self-review instead refuted five contract claims against the schema and
      corrected them; that is not a substitute for independent review.
- [ ] Links resolve; NF-WF-002 has no unresolved contract fields.
      MET — relative-link check over all changed files passes; the one open
      question (chapter identity under number reuse) was resolved into a named
      refusal rule rather than left as a placeholder.

Use rg to locate symbols/callers and inspect real schema/test scripts.
This is documentation-only: record review and link/consistency checks, not
new runtime test success. Do not create empty migrations or scaffold APIs.

## Migration, rollback and handoff

No migration is applied by this task. Its output defines the upgrade and
non-destructive recovery strategy. Until implemented and verified, runtime
gaps remain in CURRENT and high-impact workflows remain gated. Report source
revision, resolved models, changed docs, review findings, unknowns and the
readiness of NF-WF-002 using the playbook format.
