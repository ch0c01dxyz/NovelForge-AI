# Explicit Character Identity Resolution

## Status and authorization

Author approved the explicit link flow on 2026-10-21. Root integrates; a backend
writer works only in an isolated checkout; a separate actor reviews the final
diff. Existing uncommitted author-message edits must be preserved. No commit,
push, live identity mutation or automatic name matching is authorized here.

## Goal and required reading

Allow an author to resolve a character UNRESOLVED_IDENTITY finding by explicitly
choosing an existing CHARACTER StoryEntity in the same novel. Read AGENTS,
START-HERE, CURRENT, GAP-011/GAP-058, character services/routes, story-health,
revision/checkpoint helpers and the foundational writer-workspace design.

## Frozen interface and scope

- GET `/api/workspaces/:workspaceId/novels/:novelId/characters/:characterId/identity-options`
  accepts optional `q` (max120), `take` (1..50, default50), `skip` (0..100000).
  Return `{character:{id,name,storyEntityId},branchId,headRevisionId,candidates:[{id,name,key}],hasMore}`.
  Candidates are unclaimed CHARACTER entities in this novel, searched by name/key,
  ordered deterministically; no auto-selection or implicit identity creation.
- PUT the same character's `/story-entity` with strict
  `{storyEntityId,expectedBranchId,expectedHeadRevisionId}`. Expected head is UUID
  or null. Require canon:manage, same tenant/novel, entity kind CHARACTER and
  unclaimed identity. Only null-to-ID; same-ID replay is idempotent. Other existing
  links, stale heads/checkouts and concurrent claims return409; foreign IDs404.
  Return `{characterId,storyEntityId,revisionId,checkpointId}` (checkpoint may be
  null on an idempotent replay). No relink/unlink or story deletion.
- Capture required pre-change checkpoint, revision, change-set, rebuild intents,
  link and author audit atomically using current checked-out branch locks and
  head CAS. Recheck authorization inside transaction; fail closed on checkpoint
  failure. Knowledge/canon/manuscript rows are preserved.
- UI in Health & Memory: plain explanation, searchable/paged choices, explicit
  review and confirmation, loading/empty/error/unknown-result states. Recheck
  health after success. Existing technical evidence remains available. Historic
  findings cannot silently act on current data. EN/ID keys owned by root.

## Ownership and paths

Backend writer: character services/types/routes and focused API tests only, in
`.nf-batch-worktrees/character-identity`. Root: web components/tests/locales,
task/progress/issues, integration. Read-only reviewer may inspect either tree.
No dependency/schema change; no router changes, secrets, worktree deletion or
production data writes. Root owns shared files and all integration.

Connected review amendment: backend may narrowly adjust `canon.ts/deleteEntity`
to use novel/current-branch locking before deleting an identity, and refuse a
StoryEntity already linked to a Character. Existing ON DELETE SET NULL would
otherwise silently undo the approved author link without character history or
invalidation. Add linked-delete and delete-versus-link concurrency proof. No
general canon refactor or relink/unlink feature is included.

## Acceptance and negative proof

API: explicit valid link removes the character warning, knowledge unchanged,
pre-link snapshot has null link, restore can recover it. Refuse unauthenticated,
read-only actor, foreign novel/tenant/wrong kind/claimed entity, stale head,
changed checkout and stale link. Races must have at most one winner and no orphan
checkpoint/revision/audit on refusal. Same-ID replay creates no duplicate history.
UI: opening/searching never writes or preselects a match; only confirmed selection
writes; stale/network/late responses remain safe; success refreshes both health
lists. Both locales and English fallback remain supported.

## Commands, evidence and rollback

Reuse existing Windows Docker; API mutation tests use a dedicated disposable
test database, never main. Run focused API/component tests, web/API/ai-services
types, root lint and exact independent review. Retain the read-only Sofian Magani
observation: unlinked, five knowledge rows and one same-name candidate; this is
context, not an approved link. Rollback code preserves existing links/history;
story rollback uses recorded checkpoints, never SQL deletion. GAP-011 remains
open for broader timeline/event identity joins. Save verified Engram handoff.

## Completion evidence — 2026-10-21

Implemented and separately reviewed. Final root run:13 real database tests PASS
in a unique disposable database, including actual pre-link restore, null/source/
tenant/kind/claim guards and production delete-versus-link serialization. UI,
locale/fallback and automated accessibility54 PASS. API/ai-services/web types,
root lint, final test lint and diff check PASS. Independent11-file manifest:
`63d26a41b7e0bd9c773872a9f49a67c436d8b4b663f9118ecabe51837768bd87`.
No schema/dependency change, live identity mutation, commit or push. Sofian's
five knowledge records and unlinked state remain pending the author's UI choice.
Local API reload/readiness verified: API/Nuxt200, protected new endpoint401;
Sofian remains unlinked with five knowledge rows on final read-only inspection.
