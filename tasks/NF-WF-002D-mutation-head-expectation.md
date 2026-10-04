# Task NF-WF-002D: Mutation-level optimistic concurrency (client head expectation)

Status: **IMPLEMENTED / REVIEWED** 2026-10-04 (review APPROVE on production
code; one test-fidelity defect found, fixed and re-reviewed — see "Independent
review"). The blocking author decision is recorded in
`docs/implementation/decisions.md` ("NF-WF-002D mutation head expectation —
2026-10-03") and resolved below. Execution ownership is resolved by the author's 2026-10-03 follow-up: the
current DeepSeek session implements directly. The author subsequently confirmed
that only DeepSeek is active; at the time GLM was believed unavailable. That
premise was later found stale — GLM became reachable through the 9Router
gateway and the separate review ran on 2026-10-04 (see "Independent review").
No new permission question or separate implementation dispatch is required.
Read the amended contract at the next safe boundary before editing.
Milestone / capability IDs: M1 / G-01; CAP-03.
Implementer owner: the author's current Claude Code session, selected as
`deepseek-v4.1-flash`. This is the requested/configured alias, not backend proof.
Continue in that session; do not spawn a duplicate implementation writer.
Reviewer owner: one separate review actor, requested `glm-5.3-flash`, through
the existing supervised Orca workflow when available. The review was dispatched
2026-10-04 via the 9Router gateway (`bansosmontera/glm-5.3-flash`) and completed;
the requested id is proven by the gateway's echoed `model` field, the serving
backend is not (GAP-013). Route/backend evidence is recorded under "Independent
review" and in GAP-013. Implementation self-checks do not replace separate
review; NF-WF-002F still performs the parent acceptance against the tree.
Baseline revision / local changes to preserve: record at dispatch.
Engram checkpoint topic key: `context/NF-WF-002D/<worktree>/implementer`.

## Goal and reason

Make C4's stated recovery path reachable for mutations. Today only
`POST …/checkpoints` accepts a client head expectation; no C3 mutation route
does, so a caller cannot state the head its plan was built against and the
server can never detect a plan built on a stale head. C4's rationale — "the
caller re-reads rather than silently retrying, because a silent retry would
apply a plan built on a stale head" — is therefore unimplementable end to end.

The head CAS as implemented is real and tested, but it protects *internal*
consistency (atomic number allocation, no lost revision, no torn interleave).
This task is about *mutation-level* optimistic concurrency, which is a
different guarantee. See `STORY-VERSIONING.md` §C12.1 and GAP-022.

## Existing precedent to build on (do not re-invent)

`applyRestore` **already** carries an `expectedHeadRevisionId`, server-pinned
rather than client-supplied: `advanceHead` is called with
`expectedHeadRevisionId: preview.headRevisionId` (`revisions.ts:1073`). That is
the pattern to generalise — the mechanism exists and is tested; what is missing
is the *client-supplied* form on mutation routes.

Note the shape carefully, because it is **not** a single check. There are two:
an unlocked pre-check and the locked CAS.

- **Pre-check, outside the transaction** (`revisions.ts:1014-1019`):
  `readHeadRevisionId(db, novelId)` uses the `db` client, not `tx`, and runs
  before `db.$transaction` opens at `:1021`. It refuses a moved head with a 409
  *before any write*, so a stale plan does no work. It is advisory: the head can
  move again between this read and the lock.
- **The authoritative CAS, inside the transaction** (`:1073`): the same value is
  passed to `advanceHead`, which re-reads the head under
  `SELECT … FOR UPDATE` and compares again.

The author decision adopts both: the pre-check is advisory and avoids
unnecessary transaction work; the locked CAS is authoritative. A pre-check-only
implementation is racy. A locked mismatch inside the same transaction must
roll back all writes; it does not imply partially committed state. 002C already
places advancement before the first covered write. Keep that ordering. Do not
reopen the resolved two-part decision or silently retry a stale plan.

## Author decision (resolved 2026-10-03)

Recorded in `docs/implementation/decisions.md` with the rejected alternatives.
Summary:

1. **Routes: the HIGH operations only** — `proposal.approve`,
   `outlineVersion.approve`, `outline.supersede`, `chapters.import`. The set is
   derived from `impactFor(operation) === "HIGH"`, not hand-maintained, so it
   cannot drift from C3's own classification. `restore.apply` keeps its
   server-pinned form and is unchanged.
2. **Shape: a body field** `expectedHeadRevisionId: uuid.nullable().optional()`,
   exactly the frozen §C12.1 tri-state and exactly `revision-routes.ts:34`.
   No `If-Match` header: no encoding/mapping of the tri-state through that
   interface is specified here. Reuse the accepted body schema; do not claim
   an HTTP header is inherently incapable of representing equivalent semantics.
3. **Recovery: re-read and abandon**, per C4. The 409 body gains
   `currentHeadRevisionId`, which requires extending the app-wide
   `ConflictError` mapping (`platform-routes.ts`) — currently the body carries
   only `{ error: "CONFLICT" }` and the message is dropped.
4. **Compatibility: coexist.** `chapter.save`'s per-chapter `expectedVersion`
   stays and is unchanged; it guards prose, the head guards a plan. Neither
   subsumes the other.

Both halves of `applyRestore`'s mechanism are adopted: the unlocked pre-check
before any write **and** the locked CAS inside `advanceHead`.

## Scope

Allowed paths, fixed after the decision:

- `apps/api/src/services/canon.ts` — `approveProposal`
- `apps/api/src/services/planning.ts` — `approveOutlineVersion`,
  `supersedeApprovedOutline`
- `apps/api/src/services/manuscript.ts` — `importChapters`
- `apps/api/src/canon-routes.ts`, `apps/api/src/planning-routes.ts`,
  `apps/api/src/manuscript-routes.ts` — the four bodies
- `apps/api/src/services/platform.ts` + `apps/api/src/platform-routes.ts` —
  the `ConflictError` 409 body (decision 3)
- `apps/api/src/services/revisions.ts` — add typed head metadata only at
  head-mismatch throw sites in `advanceHead` and `applyRestore`; the comparison,
  lock, revision allocation, checkpoint ordering and restore behavior stay intact
- `apps/api/src/canon.test.ts`, `apps/api/src/planning.test.ts`,
  `apps/api/src/manuscript.test.ts`, `apps/api/src/revision.test.ts`,
  `apps/api/src/services/platform.integration.test.ts` — affected HTTP,
  concurrency, authorization and error-compatibility checks
- `docs/03-domain/STORY-VERSIONING.md` — affected C4/C12.1 descriptions;
  this task; `docs/implementation/{ISSUES-AND-GAPS,progress,test-matrix,decisions}.md`;
  `docs/14-progress/CURRENT.md` — actual receipts and handoff

Forbidden: all other paths; changes to the head CAS comparison/lock semantics,
snapshot ordering, schema/migrations, dependencies, credentials and root
constitutions. The narrow metadata-only allowance above is not authorization
to refactor the revision service or repair unrelated conflicts.

Out of scope: GAP-023 (event producer) and GAP-024 (snapshot ordering, owned by
NF-WF-002C).

### Resolved request and error contract

All four authorized HIGH routes accept the optional body field; none may be
silently excluded. For `proposal.approve`, resolve `novelId` from the existing
`gateProposal` result (`proposal.entity.novelId`), after authorization, never
from an unchecked client novel id. This existing source path resolves the URL
shape question without a new author decision. Keep empty-body compatibility
on approval/supersede routes by parsing `request.body ?? {}`. Import still
requires its existing text/format fields. Supersede still returns 204.

Preserve the exact omitted/null/UUID value through HTTP schema, service input,
pre-check and `advanceForMutation`; do not replace null with undefined through
`??`. Reuse `AdvanceHeadInput`, `readHeadRevisionId` and the existing boundary.
The proposed addition to `ConflictError` is optional typed metadata containing
`currentHeadRevisionId: string | null`. Existing one-argument calls stay valid.
Only genuine head-expectation mismatches populate it. Generic slug/status,
missing-baseline, unsupported-scope and chapter-version conflicts preserve
`{ error: "CONFLICT" }`; never parse the error message to derive identifiers.

Both pre-check and locked mismatch return `{ error: "CONFLICT",
currentHeadRevisionId: <observed UUID or null> }` through the existing handler.
The field is the head observed at refusal, not a guarantee it remains current.
Do not perform another unlocked read after rollback to replace that evidence.
Existing checkpoint/restore head-mismatch sites gain the same typed metadata;
other refusals do not gain fabricated values. Authorization/tenant gates run
before any head disclosure, including a proposal belonging to another tenant.

Record an inventory of existing HIGH operations: four new client assertions,
restore's server pin, checkpoint's existing client assertion, and three
classified operations with no production route yet. Compare classification
with `impactFor` and source call sites. This is a coverage inventory, not an
automatically generated HTTP route system; future mutation tasks must update
it when adding a route. Do not add endpoints for the three absent operations.

## Behavior and invariants

- An omitted expectation must keep behaving exactly as it does today: the lock
  still runs, no comparison is made. This task adds an *optional* assertion; it
  must not make the expectation mandatory and must not break existing callers.
- A mismatch must be a 409 with no partial write, on every route that accepts
  one — asserted per route, not once for a representative route.
- The route set is derived from `impactFor(operation) === "HIGH"`, not
  hand-listed. **Phrased correctly, the invariant is: every HIGH operation that
  has a mutation route carries the expectation.** It is *not* "the set of
  routes carrying it equals the HIGH set" — that assertion would fail today,
  because three HIGH operations (`outline.bulkRewrite`, `branch.merge`,
  `ai.bulkRewrite`) have no call site and no route anywhere in `apps/api/src`
  (verified 2026-10-03: no service or route references them; they are
  classified in `impact.ts` because C3 names the operation class, exactly as
  `scene.crud` is). The test asserts the implication, not the equality, so it
  stays true as those three routes land.
- A head-expectation mismatch carries typed `currentHeadRevisionId`; assert
  both pre-check and locked-race paths, plus existing checkpoint/restore head
  mismatches. Other conflicts remain unchanged; no tenant identifiers leak.
- Authorization and tenant checks are unchanged and are not delegated to the
  expectation.
- The expectation is a client assertion, never an authorization decision.

## Acceptance and verification

- [x] The chosen shape is recorded in `decisions.md` with the rejected
      alternatives. (Done 2026-10-03.)
- [x] Each of the four routes has a mismatch test asserting 409, no partial
      write, and an unchanged head. (`HIGH_ROUTE_CASES` × "409s a plan built on
      a stale head" — `revision.test.ts:1447`.)
- [x] Each such route has a match test asserting the mutation commits.
      ("commits when the expectation matches the head", `revision.test.ts:1426`.)
- [x] The tri-state is asserted per route, and the assertion is written from
      §C12.1 rather than from the implementation. `undefined` → commits
      (`:1437`); a uuid → compares (`:1426` match, `:1447` mismatch); `null` →
      409 against a baselined novel (`:1472`), with the head read from the
      branch row first (`expect(await headRevision(f)).toBe(r.head)`) rather
      than assumed. `undefined` and `null` stay distinguishable: the `send`
      helper spreads `=== undefined ? {} : {…}`, so an omitted field is absent
      from the payload and an explicit `null` is sent as `null`.
- [x] The 409 body carries `currentHeadRevisionId`, asserted on the four new
      routes (`:1447`, `:1472`) and on the two existing ones (`:684`
      checkpoint.create, and the restore-moved-head case at `:1085`).
- [x] A stale-plan scenario is tested end to end: the plan is built against
      `staleHead` (R_n), another mutation (`createEntity`) moves the head to
      `currentHead`, then the plan is applied and the 409 is observed — per
      route (`:1447`).
- [x] A no-partial-write assertion that fails against a pre-check-only
      implementation. A **per-route** locked-CAS probe (`:1506`) parks a second
      connection holding the head move, waits on `pg_stat_activity` until the
      request's transaction is actually parked on a lock, then releases and
      asserts the 409. **Falsified on all four routes:** with `advanceHead`'s
      locked comparison disabled (`if (false && …)`) each failed with its own
      success payload — `proposal.approve` 200, `outlineVersion.approve` 200,
      `outline.supersede` 204, `chapters.import` 201 — i.e. a pre-check-only
      build commits every one. Restored, all four pass. Each probe also asserts
      unchanged covered state, revision/checkpoint/snapshot counts and
      winner-attributed rebuild intents.
- [x] Empty-body callers remain compatible (approve/supersede parse
      `request.body ?? {}`; omitted-commits tests pass); malformed expectation
      is 400 (`:1493`); generic 409s remain unchanged (C5/missing-baseline/
      uncovered-table tests assert bare `{ error: "CONFLICT" }`); denied and
      cross-tenant callers expose no head (`:1606`, outsider 404 / viewer 403,
      body has no `currentHeadRevisionId`).
- [x] Existing suites, root `pnpm test`, lint and typecheck pass with selected
      counts recorded. See "Submission" below.
- [x] Independent review of the exact submitted diff. **DONE 2026-10-04** —
      APPROVE on the production change; one MAJOR test-fidelity defect found,
      fixed, re-falsified and re-reviewed to APPROVE. See "Independent review"
      below. This does not unlock NF-WF-002F by itself: the parent acceptance
      verifies against the tree.

### Commands and prerequisites

Use a confirmed disposable test DB and no concurrent database owner. Verify
GAP-018/020 prerequisites; never reset live data or print DATABASE_URL secrets.

```text
pnpm --filter @novelforge/api exec vitest run src/canon.test.ts src/planning.test.ts src/manuscript.test.ts src/revision.test.ts src/services/platform.integration.test.ts
pnpm --filter @novelforge/story-versioning test
pnpm --filter @novelforge/api exec vitest run
pnpm lint
pnpm typecheck
pnpm test
```

Record current selected counts/skips. Use forced interleaving to move the head
between pre-check and locked CAS; cover all four routes and assert unchanged
covered state, revision/checkpoint/snapshot counts and loser-owned intents.
Do not mistake the winning concurrent mutation for a loser side effect.

## Migration and rollback

No schema migration: the change is additive request/error metadata. A rollback
may ignore an unfamiliar field or lack body validation; the current affected
schemas are `z.object`, not strict parsers. Do not promise a 400 or continued
stale-plan protection on the older server. Restore the prior client/server
capability together, disclose loss of the optional assertion and verify actual
legacy behavior. The lock, chapter-version guard and snapshot ordering remain.
Clients must re-read state rather than interpreting absent metadata as success.

## Resume after the earlier DeepSeek decision checkpoint

The earlier saved decision remains evidence of the chosen four-route scope,
body tri-state and compatibility policy. It predates this task correction and
is not permission to use the old scope/error/rollback prose. Reopen this file,
current Git state and GAP-025 before continuing. Keep the implementation writer
in the author's current session and obtain a separate reviewer at submission.
No current route may be silently excluded because its URL lacks novelId.

Update the relevant Engram task checkpoint after verifying these amendments.
Correct the earlier LOW/self-contradictory, locked-partial-write and strict-400
rationales; preserve the actual HIGH-only decision and its history. Use only
that session's current hook-confirmed identity, never an ID copied from the
quoted receipt. If no identity is confirmed, retain the progress fallback.
The earlier saved 24-call-site inventory also needs reinspection against
current source; a memory count is not a live coverage test.

## Documentation and handoff

Update `STORY-VERSIONING.md` §C12.1 and C4 to name the four routes that carry
the expectation, and close GAP-022 only with the per-route negative receipts.
Update G-01 with the exact evidence, then hand off to
[NF-WF-002F](NF-WF-002F-foundation-acceptance.md). D's green suite is not parent
acceptance. This 2026-10-03 task amendment changes the earlier reviewed D
artifact; keep its old review hash as historical and review the amended
contract/implementation at the next submission boundary.

**GAP-021 note:** the Engram runtime binding was **present** at this
2026-10-03 boundary (the SessionStart hook registered session
`5ff5313c-d745-4a35-aecf-b34f4ce795d6`), unlike the 002A/002B/002C boundaries
where it was absent. The 002D checkpoint is therefore written through MCP and
GAP-021 should be re-scoped to a per-boundary observation rather than a standing
"Engram unavailable" state. If the binding is absent at execution time, fall
back to the `progress.md` handoff per GAP-021.

**Execution-boundary correction (2026-10-03).** The ID above is the
*preparation* boundary's and is historical. At the implementation boundary the
hook registered a **different** authoritative identity,
`0238856e-21de-4b68-8644-f604cad2d10f`; the implementation checkpoint was written
under that one and the `5ff5313c…` ID was not reused. This confirms the
per-boundary reading: neither presence nor the ID carries across a boundary.

## Submission — 2026-10-03 (implementer: the author's current [CC] session, `deepseek-v4.1-flash`)

Status **IMPLEMENTED / REVIEWED**. Implementation is complete, every required
check passes, and an independent GLM review has run (see "Independent review"
below). One review finding was a real test-fidelity defect; it is fixed and
re-falsified. See the review section for what the verdict does **not** cover.

### Checks actually run

All commands executed with `DATABASE_URL` pointed at the scratch PostgreSQL
`127.0.0.1:5433` (GAP-020); the repo `.env` was not modified.

```text
$ pnpm --filter @novelforge/api exec vitest run \
    src/canon.test.ts src/planning.test.ts src/manuscript.test.ts \
    src/revision.test.ts src/services/platform.integration.test.ts
 Test Files  5 passed (5)
      Tests  145 passed (145)

$ pnpm --filter @novelforge/story-versioning test
 Test Files  1 passed (1)
      Tests  17 passed (17)

$ pnpm --filter @novelforge/api exec vitest run
 Test Files  15 passed (15)
      Tests  365 passed (365)

$ pnpm lint
 (eslint . — clean, no output)

$ pnpm typecheck
 apps/api typecheck: Done   (all 15 workspaces Done)

$ pnpm test
 Test Files  38 passed (38)
      Tests  823 passed | 1 skipped (824)
```

The single skip is pre-existing and unrelated to this task.

### The locked-CAS probe, falsified

The contract asks for a no-partial-write assertion that *fails against a
pre-check-only implementation*, covering all four routes. The four per-route
probes at `revision.test.ts:1506` were run against a deliberately broken build
(`advanceHead`'s locked comparison disabled with `if (false && …)`) and each
failed with its own route's success payload:

```text
{"canonFactId":…,"supersededFactId":…}: expected 200 to be 409   proposal.approve
{"id":…,"status":"APPROVED",…}: expected 200 to be 409           outlineVersion.approve
null: expected 204 to be 409                                     outline.supersede
{"created":1}: expected 201 to be 409                            chapters.import
```

The pre-check passed on every route (it read the last committed head), the
mutation committed, and only the locked comparison refuses it. With the
comparison restored all four pass. This is what separates the probes from a test
that merely exercises the pre-check.

### Exact-diff handoff for review

Frozen at this submission boundary. Review the working tree against the frozen
dispatch baseline `5b5f139`.

- Full tree patch — tracked diff from `5b5f139` plus untracked files, 11120
  lines, **re-verifiable** (this task file is excluded from both halves: it
  carries the receipt, and citing a hash from inside the hashed content has no
  fixed point):
  `sha256 f857982bab6e9fd71d29e254f61c20a2358fd8707aa26027b2b90f7d79ccd4ca`

  **What this receipt covers, and what it does not.** It is the current working
  tree, i.e. the reviewed code *plus* the 2026-10-04 documentation sweep that
  recorded the verdict (`progress.md`, `DELIVERY-PLAN.md`, `ISSUES-AND-GAPS.md`,
  `CURRENT.md`, `test-matrix.md`, `decisions.md`). It is 11120 lines both before
  and after that sweep's last edits, which is the second check that only prose
  moved. The code hashes below are
  unchanged from the reviewed submission — the doc edits moved the combined
  receipt, not the diff that was reviewed. A reviewer re-verifying the verdict
  should use the per-file hashes; the combined receipt only pins this tree.

Re-verify with exactly this, which reproduces the value above:

```sh
T=tasks/NF-WF-002D-mutation-head-expectation.md
{ git diff 5b5f139 -- . ":(exclude)$T"
  git ls-files --others --exclude-standard | grep -v -F -x "$T"     | while read -r u; do git diff --no-index --binary /dev/null "$u" || true; done
} 2>/dev/null | sha256sum
```

**Why this changed (2026-10-04).** Twice, for two different reasons, and the
distinction matters.

*First*, from `sha256 c5d19fba…` / 10964 lines to `9757baa4…` / 10991: the
independent review found a real defect in the locked-CAS probe and the fix
edited `revision.test.ts`. The per-file hash moved with it
(`0568598997ccc3b4` → `7de0485ec0266dce`), and 10964 + 27 = 10991 is consistent
with that being the only code change.

*Second*, from `9757baa4…` / 10991 to `f857982b…` / 11120: **no code changed.**
This is the documentation sweep that recorded the review outcome — the task
file's own status lines are excluded, but `progress.md`, `DELIVERY-PLAN.md`,
`ISSUES-AND-GAPS.md`, `CURRENT.md`, `test-matrix.md` and `decisions.md` are
tracked and therefore inside the receipt. Every per-file code hash below is
byte-identical to the reviewed submission, which is the check that proves it.

Neither old hash is re-verifiable now, because the tree it hashed no longer
exists in that form — which is the general reason a combined-diff receipt is a
milestone, not a standing identity.

**Trap, recorded because it bit this receipt twice.** Do not write the patch to
a file inside the repository and then hash it: that file is itself untracked, so
the next `git ls-files --others` sweep folds it into its own input and the count
inflates (observed: 10991 → 16414 in a run that wrote `.full.patch` at the repo
root). Keep the pipeline a pure pipe to `sha256sum`, or write the file outside
the work tree. The `":$T"` and `":(exclude)$T"` pathspecs were compared rather
than assumed: both exclude the task file and both yield the same 5417 tracked
lines.
- Per-file `sha256` (first 16 hex) of the ten D-touched code files, stable and
  re-verifiable:

```text
5ec0b6148ee43ff9  apps/api/src/services/platform.ts
da9e3c339c973198  apps/api/src/platform-routes.ts
19faeedb8e8b1cf0  apps/api/src/services/revisions.ts
1bdf82e84bceb1d1  apps/api/src/canon-routes.ts
efc6c99676b51daa  apps/api/src/planning-routes.ts
1b14aa6a9a36c085  apps/api/src/manuscript-routes.ts
2b9263d410e9ef09  apps/api/src/services/canon.ts
4c32ff01b00dd2bb  apps/api/src/services/planning.ts
49f781291e1ff644  apps/api/src/services/manuscript.ts
7de0485ec0266dce  apps/api/src/revision.test.ts
```

The earlier `640f9698…` hash of this task file is historical: it identifies the
pre-amendment contract, not this submission.

### Independent review — 2026-10-04 (reviewer: `glm-5.3-flash` via the 9Router gateway)

Dispatched by the author's instruction. Passes over the exact submitted diff:
production code, then the test file, then a re-review after the fix.

**Dispatch and identity.** `POST http://localhost:20127/v1/messages`, model
`bansosmontera/glm-5.3-flash` (present in `GET /v1/models`). The response's own
`model` field reads `glm-5.3-flash` and the request named the id explicitly, so
the **requested** model is proven; the **serving backend** is not, for the same
reason GAP-013 stays open — the gateway is a router and its self-report is not
backend evidence. Reviewer backend: MODEL_UNVERIFIED.

**Transport note (not a product finding).** The gateway returned
`upstream_error` / "All upstream attempts routed by Mortera Cloud failed" on
several attempts *after* emitting 25–35k characters of reasoning and before any
content, so early passes yielded reasoning with an empty answer. Retries with a
shorter prompt and a brevity instruction completed. The `glm-cn/glm-5.3-flash`
and `cl/z-ai/glm-5.3-flash` routes were tried and both returned HTTP 503
`429 … 余额不足或无可用资源包` (upstream account out of credit), so only the
`bansosmontera` route is usable and it is intermittently flaky. Recorded because
a future reviewer needs to know a silent empty answer means "retry", not "no
findings".

**Verdict: APPROVE on production code; one MAJOR test-fidelity defect, found,
fixed, and re-reviewed APPROVE.**

#### Pass 1 — production diff

Three attack items, all answered against source:

1. *Authorization before head disclosure* — traced each route and service:
   `gateProposal` → status check → `assertHeadExpectation` (`proposal.approve`);
   `gate` → assert (`chapters.import`, `outlineVersion.approve`,
   `outline.supersede`). **No disclosure path precedes authorization**, and the
   `novelId` used by the assert comes from stored rows, not client input.
2. *Generic 409s stay bare* — `ConflictError` sets `currentHeadRevisionId` only
   when the second constructor argument is passed; every generic conflict
   (slug-exists, already-`<status>`, no-baseline, snapshot-incomplete,
   outside-restore-scope, chapter-identity) is single-argument. No message-parsing
   path exists; the error handler does not serialize `message`.
3. *Tri-state not collapsed* — Zod `.nullable().optional()` preserves the
   null/undefined distinction; the planning handlers and `createCheckpoint` use an
   explicit `=== undefined` conditional spread; `approveBody` and `importBody`
   flow through pre-existing `...body.data` spreads, so `null` survives and an
   absent key stays absent. `assertHeadExpectation` and `advanceHead` both guard
   `!== undefined` before comparing.

Its first pass also raised a **MAJOR** on `canon-routes.ts` and
`manuscript-routes.ts`: the diff adds the schema field but shows no handler hunk,
so the field "may be silently dropped". **Refuted against the tree** — both
handlers already spread `...body.data` into the service call
(`canon-routes.ts:385`, `manuscript-routes.ts:200`), so a schema-only hunk is the
complete change. Recorded because the initial finding was an artifact of reviewing
a diff without its unchanged context, not a defect.

#### Pass 2 — the test file: one finding, confirmed and fixed

> `parkHeadMove`'s `waitForBlocked` matched *any* backend with
> `wait_event_type = 'Lock'` in the test database. A lock waiter belonging to a
> different transaction (a pool peer, another suite) could satisfy the guard, so
> `release()` could fire before the request had actually parked — and a
> pre-check-only build would then pass the probe.

The finding is correct. The probe's discriminating power did not rest on that
guard alone (the 409 + exact body + unchanged row counts fail independently), but
the guard was not measuring what its comment claimed. **Fixed** by recording the
parking backend's pid (`SELECT pg_backend_pid()` inside the parking transaction)
and requiring `pg_blocking_pids(pid)` to contain it, so only a waiter blocked *by
this probe's* parked transaction counts. The poll window was tightened from 5s to
3s, deliberately under the request transaction's Prisma default, so a
non-parking request surfaces as `blocked === false` rather than as a 500 from an
expired transaction.

Re-review of the fix: **APPROVE** — the residual path it names (a third actor
blocked by the same parking pid) is unreachable here because each probe seeds its
own novel (`head-locked-${route.slug}`) and the plain `count` reads never block
under MVCC.

Its two other test findings were **MINOR and not actioned**, deliberately:

- the coverage inventory cannot detect a *newly added* HIGH route; the pinned
  remainder makes adding a case for one of the five existing unrouted operations
  fail loudly, but a brand-new route plus a brand-new operation would not. Making
  the pin load-bearing needs a route-registry walk — more machinery than the risk
  justifies today;
- the inventory's "has a route" premise is asserted by the comment rather than
  checked by the test. Same reasoning.

Both are honest limitations, now stated in the test's own comment rather than
left implied.

#### What this verdict does not cover

The reviewer read the submitted diff and the excerpts supplied with it, not the
whole working tree line by line. It did not run the suite; the green receipts
below are the implementer's. It did not review the docs changes. It is one
reviewer, on one model, with an unverified backend.

### What the reviewer should attack

1. The coverage inventory (`revision.test.ts:1653`) asserts the **implication**
   — every HIGH operation *with* a route carries the expectation — not equality
   with the HIGH set. Check that this is the correct invariant and that the
   pinned remainder (`ai.bulkRewrite`, `branch.merge`, `checkpoint.create`,
   `outline.bulkRewrite`, `restore.apply`) is accurate against `impact.ts` and
   current call sites.
2. Whether the typed `ConflictError` metadata can leak a head to a caller who
   failed authorization, on any of the four routes.
3. Whether every generic 409 path still omits `currentHeadRevisionId`.
4. ~~The per-route locked-CAS probes' fidelity.~~ **Raised, confirmed and
   fixed** in the 2026-10-04 review -- see "Independent review" above. The poll
   now matches only a waiter blocked by the parking backend's own pid, and the
   four probes were re-falsified against a pre-check-only build afterwards
   (200/200/204/201 with the locked comparison disabled; 409 on all four
   restored).

### Unfinished work / next action

- ~~Independent review of the exact submitted diff.~~ **Ran 2026-10-04**; verdict
  APPROVE on production code, one test-fidelity defect found, fixed and
  re-reviewed APPROVE. See "Independent review" above.
- [NF-WF-002F](NF-WF-002F-foundation-acceptance.md) -- the author authorised
  starting it once the review returned. It is **not** started in this turn. D's
  green suite and this review are inputs to it, not the acceptance itself.

