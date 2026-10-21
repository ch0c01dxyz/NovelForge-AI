# Workspace Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the author selects delegation. Implement task by task; do not infer execution-method approval from the design approval.

**Goal:** Deliver the approved chapter lifecycle, author model controls,
workspace Studio, image cover generation and whole-novel publication as usable
author workflows.

**Architecture:** Reuse manuscript/revision/publication services, the Model
Manager and gateway adapter, and versioned workspace definitions. Add small
explicit contracts at those boundaries; never route provider calls from UI or
business modules. One writer integrates shared contracts and manifests.

**Tech Stack:** Existing TypeScript, Vue/Nuxt, Fastify, Prisma/PostgreSQL,
BullMQ/Redis, existing validation and workflow executor. No framework change.

**Spec:** ../specs/2026-10-20-workspace-chapter-lifecycle-design.md

## Global constraints

- Design, discussion additions and native execution approved 2026-10-20.
- English project content; en/id UI and English fallback; imported prose kept.
- Preserve 7a5cac3 and all existing homepage WIP, stashes, debug.png, backups,
  Windows Docker services and acceptance data. No commit/push/merge/deploy.
- Only real configured gateway results establish AI/provider acceptance. Unit
  fault injection is useful regression evidence, never live integration proof.
- Mutation tests use dedicated disposable databases/novels and Redis isolation;
  never publish, rename, delete or generate story content into the author's
  existing novels merely to test a feature.
- Reuse independent successful evidence unless source changes invalidate it.
- Missing image-provider capability blocks image acceptance only; other tasks
  continue. OpenDesign Transport closed remains an explicit capability limit.
- Separate source correctness, native API/browser, provider and author/human
  screen-reader acceptance. UI/data presence is not evidence of execution.
- Each slice ends in exact-diff independent review, progress and verified
  Engram checkpoint. Separate reviewer cannot self-approve implementation.

## Review focus

1. Existing unsaved edits and delayed responses cannot mutate the wrong chapter
   or overwrite a later edit (chapter plan tasks 1–2).
2. Admin-disabled/deleted model mappings between selection and execution must
   refuse/fallback honestly; no cross-profile or gateway-ID ambiguity (routing
   plan tasks 1–2).
3. Generated workflow definitions cannot reference another workspace or grant
   tools/capabilities through prompt text (routing plan task 3).
4. Nine-image requests with partial failures, provider timeouts, cancellation
   or reload cannot fabricate nine successes or silently duplicate submissions
   (cover plan tasks 1–2).
5. Concurrent edits/new chapters/scheduled publications during novel preflight
   must prevent partial or stale batch publication (chapter plan task 4).

## Delivery sequence and dependencies

| Slice | Plan | Depends on | Observable result |
|---|---|---|---|
| A | chapter lifecycle tasks 1–2 | Existing manuscript services | Labeled controls, manual create, rename and safe delete |
| B | routing/Studio tasks 1–3 | Current profile resolver and definitions | Admin controls, actual per-definition model choice, workspace CRUD/AI drafts |
| C | chapter lifecycle task 3 | B and actual chapter workflow | AI title+prose with author instructions and acceptance |
| D | cover tasks 1–2 | B plus verified image transport | 1–9 real cover candidates, styles/badges and Apply |
| E | chapter lifecycle task 4 | C review pins and publication contract | All-or-nothing whole-novel publication |
| F | workspace policy task | Answer to focused exemption question | One owned workspace for ordinary authors, no novel count cap |

Detailed plans are linked below; this is one approved feature program with
reviewable slices, not six repeated product-design permission gates.

- [Chapter lifecycle and publication](2026-10-20-chapter-lifecycle-and-publication.md)
- [Routing and workspace Studio](2026-10-20-routing-and-workspace-studio.md)
- [Cover generation](2026-10-20-cover-generation.md)
- [Workspace ownership limit](2026-10-20-workspace-ownership-policy.md)

## Start prerequisites and ownership

- [x] Author reviewed the plan and approved recommended native execution.
- [x] Workspace exemption resolved: SUPER_ADMIN unlimited, ordinary accounts
  max1 owned workspace; novels unlimited. Existing data retained.
- [ ] Capture current source hashes in a private baseline manifest; verify
  Docker/test endpoints and no concurrent writer. Use existing main checkout
  only as the single integration writer, or a verified isolated snapshot that
  includes preserved WIP. Never copy secrets into a branch/worktree artifact.
- [ ] Root implements/integrates; separate read-only reviewer checks each
  exact slice. Never assign a child this session's Engram identity.
- [ ] Freeze new model-routing, image and publication contracts/ADR before
  dependent code. Add only reviewed additive migrations; prove populated-data
  compatibility and rollback without dropping production tables/history.

## Evidence and handoff

Expected commands are named in each slice; record actual selection and exit
codes. Use current package scripts and dedicated test DB env. No skipped/zero
test count can pass a slice. Final native browser exercises populated/empty/
error cases, en/id desktop/mobile, focus/Escape and opened dropdown geometry.
Types/lint apply to changed packages only, broaden for an observed dependency.
Update CURRENT and the single ISSUES register after each slice, retaining
unknowns and rejected assumptions. Save concise Engram records with the
host-confirmed binding and read back before handoff.

Self-review: all original requests and latest additions map to A–F. Runtime
image provider and workspace exemption remain explicit dependencies, not
assumed capabilities. No implementation, migration or acceptance is claimed.
