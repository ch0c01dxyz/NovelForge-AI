# Resumable Horde Cover Jobs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for root integration; a gateway writer may use a separate worktree. One writer per checkout; exact-diff independent review before local activation.

**Goal:** Recover long-running Horde cover jobs without duplicate upstream submission and synchronize eligible Horde image models from the author's gateway.
**Architecture:** Durable authenticated gateway job receipts in its existing SQLite KV store. NovelForge pins a gateway/model/request identity in Generation.contextSnapshot before first dispatch and resumes status/result reads on that identity. Existing cover queue, gallery, normalization and explicit Apply remain.
**Tech Stack:** Existing Next.js gateway/SQLite, Fastify/Prisma/BullMQ/Vue; no new dependencies or schema migration required.
**Spec:** Author-approved recommendation in tasks/workspace-authoring-cover-generation.md, Horde queue analysis section.

## Global constraints

- Author explicitly approved gateway changes and Horde catalog synchronization; preserve all existing dirty files, databases, credentials, mappings and model defaults. No commit/push/deploy.
- Gateway owns Horde credentials and upstream IDs. NovelForge never fetches provider URLs or bypasses the gateway.
- Retain image byte/pixel limits, Gemini disable, tenant authorization, source/cover Apply checks and recoverable history.
- Preserve before-state and actual read-back. A timer test is not a witnessed20-minute provider run; reuse author-observed15–20-minute successful timing.

## Frozen gateway contract

- POST `/v1/images/jobs` with Bearer API key and UUID `Idempotency-Key`; bounded `{model,prompt,n:1}`. Only direct Horde image models in this slice. Return202 `{id,model,state,progress?,error?}`. Identity is scoped to the validated API key. Same key/body replays the same job; changed input409.
- Reserve SQLite receipt BEFORE one upstream POST. Persist chosen provider connection and upstream ID as soon as received. Never persist credentials. A crash/ambiguous submission leaves UNKNOWN/SUBMITTING and MUST NOT submit again automatically.
- GET `/v1/images/jobs/:id` authenticates/key-access-checks, checks ownership and polls the SAME upstream ID; returns QUEUED/RUNNING/SUCCEEDED/FAILED/UNKNOWN plus sanitized optional actual progress. Poll transport errors preserve recoverable state; no POST fallback. Persist terminal failure only for confirmed provider failure/expiry. Enforce finite request/poll timeouts; no retry of submit.
- GET `/v1/images/jobs/:id/result` returns bounded image bytes (JPEG/PNG/WebP) for a confirmed successful owned job; no new generation. Use safe bounded gateway retrieval, retain unknown model/usage.
- Existing synchronous images endpoint remains compatible; extend Horde wait budget with bounded polling failures without changing quality/model defaults. No dropped job on six temporary check failures.

## Task 1: Gateway durable job boundary

- [x] Add focused KV repository/service, authenticated routes, bounded provider adapter submit/check/result operations and negative/ownership/idempotency/crash/poll regressions.
- [x] Prove no duplicate submission after replay, restart, temporary status errors or concurrent clients. No live DB use in unit tests.

## Task 2: NovelForge recovery and ledger

- [x] Add optional manager/adapter async ports selected by model capability data, with pinned gateway/model identity and short HTTP calls.
- [x] Persist request identity before POST and receipt after submission; recovered accepted jobs use only GET on their original gateway/model.
- [x] Resume same Generation; fence old executors and atomically finalize item+Generation+one terminal attempt. Polls are not new generation attempts. Preserve cancellation/revocation and stale Apply refusal.
- [x] Regress lost response, concurrent recovery, source change after acceptance, disabled route, malformed status/result, timeout and no duplicate POST/attempt.

## Task 3: Catalog, local activation and handoff

- [x] Sync live image catalog through existing audited service; only eligible Horde image rows receive async/binary/30-minute settings and mappings. Preserve existing author priority/default; disabled Gemini remains disabled. Do not claim all catalog models have individual successful generations.
- [x] Exact review, focused tests/types/lint and safe local readiness/recovery proof; preserve all accepted jobs and active queues during restart. Record gateway source/runtime association and any unavailable activation evidence.
- [x] Update CURRENT/ISSUES/task evidence; verified Engram checkpoint/summary before handoff. No commit/push.

## Review focus and rollback

Unknown submission must not become a second upstream job; job IDs alone do not grant access; result retrieval must not expose credentials or fetch attacker-controlled local URLs. Enforce gateway/model disable without rerouting an accepted job. Keep KV receipts, Generation snapshots and candidates on rollback; revert code/config from retained before-state, never delete accepted jobs or story data.

## Observed completion evidence — 2026-10-21

Core142/API cover24/UI10, relevant types and root lint PASS; gateway18 tests and
production build PASS. Separate exact reviews APPROVE, including the2-file R2
host correction manifest611b84c2f0d231c98b3e5286a2c080441d61c16e63e5b4f92636357769d9f7ba.
Gateway jobs endpoints active after author reload;16 Horde async models read
back, Gemini0enabled, defaults preserved. Real scratch AbsoluteReality image
SUCCEEDED after worker restart and gateway reload: same job/Generation, one
terminal attempt,278560 ->154667 bytes, main story/cover unchanged. Private
receipt `.nf-artifacts/horde-live-receipt.json`; no main Apply/commit/push.
Engram checkpoint533 and summary543 saved with the current host-confirmed
session identity and read back before handoff.
