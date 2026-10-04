# Task NF-WF-002C: Capture the PRE_MUTATION snapshot before the mutation writes

Status: **COMPLETE / APPROVED** 2026-10-02 — implementation and two-direction proof complete. Round-1 independent review returned CHANGES_REQUESTED (finding A hash-identity defect fixed, B refuted, C confirmed-by-probe and fixed); the round-2 re-review of the corrected tree `sha256 653a769d…` returned **APPROVE with no findings**. **GAP-024 is CLOSED.**
Milestone / capability IDs: M1 / G-01; CAP-03 (revision/checkpoint foundation).
Implementer role / requested and resolved model: requested
`deepseek-v4.1-flash`; record the requested alias and the available backend
evidence separately (GAP-013). Reviewer role / requested and resolved model:
requested `glm-5.3-flash`; same rule.
Baseline revision / local changes to preserve: record HEAD and the complete
NF-WF-002 + 002A + 002B working-tree state at dispatch. Preserve the dirty
implementation; this task edits production services for the first time since
NF-WF-002, so the baseline diff identity must be recorded before the first edit.
Engram checkpoint topic key / last confirmed observation reference:
`context/NF-WF-002C/<worktree>/implementer`; if the runtime supplies no
authoritative session identity, preserve the fallback handoff in this task and
`progress.md` per GAP-021 and write no agent-attributed checkpoint.

## Goal and reason

Make every HIGH mutation's `PRE_MUTATION` checkpoint hold the **pre**-mutation
image, so an author's "step back from this decision" operation actually steps
back. Today it holds the post-mutation image at four call sites and the
operation is a no-op — see GAP-024 and `STORY-VERSIONING.md` §C12.6 for the
measured evidence.

This is a correctness fix to a recovery promise, not a feature. The contract
already states the requirement in C4 ("Statement order is load-bearing") and in
`advanceHead`'s doc comment ("MUST be called inside the caller's transaction,
before the caller's own writes"); the code at four sites does not satisfy it.

## Required reading

- [Operating constitution](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) §9.
- [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [STORY-VERSIONING.md](../docs/03-domain/STORY-VERSIONING.md) **§C4**
  (statement order), **§C10** (worked mutation example, step 4) and **§C12.3 /
  §C12.6** (pinning rule and this defect).
- [ADR-0014](../docs/adr/ADR-0014-revision-checkpoint-model.md).
- The four violating call sites in full, plus `advanceHead`,
  `advanceForMutation` and `captureSnapshot` in
  `apps/api/src/services/revisions.ts`, and `applyRestore` in the same file.

## Dependencies and evidence

Depends on NF-WF-002 (IMPLEMENTED_WITH_GAPS) and NF-WF-002A (REVIEWED /
APPROVE). Active issue IDs: **GAP-024** (this task), GAP-013 (reviewer
identity), GAP-021 (Engram attribution). GAP-022 and GAP-023 are unrelated to
this change and must not be touched here.

## Scope

Allowed paths: `apps/api/src/services/{canon,planning,manuscript,revisions}.ts`
and the tests that cover them
(`apps/api/src/{canon,planning,manuscript,revision}.test.ts`), plus this task,
NF-WF-002's status, and
`docs/implementation/{ISSUES-AND-GAPS,progress,test-matrix}.md`.

Forbidden paths: every other production file; the schema, migrations and
lockfile; `.env`; the root constitutions; `packages/story-versioning` (its
classifier is already correct); historical receipts.

Inputs: the four call sites as they stand at the recorded baseline.
Outputs: the same four call sites with `advanceForMutation` called before their
first covered-table write; a payload-content assertion in `revision.test.ts`
that fails on the old ordering.
Out of scope: any change to the head CAS semantics, the pin values, the
revision numbering, the checkpoint HTTP shape, or `expectedHeadRevisionId`
(GAP-022). Out of scope: GAP-023's event producer.

## Exact writes per site (enumerated, so "first covered write" is unambiguous)

Enumerated by listing every `tx.<model>.<write>()` in each transaction body — not
by reading for the pattern. The implementer should confirm this list against the
code before starting, and report any write it missed.

| Site | Covered writes, in statement order | Advance must precede |
|---|---|---|
| `proposal.approve` (`canon.ts`) | `canonFact.updateMany` (supersede, `:1166`), `canonFact.create` (`:1179`), `canonFact.update` (link, `:1198`), `canonProposal.updateMany` (CAS, `:1213`) | the supersede |
| `outlineVersion.approve` (`planning.ts`) | `outlineVersion.updateMany` (supersede, `:580`), `outlineVersion.updateMany` (promote, `:586`) | the supersede |
| `outline.supersede` (`planning.ts`) | `outlineVersion.updateMany` (`:647`) | that update |
| `chapters.import` (`manuscript.ts`) | `chapter.create`, `chapterVersion.create`, `chapter.update` — per loop iteration (`:493-518`) | the first `chapter.create` |

Only two covered tables are involved across all four sites: `canon_facts` and
`canon_proposals` at the first, `outline_versions` at the middle two, `chapters`
and `chapter_versions` at the last. All are in `COVERED_TABLE_NAMES`
(`packages/story-versioning/snapshot.ts`). Advance-before-first-covered-write is
therefore sufficient at every site — there is no write outside those tables that
the capture would see.

**No fifth site exists.** C3 names eight HIGH mutation operations but only five
are implemented; the other three (`outline.bulkRewrite`, `branch.merge`,
`ai.bulkRewrite`) have no call site under `apps/api/src/`, verified by grepping
every `operation:` literal passed to `advanceHead`/`advanceForMutation`. The
fifth implemented one is `restore.apply`, which is already correct (invariant 4).

## Behavior and invariants

1. **The snapshot must describe the state before the mutation.** After the fix,
   a `PRE_MUTATION` checkpoint taken by any of the four operations must restore
   the pre-operation state when applied.
2. **The status CAS is itself a covered write, so it moves too.** The order is
   **advance → first covered write**, with no exception for the CAS.
   `canonProposal.updateMany` (`canon.ts:1213`) writes `canon_proposals` and
   `outlineVersion.updateMany` (`planning.ts:586`) writes `outline_versions`;
   both are in `COVERED_TABLE_NAMES` (`snapshot.ts:76`, `:94`), so a
   same-transaction capture sees them. Ordering the advance *after* the CAS
   yields a snapshot that is pre-mutation for `canon_facts` but **post**-
   mutation for `canon_proposals` — a partial fix that a `canon_facts`-only
   assertion passes. **An earlier draft of this contract said "CAS → advance →
   write"; that was wrong and is corrected here.**

   The race concern that motivated the old wording is unfounded: a CAS that
   loses throws **inside the same transaction**, so the rollback removes the
   checkpoint, revision, head move and snapshot together. Do not add an
   ordering constraint to protect a guarantee the transaction boundary already
   provides. If a precondition must run before the advance, it must be a
   **locked read** (`SELECT … FOR UPDATE`), never an `updateMany`.
3. **`chapters.import` loops.** The advance must move outside the per-part loop
   and run before the first `tx.chapter.create`, not once per part.
4. **`applyRestore` is already correct — do not touch it.** An earlier draft of
   this contract claimed it "has the same ordering". That was **false**:
   `advanceHead` is called at `revisions.ts:1070`, *before* the DELETEs at
   `:1095` and the re-inserts at `:1104`, and its own comment at `:1065-1069`
   states the intent. Moving that advance to "fix" it would introduce this very
   defect. It is listed here only so the implementer does not "fix" it by
   pattern-matching the four real sites.
5. **`canon.ts` cannot be hoisted naively.** The advance's `items` array names
   `fact.id` (`canon.ts:1241`), which does not exist until the fact is minted
   after the supersede. Hoisting the whole call above the supersede would
   reference an undefined id.

   The dependency is resolvable, and the reason is worth stating because it
   bounds the options: `advanceHead` reads `input.items` at exactly one point
   (`revisions.ts:355-364`, after the change set is created) and nowhere else.
   The snapshot capture (`revisions.ts:391`) never reads it. So the change-set
   items do **not** have to be known before the advance — but the *input object*
   is passed by value, so a restructure is needed either way.

   Options, in preference order:
   1. **Pre-generate the fact id.** `canon_facts.id` is
      `@default(dbgenerated("gen_random_uuid()"))`, so a caller-supplied UUID is
      permitted; pass `id: <uuid>` to `tx.canonFact.create` and name it in
      `items`. This keeps one advance call and one ordering. There is **no
      precedent** for an explicit `id` anywhere under `apps/api/src/services/`
      (checked), so verify Prisma 7.10 accepts it on this column before relying
      on it.
   2. **Advance with an empty/partial `items`, then append the fact item.** This
      needs only a small second write, **not a new export**: `changeSetId` is
      already a public field of `AdvanceHeadResult` (`revisions.ts:118`, returned
      at `:437`, and `advanceForMutation` returns that same type at `:453`), so
      the append is
      `tx.changeSetItem.createMany({ data: [...], changeSetId: head.changeSetId })`.
      Do not go looking for an export to add. This option is the only one that
      changes the *sequence* rather than the argument, so it must be reviewed
      hardest — but it is a smaller change than option 1's unproven assumption.
   3. Restructure the write sequence so the fact is minted before the advance.
      This collides with the supersede/insert/link FK ordering the code documents
      at `canon.ts:1040-1048` — that ordering was verified against PostgreSQL and
      must not be disturbed. **Not recommended.**

   **Say which you chose and why** in the handoff, with the receipt that the
   chosen one preserves the supersede → insert → link sequence. This is the one
   site where the fix is a design choice rather than a move.
6. **LOW operations must not change.** `createWithRevision` / `withRevision`
   writes then advances, which is correct because LOW captures no snapshot. Do
   not "fix" it.
7. **No new abstraction.** Do not introduce a helper that takes an ordering
   callback or an "advance-first" wrapper unless the four sites genuinely share
   one shape; a mechanical reordering at each site is the smaller diff.
8. Authorization, tenant checks, transaction boundaries and error mapping are
   unchanged.

## Acceptance and verification

- [ ] **The test that would have caught it.** `revision.test.ts` gains an
      assertion that the `PRE_MUTATION` snapshot's payload holds the
      **pre**-mutation rows — not merely that a snapshot exists with the right
      pin. It must fail against the old ordering and pass against the new one.
      Prove both directions and record both receipts.
- [ ] **The assertion covers every table the operation touches, not just one.**
      A `canon_facts`-only assertion passes against the *partial* fix described
      in invariant 2, because `canon_facts` is the one table the approval mints
      after the CAS. Assert `canon_proposals` too (the proposal is `PROPOSED`,
      not `APPROVED`, in the snapshot), and for `outlineVersion.approve` assert
      `outline_versions` (the version is `DRAFT`, not `APPROVED`). State in the
      handoff which tables each assertion covers.
- [ ] One assertion per fixed site (or one shared assertion exercised by all
      four) proving the checkpoint restores the pre-operation state:
      `previewRestore` reports the minted rows as `added`, and applying it
      removes them.
- [ ] The lost-race negative is still asserted: a concurrent decision that loses
      its CAS records no checkpoint and mints no canon.
- [ ] Full API suite, root `pnpm test`, `pnpm lint`, `pnpm typecheck` — exact
      commands, selected counts, exit codes, recorded. A zero-selected or
      skipped suite does not pass this gate.
- [ ] Independent review of the exact submitted diff; findings resolved before
      closure. Requested reviewer alias reported separately from backend
      evidence; `MODEL_UNVERIFIED` if unproven.
- [ ] `git diff` over the four service files recorded by hash before and after,
      so the change is attributable.

## Review history

Round 2 (same reviewer, 2026-10-02) returned **APPROVE**. Findings 6 (the
C12.3 off-by-one) and 7 (invariant 5 under-specified) were both confirmed
resolved against the current tree. Three things it verified rather than
accepted: `createNovel` mints the baseline as revision **1** (`platform.ts:410`),
so the five-operation `R42…R46` example is arithmetically sound; `captureSnapshot`
runs **only** in the `else` branch at `revisions.ts:391`, so GAP-024 cannot change
*which* revision a reused snapshot attaches to — only the image of a newly
created one, which is why the reuse test at `revision.test.ts:1127` stays green;
and `changeSetId` is already public on `AdvanceHeadResult` (`:118`), so option 2
below needs a second write and **not** a new export — corrected here. It also
confirmed `gate`/`gateProposal` are read-only and run before the transaction, and
that all four sites pass `expectedHeadRevisionId: undefined`, so moving the
advance changes no CAS comparison. Reviewer model identity: **MODEL_UNVERIFIED**
(environment reports `bansoskenari/deepseek-v4-1-flash`, a tier alias, not
backend proof — GAP-013 stays open).

Round 1 (same reviewer, 2026-10-02) returned **CHANGES_REQUESTED** against this
contract and against `STORY-VERSIONING.md` §C12.6, with four findings — all
confirmed against source before being accepted, none disputed:

1. The prescribed fix ("CAS → advance → write") does not fix the defect,
   because the CAS is a covered-table write. **Corrected** in invariant 2 and
   in §C12.6.
2. `applyRestore` is **not** affected — it advances at `revisions.ts:1070`
   before its deletes at `:1095`. Both this contract and §C12.6 claimed it was.
   **Corrected** in invariant 4 and in §C12.6; the false claim is recorded
   rather than quietly deleted, because a READY contract that names a correct
   site as violating is how a correct path gets broken.
3. §C12.3's worked example put a LOW revision between the explicit checkpoint
   and the HIGH mutation, which makes the reuse step unreachable — a LOW
   operation advances the head too. **Corrected**; the example now matches the
   shape `revision.test.ts:1127` actually exercises.
4. `NF-WF-002D` omitted the existing server-pinned `expectedHeadRevisionId`
   precedent in `applyRestore` (`revisions.ts:1014-1019`, `:1073`).
   **Corrected** there.

The reviewer also confirmed, with no finding: C12.1's tri-state, C12.2
(including the reword), C12.3's pin logic and `snapshots.revision_id @unique`,
C12.4's event withdrawal, the four-site table in C12.6, and the "eight C3 HIGH
rows" count. The finding that the *fix instruction* was wrong while the
*defect* was real is the useful shape: a correct diagnosis with an incorrect
remedy would have shipped a partial fix behind a passing test.

Two review-hygiene lapses are recorded rather than omitted. First, the reviewer
was dispatched against `sha256 a3ae218c…` and this diff was edited again beneath
it, ending at `fd7ae291…`; each superseded hash was disclosed, but the round-2
pass began against a tree that had moved. Second, the reviewer's round-2 message
carried a stale hash pair in its first half and the current pair in its second;
the mismatch was raised, and it confirmed the current values. Neither lapse
changed a finding, and the final APPROVE was re-issued against the then-current
`fd7ae291…` identity.

## Execution history (2026-10-02)

Baseline at dispatch: HEAD `811e7e68debdd7550b5516df96637d227d10fdf6`, branch
`main`, the NF-WF-002 + 002A + 002B working tree preserved untouched. Pre-edit
content hashes (sha256, first 16): `canon.ts 6adc01ed428fa51e`,
`planning.ts b7ffb279382d55ff`, `manuscript.ts 387f805d507f0486`,
`revisions.ts b0b25225fb71f0ba`.

### What changed

`advanceForMutation` now precedes the first covered-table write at all four
sites. `revisions.ts` was not touched — its hash is `b0b25225fb71f0ba`,
unchanged, confirming `applyRestore` (advance at `:1070`, deletes at `:1095`)
was correctly identified as already-ordered by round 1 and left alone.

| Site | File | Advance | First covered write |
|---|---|---|---|
| `proposal.approve` | `apps/api/src/services/canon.ts` | `:1149` | `:1226` supersede, `:1238` create, `:1273` status CAS |
| `outlineVersion.approve` | `apps/api/src/services/planning.ts` | `:589` | `:602` / `:608` |
| `outline.supersede` | `apps/api/src/services/planning.ts` | `:656` | `:667` |
| `chapters.import` | `apps/api/src/services/manuscript.ts` | `:492` | `:511` |

**The one non-mechanical edit.** `canon.ts` minted the new fact id in the
database and then used it to link the supersede, so the advance could not simply
move ahead of the insert. Rather than reorder supersede → insert → link (a
semantics change), the id is minted client-side: `const factId = randomUUID();`
(`:1130`), the supersede target captured as `const supersededFactId: string |
null = priorLive?.id ?? null;` (`:1135`), and `id: factId` passed first in the
create's `data`. `canon_facts.id` is `@default(dbgenerated(...))`, so an explicit
id is legal. The mutation order is unchanged.

### Two-direction proof (the acceptance criterion)

Each site gained a payload-content assertion — the thing C12.6 asked for and the
thing the original suite lacked — and each was proven to **fail against the old
ordering** and **pass against the new**. The old-ordering receipts were produced
by temporarily reordering the real production file, running the test, and
restoring it:

| Site | Test | Old-ordering failure |
|---|---|---|
| `proposal.approve` | `revision.test.ts:550` | `expected [ …(2) ] to deeply equal [ Array(1) ]` — `canon_facts` held 2 rows, not 1 |
| `outlineVersion.approve` | `planning.test.ts:499` | `"…:APPROVED"` where the pre-image requires `"…:DRAFT"` |
| `outline.supersede` | `planning.test.ts:516` | `"…:SUPERSEDED"` where the pre-image requires `"…:APPROVED"` |
| `chapters.import` | `manuscript.test.ts:425` | `payload["chapters"]` was 2 rows, expected `[]` |

Two receipts had to be redone. The first `outline.supersede` revert inserted the
advance after `return result;`, making it dead code; the test then failed with
`findFirstOrThrow` "no record found", which proves nothing about payload
ordering. The first `chapters.import` revert placed the block outside the
transaction. Both were recognized as invalid receipts and redone inside the
correct position; only the redone runs are cited above.

### Test changes beyond the assertions

- `revision.test.ts` fixture now genuinely supersedes *and* mints (same subject
  and predicate as the live fact, different object, `validFromChapter` supplied),
  so both covered tables change and the assertion cannot pass on an unchanged
  payload.
- The parked-lock test's mutation was raised from LOW to HIGH, because a LOW
  advance captures no checkpoint and "the loser records no checkpoint" would then
  be true for a reason unrelated to the CAS.
- `planning.test.ts` applies a restore, not only a preview: the approve leaves
  row identities unchanged, so preview counts would be zero either way and prove
  nothing about the image.

### Gates (all green)

`revision.test.ts` 25 passed (25); `planning.test.ts` 8 passed (8);
`manuscript.test.ts` 21 passed (21); API suite 15 files, 338 passed (338); root
`pnpm test` 38 files, 796 passed | 1 skipped (797); `pnpm lint` exit 0;
`pnpm typecheck` exit 0. Every run used `DATABASE_URL` inline; `.env` was not
modified. Test databases are disposable by construction (each suite drops and
recreates its own in `beforeAll`).

### Diff identity

Frozen before dispatch. **The hash first recorded here
(`b91e5287…` / 1039 lines / "six files") did not reproduce — the diff command
silently omits the untracked `revision.test.ts`, so it hashed a five-file
artifact.** Reproduced identities: 5-file `dcba80ed…` (1037), 6-file with
`git add -N` `d66c0aea…` (2295). After the finding-C comment fix, the current
identity is **2301 lines, `sha256
653a769dff4a3dbf3161ddb158f8f03844d863eb8c25fd852f9a4608afbf3eff`**. Post-edit hashes (sha256,
first 16): `canon.ts 1658101e7d9ee050`, `planning.ts aad03c6563173b17`,
`manuscript.ts 5ff4e50b24b36ea6`, `planning.test.ts 57a6c97b200da99d`,
`manuscript.test.ts 22585f1cb1b8af78`, `revision.test.ts 6c739d79e90bcea4`
(finding-C comment fix; `e843ee196aa72634` before it).
`canon.test.ts c08e95e7e97bce7f` unchanged.

### Independent review of the execution diff

Dispatched against the frozen hash with seven numbered falsification items:
(1) advance-before-first-covered-write at each of the four sites; (2) no fifth
violating HIGH site and `restore.apply` not broken; (3) supersede → insert →
link preserved and the client-minted `id: factId` legal; (4) each new assertion
load-bearing rather than tautological; (5) the lost-race negative non-vacuous;
(6) nothing outside the six allowed files changed; (7) no new
correctness/security/data-loss problem. The reviewer's alias
is reported separately from backend evidence; `MODEL_UNVERIFIED` (its
environment self-reports a tier alias), so GAP-013 stays open.

**Round 1: CHANGES_REQUESTED**, with items 1, 3, 5, 7 CONFIRMED on inspection,
item 2 CONFIRMED in conclusion (the reviewer disputed the *enumeration*, not the
ordering claim), item 6 NOT_CHECKED (the frozen hash it was given did not
reproduce, so it could not delimit the diff), and item 4 CONFIRMED with one
scope overstatement. Three findings; the reviewer then crashed mid-report
(gateway `insufficient_balance`), so finding C is reconstructed from its
truncated message and independently verified:

- **A (blocker) — the frozen artifact does not reproduce: CONFIRMED, fixed in
  the records.** `b91e5287…` was a misrecording; the command silently dropped
  the untracked `revision.test.ts` and hashed a five-file diff. See the corrected
  Diff identity section above. The reviewer's own reproductions (1037 /
  `dcba80ed…` for five files, 2295 / `d66c0aea…` for six) match.
- **B — "the docs call the HIGH set eight, it is nine": REFUTED.** The doc at
  `STORY-VERSIONING.md:760-764` deliberately distinguishes the nine-entry HIGH
  set from "the eight mutation operations already in that class" and excludes
  `checkpoint.create` from the latter by name ("it is not one of them: it writes
  no covered table"). "Eight" is the count of mutation operations, not the set
  size.
- **C — a `revision.test.ts` comment claims the `canon_proposals` pair is "the
  assertion the CAS-ordering half of the fix needs": CONFIRMED by probe, fixed.**
  Moving the advance to just before the CAS (after the supersede and the mint)
  left the proposals pair green — the CAS writes `canon_proposals` only after
  the advance in that shape, so the payload genuinely held the pre-CAS row.
  What caught that shape was the `canon_facts` pair (the mint would be in the
  image) and the `removed` count. The comment now says exactly that. Probe
  receipt: partial-fix ordering placed the advance at `canon.ts:1252` (after
  the supersede at `:1205` and the mint at `:1217`, before the CAS at `:1273`);
  the test failed at `:550` (`expected [ …(2) ] to deeply equal [ Array(1) ]`)
  and, with the facts pair disabled, at the `removed` count (`expected +0 to be
  1`) — the proposals pair passed in both runs. Restored and re-verified green
  25/25.

**Round 2: APPROVE, no findings.** The re-review of the corrected tree
(`sha256 653a769d…`, 2301 lines, six files — `git add -N` first) reproduced the
identity exactly (2301 lines, same hash) and CONFIRMED all eight falsification
items: advance-before-first-covered-write at all four sites; no fifth violating
HIGH site and `restore.apply` intact (`revisions.ts` unchanged, `b0b25225…`);
supersede → insert → link order preserved with the client-minted `id: factId`
legal (`schema.prisma:1178`); every new assertion load-bearing (planning and
manuscript assertions fail under an advance-after ordering, the corrected
`revision.test.ts:552-559` comment matches the round-1 probe); the lost-race
negative non-vacuous (count assertions on checkpoint/snapshot/revision, the
timer only proving the loser is still parked); exactly the six named files in
the diff; and every losing-CAS/conflict throw inside its transaction so
rollback removes checkpoint, revision, head move and snapshot together.
Reviewer backend MODEL_UNVERIFIED (its environment self-reports a routing
alias), so GAP-013 stays open. **GAP-024 CLOSED 2026-10-02.**

### Engram checkpoint (GAP-021, re-observed)

The SessionStart/compact hook reported no authoritative registered runtime
identity and instructed that agent-attributed memory writes stop until the host
re-registers. No Engram checkpoint was written at this boundary and no session ID
was invented, derived or reused. This section and the `progress.md` entry are the
fallback handoff.

## Migration and rollback

No schema change and no migration. Existing `PRE_MUTATION` checkpoints already
written under the old ordering remain post-mutation images; they are **not**
repaired or deleted by this task, because rewriting a historical snapshot is a
destructive act. Record that limitation in the handoff and in GAP-024's closure
note. Rollback is `git revert` of the four service hunks plus the test change.

## Documentation and handoff

Update `STORY-VERSIONING.md` §C12.6 to state that the defect is fixed (the
section is the defect's record; annotate it rather than deleting it) and
`§C12.3`'s worked example, which C12.6 marks as aspirational for `R45` until
this lands. Close GAP-024 only with the two-direction test receipt and the
review verdict. Update G-01 and parent NF-WF-002 status with the exact evidence.
Save a runtime-bound Engram checkpoint or preserve the fallback handoff per
GAP-021. Reference GAP-013, 017, 018, 020, 021, 022, 023.
