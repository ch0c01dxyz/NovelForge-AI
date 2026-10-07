# Task NF-WF-047A: Gap Evidence Audit

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: READY (contract APPROVED 2026-10-07; implementation complete; diff review APPROVE with 1 P3 folded in; audit report verified; committed f957e0f on work/nf-wf047-external-follow-up; pushed to origin)
Milestone / capability IDs: M0/M8; CAP-01–21 evidence maintenance.
Implementer role / requested and resolved model: separate subagent actor
dispatched by the 047 coordinator (different actor from the contract author);
serving identity MODEL_UNVERIFIED per GAP-013. Implemented the source-only
audit (22 gaps dispositioned); reported READY.
Reviewer role / requested and resolved model: separate subagent actor
dispatched by the 047 coordinator (different actor from the contract author
and the implementer); serving identity MODEL_UNVERIFIED per GAP-013.
Verdict: APPROVE (1 P3 citation-precision finding folded in before commit).
Readiness evidence / unresolved decisions / parent acceptance owner: parent
coordinator `047-coordinator`; parent acceptance: local author. This contract
requires separate review (APPROVE) before the child is marked READY.
Frozen review manifest / exact artifact paths and identity:
- `tasks/NF-WF-047A-gap-evidence-audit.md` (blob 2596f0e4, committed f957e0f)
- `docs/implementation/ISSUES-AND-GAPS.md` — GAP-084 and GAP-090 CLOSED with
  exact receipts, applied by the coordinator (same commit)
This manifest does not hash itself.
Baseline revision / local changes to preserve: branch
`work/nf-wf047-external-follow-up`; 047A committed as f957e0f and pushed.
Do NOT merge to main.
Engram checkpoint topic key / last confirmed observation reference:
`novelforge-ai/nf-wf-047/047A/<role>`. Engram MCP is UNAVAILABLE on this
host (GAP-021, re-observed at this boundary — no authoritative runtime
identity; no session ID invented or reused). Checkpoints are recorded in
this task file itself ("Checkpoint" section below); no MCP save is claimed.

## Goal and reason

Reconcile the remaining evidence: compare each currently unresolved issue
label in `docs/implementation/ISSUES-AND-GAPS.md` against the latest
verified receipt (task contract, diff review, test evidence, or commit),
and produce a disposition table — issue/capability, current source or
receipt, actual remaining work, owner/dependency, and closure evidence or
UNKNOWN. This is a source-only audit: it diagnoses the register, it does
not fix product code, rewrite history, or close gaps without evidence.
Its output gates children 047B–047F (B proceeds only if GAP-042 remains
unresolved; C proceeds on confirmed GAP-081/082 dispositions; D is
conditional on an authorized dump; F proceeds as proposal-only after A).

## Required reading

- [Operating constitution](../../AGENTS.md) (§10, §12, §13) or equivalent CLAUDE.md.
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [External follow-up workflow](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md)
  — 047A section, Global constraints, Review focus, Execution order.
- [Implementation playbook](../../docs/06-ai/MULTI-LLM-ORCHESTRATION.md).
- [Current evidence](../14-progress/CURRENT.md).
- [Issue register](../implementation/ISSUES-AND-GAPS.md) — full file; inspect
  later updates before interpreting an initial register row as current.
- [Delivery plan](../implementation/DELIVERY-PLAN.md) — capability ledger
  CAP-01–21.
- Referenced task receipts as cited (e.g. `tasks/NF-WF-021-simulation.md`,
  `tasks/NF-WF-022-endgame.md`, NF-WF-042/044/045/046 task files).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
This child is source-only: no database, no test execution, no services
required. Record actual OS/tool versions and the `git` baseline in the
report. Ubuntu installs nothing for this child; Windows reuse rules do not
apply. If any check unexpectedly needs runtime evidence, stop and record
it as BLOCKED rather than fabricating results.

## Dependencies and evidence

- Parent: NF-WF-047 (`docs/implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md`,
  plan review APPROVE 2026-10-07 by `review_mutations_034`).
- Blocks: 047B (needs GAP-042 disposition), 047C (needs GAP-081/082
  dispositions), 047D (conditional), 047F (proposal-only after A).
- Issue IDs owned for disposition: GAP-013, GAP-014, GAP-018, GAP-021,
  GAP-023, GAP-027, GAP-042, GAP-081, GAP-082, GAP-084, GAP-090 (explicit);
  plus inspection of other unresolved entries — the list is not exhaustive.
- New technical problems found during the audit are reported to the
  coordinator for ISSUES-AND-GAPS.md; the 047A worker does NOT edit the
  register (coordinator-owned).

## Scope

Allowed paths: this contract file
(`tasks/NF-WF-047A-gap-evidence-audit.md`) and the audit report it
contains (as an appended "Audit report" section, or a sibling receipt
file named in the handoff — one writer, one report).
Forbidden paths: everything else, including production code, migrations,
test files, historical task contracts, and all shared records
(ISSUES-AND-GAPS.md, CURRENT.md, DELIVERY-PLAN.md, START-HERE.md,
EXTERNAL-FOLLOW-UP-WORKFLOW.md — coordinator-owned).
Inputs: current issue entries, capability ledger, task receipts, code and
Git history at the baseline.
Outputs: the disposition table plus per-gap findings, in the report.
Name the diagnostic path explicitly: source/caller inspection and
referenced path/commit checks only.

Out of scope: closing any gap (the coordinator applies separately reviewed
dispositions); re-running tests; amending contracts (047B's job);
diagnosing loaders (047C's job); any populated-upgrade work (047D's job);
any SCALE/quota proposal (047F's job).

## Behavior and invariants

1. For each gap, read the FULL entry including later updates before
   interpreting the initial row — a stale reading is the primary failure
   mode this audit prevents.
2. Classify each gap into exactly one of: (a) real missing behavior
   (product/test work remains), (b) documentation debt (prose/register
   inconsistency, no behavior missing), (c) host-specific observation
   (environment flake, already worked around, needs diagnosis or a
   standing note), (d) superseded/closable (a later verified receipt
   satisfies the closure check — cite it exactly).
3. A stale OPEN label must NOT trigger reimplementation of a working
   feature. If the behavior exists and is evidenced, the disposition is
   "closable with receipt" or "documentation debt", never "reimplement".
4. Preserve GAP-023's no-consumer constraint: `domainEventSchema` has no
   producer and no consumer; NF-WF-002E is PLANNED and blocked on a
   consumer design. No speculative outbox implementation may be proposed
   or implied. `packages/contracts/events.ts` must not be edited.
5. Do NOT fabricate runtime results during this source-only audit. Every
   claim cites a file path + line or commit; every "UNKNOWN" is explicit.
6. Proposed closures require an exact receipt (commit, test evidence, or
   reviewed contract) AND a resolved review; anything less stays OPEN or
   VERIFY_PENDING with the missing piece named.
7. Do not recreate the author-removed GAP-098 cost tracker under any name.
8. Product decisions (SCALE/quota GAP-039/063), human screen-reader
   acceptance (GAP-051), live credentials, and production deployment stay
   with the author — the audit records them as author-owned, never
   disposes them.

## Acceptance and verification

- [ ] Disposition table covers GAP-013/014/018/021/023/027/042/081/082/
      084/090 explicitly, plus every other entry whose status is not
      CLOSED (sample at minimum; state the coverage explicitly rather
      than declaring the list exhaustive).
- [ ] Each row: issue/capability, current source or receipt (path+line or
      commit), actual remaining work, owner/dependency, closure evidence
      or UNKNOWN.
- [ ] GAP-084: verified against `packages/auth/authorization.ts` —
      the capability pair `simulation:read`/`simulation:manage` is
      declared exactly once in the capability list
      (`authorization.ts:71-72`) and appears exactly once in each role's
      mapping set; 021A's integration introduced no second declaration.
      (A naive `grep -c` is insufficient: the pair legitimately appears
      in the declaration, comments, and role mappings, so the count must
      be stated per location.) State the finding as OBSERVED or the gap
      stays OPEN.
- [ ] GAP-090: verified against the integrated NF-WF-022 tree — the
      022A/022B shared-file coordination risk is resolved or still live,
      with the evidence cited.
- [ ] GAP-023: disposition explicitly preserves the no-consumer
      constraint; no implementation proposed.
- [ ] GAP-042: disposition states whether it remains unresolved (gates
      047B) with the exact-30 vs at-least-30 evidence cited.
- [ ] GAP-081/082: dispositions state whether the loader defect is
      confirmed as diagnosed-vs-worked-around (gates 047C's scope).
- [ ] No proposed closure lacks an exact receipt and resolved review.
- [ ] `git diff --check` clean on the report; all referenced paths and
      commits verified to exist at the baseline.
- [ ] Separate review of the exact submitted report by `047A-reviewer`;
      findings resolved before READY.

Record actual results separately from expectations. A gap inspected but
not classifiable is UNKNOWN, not closed.

## Migration and rollback

None. Documentation only. Reverted by a normal Git revert.

## Documentation and handoff

The implementer's handoff (appended "Audit report" section) includes:
the disposition table; per-gap evidence citations; the explicit checks
for GAP-084/090/042/081/082 with OBSERVED findings; a list of gaps left
UNKNOWN with reasons; the `git diff --check` result; and the checkpoint
below. Follow the MULTI-LLM-ORCHESTRATION.md handoff playbook. Unknowns,
blocked checks, observed-versus-inferred findings, risks, and the next
dependency-ready child are listed. Do not claim full platform completion.

**Checkpoint (Engram unavailable — GAP-021):** this section is the
fallback checkpoint. Last confirmed observation: baseline
`work/nf-wf047-external-follow-up` at `fe8e028`, verified via
`git log --oneline -1` before drafting. Contract status: DRAFT,
unreviewed, uncommitted. Next action: separate contract review, then
dispatch `047A-implementer` on READY.

**Explicit non-goals for the reviewer to check:** no production code
changes; no migration edits; no historical receipt rewriting; no
unsupported closures; no invented actor identities, test results, or
runtime observations; no GAP-098 recreation; no product-decision
disposal; shared records untouched.

## Audit report (implementer, 2026-10-07)

**Implementer:** separate subagent actor; backends MODEL_UNVERIFIED per
GAP-013. Source-only audit — no tests run, no production code touched,
no shared records modified. Baseline: branch
`work/nf-wf047-external-follow-up` at `fe8e028` (verified via
`git log --oneline -1`). Environment: Ubuntu 24.04.5 LTS
(`htch-runtime` 7.0.0-39-generic), node v24.20.0. Engram MCP
UNAVAILABLE at this boundary (GAP-021, re-observed — no session ID
invented or reused); this section is the fallback checkpoint.

**Method:** for each gap, the FULL entry (including later updates) was
read before interpreting the initial row. Every claim cites a file
path + line or commit. Classification: (a) real missing behavior,
(b) documentation debt, (c) host-specific observation,
(d) superseded/closable. "Superseded" applied conservatively: only
where a later verified receipt directly satisfies the original closure
check.

### Disposition table — explicitly required gaps

| Issue | Current source / receipt | Actual remaining work | Owner / dependency | Closure evidence or UNKNOWN | Class |
|---|---|---|---|---|---|
| GAP-013 (coding actor/model runtime evidence) | Register table row 80: OPEN / P2. Author chose Option B 2026-10-07 (restart 9Router gateway on Windows workstation himself); proof definition drafted then deleted per author request (handled on his local machine). | Author restarts gateway; coordinator dispatches probe with unique nonce; provider-dashboard reconciliation per the (author-held) proof definition. | Author (gateway + dashboard) + coordinator (probe) | UNKNOWN (no new evidence since 2026-10-07 decision) | (a) — blocked on author |
| GAP-014 (historical chronology attribution) | Register table row 81: OPEN / P2. | Attribute each receipt's date/commit to its source; label unresolved chronology explicitly; never invent dates. | M0 evidence maintenance | UNKNOWN | (b) |
| GAP-018 (dev-dump upgrade partial apply) | Register table row 85: OPEN / P2. Failure mechanism narrowed (partial apply strips two RESTRICT FKs); remedy correction recorded (no IF NOT EXISTS edit; forward repair only). | Reviewed transactional recovery procedure / forward repair migration; needs an authorized sanitized dump whose `_prisma_migrations` matches the repo set. | 047D (conditional on dump) | UNKNOWN | (a) |
| GAP-021 (runtime memory attribution) | Entry at `ISSUES-AND-GAPS.md:552`: "Resolved at the 2026-10-03 boundary" BUT binding is per-boundary. Re-observed at THIS boundary: no authoritative runtime identity; fallback checkpoint in this file. | None (per-boundary observation); continue fallback checkpoints until a boundary registers identity. | Host integration owner | N/A (observation, not closable by task) | (c) |
| GAP-023 (`domainEventSchema` no producer/consumer) | Register table row 92: OPEN / P3. NF-WF-002E (`tasks/NF-WF-002E-domain-event-producer.md`) PLANNED, blocked on consumer design. | Consumer design decision; then 002E implementation. No speculative outbox — constraint preserved. | NF-WF-002E (blocked) | UNKNOWN | (a) — blocked |
| GAP-027 (platform env policy) | Entry at `ISSUES-AND-GAPS.md:721`: VERIFY_PENDING. `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` exists with Ubuntu-native + Windows-reuse rules. | Host-specific receipt verifying the actual setup on the current host. | Environment coordinator | UNKNOWN | (b) |
| GAP-042 (`FIXTURE_REVISIONS = 30`) | Entry at `ISSUES-AND-GAPS.md:1180`: OPEN (documented limitation). Contract pins exact 30; fixture asserts `>= 30` (deviation recorded before workaround). | Contract amendment superseding exact-30 with at-least-30 (047B scope). | 047B | UNKNOWN | (a) |
| GAP-081 (`loadEnvFile` flaky in vitest) | Entry at `ISSUES-AND-GAPS.md:1801`: OPEN. Workaround in use (explicit `DATABASE_URL` export); root cause NOT diagnosed. | Diagnose why `process.loadEnvFile` intermittently fails (stale parent env? worker race?); smallest fix or standing note. | 047C | UNKNOWN | (a) |
| GAP-082 (DB password resets; loadEnvFile fails) | Entry at `ISSUES-AND-GAPS.md:1809`: OPEN. Workaround in use; root cause NOT diagnosed. | Same as GAP-081 (likely same loader defect). | 047C | UNKNOWN | (a) |
| GAP-084 (capability pair declared by 021B) | Entry at `ISSUES-AND-GAPS.md:1834`: OPEN. **OBSERVED**: `packages/auth/authorization.ts:71-72` declares the pair exactly once in the capability list (line 78 is a comment, not a declaration). Role mappings: OWNER both (via filter, lines 117-119; pair not platform-only per lines 65-70), ADMIN both (164-165), AUTHOR both (205-206), EDITOR read-only (238), VIEWER neither (244). 021A implemented (commit `1992ce4`); `CURRENT.md:195` records "capabilities verified (F1/Q7... no duplicate)". | None — NEXT ACTION (021A verifies on integration) satisfied. | Coordinator (apply closure) | **Proposed CLOSABLE**: receipt = `authorization.ts:71-72` + role mappings + 021A integration record; review = 021A implementer verification (CURRENT.md:195) + 021A diff review APPROVE_WITH_FINDINGS (commit `1992ce4` message) + current-code inspection (single declaration; integration diff introduces no second declaration) | (d) |
| GAP-090 (022A/022B shared files) | Entry at `ISSUES-AND-GAPS.md:1930`: OPEN. **Evidence**: parent chose the "single unit" commit option — one commit `d9c2e6f` ("NF-WF-022A/B/C endgame planning, debt and closure", 2026-10-07); 022A diff APPROVE_WITH_FINDINGS (F1 fixed); 022B diff APPROVE_WITH_FINDINGS (3 P3); changes additive/non-overlapping per the gap's own EVIDENCE section. | None — coordination risk resolved by the single-unit commit (no merge conflict possible). | Coordinator (apply closure) | **Proposed CLOSABLE**: receipt = commit `d9c2e6f` + both diff-review verdicts | (d) |

### Disposition table — other unresolved entries

| Issue | Current source / receipt | Actual remaining work | Owner / dependency | Closure evidence or UNKNOWN | Class |
|---|---|---|---|---|---|
| GAP-029 (definition-resolver duplication) | Register remedies table row 690: OPEN / P2. | Unify resolvers behind one implementation or add an explicit sync test. | Follow-up task (unassigned) | UNKNOWN | (a) |
| GAP-037 sub-entry: F3 full-lineage memory | `ISSUES-AND-GAPS.md:970`: OPEN (contract F3; Invariant 6 gates follow-up). | Follow-up task for model-assisted summaries + L5/L6 full-lineage memory. | Future task | UNKNOWN | (a) |
| GAP-037 sub-entry: intent-lifecycle (no consumer) | `ISSUES-AND-GAPS.md:982`: OPEN (behavioral no-op today). | Platform-wide intent consumption OR contract amendment describing the shipped model. | Future task | UNKNOWN | (a) |
| GAP-039 (SCALE policies never FAIL review) | `ISSUES-AND-GAPS.md:1035`: OPEN (documented limitation). | Define the SCALE assessment source (author-declared vs extracted). Product decision. | Author | UNKNOWN | (a) — author-owned |
| GAP-051 (screen-reader pass) | `ISSUES-AND-GAPS.md:1414` + update at 2101: OPEN, explicit release gate. | Human manual pass (NVDA/VoiceOver). | Human / author | UNKNOWN | (a) — blocked on human |
| GAP-063 (quota fields) | `ISSUES-AND-GAPS.md:1605`: OPEN (documented absence). | Decide: schema addition vs drop §6 requirement. Product decision. | Author | UNKNOWN | (a) — author-owned |
| GAP-036, GAP-065, GAP-077, GAP-088, GAP-108 (VM resets / env) | Various: WORKED AROUND / RESOLVED / recurring. | None (standing note); re-apply GAP-065 after each reset. | Host setup | N/A | (c) |

### Gating decisions

- **047B: PROCEED.** GAP-042 remains unresolved (OPEN, documented limitation; exact-30 claim not satisfiable through real service paths). The amendment must supersede exact-30 with at-least-30 without weakening the revision-attribution evidence.
- **047C: PROCEED.** GAP-081/082 are confirmed as **workaround-only, root cause undiagnosed** — the loader defect is NOT confirmed fixed, only bypassed by explicit `DATABASE_URL` export. 047C's scope is to reproduce and diagnose (or report the checked matrix if not reproducible).
- **047D: CONDITIONAL.** Blocked until an authorized sanitized dump is provided (GAP-018). Without it, output the precise missing-input receipt.
- **047F: PROCEED as proposal-only** after A (per workflow order).

### Proposed closures (for coordinator application)

1. **GAP-084 → CLOSED.** Receipt: `packages/auth/authorization.ts:71-72` (single declaration) + role mappings (OWNER/ADMIN/AUTHOR both, EDITOR read-only, VIEWER neither) + 021A integration record (`CURRENT.md:195`, commit `1992ce4`). Review: 021A diff review. The gap's NEXT ACTION is satisfied; no duplicate exists.
2. **GAP-090 → CLOSED.** Receipt: single-unit commit `d9c2e6f` + 022A/022B diff-review verdicts (both APPROVE_WITH_FINDINGS, findings addressed). The coordination risk (commit-time conflict) cannot materialize in a single commit.

### Unknowns

None. Every explicitly-checked gap was classifiable against a cited source. Gaps marked UNKNOWN above are "unknown closure evidence," not "unclassifiable" — their classification and owner are stated.

### Evidence limits

- Source-only audit: no runtime execution, no test re-runs. All "OBSERVED" claims are file/commit inspections at baseline `fe8e028`.
- GAP-013/051/039/063 dispositions depend on author/human actions outside this audit's reach; recorded as author-owned, never disposed.
- The GAP-084/090 closure proposals need the coordinator's separate application per the workflow (047A does not close gaps).

### Checkpoint (Engram unavailable — GAP-021)

Fallback checkpoint: audit complete 2026-10-07. Baseline `fe8e028`
verified. Report appended to `tasks/NF-WF-047A-gap-evidence-audit.md`
(uncommitted, per instructions). Next: `047A-reviewer` separate review
of this exact report, then READY. `git diff --check` clean (verified
below).
