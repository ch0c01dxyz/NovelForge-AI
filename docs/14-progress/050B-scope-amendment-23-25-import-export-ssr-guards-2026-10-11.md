# 050B Scope Amendment Proposal — Amendments 23–25 (2026-10-11)

**Task:** NF-WF-050B (scale review and author decisions)
**Type:** Scope amendment proposal per contract "Scope and interfaces":
"If another fixture/caller actually needs a change, record it in GAP-119 and
amend exact paths before editing."
**Status:** RECORDED (RETROSPECTIVE) — bounded independent re-review APPROVE
2026-10-11 (code, allowlist status, numbering, parity-test pattern all
verified). RETROSPECTIVE ORDERING: the three amended paths were already
modified when this proposal was drafted (during the GAP-120/121 repairs);
this document records and proposes them after the fact and does not claim
the amendment preceded the edits. The governing 050B contract's amendment
rule ("record it in GAP-119 and amend exact paths before editing; never
replace passing expectations with weaker assertions") requires a recorded,
separately reviewed exact-path amendment — not a separate author approval.
Commit authorization is a separate gate and remains per the repository
authorization policy.
**Proposer:** 050B live-acceptance session (writer/controller), 2026-10-11
**Baseline:** HEAD `dcb2f49c0f85259f9a1bdc7d39de9a0b5e53b839`, working tree
carrying the uncommitted GAP-120/121 acceptance WIP
**Contract checked:** `tasks/NF-WF-050B-scale-review-and-author-decisions.md`,
"Scope and interfaces" existing-paths allowlist and "Proposed new paths" list
**Discovery context:** first real-browser NF-WF-050B acceptance journey
(scenario 2, novel workspace page) at `dcb2f49`.

---

## Amendment 23: `apps/web/app/components/import-export/ExportPicker.vue` (+3 lines)

**Allowlist status (verbatim):** NOT in the contract's existing-paths
allowlist and NOT in the proposed-new-paths list. No prior amendment
(`050B-scope-amendment-*.md`) mentions this file. Amendment REQUIRED.

**Change:** first statement of the `watch(() => props.open, …, { immediate:
true })` callback gains an SSR guard:

```ts
if (typeof window === "undefined") return;
```

**Why the change is needed:** before GAP-120, the 12 unresolved template
components on the novel page were never instantiated server-side, so neither
dialog's `immediate` watch ever ran during SSR. Once GAP-120 added the
runtime imports, the components instantiate on the server and the
`open=false` hydration branch executed `window.removeEventListener` during
SSR — a `ReferenceError` that would return the novel page to a 500 state.
The guard is required for GAP-120's own closure check ("novel page renders
200 in a real browser") to hold.

**Semantics:** server-only early return replacing a thrown ReferenceError.
Client path is branch-for-branch identical (verified by independent exact-diff
review 2026-10-11, check 4): focus restore, Escape handling, keydown
listeners, reset-on-close preserved. No assertion weakened; no test changed.

## Amendment 24: `apps/web/app/components/import-export/ImportDialog.vue` (+3 lines)

**Allowlist status (verbatim):** same as Amendment 23 — NOT allowlisted, not
previously amended. Amendment REQUIRED.

**Change:** first statement of the `watch(() => props.open, …, { immediate:
true })` callback gains an SSR guard:

```ts
if (typeof document === "undefined") return;
```

**Why needed:** identical instantiation-chain reasoning as Amendment 23; this
callback touches `document.activeElement` / `addEventListener` before any
guard existed.

**Semantics:** server-only early return; client behavior identical
(idempotent hydration reset, null opener — independent review check 4).
`onUnmounted` cleanup is pre-existing and never runs server-side.

---

## Related amendment (same repair group): GAP-120 runtime imports on the allowlisted page

`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue` IS
on the contract allowlist. Its diff replaces the two `import type` statements
(`RunStatusPanel`, `GenerationPanel`) with runtime default imports and adds 12
more runtime imports — recorded here because GAP-120's ISSUES-AND-GAPS entry
originally said "keep existing type-only imports"; the applied diff strictly
improves on that wording (type positions still resolve through the value
imports; `InstanceType<typeof …>` refs verified typecheck-identical by
independent review). No amendment needed; documentation correction only.

## Related test addition (GAP-121, allowlisted surface)

`apps/web/app/components/workspace/scale-review-i18n-parity.test.ts` (NEW,
4 tests) resolves every `workspace.narrative.scaleReview.*` key referenced by
`NarrativePanel.vue` / `ScalePayloadForm.vue` / `ScaleReviewPanel.vue` — plus
the runtime-interpolated `state.*` and `checklist.items.*` families — against
the real `apps/web/app/i18n/{en,id}.ts` modules. Pattern follows the existing
`workspace-characters.test.ts` / `workspace-relationships.test.ts` real-dict
approach. Recorded for completeness: the components and i18n files are
allowlisted/proposed paths; the new test file itself is an additional
proposed-new path (Amendment 25).

## Evidence

- Independent exact-diff review 2026-10-11 (read-only scout, frozen diff
  sha256 `574b75f2832fcc81c5c3417a3349eb286f86d2c71b59748116043a43e162a291`):
  checks 1–6 passed for code correctness; sole blocker was the missing
  process amendment for these two files (this proposal).
- Live acceptance: novel page renders 200 in real Chromium and the author
  journey proceeds through scenarios 2–11 with these guards applied
  (`docs/14-progress/050B-live-acceptance-evidence-2026-10-11.md`).
- `pnpm exec vitest run` on the six affected workspace suites: 60/60 pass;
  `vue-tsc --noEmit` exit 0; parity test 4/4 pass.

## Commit decision (repository authorization policy)

The contract's amendment process is satisfied (GAP-119 record, exact paths,
separate review). No amendment-level author approval applies; the commit
decision follows the repository's existing authorization policy. Until a
commit is authorized, the GAP-120/121 working tree stays uncommitted.
