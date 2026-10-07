# NF-WF-036 — Scene mutation revisions

Status: IMPLEMENTED / REVIEWED. Baseline: 3086e7c.
Owner: current Codex implementer. Reviewer: separate review_recovery_034 actor.

## Contract

Goal: close GAP-110 by recording scene creation, metadata edits and every
renumbered scene on the checked-out branch, atomically with manuscript rebuild
intent. Preserve existing API shapes, capabilities and published-chapter policy
(scene planning metadata remains editable; chapter text/publication is unchanged).

Reading: constitution, CURRENT, GAP-110, STORY-VERSIONING, manuscript scene
callers/routes/tests, revision mutation helpers and projection mappings.
Dependencies: NF-WF-035 reviewed and pushed at 3086e7c; existing scene restore
coverage and scene.crud LOW classification. No new migration or checkpoint gate.
Inputs/outputs: existing scene POST/PUT/DELETE and response shapes, unchanged.
Allowed: manuscript service (including save/restore/status lock order), scheduled
publication worker lock order and its tests, scenes integration tests, impact documentation comment,
publication service shared chapter-lock ordering,
this task, CURRENT, issue register and delivery/start pointers.
Forbidden: schema/auth changes, production data writes/resets, new recovery scope,
changing published prose, new provider/model requirements.
Invariants: novel then checked-out branch locks precede chapter/scene writes;
scene writes, revision/change set and rebuild intent commit or roll back together;
main head stays unchanged on an alternate checkout; no-op PUT creates no revision.
Acceptance: create/edit/reorder revision and affected-item assertions; alternate
checkout; concurrent numbering; refused mutation leaves head/data unchanged;
checkpoint restore returns scene metadata and ordering; existing tenant/auth tests.
Commands: pnpm --filter @novelforge/api exec vitest run src/scenes.test.ts,
affected API typecheck, lint and diff check. Prerequisites: existing Windows Docker
PostgreSQL 5433, dedicated novelforge_test_scenes only, no competing test run.
Rollback: revert code only; immutable historical revisions remain; existing
non-destructive checkpoint restore handles scene rows. No migration.
Handoff: actual verification and separate exact-diff review recorded here and
CURRENT. Engram attribution unavailable per runtime hook; retain file checkpoint.

Contract review: review_recovery_034 APPROVE, 2026-10-07. Detect no-op from
final values (including clamped reorder), record each changed final number,
and reuse the delete path's checkout locking.

Review amendment: saveChapter/restoreChapterVersion lock chapter before branch,
which would deadlock against scene's required branch-first locks. Reuse the same
novel/checkout helper in these two paths and record their revisions on that branch.
Recheck chapter existence after createScene's lock; no-op must avoid updatedAt writes.

Verification (Windows, 2026-10-07): create-lineage test RED before repair;
final scene suite20/20 includes unchanged timestamps/clamped no-op, alternate
checkout, every reordered item, rebuild intent, concurrency and checkpoint restore.
Expanded scene/manuscript/publication58/58; scheduled-publication worker21/21.
API typecheck and lint exit0. Separate review_recovery_034 APPROVE after the
lock-order/no-op/existence findings; reviewer ran no tests. No release claim.
