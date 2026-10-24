# Staging real-novel and temporary cover acceptance

Status: VERIFIED for scoped automated staging acceptance; production release
and author review remain open as explicitly documented. Owner: current
host-bound Codex executor. Independent
reviewer: separate read-only actor, before executing mutation helpers.
Baseline: `9d82964`; preserve all existing WIP, stashes and local Docker data.

## Goal and authority

Create one private staging copy of the author's local *Kaisar dari Masa Depan*,
exercise real chapter generation and cover generation using working gateway
models, and report release evidence without treating one journey as every
production gate. The author explicitly authorized temporary copying of the
local gpt-image-2 provider/key; delete that temporary access after testing,
including on failure/handoff. Imported Indonesian manuscript remains verbatim.

## Required reading and dependencies

AGENTS.md, START-HERE.md, DELIVERY-PLAN.md, CURRENT.md, ISSUES-AND-GAPS.md,
environment preflight, model evidence policy, story snapshot/revision services,
AI gateway and cover routes. Reuse observed staging proof from the October 24
audit and checkpoint 627; synthetic evidence does not prove this novel journey.
Windows uses its existing acceptance PostgreSQL container read-only. Ubuntu
uses existing native services; never install Docker or reset either database.

## Scope and invariants

Source novel `e36d568b-aecf-476a-8e3f-f47ca709672b`, workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9`. Existing owner identity must match.
Allowed: this contract; ignored `.nf-artifacts/staging-real-*` helpers/receipts;
CURRENT, existing staging audit and ISSUES records; scoped staging data and
uniquely identified temporary router/provider records. No application code,
unrelated configuration, source data, commits, pushes or deployment changes.

Evidence-driven scope amendment: the deployed gateway omits the existing local
`src/app/api/v1/images/generations/route.js`; POST returns HTML404 while image
catalog discovery works. Repair this deployment omission by copying that exact
existing route to `/opt/akanesia-router`, building an isolated
`.next-real-cover-20261024`, and activating only after verification through
`30-novelforge-image-route.conf`. Keep the previous `.next` as rollback. No
upstream logic change or credential is part of this repair. Three text profiles
may select proven Qwen3.8Max while failed historical mappings remain retained.

Export only allowlisted story/reference/lineage tables under one read-only
snapshot. Import INSERT ONLY, preserve UUIDs and manuscript/version content,
reject collisions or unresolved foreign keys, and validate before COMMIT.
Keep target novel/chapters DRAFT; omit publications, reader data, historical
review acceptance, workflow runs, credentials and old restorable snapshots.
Generate a fresh native checkpoint and verify it. Preserve original source
statuses in the private source archive as historical context only.

Keep secrets in encrypted SSH transport/process memory; never print/store keys
in receipts, commands, memory or repository artifacts. Record exact temporary
record IDs. Cleanup must remove transferred upstream credentials and temporary
client credentials wherever actually retained; verify unaffected pre-existing
provider/key IDs and generated cover accessibility after cleanup.

## Acceptance and negative cases

- Backup staging PostgreSQL before import, validate TOC; rehearse scoped import
  in a disposable native clone before live execution.
- Exact chapter/version text and structured-data counts/hash read-back;
  source unchanged; collisions/FK mismatch abort without partial writes.
- Real AI generation from bounded local story context and approved direction;
  record actual serving models, strict validation, draft/application and canon
  outcomes separately. Automated test decisions are not human acceptance.
- One real gpt-image-2 cover generation, validated storage/read-back and normal
  cover application. No mock/provider bypass; no automatic paid repeat loop.
- Cleanup exact temporary credentials/provider/models/mappings and verify no
  pending provider job or private key residue. Preserve unrelated gateway data.
- Normal author UI and relevant tenant isolation/error checks. Reuse prior
  successful checks where their premises remain unchanged.

## Recovery and handoff

Import transaction is atomic. Before further high-impact story changes use the
native checkpoint flow. Rollback of a committed copy requires an exact scoped
plan or isolated preimage restoration, never overwriting other staging work.
Record known issues in the single issue register before workarounds. Finish
with observed/open/unknown release gates, English evidence records and a
host-confirmed Engram checkpoint/summary, each saved and read back.

## Completion evidence

See [real-novel acceptance](../docs/14-progress/STAGING-REAL-NOVEL-ACCEPTANCE-2026-10-24.md).
Private import/rehearsal, checkpoint, unchanged source, real Qwen chapter
candidate, real gpt-image-2 cover/apply/read-back and required provider/key
cleanup were executed. Latest candidate awaits author review with one stored
minor finding; it was not applied or published. Browser preview and cover
display passed, operator sessions revoked, all services active. Remaining
production gates are explicitly listed; no commit/push performed.
