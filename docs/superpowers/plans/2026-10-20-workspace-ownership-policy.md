# Workspace Ownership Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development only after execution selection and the focused account-exemption answer.

**Goal:** Limit ordinary authors to one owned workspace, keep novels unlimited,
and honor the approved owner/admin exemption without deleting existing data.
**Architecture:** Central server ownership policy in existing workspace create
service, with creator-account locking to serialize concurrent requests. UI
reflects the server policy; memberships never grant implicit global exemption.
**Tech Stack:** Existing Fastify, Prisma/PostgreSQL and Vue.
**Spec:** ../specs/2026-10-20-workspace-chapter-lifecycle-design.md

## Global constraints

Parent constraints apply. User explicitly requested exemption for owner/admin;
its global-versus-workspace interpretation is currently awaiting clarification.
All workspace creators become membership OWNER, so treating that membership as
an exemption would invalidate the ordinary-author limit. Current platform enum
contains only SUPER_ADMIN. Do not invent an exemption, role or promotion.

## Review focus

Concurrent creates, existing owners over the new limit, invited memberships,
ownership-transfer bypass and attempted unbounded novel creation are pinned
below. Existing data is preserved; no automatic deletion or lockout of reads.

### Task 1: Resolved ownership policy and consistent creation UI

Files: `packages/ai-services/src/platform.ts`, `apps/api/src/platform-routes.ts`,
`apps/api/src/workspace-management.test.ts`,
`apps/web/app/components/author/{NewNovelWizard.vue,WorkspaceManager.vue}`,
`apps/web/app/pages/index.vue`, relevant tests/locales and a policy ADR if
clarification requires an explicit new account entitlement.

- [x] Author confirmed ordinary accounts max1 owned workspace; SUPER_ADMIN
  unlimited. Membership OWNER/ADMIN is not an account-level exemption.
- [ ] Freeze `workspaceOwnershipPolicy(actorUserId)` response
  `{ ownedCount: number; maxOwned: number|null; canCreate: boolean }` with
  maxOwned1 for ordinary accounts and null for approved exempt accounts.
  Return legible409 `WORKSPACE_OWNERSHIP_LIMIT` on a refused second create.
- [ ] Native regressions: two concurrent creates permit exactly one ordinary
  workspace; privileged actor creates more than one; invited membership does
  not consume ownership; existing over-limit workspaces remain accessible;
  transfer/assignment paths cannot bypass the resolved recipient ownership cap.
- [ ] Implement policy inside transaction with creator-account lock and current
  role read. Apply the same recipient check at any owner transfer path. Do not
  base global exemptions on caller-supplied role or on newly created membership.
- [ ] UI consumes policy to hide/disable new-workspace option with an explanation
  while preserving reuse/manage and unlimited novel creation in the eligible
  workspace. A stale UI still receives server refusal; never enforce UI only.
- [ ] Dedicated test DB/browser proves second workspace refusal, successful
  repeated novel creation, cancellation and en/id messaging. Run workspace
  management API/wizard tests, types and exact-diff review.

## Migration and rollback

Recommended interpretation needs no schema migration; it is a new policy over
existing ownerId and platformRole. Existing over-limit data is retained and
reported, not deleted or silently reassigned. Source rollback must not remove
workspaces, novels, memberships or audit history. Slice remains dependent on
the unanswered exemption question; independent chapter/routing/cover work can
proceed after overall plan execution approval.
