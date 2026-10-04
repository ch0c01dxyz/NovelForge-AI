# Task NF-WF-002B: Clarify GAP-019 and review the revision foundation

Status: COMPLETE / APPROVED. Activated 2026-10-02
after NF-WF-002A returned its green receipts and an APPROVE review. Deliverable
written (`STORY-VERSIONING.md` §C12, `DATA-MODEL-BLUEPRINT.md`,
`ISSUES-AND-GAPS.md`); independent review of the exact documentation diff
returned **CHANGES_REQUESTED** with four findings, all confirmed against source
and all corrected; the re-review of the corrected §C12.3/§C12.6 and the three
follow-up contracts returned **APPROVE** against the then-current diff identity
`fd7ae2911a0aab9cfcf63c2b30fe38f06eeaf39a7c19434e5bbd14683e079760` (648 lines),
scoped by the reviewer to "changed regions re-read in the current tree; unchanged
regions unchanged by hash" rather than full line-by-line coverage. Acting on that
review's own note, a 3-removed/6-added hunk of §C12.6's reuse caveat was then
strengthened with the verified `captureSnapshot`-in-`else` mechanism, taking the
diff to `c60fef9c8244f2d66b5489de2c1259d7595c6862453336ca3fdf1b8b0990ac18`
(651 lines); the bounded re-review of exactly that delta returned **APPROVE** with
no overreach. Three post-approval edits to `ISSUES-AND-GAPS.md` were then
themselves reviewed: **CHANGES_REQUESTED** on one clause — a register row had
pinned the approval to a combined-diff hash that *includes that row*, which is
self-referential and stale the moment it is written — and the corrections took
the combined identity to `89edc9b9…` / 654 lines. The durable receipt is
therefore the **reviewed artifacts'** hashes, not a combined one:
`docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`,
`tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…` (an "as reviewed"
receipt — 002C is READY and its review-history section is appended on execution)
and `tasks/NF-WF-002D-mutation-head-expectation.md` `sha256 640f9698…`. Three
artifacts, not one, because three of the four findings' corrections landed outside
`STORY-VERSIONING.md`. None is a register file, so no register edit moves them. All
combined-diff hashes above are historical milestones, not current identities.
Reviewer identity is MODEL_UNVERIFIED (GAP-013 open); it verified the mechanism
but did not re-run the reuse test, so the greenness is this session's receipt.
Milestone: M1 / G-01. Capability: CAP-03.
Owner: coordinator/design author, requested `deepseek-v4.1-flash`;
independent reviewer, requested `glm-5.3-flash`. Record requested alias and
available backend evidence separately (GAP-013).
Baseline: record current HEAD and complete NF-WF-002 + 002A diff at execution.
Engram topic: `context/NF-WF-002B/<worktree>/coordinator`.

## Goal and required reading

Resolve GAP-019 against the reviewed C1–C11 contract, then obtain an independent
review of the exact final NF-WF-002 implementation and fixture repair. Read
STORY-VERSIONING's relevant contract sections, ADR-0014, NF-WF-002/002A,
GAP-019 and the actual `AdvanceHeadInput`, `advanceHead`, `createCheckpoint`,
checkpoint HTTP validation, `recordMutation`, restore code and their tests.
Inspect `packages/contracts/events.ts` and actual event producers before
asserting any runtime `revisionId` behavior. A nullable schema alone does not
prove the emitted value is always null. Do not reload unrelated specifications.

## Scope

Allowed writes: clarification sections of `docs/03-domain/STORY-VERSIONING.md`
and `docs/04-data/DATA-MODEL-BLUEPRINT.md`; this task and NF-WF-002's status;
`docs/implementation/{ISSUES-AND-GAPS,progress,test-matrix,decisions}.md`;
`docs/14-progress/CURRENT.md`. A new architectural decision requires a new ADR
and index entry, explicitly identified in the handoff before finalization.
Never silently change the accepted ADR-0014 or mark a proposal accepted.

All implementation, tests, schema/migrations, credentials, root constitutions
and historical receipts are read-only. Review may execute existing checks on
disposable databases. If clarification requires code changes, document exact
paths, behavior and regression checks in a new bounded task under `tasks/`;
do not implement the change during this documentation/review task.

## Questions and outputs

Produce an explicit disposition for each GAP-019 item:

1. Omitted versus null versus UUID `expectedHeadRevisionId`: specify service
   and HTTP behavior, distinguish omitted client expectation from the locked
   head CAS, and prove concurrency/refusal behavior. The current tri-state
   implementation is an observed choice, not automatically an accepted policy.
2. `checkpoint.create`: specify impact class, revision advancement, snapshot
   capture and invalidation behavior. Review LOW-with-checkpoint against the
   contract rather than endorsing it because current tests pass.
3. Checkpoint pinning: specify explicit checkpoint versus HIGH pre-mutation
   boundaries, the owning revision, snapshot contents and parent relationships;
   include a worked example consistent with restore and preserved history.
4. Event revision provenance: inspect producers; distinguish existing contract,
   implementation and future requirement. Keep events.ts read-only and assign
   any real remaining gap to an exact follow-up task. Do not claim it integrated.
5. Test naming: verify the current convention; close the non-conflicting naming
   subitem with file evidence without hiding unresolved semantic questions.

Output includes a concise contract addendum, source/diff references, separate
review disposition, and exact follow-up contracts for genuine implementation
gaps. Do not turn existing code into specification without assessing it against
the invariants. A semantic change invalidates the review tied to prior text.

## Acceptance, review and closure

- [x] Each item is supported, corrected or explicitly blocked; no silent default.
      All five GAP-019 items disposed in `STORY-VERSIONING.md` §C12.1–C12.5:
      three supported (tri-state, pinning, test naming), two corrected
      (`checkpoint.create` is HIGH; the "always `null`" event claim withdrawn),
      and one previously unowned requirement named as GAP-022.
- [x] Relative links, source symbols, worked examples and contract counts agree.
      Every C12 claim was checked against the service, route, classifier and
      schema it names; the four violating call sites in C12.6 were read in
      order rather than inferred. C12.3's worked example is marked aspirational
      for its `R45` step until GAP-024 is fixed.
- [x] Independent reviewer inspects the complete final implementation plus
      fixture diff, not only this clarification document or a worker summary.
      Dispatched against the exact diff identity (`sha256 a3ae218c…`, 607
      lines) with instructions to falsify each claim against source. Verdict
      **CHANGES_REQUESTED** with four findings, all confirmed against source
      and all corrected — see the review history in
      [NF-WF-002C](NF-WF-002C-premutation-ordering.md) and the NF-WF-002B
      progress entry. The reviewer verified all four HIGH call sites by reading
      them in statement order, and confirmed C12.1, C12.2, C12.3's pin logic,
      C12.4 and the "eight C3 HIGH rows" count with no finding. This is why the
      box existed: the review's value was that the **fix instruction** was
      wrong while the **defect** was real. The re-review of the corrected
      artifact returned **APPROVE** against the frozen
      `fd7ae2911a0aab9cfcf63c2b30fe38f06eeaf39a7c19434e5bbd14683e079760`
      (648 lines), with round-2 findings 6 and 7 resolved and none raised in
      round 3. Two hygiene lapses are recorded in the progress entry: the diff
      was edited under the open round-1 review (every superseded hash
      disclosed), and the round-2 message carried a stale hash pair in its
      first half that was raised and corrected. The reviewer's backend is
      **MODEL_UNVERIFIED**.
- [x] Review confirms atomic baseline/head/CAS, rollback on failed checkpoint,
      source pinning/restore refusal, durable rebuild intent and tenant checks.
      The review **refuted** one of these: the `PRE_MUTATION` snapshot is
      captured after the mutation's writes at four HIGH call sites, so the
      checkpoint an author restores from is not the pre-mutation state. That is
      GAP-024, recorded with measured probe evidence and handed to NF-WF-002C.
      The head CAS, its lock, the failed-checkpoint rollback, restore refusal on
      a missing baseline, the rebuild-intent uniqueness and the tenant checks
      were all confirmed as claimed. The reviewer additionally corrected two
      claims that had been wrong in the **other** direction: `applyRestore` is
      ordered correctly and was falsely named as violating, and the prescribed
      reordering was wrong because the status CAS is itself a covered write.
      Both are corrected in place.
- [x] Current API/package/constraint suites and root test gate pass with selected
      counts; lint/typecheck/build and empty/populated migration receipts are
      attributed to the reviewed diff and rerun where changes invalidate them.
      The 002B diff is three Markdown files, so no gate is invalidated and none
      was rerun for it. The receipts on the reviewed implementation, run
      immediately before these documentation edits: API `338 passed (338)`
      (15 files) exit 0; root `pnpm test` `796 passed | 1 skipped (797)`
      (38 files) exit 0; `pnpm lint` exit 0; `pnpm typecheck` exit 0. Recorded
      in `test-matrix.md` G-01 and the NF-WF-002A/002B progress entries.
- [x] GAP-018's scratch-only migration workaround is disclosed; no live database
      history is marked applied or repaired through this task. GAP-018 stays open
      with its own owner; 002B ran no migration and no database preparation, and
      no live history was touched. GAP-020 (stale `:5432` allocation) is likewise
      untouched and unchanged.
- [x] Unknown requested reviewer identity is reported as MODEL_UNVERIFIED;
      unavailable independent review is REVIEW_PENDING. Neither is fabricated
      into proof of the requested GLM backend. The reviewer was asked to report
      `MODEL_UNVERIFIED` if it cannot prove its backend, and its report does not
      claim the requested `glm-5.3-flash` backend — it reports no provable model
      identity, so **GAP-013 stays open** and no GLM receipt is claimed. The
      review is reported as an independent review by a harness worker of
      unverified backend identity.

Use NF-WF-002's existing verification commands and prerequisites. Only run
checks needed for the final diff; record exact commands/environment/results.
This task applies no migrations to live data and changes no production code.
Rollback is limited to the new documentation amendments; preserve earlier
history and review receipts. Close GAP-004, GAP-011 or GAP-019 only for their
verified scope; unresolved integration joins/events retain explicit ownership.

At acceptance, update parent status and G-01 with the exact evidence. The
coordinator may expand NF-WF-003 only after NF-WF-002's full criteria pass.
Save/confirm a runtime-bound Engram checkpoint or preserve a fallback in
existing progress; reference all remaining issue IDs.

## Handoff to NF-WF-002C / 002D / 002E

The clarification named three follow-ups rather than leaving them as prose:

- **NF-WF-002C** (`tasks/NF-WF-002C-premutation-ordering.md`, READY) — GAP-024.
  Production code change; the only one of the three that is dispatchable now.
- **NF-WF-002D** (`tasks/NF-WF-002D-mutation-head-expectation.md`, PLANNED) —
  GAP-022. Blocked on an author decision about request shape and route coverage.
- **NF-WF-002E** (`tasks/NF-WF-002E-domain-event-producer.md`, PLANNED) —
  GAP-023. Blocked on a consumer design; deliberately not to be built
  speculatively.

NF-WF-003 stays gated: parent NF-WF-002 / G-01 acceptance must either close
GAP-022 and GAP-024 or record them as accepted limitations. Silently advancing
past them would make the acceptance record false.
