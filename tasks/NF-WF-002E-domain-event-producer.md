# Task NF-WF-002E: Domain event producer for versioned mutations

Status: PLANNED; not READY. Blocked on a design decision, not on capacity: no
consumer exists, so there is no requirement to satisfy yet beyond the field
semantics. Do not dispatch until a consumer is actually designed.
Milestone / capability IDs: M1 / G-01 area; CAP-03 adjacent.
Implementer role / requested and resolved model: unassigned.
Reviewer role / requested and resolved model: unassigned.
Engram checkpoint topic key: `context/NF-WF-002E/<worktree>/implementer`.

## Goal and reason

`packages/contracts/events.ts` declares
`revisionId: z.string().min(1).nullable()` and **nothing produces or consumes
it**. `packages/contracts/index.ts` re-exports the schema and
`packages/contracts/boundaries.test.ts` asserts `DOMAIN_EVENT_NAMES` matches
`SYSTEM-ARCHITECTURE.md`; that is the whole of its use. `domain_outbox` is named
in `DATA-MODEL-BLUEPRINT.md` and does not exist in `schema.prisma`.

C11 previously asserted the field "is currently always `null`". That was an
inference from nullability, not an observation, and NF-WF-002B withdrew it
(§C12.4). This task exists so the withdrawn claim has an owner rather than
becoming a silent default.

## What is genuinely required (and what is not)

Required when a producer lands: a versioned mutation's event carries the
revision that mutation created; a system-initiated event may carry `null`. That
is already what the schema permits.

**Not required yet, and not to be built speculatively:** an outbox table, a
dispatcher, a retry policy, or a consumer. ADR-0008's posture — a table earns
its existence when a consumer asks for one — applies. Building an outbox with
no consumer is the scaffolding the constitution forbids.

## Open question that blocks READY

Consumer-design owner: the coordinator preparing NF-WF-004 must inspect its
actual durable execution requirements and the existing rebuild intents before
activating this task. Keep any downstream NF-WF-008 event use attributed too.
This is an investigation trigger, not permission to invent a consumer/outbox.
002E does not automatically block G-01; parent acceptance must state its
remaining event scope. It cannot mark the promised event capability complete.

If and when a consumer is designed, decide whether events travel through a
`domain_outbox` row written **in the mutation transaction**, which would put
them under C6's atomicity rule (canonical change and durable intent commit
together), or are only advisory notifications after commit. A required durable workflow
may not use best-effort emission in place of atomic intent. The
blueprint already says the former is required for durable workflows; confirm
that reading applies here before implementing it.

## Scope

Allowed paths: to be fixed after the design decision. Expect
`packages/contracts/events.ts`, possibly a schema/migration for the outbox, the
mutating service that emits, and this task plus the issue/progress records.
Forbidden until then: **`events.ts` must not be edited.** It is read-only in
NF-WF-002B and remains so here until the producer's design exists.

Out of scope: GAP-022 (client head expectation) and GAP-024 (snapshot ordering,
owned by NF-WF-002C). This task does not touch the revision foundation.

## Acceptance and verification

- [ ] The design decision is recorded in `decisions.md` before implementation.
- [ ] If an outbox is chosen: the row is written in the mutation transaction,
      deduplicated by operation/source revision, and a Redis outage cannot fail
      the canonical commit.
- [ ] A versioned mutation's event carries the revision it created — asserted,
      not inferred from the field's type.
- [ ] A system-initiated event with `revisionId: null` is asserted to be
      accepted, so the nullable field's purpose is pinned by a test.
- [ ] Independent review of the exact submitted diff.

## Migration and rollback

If an outbox table is added it is additive; it must apply from empty and
populated databases and must not require backfilling events for history that
predates it. Application rollback preserves pending intents and their deduplication history;
stop incompatible consumers and use a compatible forward migration if needed.
Do not drop an outbox merely because it is derived: losing required pending
work can break workflow guarantees. A destructive purge needs an explicit
retention decision and verified recovery, outside this planned task.

## Documentation and handoff

Update `DATA-MODEL-BLUEPRINT.md` (which currently says `domain_outbox` does not
exist) and `STORY-VERSIONING.md` §C12.4 when the producer lands. Close GAP-023
only with the producer/consumer evidence, not with the field's existence.
Fallback handoff per GAP-021 if Engram has no runtime binding.
