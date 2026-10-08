# Task NF-WF-047F: SCALE and Quota Proposals (decision brief, proposal-only)

Author decision update (2026-10-08): ADR-0016 selects S1 as foundation, S2 as
follow-up, and optional settings-enabled S3 with author approve/reject/alternative.
NF-WF-050 owns planned implementation; GAP-039 remains OPEN. This supersedes
the recommendation against S3 below, not historical observations. ADR-0015 /
NF-WF-049 supersede the quota alternatives; GAP-063's local gate is CLOSED.

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: APPROVED (contract review 2026-10-07 — APPROVE_WITH_FINDINGS, 1P2+2P3 folded in; proposal-only, no separate implementation; committed 9424c7e on work/nf-wf047-external-follow-up; pushed to origin). Awaits author product decisions on GAP-039/063 — no implementation authorized.
Milestone / capability IDs: M3/M5/M8; capabilities CAP-06/14
Implementer role / requested and resolved model: proposal drafter — separate
subagent actor dispatched by the 047 coordinator; serving identity
MODEL_UNVERIFIED per GAP-013. (Proposal-only task: the drafter is the
implementer role; no code implementation exists or is authorized.)
Reviewer role / requested and resolved model: separate subagent actor
dispatched by the 047 coordinator (different actor from the drafter);
serving identity MODEL_UNVERIFIED per GAP-013. Verdict:
APPROVE_WITH_FINDINGS (1 P2 S1-premise correction + 2 P3, all folded in
before commit).
Readiness evidence / unresolved decisions / parent acceptance owner: NF-WF-047
workflow (`docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md`); 047A audit
confirmed GAP-039/063 are author-owned → 047F proceeds as proposal-only.
Parent acceptance: local author (Klein).
Frozen review manifest / exact artifact paths and identity:
- `tasks/NF-WF-047F-scale-quota-proposals.md` (blob c571ed3b, committed
  9424c7e)
This manifest does not hash itself.
Baseline revision / local changes to preserve: branch
`work/nf-wf047-external-follow-up`; do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference:
(coordinator-owned)

## Goal and reason

Produce a **reviewed decision brief** for the local author on two
author-owned gaps, proposing concrete alternatives with evidence and
tradeoffs — **without selecting policy and without any implementation**
(no schema, adapter, API/UI, or policy changes). After the author records
a local decision, a separate bounded implementation contract would be
created (out of scope here).

- **GAP-039:** `reviewFinalText` has no deterministic way to propose a
  SCALE standing change from prose, so a violated SCALE standing produces
  no HARD/SOFT verdict in the review (only write-time 409s and read-side
  MALFORMED_POLICY findings).
- **GAP-063:** constitution §6 requires gateway configuration to include
  "latency/error/quota observations"; the `AIGateway` model records
  latency, errors, and health but has no quota fields, so a SUPER_ADMIN
  cannot see quota consumption or remaining quota.

## Required reading

- [Operating constitution](../../AGENTS.md) (§6 AI gateway rules, §10, §12).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [External follow-up workflow](../../docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md)
  (§047F).
- [Issues and gaps](../../docs/implementation/ISSUES-AND-GAPS.md) — GAP-039,
  GAP-063, GAP-098 (author-removed token budget).
- `apps/api/src/services/final-text-review.ts` (SCALE branch, file comment).
- `packages/narrative-rhythm/scale.ts` (`assessScaleAppropriateness`).
- `packages/ai-services/src/narrative.ts` (`scaleStandingOf`,
  `isValidScalePayload`).
- `packages/database/prisma/schema.prisma` (`NarrativePolicy`,
  `NarrativePolicyKind`, `PolicyHardness`, `AIGateway`).
- `packages/ai-core/omniroute.ts` (adapter: usage capture, healthCheck),
  `packages/ai-core/manager.ts` (`checkHealth`, error classification).

## Environment prerequisites

Read-only investigation. No services, databases, or credentials required.
No provider API calls. Do not invent provider APIs or use live
credentials.

## Dependencies and evidence

- Depends on: NF-WF-047A audit disposition (GAP-039/063 author-owned —
  OBSERVED from the workflow doc).
- Blocked until: separate contract review APPROVE of this brief.
- Active issue IDs: GAP-039, GAP-063. Record new problems in
  ISSUES-AND-GAPS.md (coordinator-owned) before any workaround.

## Scope

Allowed writes: this contract/proposal file only.
Forbidden: schema changes, adapter changes, API/UI changes, policy
behavior changes, ISSUES-AND-GAPS.md edits, commits (coordinator-owned).

## Part 1 — GAP-039: SCALE proposal sources (traced, OBSERVED)

### Current behavior (OBSERVED, 2026-10-07)

1. `NarrativePolicy` (`schema.prisma` ~line 2473): one row per
   `(novelId, kind)`; `kind: SCALE`; `hardness: SOFT|HARD` (HARD requires
   `hardReason`); `payload: Json` whose shape is owned by
   `packages/narrative-rhythm` and validated by `isValidScalePayload`
   (`packages/ai-services/src/narrative.ts:87`).
2. The payload's `standing` is the **declared standing**: the author's
   declared protagonist scale/access/reputation
   (`scaleStandingOf` returns `{ scale, access, reputation }` or null).
3. `reviewFinalText` (`final-text-review.ts:436-449`) builds the
   **proposal** as `{ id: chapterVersionId, scale: standing.scale,
   summary: version.chapter.title }` — the chapter version *at the
   standing's own scale*. `assessScaleAppropriateness` (pure, tested in
   `packages/narrative-rhythm/scale.test.ts`) therefore always finds the
   proposal inside reach: **SCALE can never FAIL a review in 010**.
   The assessment result is computed and discarded (`void assessment`).
4. A violated SCALE standing therefore surfaces only via write-time 409s
   (antagonist validator) and read-side MALFORMED_POLICY findings —
   never as a HARD/SOFT review verdict.

### The missing piece

A **deterministic conflict-proposal source**: something that proposes a
scale claim *from the chapter prose* (an "extracted claim") or an
explicit **author-approved proposal** flow, so the assessor has two
genuinely different inputs to compare. Today the proposal is derived
from the standing itself — a tautology by construction.

### Alternatives (proposals, not decisions)

**Option S1 — Extracted-claim source (deterministic, no LLM).**
Prerequisite (honest): entity-scale tagging must first be modeled
(new schema fields on beats/characters) and populated (tagging effort
for existing content) before any extraction logic can run — neither
`OutlineNode` nor `Character` carries any scale field today (verified
against `schema.prisma`; no `entityScale`/`beatScale`/`characterScale`
concept exists anywhere). Once tagged, the chapter's claimed scale
derives from the chapter's beats/characters and their registered
scales (e.g., a beat tagged at a scale above the protagonist's reach
proposes that scale). Verdict behavior: HARD policy + proposal above
reach → FAIL with named finding; SOFT → advisory. Provenance: the
finding names the beat/character row and its scale. Stale-version
handling: claims re-derive per chapter version; a new version
re-evaluates. Authorization: no new capability for the evaluation
itself (read-side); the tagging UI/API is a separate bounded effort.
Negative cases: chapter with no scaled entities → no claim → no verdict
(advisory "no scale claim extracted" is optional, not required).
Tradeoff: deterministic and cheap at review time, but the upfront
data-modeling and tagging cost is real; prose that *implies* scale
without tagged entities is invisible.

**Option S2 — Author-proposed standing change (explicit flow).**
The author proposes a standing change (or a per-chapter scale
exception) through a gated UI/API action; the review then assesses the
chapter against the *proposed* standing instead of the declared one.
Verdict behavior: unchanged machinery, new input. Provenance: the
proposal row (author id, timestamp, reason). Stale-version handling:
proposals pin to a chapter version; a newer version without a renewed
proposal falls back to the declared standing. Authorization: new
capability (e.g., `canon:manage`) — author-only by default.
Negative cases: proposal for a version that no longer exists →
404/ignored with an audit note, never applied to the wrong version.
Tradeoff: explicit and auditable, but adds author workflow; does not
detect undeclared scale drift on its own.

**Option S3 — LLM-extracted claim (non-deterministic).**
An AI step extracts the chapter's operative scale from prose during
review; the deterministic assessor then compares. Verdict behavior:
same as S1, but the claim carries model provenance. Provenance: claim
+ model id + prompt version + raw output retained. Stale-version
handling: extraction re-runs per version; cached per
`(chapterVersionId, extractorVersion)`. Authorization: no new
capability; cost/latency budget applies. Negative cases: extractor
failure or low confidence → claim UNKNOWN → no verdict (fail-open,
advisory note). Note the tension: fail-open is safe for SOFT policies
but questionable for HARD SCALE policies — a violated HARD standing
would silently pass review on extractor failure. Tradeoff: catches
implied scale, but
non-deterministic, costs tokens per review, and needs confidence
thresholds the author must set — the least "NovelForge owns truth"
option.

**Option S4 — Keep SCALE out of review verdicts (status quo, documented).**
Ratify the current behavior as the product decision: SCALE participates
in write-time validation and read-side findings only. The `void
assessment` becomes an explicitly documented no-op (or is removed).
Tradeoff: zero work, honest about the limitation; but GAP-039 stays
open as accepted behavior and HARD SCALE policies remain
unenforceable at review time.

### Recommendation: S1, with S2 as the follow-up

**S1** is recommended because, once the tagging prerequisite is met,
it is deterministic, needs no new review-time capabilities, and cannot
hallucinate a claim: no tagged entities → no verdict (fail-open). The
prerequisite is real and must be weighed: entity-scale tagging has to
be modeled (new schema fields) and populated (existing content tagged)
before S1 can do anything — this is the option's main cost. **S2**
is the natural follow-up for the cases S1 cannot see — an explicit,
auditable author override — and the two compose (S2 proposals take
precedence over S1 extractions). Notably, S2 needs no new data model
for its own verdict path (it proposes standings, not entity claims),
so if tagging effort is the blocker, S2-first is a legitimate
sequencing the author may prefer. S3 is not recommended now: it trades
the platform's determinism guarantee for coverage, and its thresholds
are a product decision the author has not been asked to make. S4 is
the legitimate fallback if the author decides SCALE verdicts are not
worth the machinery.

## Part 2 — GAP-063: quota observations (traced, OBSERVED)

### Current behavior (OBSERVED, 2026-10-07)

1. Constitution §6 (AGENTS.md:104) requires gateway configuration to
   include "latency/error/quota observations".
2. `AIGateway` (`schema.prisma:511-538`) records: `latencyMs` (last
   observed round-trip), `lastErrorAt`, `lastErrorCategory`,
   `consecutiveFailures` (circuit-breaker input), `health`,
   `lastHealthCheckAt`. **No quota fields** — no limit, usage, or reset
   window on the gateway row or the catalog models (`AIModel`).
3. The OmniRoute adapter captures per-request token usage
   (`prompt_tokens`, `completion_tokens`) into `GenerationAttempt`
   rows (`omniroute.ts:271-272, 402`) — so *consumption* is observable
   per attempt, but there is no *limit* to compare it against and no
   aggregation surface.
4. `checkHealth` (`manager.ts:497`) probes `GET /v1/models` and records
   healthy/latency/category only — no quota signal.
5. Error classification includes `RATE_LIMIT` (429 → attempt status
   `RATE_LIMITED`), so quota *exhaustion events* are observable
   after the fact, but remaining quota is not.

### What "quota observations" must NOT be confused with

- **GAP-098 (author-removed, CLOSED 2026-10-07):** Klein manages token
  budgets himself at his own LLM gateway; the 024C `TokenBudget`
  enforcement scope was removed by explicit author decision. Any
  proposal that reintroduces *local token-budget enforcement* (spend
  caps, blocking on budget exhaustion) contradicts that decision and
  is out of scope. Quota observations are *read-only visibility*,
  not enforcement.
- **Per-attempt usage** already exists (`GenerationAttempt`
  input/output tokens). The gap is the *limit* side and the
  *aggregated/remaining* view, not raw consumption data.

### Alternatives (proposals, not decisions)

**Option Q1 — Provider-reported quota via response headers (read-only).**
Many OpenAI-compatible gateways expose rate-limit/quota state in
response headers (e.g., `x-ratelimit-limit-*`,
`x-ratelimit-remaining-*`, `x-ratelimit-reset-*` families — exact names
are provider-specific and UNKNOWN for the author's gateway until
observed). The adapter would capture these headers per request into
the attempt record; a rollup job would maintain per-gateway
`quotaRemaining`/`quotaResetAt` observations. Verdict behavior: none —
observations only, never gating. Freshness: header values are
per-request; staleness is bounded by request recency (a gateway with
no recent traffic shows "unknown/stale"). Scope: per gateway (and
per model where the provider scopes headers that way). Permissions:
SUPER_ADMIN read; no new capability for viewing. UI: gateway detail
shows "quota: remaining X / resets at T (observed HH:MM)" or
"unknown — no quota headers observed". Negative cases: provider sends
no quota headers → fields stay null → UI shows "unknown", never a
fabricated zero. Tradeoff: zero schema guesswork about provider
semantics (we record what the provider says), but entirely dependent
on the provider actually sending the headers — unverified for the
author's gateway until probed.

**Option Q2 — Manual quota fields on the gateway (operator-declared).**
Add `quotaLimit`, `quotaWindow` (e.g., monthly), `quotaResetAt` as
operator-entered fields on `AIGateway`; aggregate `GenerationAttempt`
token usage per gateway per window to show consumed vs. declared
limit. Verdict behavior: none — observations only (GAP-098 forbids
enforcement). Freshness: usage aggregates recompute on a schedule;
declared limits go stale only if the operator's plan changes.
Scope: per gateway (provider plan), not per model. Permissions:
SUPER_ADMIN write on the fields; read for admins. UI: "1.2M / 5M
tokens this window (operator-declared limit)". Negative cases:
no declared limit → show consumption without a denominator, never
imply a limit. Tradeoff: works with any provider (no header
dependence), but the limit is operator-maintained truth, not provider
truth — it can drift from the real plan.

**Option Q3 — Rate-limit event surfacing only (minimal).**
No new fields: aggregate the existing `RATE_LIMITED` attempt statuses
into a per-gateway "rate-limit events in the last N hours" observation
on the existing admin surface. Verdict behavior: none. Tradeoff:
near-zero work and no schema change, but it only shows exhaustion
after it happens — the weakest reading of "quota observations".

**Option Q4 — Drop "quota observations" from §6 (constitution amendment).**
If the author decides quota visibility is not worth the machinery,
amend §6 to remove the quota clause (with the review record), instead
of leaving an unenforced requirement. Tradeoff: honest, zero work;
but loses the visibility §6 originally wanted.

### Recommendation: Q1, with Q2 as fallback

**Q1** is recommended because it records *provider truth* rather than
operator-maintained truth, and it degrades honestly (null → "unknown")
when the provider does not cooperate. The required first step is
small and safe: log the response headers of a few real gateway calls
(on the author's machine, with his credentials) and confirm which
quota families the provider actually sends — until then, the exact
header names stay UNKNOWN and no schema is designed around them.
**Q2** is the fallback if the provider sends nothing usable: it works
with every provider and reuses the attempt-usage data already stored.
Q3 is too weak to satisfy §6's intent; Q4 is the legitimate fallback
if the author decides the visibility is not worth it.

## Unknowns (honest, per evidence policy)

- Which quota/rate-limit response headers the author's gateway
  (OmniRoute/9Router) actually sends: UNKNOWN until observed on his
  machine. No provider API is invented in this brief.
- Whether any SCALE entity-scale tagging exists at all: it does not —
  OBSERVED absent from `schema.prisma` (no scale field on `OutlineNode`
  or `Character`). The open question for the author is whether the
  tagging effort (schema + UI/API + backfill) is worth S1's
  deterministic coverage, or whether S2-first is preferable.
- The author's product stance on HARD SCALE review verdicts and on
  quota visibility: UNKNOWN — that is what this brief asks him to decide.

## Acceptance and verification

- [ ] A decision brief covering GAP-039 and GAP-063 with traced current
  behavior (OBSERVED), concrete alternatives with verdict behavior,
  provenance, stale-version handling, HARD/SOFT implications,
  authorization, and negative cases.
- [ ] Quota proposals separated from GAP-098 (no local budget
  enforcement proposed).
- [ ] Unknowns labeled UNKNOWN; no invented provider APIs; no live
  credentials used.
- [ ] One recommendation per issue with evidence and tradeoffs.
- [ ] Separate review of this brief; findings resolved.
- [ ] No schema, adapter, API/UI, or policy changes in this task.

## Migration and rollback

None for proposals. Each option discloses its possible effects:
S1/S2/S3 would add new verdict paths to `reviewFinalText` (bounded
implementation contract required); Q1/Q2 would add read-only
observation fields or rollups (bounded implementation contract
required). S4/Q4 are documentation/constitution changes only.

## Documentation and handoff

This brief is the deliverable. After the local author records a
decision, a separate bounded implementation contract is created for
the selected option(s) — out of scope here. Gaps stay OPEN until that
implementation lands; this task closes as "proposal delivered and
reviewed", not as gap closure.
