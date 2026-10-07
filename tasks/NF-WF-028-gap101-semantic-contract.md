# Task NF-WF-028: GAP-101 — Semantic preview/apply agreement (resolved-row builder + mode-aware locked apply)

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE_WITH_FINDINGS, 2P2+2P3 folded in)
Milestone / capability IDs: M9 (024C semantic merge follow-up)
Implementer role / requested and resolved model: (to be assigned — separate actor from contract author and reviewer)
Reviewer role / requested and resolved model: (to be assigned — separate actor from contract author and implementer)
Readiness evidence / unresolved decisions / parent acceptance owner: GAP-101 is BLOCKED pending this reviewed contract (per coordinator dispatch).
Frozen review manifest / exact artifact paths and identity: (set at implementation dispatch)
Baseline revision / local changes to preserve: eb065cf (or newer revision containing it)
Engram checkpoint topic key / last confirmed observation reference: (coordinator-owned)

## Goal and reason

Make semantic merge preview and apply agree. Today, `POST
.../merge/preview` with `mode: semantic` narrows CONFLICT → CLEAN (S1/S2/S3
with proof) and advertises `canApply: true`, but `POST .../merge/apply`
has no `mode`, recomputes conservative conflicts, and 409s with
`MERGE_CONFLICTS` — the user is told the merge is safe, then refused.
Separately, the existing `buildMergedPayload` copies whole source rows,
so naively forwarding the mode would silently discard target-side edits
that S2/S3 proved disjoint and safe to keep.

The observable result: a user who previews with `mode: semantic` and sees
`canApply: true` can apply with the same mode and get a merged row that
preserves **both** sides' edits, with explicit refusal (never silent
clearing) for anything the rules cannot resolve.

This is a design contract, not an implemented feature. No code changes
are authorized by this document; implementation requires a separate
reviewed dispatch.

## Required reading

- [Operating constitution](../../AGENTS.md) (§10 development rules, §12
  multi-LLM orchestration protocol; §5 conflicts surfaced, never
  silently reconciled).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [GAP-101](../../docs/implementation/ISSUES-AND-GAPS.md) (line 2021).
- [024C contract](../../tasks/NF-WF-024-advanced-intelligence.md)
  (Child 024C, Part 1 — semantic merge; precision gate; S1/S2/S3 rules;
  coupled-field denylist; "Default: CONFLICT").
- Existing implementation:
  - `apps/api/src/services/semantic-merge.ts` (S1/S2/S3 rules,
    `analyzeMergeChange`, `applySemanticMerge`, `COUPLED_FIELD_DENYLIST`)
  - `apps/api/src/services/revisions.ts`: `previewMerge` (line 2431,
    semantic narrowing), `applyMerge` (line 2455, conservative
    recompute + `buildMergedPayload` at line 2553), `buildMergedPayload`
    (line 2936, whole-source-row copy), `MergeChange` (line 646,
    `semanticRule` at line 672)
  - `apps/api/src/revision-routes.ts`: `mergePreviewBody` (line 117,
    has `mode`), `mergeApplyBody` (line 120, no `mode`), apply handler
    (line 374)

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Record actual OS/tool versions, service endpoints (redacted), scratch DB
ownership and required tools. Ubuntu installs missing native task
prerequisites without Docker; Windows reuses existing running Docker
services/data. List permission/network/credential blockers; never reset
working databases for tests. Use disposable scratch databases for all
merge fixture tests.

## Dependencies and evidence

- **NF-WF-020C** (conservative merge): IMPLEMENTED — the apply path,
  `buildMergedPayload`, branch lock + recompute (C4),
  `expectedHeadRevisionId` CAS, PRE_MUTATION checkpoint, and
  `isBranchDirty` guard are its behavior; this task must not weaken
  any of them.
- **NF-WF-024C Part 1** (semantic preview): IMPLEMENTED — S1/S2/S3
  analysis, `applySemanticMerge`, precision-gated fixture suite. The
  rules and denylist are pinned; this task reuses them, does not
  redefine them.
- **GAP-100** (what-if branch isolation): separate BLOCKED gap with its
  own contract (NF-WF-027). No dependency — the two gaps touch
  different code paths (what-if simulation vs. merge apply).
- Active issue: **GAP-101** (BLOCKED/P2) in
  [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md).
  Record new technical problems there before any workaround.

## Scope

### Allowed paths

- `apps/api/src/services/semantic-merge.ts` — add the resolved-row
  builder (`buildResolvedRow` or equivalent), reusing the existing
  S1/S2/S3 rule functions and `COUPLED_FIELD_DENYLIST`. Pure,
  deterministic, no LLM (024 Invariant 4).
- `apps/api/src/services/revisions.ts` —
  - applyMerge service input interface (`revisions.ts:1194`): accept
    `mode?: "conservative" | "semantic"`.
  - `applyMerge` service: accept and honor `mode`; under the branch
    lock, recompute the preview **with** the requested mode; for
    changes carrying a verified `semanticRule`, build the merged row
    via the resolved-row builder instead of whole-source-row copy.
  - `buildMergedPayload`: extend (or add a mode-aware sibling) so
    semantic-resolved changes use the builder; conservative CLEAN
    changes keep byte-identical existing behavior.
- `apps/api/src/revision-routes.ts` — `mergeApplyBody` zod schema:
  add optional `mode` enum; pass through to `services.applyMerge`.
- Tests: new fixture file(s) for resolved-row content assertions
  (S1/S2/S3), preview/apply agreement, coupled-field refusal in apply,
  stale-head and conservative regression coverage. Existing 024C
  precision fixtures must keep passing unchanged.
- Docs: update the 024C section of
  `tasks/NF-WF-024-advanced-intelligence.md` (or its successor note)
  and `docs/implementation/ISSUES-AND-GAPS.md` (GAP-101 closure
  record) with verified scope only.

### Forbidden paths

- **Forwarding `mode: semantic` into the existing whole-row
  `buildMergedPayload`** without the resolved-row builder. This is
  the exact data-loss path GAP-101 names: target S2/S3 edits would
  be silently overwritten by the source row.
- **Trusting the preview's `semanticRule` citation without recompute
  under the branch lock.** The head may have moved between preview
  and apply (C4); the apply path must re-run `analyzeMergeChange`
  on the locked preview and refuse on mismatch.
- **Silently clearing conflicts in apply.** Anything unproven stays
  CONFLICT → `MERGE_CONFLICTS` (020C behavior preserved).
- Changing conservative (default, no-mode) apply behavior in any way.
- New API routes, schema/migration changes, new merge modes, LLM in
  the builder or decision path.
- Touching what-if simulation (GAP-100), publication/notification/
  memory recovery (GAP-094/095/096), or the worker AI path (026).

### Inputs

- `MergeChange` with `semanticRule?: "S1" | "S2" | "S3"` and row
  evidence (`base`, `sourceVersion`, `targetVersion` keyed by
  DATABASE column names, per C2).
- Apply request: `{ targetBranchId?, expectedHeadRevisionId?,
  mode?: "conservative" | "semantic" }` (mode defaults to
  `"conservative"`).
- Existing pinned artifacts: `COUPLED_FIELD_DENYLIST`, S1/S2/S3 rule
  functions, 024C precision fixture suite.

### Outputs

- `buildResolvedRow(change): Record<string, unknown> | null` (name
  may differ; contract pins behavior, not identifier): the merged
  row for a semantically-resolved change, or null when unresolvable
  (→ explicit refusal, never silent fallback).
- Mode-aware `applyMerge`: semantic apply succeeds exactly when the
  locked recompute (with semantic narrowing) yields zero
  CONFLICT/DELETED_MODIFIED, and every cited rule re-verifies.
- Named typed errors for each refusal case (see Behavior).
- Test evidence: content assertions, agreement tests, refusal tests,
  regression runs.

### Out of scope

- Redefining S1/S2/S3 rules or the coupled-field denylist (pinned by
  024C; a rule change is a separate contract).
- Semantic application of DELETED_MODIFIED or ORPHAN_RISK changes
  (out of scope; they keep 020C behavior).
- UI changes for the merge preview/apply flow (follow-up owner:
  writer-workspace UI track, if the author requests it).

## Behavior and invariants

### Resolved-row builder (per rule)

The builder is a pure function of `(base, sourceVersion, targetVersion,
semanticRule)`. Deterministic: same inputs → same row (024 Invariant 4).

- **S1** (byte-identical source/target): return a deep clone of
  `sourceVersion` (identical to `targetVersion`; either is correct).
- **S2** (single text field, disjoint sentence spans): start from a
  deep clone of `base`; replace the one diverged field with the
  sentence-merged text — for each sentence index, take the source
  sentence where source changed it, the target sentence where target
  changed it, base elsewhere. (S2's rule guarantees exactly one
  both-changed text field and all other fields byte-identical to
  base across the three versions; the builder asserts this shape
  and returns null if violated.)
- **S3** (disjoint structured fields): start from a deep clone of
  `base`; apply source's changed fields, then target's changed
  fields. (S3's rule guarantees no field changed on both sides and
  no coupled pair across sides; the builder re-checks the denylist
  and returns null on any violation.)
- Returns **null** (→ explicit refusal) when: any row evidence is
  missing; `semanticRule` is absent; the recomputed rule via
  `analyzeMergeChange` does not equal the cited rule; the row shape
  violates the rule's preconditions; a coupled pair is detected.

### Mode-aware locked apply

1. Route validates `mode` (zod enum, default `"conservative"`) and
   passes it to `services.applyMerge`.
2. Apply recomputes the preview **with the requested mode** — both
   in the outer check and under the branch lock (C4). Semantic
   narrowing (`applySemanticMerge`) runs inside the locked
   recompute, not just the user's preview.
3. If locked conflicts remain → `MERGE_CONFLICTS` (unchanged 020C
   behavior, including the preview payload for evidence).
4. For each change with a verified `semanticRule`, the merged row
   comes from `buildResolvedRow`. For all other CLEAN changes, the
   existing whole-row logic applies unchanged. The mode-aware
   payload builder MUST place the resolved row at the same index
   the whole-source-row clone would have occupied, with consistent
   key normalization (table + entity-id key, DATABASE column names
   per C2).
5. If any cited rule fails re-verification or the builder returns
   null → explicit typed refusal (below); the transaction rolls
   back; no partial merge is written.

### Named refusal errors (explicit, never silent)

- `SEMANTIC_NO_EVIDENCE`: semantic mode requested but a change
  lacks base/source/target row evidence (e.g., missing snapshot).
- `SEMANTIC_RULE_MISMATCH`: the builder's internal re-derivation
  check — the rule re-derived at build time (via a fresh
  `analyzeMergeChange` on the locked-preview change) differs from
  the rule the locked preview cites on that change. This is a
  defensive assertion against corrupted changes or
  rule-evaluation inconsistency, **not** preview staleness:
  preview staleness (heads moved between the user's preview and
  apply) is handled by the `expectedHeadRevisionId` CAS and the
  locked recompute, before this error can fire.
- `SEMANTIC_UNRESOLVABLE`: the builder returned null (shape
  violation, coupled pair, or rule precondition failure).
- `SEMANTIC_COUPLED_FIELDS`: a coupled denylist pair detected
  across sides during apply (defense in depth; preview should
  already have kept it CONFLICT).
- All refusals are 409s with the change evidence attached, matching
  the existing `MergeError` shape. No silent fallback to
  conservative, no silent clearing.

### Preserved 020C safety (must not weaken)

- `expectedHeadRevisionId` CAS via `advanceForMutation` (stale-head
  → typed 409).
- Branch lock + recompute (C4): the head may have moved between the
  outer preview and the transaction.
- `isBranchDirty` guard: target must be clean (un-checkpointed work
  is never silently destroyed).
- `snapshotsAvailable` check, before and under the lock.
- PRE_MUTATION checkpoint pinned to the pre-merge head (Invariant 15)
  → merge remains rollback-able via existing rollback path.
- Audit logging of the merge.

### Invariants

1. **No data loss.** The merged row preserves both sides' edits
   exactly as the proving rule justifies. Proven by per-rule
   merged-content assertions (not by "no conflict" alone).
2. **Explicit refusal.** Every unsupported semantic application
   fails with a named error; conflicts are surfaced, never silently
   reconciled (constitution §5).
3. **Preview/apply parity.** Same mode + same heads → same verdict.
   A semantic preview advertising `canApply: true` must not be
   contradicted by the apply path on identical inputs.
4. **Deterministic.** No LLM in the builder or decision path (024
   Invariant 4). Same `(base, source, target, rule)` → same row.
5. **Conservative default unchanged.** Without `mode: semantic`,
   apply behavior is byte-identical to 020C (proven by the
   conservative regression suite).

## Acceptance and verification

- [ ] **S1 merged-content assertion**: fixture with byte-identical
  source/target change → merged row equals the shared version
  (field-by-field assert, not just kind).
- [ ] **S2 merged-content assertion**: fixture with disjoint sentence
  edits on one text field → merged text contains source's sentences
  where source changed, target's where target changed, base
  elsewhere; all other fields equal base.
- [ ] **S3 merged-content assertion**: fixture with disjoint field
  changes → merged row has source's fields + target's fields, rest
  at base values.
- [ ] **Preview/apply agreement**: semantic preview returns
  `canApply: true` → `POST .../merge/apply` with `mode: semantic`
  succeeds (2xx) on the same heads; merged content matches the
  preview's implied resolution.
- [ ] **Coupled-field refusal (preview + apply)**: adversarial
  fixture (e.g., source changes `status`, target changes
  `statusReason`) → preview keeps CONFLICT; apply with
  `mode: semantic` → `MERGE_CONFLICTS` (or
  `SEMANTIC_COUPLED_FIELDS`), never a merged row.
- [ ] **Stale-head**: apply with `expectedHeadRevisionId` older than
  the moved head → typed 409 (existing 020C behavior, regression).
- [ ] **Rollback**: merged revision rolls back via the existing
  checkpoint/rollback path (existing 020C behavior, regression).
- [ ] **Conservative regressions**: full 024C precision fixture suite
  passes unchanged (100% precision; no conservative CLEAN flipped
  to CONFLICT); 020C merge test files pass.
- [ ] **Determinism / purity of the builder**: run
  `buildResolvedRow` twice on identical fixtures (S1, S2, S3) and
  assert byte-identical output. Assert the builder path has no
  imports from AI/gateway modules (static check; e.g., grep for
  `ai-core`/`gateway` imports under the builder's module path) —
  the builder is pure and LLM-free per Invariant 4.
- [ ] **Negative — rule mismatch**: craft a change whose cited
  `semanticRule` disagrees with the builder's fresh re-derivation
  (e.g., mutate the cited rule in a test) → `SEMANTIC_RULE_MISMATCH`,
  transaction rolled back. This validates the defensive assertion;
  stale-preview handling (heads moved between preview and apply) is
  covered by the stale-head CAS test above, not this test.
- [ ] **Negative — missing evidence**: semantic apply on a change
  without row evidence → `SEMANTIC_NO_EVIDENCE`, no write.
- [ ] Commands: `pnpm --filter @novelforge/api exec vitest run`
  on the merge/semantic test files; `npx tsc --noEmit` in
  `apps/api`; `pnpm lint` clean. Prerequisites: disposable scratch
  DB per ENVIRONMENT-PREFLIGHT; `DATABASE_URL` exported.
- [ ] Separate review of the submitted revision by an actor other
  than the implementer; findings resolved before GAP-101 closure.

Record actual results separately from expectations. Zero selected
tests or skipped integration checks do not pass this gate.

## Migration and rollback

No schema migration. No data migration. The change is code-only:
one optional request field (`mode` on merge apply), one pure builder
function, and a mode-aware branch in the existing apply service.
Baseline revision: eb065cf (or newer containing it). Deployment
compatibility: old clients omit `mode` → conservative default →
020C behavior. Rollback: revert the commits; no database state to
repair (merges are versioned revisions with PRE_MUTATION
checkpoints; a bad merge rolls back via the existing rollback
path, which this task does not modify).

## Documentation and handoff

Update on verified evidence only:
- `docs/implementation/ISSUES-AND-GAPS.md`: GAP-101 closure record
  (status, evidence, revision).
- 024C contract note (`tasks/NF-WF-024-advanced-intelligence.md`
  or its successor): record that semantic apply is now supported
  via the resolved-row builder, with the refusal taxonomy.
- `docs/14-progress/CURRENT.md` and test-matrix: verified scope.

Use the Engram save/recovery protocol per the playbook; on failure
keep the compact handoff in the task record and log it in
ISSUES-AND-GAPS.md. Never claim an unconfirmed save.

**Explicit non-goals for the reviewer to check:** no whole-row
forwarding of semantic mode; no preview-citation trust without
locked recompute; no silent conflict clearing; no conservative
behavior change; no LLM anywhere in the path; no scope creep into
GAP-100/094/095/096.

**Unknowns / risks:**
- `MergeChange` row evidence uses DATABASE column names (C2); the
  builder must handle key normalization consistently with the
  existing rules (which already operate on these payloads).
- Sentence-merge edge cases (empty strings, single-sentence fields)
  must be covered by fixtures; S2's rule already constrains the
  shape, but the builder needs its own null-paths tested.
- Performance: the locked recompute now runs semantic analysis;
  it is the same pure-function cost as preview — no new queries.
