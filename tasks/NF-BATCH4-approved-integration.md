# Batch 4 approved working-tree integration

Status: APPLIED TO WORKING TREE; focused checks passed, independently reviewed
APPROVE (two initial P3 wording notes addressed and rechecked). Owner: current Codex
integration coordinator. No commit/deployment; ADR-0017 remains deferred.

## Goal and authority

Apply the independently approved candidate to the main working tree, preserve
existing WIP, improve the four identified discovery control boundaries with
`--color-nf-border-focus: #6f6a63`, and repair locale-test fidelity and the
NF-WF-051 timing race. The author explicitly approved all explained items on
2026-10-14. ADR-0017 remains deferred; no option was selected.

## Required reading and inputs

AGENTS.md, START-HERE.md, CURRENT.md, ISSUES-AND-GAPS.md, DESIGN-TOKENS.md,
INTEGRATION-MANIFEST-scopeB.md and NF-WF-051 contract. Input: reviewed
`.nf-batch-worktrees/candidate-integration` at HEAD 50609c0, with paired
batch-2/A3 accessibility fixes, GAP-029 parity test and NF-WF-051 companions.
ScopeB4 web-test repair is a separate input requiring faithful keyed state
stubs before incorporation. Retain frozen artifacts and previous test evidence.

## Scope and ownership

Coordinator owns main-checkout integration, discovery controls/tests,
main.css's additive token, design and progress documentation. Isolated writers
own locale tests and sweeper-test investigation in separate worktrees. Copy
only enumerated source/test files; do not replace main progress/WIP with stale
candidate copies. Final reviewer has read-only access to the exact delta.

No staging, commit, push, Git merge, deployment, data migration, novel-data
mutation, Docker reset or worktree deletion. Preserve en/id, keyboard/focus,
disabled states, existing behavior and acceptance data. No global replacement
of decorative borders or unrelated faint text. No new dependencies.

## Verification and negative checks

Verify candidate source fidelity before approved follow-up edits. Run focused
discovery/locale/repaired web tests and controlled sweeper tests. Reuse prior
unchanged API/publication/ACC-1 receipts. Test inactive and active chip states;
hover must not restore a low-contrast boundary. Check compiled/rendered control
colors on affected surfaces, including both locales when tooling permits.
State stubs must distinguish keys and reset per test. Timer tests must not
assert that stop cancels already-running passes when the contract permits them.
Use existing node/pnpm and Windows Docker; DB tests only in their dedicated
scratch database, never acceptance DB. Record commands and limits in CURRENT.

## Recovery and handoff

No migration or deployment. Preserve pre-edit hashes and frozen inputs for
selective recovery; do not reset or restore the dirty checkout wholesale.
Handoff includes exact file/hash manifest, focused results, separate review,
remaining gaps and a verified Engram checkpoint with runtime-confirmed identity.
