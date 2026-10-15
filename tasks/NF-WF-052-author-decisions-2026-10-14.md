# NF-WF-052 — Author decisions and implementation dispatch

Date: 2026-10-14. Baseline HEAD:
`50609c0d2704380ac2b48fa5eb01164fe8e858ca` plus preserved current WIP.

## Authority and timing

The author explicitly approved the recommended three policies, with execution
deferred until their next external harness output. That output has now arrived
and was assessed. This records direct author approval; Engram observation #292
is retained context, not the approval authority.

## Selected policies

1. Select candidates by normalized `(createdAt ASC, id ASC)`, using the
   reviewed addendum's cross-source key/domain agreement. This means database
   creation order, not narrative chronology or relevance ranking.
2. `MEMORY_ARC_SCOPES_MAX = 20`: at most 20 candidates per novel/read.
   MISSING candidates consume the selected window; no replacement/backfill.
   No limit on stored arcs/novels and no gateway quota policy is introduced.
3. Routes-only: expose the read endpoint; do not wire it into NF-WF-003 or
   change generation context. No UI, LLM calls, new summaries or storage.

These decisions supersede the historical PENDING/NOT READY policy statements
in the frozen contract and dispatch chain. Policy readiness is resolved;
implementation, verification and separate exact-diff review remain required.
No renewed ADR-0017 or NF-WF-053 decision is required.

## Contract chain and execution scope

Read the original, amendment, correction, addendum, dispatch manifest and
dispatch-manifest correction. Preserve all six artifacts byte-identical.
The latest dispatch correction SHA256 is
`c85f344aecb102714428c980a84a4340195d026858a221d86b18a9aae7af6009`.
Re-verify their identities before work. This file changes policy/timing only;
it does not alter the reviewed algorithm or expand allowed source paths.

Implement the bounded, authorized GET memory/global slice in the listed
backend/API paths and focused tests. Use disjoint every-Saga S and orphan-only
P, one global boundary, exact aggregate overflow count, at most 50 overflow
IDs, and only MISSING/UNRESOLVABLE_SOURCE per-scope exclusions. Preserve
freshness, provenance, same-branch as-of semantics and server-side novel:read.
Use suite-owned disposable databases only; preserve acceptance data and the
existing Windows Docker environment. Do not repeat retained release suites.

One writer per worktree; coordinator owns progress docs. A separate reviewer
must assess the exact submitted diff. At most three children including review.
The bounded implementation may proceed without requesting these policy
decisions again. Completion requires actual focused results and review.

No staging, commit, push, Git merge, deployment, runtime restart, destructive
cleanup or residual-D2 main integration is authorized by this decision.
ContinueReading rendered evidence remains UNKNOWN; human screen-reader
acceptance remains DEFERRED_BY_AUTHOR_DECISION.
