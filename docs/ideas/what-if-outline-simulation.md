# IDEA DRAFT — "What-if" story simulation across outline versions

Status: DRAFT IDEA (not a contract; no implementation). Captured 2026-10-05
from the NF-WF-007 review F2 author decision.

## Origin

During the NF-WF-007 implementation review, the generation start form
let the author start a run from ANY outline version. The contract
(Invariant 2.2) pins the APPROVED outline version, and the author
decided 2026-10-05 to **restrict to APPROVED only** — the dropdown
became a read-only display. The rejected alternative ("let the author
pick another version") is not discarded: it becomes this feature.

## The idea

A **story simulation mode** that answers: *"What if outline A were
chosen instead of outline B?"* The author picks two (or more) outline
versions, and the system simulates the story path each outline would
produce — then shows how the simulated paths diverge.

This is a narrative-level "what-if" exploration tool, distinct from
NF-WF-021's world/civilization simulation primitives (though it could
one day build on them).

## How it could work (sketch)

- **Simulation runs are first-class but non-canon.** They execute the
  NF-WF-006 chapter generation template (or a bounded variant) against
  a chosen outline version, tagged `simulation: true` from start to
  finish. Simulation outputs MUST NEVER enter the canon pipeline
  (NF-WF-008), memory consolidation (NF-WF-009), or the approved
  manuscript — the text/canon separation from NF-WF-005/007 applies
  doubly here.
- **Inputs:** 2+ outline versions (any status — this is the one place
  non-APPROVED outlines are legitimately usable), a chapter range or
  depth limit, and the current story state (NF-WF-003 context compiler).
- **Outputs:** per-outline simulated trajectories — chapter drafts,
  key divergence points (where path A and path B first meaningfully
  differ), affected threads/characters/arcs. A side-by-side or
  diff-style comparison view, reusing the NF-WF-007 diff/review
  surfaces.
- **Cost controls:** simulations are bounded (chapter cap, token
  budget, explicit author confirmation) — they multiply generation
  cost by the number of compared outlines.

## Why it matters

- Outline approval is currently a one-way door with real weight
  (canon, memory, downstream chapters). Authors need a safe way to
  explore alternatives BEFORE committing.
- It turns the outline version history (already stored by the
  planning service) into a decision-support asset instead of dead
  history.
- It gives the "what changed" outline-diff work (NF-WF-007 Q2) a
  forward-looking sibling: not just "what moved", but "where would
  this lead".

## Relationship to the delivery plan

- Builds on: NF-WF-003 (context compiler), NF-WF-006 (generation
  template), NF-WF-007 (diff/review UI), NF-WF-009 (memory — for
  multi-chapter simulation continuity).
- Must respect: NF-WF-008 (never auto-promote simulation output to
  canon), NF-WF-005 invariants (approval semantics unchanged).
- Possible home: a new workstream after NF-WF-009, or a narrative
  application under NF-WF-021's simulation umbrella. Undecided.

## Open questions

1. Simulation depth: single chapter vs multi-chapter arcs? (Cost vs
   usefulness tradeoff.)
2. Should simulations be allowed from DRAFT outlines, or only
   APPROVED + explicitly marked "candidate" versions?
3. How is divergence measured and presented — author-readable
   summaries, structural diffs, or both?
4. Do simulation runs go through the approval flow (NF-WF-005), or a
   lighter "simulation review" with no approve/reject semantics?
5. Persistence: are simulations kept (comparable later) or ephemeral?
6. Interaction with NF-WF-021: shared primitives or separate?

## Next step

When the author wants this: promote to a delivery-plan workstream
with a proper contract (contract → separate review → implement →
diff review → push, per the standing pattern).
