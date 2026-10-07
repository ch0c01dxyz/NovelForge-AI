# Task NF-WF-034: GAP-055 — Scene delete cascades to linked outline beats

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — CHANGES_REQUESTED, 2P1+2P2+1P3 folded in)
Milestone / capability IDs: M6 follow-up (NF-WF-015 scene authoring)
Implementer role / requested and resolved model: (to be assigned — separate actor from contract author and reviewer)
Reviewer role / requested and resolved model: (to be assigned — separate actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-055 is OPEN pending this reviewed contract (per author decision 2026-10-07).
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: (coordinator-owned)
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Normative vs informative

Normative: the cascade definition (§Behavior), the mechanism choice
(application-level explicit delete), the audit-logging requirements, the
acceptance checks. Informative: the rationale for preferring explicit delete
over the schema cascade, UI wording suggestions.

## Goal and reason

Make scene deletion cascade to the outline beats that plan it. Today,
`DELETE .../chapters/:chapterId/scenes/:sceneId` refuses with 409
`{error: "CONFLICT"}` when any `outline_nodes` row references the scene —
the author must delete the beats first via planning's `deleteOutlineNode`,
then delete the scene. The planning owner (author) decided 2026-10-07:
**CASCADE** — deleting a scene automatically deletes the outline node(s)
referencing it.

The observable result: deleting a scene with linked beats succeeds (200),
the beats are gone, the deletion is audit-logged per node, and the writer
UI warns about the cascade before confirming — no silent planning-data loss,
no 409 for this case.

This is a design contract, not an implemented feature. No code changes
are authorized by this document; implementation requires a separate
reviewed dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol; §5 conflicts surfaced, never
  silently reconciled).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [GAP-055](../../docs/implementation/ISSUES-AND-GAPS.md) (line 1476).
- Existing implementation:
  - `apps/api/src/services/manuscript.ts`: `deleteScene` (line 1182 —
    the 409 refusal, the transaction, the audit log)
  - `apps/api/src/manuscript-routes.ts`: DELETE scene route (line 220)
  - `packages/database/prisma/schema.prisma`: `Scene` (line 440),
    `OutlineNode` (line 1742), the `scene` relation
    (`onDelete: Cascade`), the CHECK
    `OutlineNode_leaf_links_exactly_one`
    (`packages/database/prisma/migrations/20261001_phase7_planning/migration.sql:162`)
  - `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`:
    `onDeleteScene` (line 648 — the confirm dialog, the 409 →
    `deleteBlockedByOutline` mapping)
  - `apps/web/app/i18n/en.ts` / `id.ts` (line 523):
    `scenes.deleteBlockedByOutline`, `scenes.deleteConfirm`
  - `apps/api/src/scenes.test.ts` (line 330 — the 409 refusal test)
- `apps/api/src/services/revisions.ts`: `TABLE_SCOPE` (line 200 —
  `outline_nodes` is checkpoint-covered)

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Use disposable scratch databases for all
tests.

## Dependencies and evidence

- **NF-WF-015** (scene authoring): IMPLEMENTED — the DELETE route, the
  409 refusal, the writer-page handling, and the test are its behavior;
  this task changes the refusal into a cascade.
- **GAP-052** (schema CHECK pinned): the CHECK
  `OutlineNode_leaf_links_exactly_one` is pinned by constitution §12;
  this task does not modify it. Cascade-delete of rows never violates
  it (rows are deleted, not unlinked).
- **GAP-004** (cross-domain recovery): `outline_nodes` is in
  `TABLE_SCOPE`, so a future checkpoint integration would capture the
  cascade. Checkpoint-on-scene-delete is out of scope here (GAP-004's
  domain); this task's recoverability story is the audit log.
- Active issue: **GAP-055** (OPEN/P2) in
  [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
  Record new technical problems there before any workaround.

## Scope

### Allowed paths

- `apps/api/src/services/manuscript.ts` — `deleteScene`: replace the
  409 refusal with the cascade (application-level explicit delete of
  linked nodes inside the existing transaction, then the scene delete).
  Audit-log each deleted node.
- `apps/api/src/manuscript-routes.ts` — DELETE scene route: return the
  cascade summary (count and identities of deleted beats) in the
  response. No new route, no new query param (unconditional per the
  author decision).
- `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`
  — `onDeleteScene`: warn about the cascade in the confirm flow;
  remove the 409 → `deleteBlockedByOutline` special case (the route no
  longer emits 409 for this case).
- `apps/web/app/i18n/en.ts`, `id.ts` — update `scenes` keys: the
  confirm message warns about linked beats; `deleteBlockedByOutline`
  is removed (normative — the 409 case is gone); en/id parity kept.
- Tests: `apps/api/src/scenes.test.ts` — replace the 409 refusal test
  with cascade tests (below).

### Forbidden paths

- Modifying the CHECK `OutlineNode_leaf_links_exactly_one` (pinned by
  GAP-052 / constitution §12).
- Modifying the Prisma schema or creating a migration (no schema change
  is needed — the FK is already `onDelete: Cascade`; the application
  deletes explicitly before the schema cascade would fire).
- Relying on the schema-level `ON DELETE CASCADE` as the *mechanism*
  (it stays as a safety net, but the application deletes explicitly so
  each node is audit-logged and reported — see Mechanism below).
- Adding a `?cascade=true` confirmation flag (the author decision is
  unconditional cascade; the UI confirm dialog is the safeguard).
- Changing chapter delete behavior, other outline node kinds, or the
  planning `deleteOutlineNode` route.
- Checkpoint-on-delete (GAP-004's domain; explicitly out of scope).
- Silently deleting nodes without audit logging them.

### Inputs

- `DELETE .../chapters/:chapterId/scenes/:sceneId` (unchanged shape;
  no new params).

### Outputs

- `200 { status: "ok", deletedBeats: [...] }` where `deletedBeats` is
  the list of cascade-deleted outline nodes (`{ id, title, order,
  sagaId }`), empty when no beats were linked. (Exact field names are
  the implementer's choice; the contract pins that the list is present
  and non-empty iff beats were deleted.)
- `403` when beats are linked and the caller lacks `canon:manage`
  (authorization failure; nothing is deleted).
- Per-node audit log records with action
  `planning.outline-node-deleted` and payload `{ sagaId, order,
  sceneId }` — pinned, not implementer's choice.

### Out of scope

- Redefining the CHECK constraint or the FK actions.
- Chapter delete (already cascades scenes via `Scene.chapter`
  `onDelete: Cascade`; unchanged).
- Non-SCENE outline nodes (CHAPTER and CHAPTER_GROUP kinds cannot
  reference a scene — the CHECK forbids it; trivially unaffected).
- A PRE_MUTATION checkpoint on scene delete (GAP-004 follow-up).
- UI redesign of the scene list (only the delete confirm flow).

## Behavior and invariants

### Cascade definition

When `deleteScene` runs, after the existing `chapter:update` gate and
scene lookup:

1. Select all `outline_nodes` with `sceneId = :sceneId` (these are
   necessarily `kind = 'SCENE'` — the CHECK guarantees no other kind
   can carry a `sceneId`). The select needs `id`, `sagaId`, `order`
   and `title` for the audit records and the response.
2. **Capability gate — fail fast.** If any nodes are linked and the
   caller lacks `canon:manage`, refuse with 403 (authorization failure)
   before any row is deleted. Rationale: planning's
   `deleteOutlineNode` gates on `canon:manage`, and EDITOR holds
   `chapter:update` but deliberately NOT `canon:manage` ("This
   asymmetry is deliberate", `packages/auth/authorization.ts`).
   Without this gate, an EDITOR could delete outline nodes via
   scene-delete that they are forbidden from deleting directly. When
   no nodes are linked, the existing `chapter:update` gate suffices.
3. Inside the existing transaction: delete the nodes explicitly
   (`deleteMany` or per-row delete — the implementer's choice; per-row
   delete is preferred if the audit helper needs the row).
4. Delete the scene (existing statement).
5. Still inside the transaction, call `advanceForMutation` with
   `tables: ["outline_nodes", "scenes"]` and one `items` entry per
   deleted node (`{ entityType: "OutlineNode", entityId,
   operation: "DELETE" }`), mirroring `deleteOutlineNode`
   (`packages/ai-services/src/planning.ts:515`). This keeps revision
   history consistent between the two deletion paths.
6. Audit-log (existing pattern): the existing `scene.deleted` record
   (unchanged), plus one `planning.outline-node-deleted` record per
   deleted node with payload `{ sagaId, order, sceneId }` — the
   existing convention from `deleteOutlineNode`
   (`packages/ai-services/src/planning.ts:528`), extended with
   `sceneId` for cascade context.

There is no outline tree to recurse into: `OutlineNode` has no
`parentId` — nodes are a flat ordered list per saga
(`@@unique([sagaId, order])`). Deleting nodes leaves gaps in `order`;
no rebalancing is needed (`order` is a sort key, not a dense sequence —
verify this against the planning read path during implementation; if
any read path assumes dense ordering, record it as a new gap rather
than rebalancing silently).

### Mechanism — application-level explicit delete (recommended)

The Prisma schema already declares the `OutlineNode.scene` FK as
`onDelete: Cascade`. Two mechanisms are possible:

- **(a) Schema cascade**: delete the scene; the database deletes the
  nodes. Atomic and simple — but silent: no per-node audit record, no
  node list for the response, and the writer UI cannot tell the author
  which beats were deleted.
- **(b) Application-level explicit delete** (recommended): SELECT the
  linked nodes, delete them explicitly in the transaction, then delete
  the scene. Every deleted node is audit-logged and returned in the
  response. The schema cascade never fires (no linked rows remain) and
  stays as a safety net for any path that deletes a scene without going
  through this service.

Choose (b). Rationale: this is a destructive operation with data-loss
implications (beats carry planning notes/summaries). Constitution §5
("conflicts surfaced, never silently reconciled") extends in spirit to
destructive cascades: the author must be able to see exactly what was
deleted, in the audit log and in the UI. The extra code is one SELECT
plus one `deleteMany` inside the existing transaction.

### Data-loss safeguards

- **Audit log is the recovery record.** Each deleted node is
  audit-logged with its identity and content summary (title at minimum;
  summary if cheap). `outline_nodes` is in `TABLE_SCOPE`, so when
  GAP-004 lands checkpoint-on-delete, the cascade will be captured —
  until then, the audit log is the record. Do not claim rollback
  recoverability this task does not provide.
- **UI confirmation.** The writer page already confirms scene deletion
  (`scenes.deleteConfirm` via `globalThis.confirm`). The confirm
  message must warn that linked beats will also be deleted. Two options
  for the implementer (reviewer to verify one is chosen):
  - (i) a single updated `deleteConfirm` message that always mentions
    beats ("Deleting this scene will also delete its outline beats."),
    or
  - (ii) a beat-aware confirm: the scene list query includes a
    `beatCount` per scene (or a pre-delete HEAD/probe), and the UI uses
    `scenes.deleteConfirmWithBeats` (new key, en+id) when `beatCount >
    0`, else the plain `deleteConfirm`.
  Option (ii) is preferred (precise warnings), option (i) is acceptable
  (simpler, no list-shape change).
- **No API-level confirmation flag.** Per the author decision the API
  cascade is unconditional. The UI dialog is the safeguard. Do not add
  `?cascade=true`.

### UI changes

- `onDeleteScene`: remove the 409 → `t("scenes.deleteBlockedByOutline")`
  special case. The route no longer emits 409 for linked beats; any
  future 409 falls through to `t("scenes.deleteFailed")` (generic).
  Update the code comment (it currently says "the only 409 this route
  emits is the outline-link refusal").
- `scenes.deleteBlockedByOutline` (en+id): remove the key — normative.
  The 409 case is gone, so the key has no use. en/id parity must hold
  (the i18n parity test will catch drift).
- No outline-node cache invalidation is needed: the writer page does
  not load outline nodes (verified: zero references in `index.vue`),
  so there is nothing client-side to reload after a cascade delete.

### Invariants

1. **CHECK never violated.** Cascade deletes rows; it never nulls
   `sceneId`. (Proven by the deletes succeeding — a CHECK violation
   would fail the transaction.)
2. **Atomicity.** Nodes + scene delete in the existing transaction:
   all-or-nothing. (Unchanged — the transaction already exists.)
3. **No silent loss.** Every deleted node is audit-logged and listed in
   the response. (New — the core of this task.)
4. **Tenant isolation.** Unchanged: the scene lookup is scoped to
   `chapterId` (+ novel via `getChapterOr404`); node selection is by
   `sceneId` only, and `sceneId`s are unguessable UUIDs scoped through
   the chapter. No cross-novel leakage.
5. **Capability gate: two tiers.** `chapter:update` is always required
   (existing gate, unchanged). When outline beats are linked,
   `canon:manage` is additionally required — fail fast with 403 when
   the caller lacks it. The unconditional cascade applies only when
   the caller holds both capabilities.
6. **409 eliminated for this case.** The route no longer emits 409
   when beats are linked. (Other 409s on this route: none — verify
   during implementation; the old comment claims the refusal was the
   only one.)

## Acceptance and verification

- [ ] **Cascade single beat**: scene with one linked SCENE node →
  `DELETE` returns 200 with `deletedBeats` of length 1 (id matches);
  `outlineNode.findUnique` → null; `scene.findUnique` → null.
- [ ] **Cascade multiple beats**: scene with 3 linked nodes (different
  sagas/orders) → all 3 deleted, `deletedBeats` length 3.
- [ ] **No linked beats**: scene with no nodes → 200,
  `deletedBeats: []`; behavior identical to today minus the refusal
  check.
- [ ] **409 gone**: the old refusal test is replaced — deleting a
  scene with linked beats no longer 409s. (Update
  `scenes.test.ts:330`.)
- [ ] **403 capability gate**: EDITOR (holds `chapter:update`, lacks
  `canon:manage`) deleting a scene with linked beats → 403, zero rows
  deleted (scene and beats intact). The same EDITOR deleting a scene
  with no linked beats → 200. A caller holding both capabilities →
  200 with the cascade.
- [ ] **Audit**: audit log contains one `scene.deleted` record and one
  `planning.outline-node-deleted` record per cascade-deleted node,
  with payload `{ sagaId, order, sceneId }`. (Assert via the audit
  query helper used by existing tests, or a test-local audit spy —
  follow the existing pattern.)
- [ ] **Revision tracking**: the cascade path calls `advanceForMutation`
  with `tables: ["outline_nodes", "scenes"]` and one `items` entry per
  deleted node (`{ entityType: "OutlineNode", entityId, operation:
  "DELETE" }`), mirroring `deleteOutlineNode`.
- [ ] **Non-SCENE nodes untouched**: a CHAPTER-kind node (linked to the
  chapter, not the scene) still exists after the scene delete.
  (Trivially true by the CHECK, but assert it — guards against a
  `deleteMany` with a wrong `where`.)
- [ ] **Other scenes' beats untouched**: beats linked to a *different*
  scene in the same chapter still exist.
- [ ] **CHECK intact**: no migration, no schema change; the CHECK
  still exists in the database (assert via a direct negative test only
  if cheap — e.g., creating a SCENE node with null `sceneId` still
  fails; otherwise rely on the migration being untouched).
- [ ] **UI**: `onDeleteScene` no longer maps 409 to
  `deleteBlockedByOutline`; the confirm message warns about beats
  (option (i) or (ii) above); en/id parity holds
  (`pnpm --filter @novelforge/web exec vitest run` i18n tests).
- [ ] **Commands**: `pnpm --filter @novelforge/api exec vitest run
  src/scenes.test.ts`; `npx tsc --noEmit` in `apps/api`;
  `pnpm lint` clean. Web: relevant vitest file(s) for the page/i18n.
  Prerequisites: disposable scratch DB per ENVIRONMENT-PREFLIGHT;
  `DATABASE_URL` exported.
- [ ] Separate review of the submitted revision by an actor other
  than the implementer; findings resolved before GAP-055 closure.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass this gate.

## Migration and rollback

No schema migration. No data migration. The change is code-only: the
409 refusal becomes an explicit in-transaction delete + audit records,
plus the writer-page confirm flow. Baseline revision: (coordinator to
set at dispatch). Deployment compatibility: old clients that interpreted
409 as "blocked by outline" will now see 200 with `deletedBeats` — the
409 case disappears, which is the intended behavior change. Rollback:
revert the commits; no database state to repair (the cascade only
deletes rows going forward; already-deleted beats are covered by the
audit log, not by rollback).

## Documentation and handoff

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-055 closure record
  (status, evidence, revision).
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

Use the Engram save/recovery protocol per the playbook; on failure
keep the compact handoff in the task record and log it in
ISSUES-AND-GAPS.md. Never claim an unconfirmed save.

**Explicit non-goals for the reviewer to check:** no CHECK change; no
migration; no `?cascade=true` flag; no silent (unaudited) deletes; no
chapter-delete change; no checkpoint integration (GAP-004); the old
409 refusal is gone, not kept as an option.

**Unknowns / risks:**
- Whether any planning read path assumes dense `order` sequencing
  (gaps after delete). If so, record as a new gap; do not rebalance
  silently.
