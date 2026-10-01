# Dispatch brief — NF-WF-002 revision foundation (implementer)

You are the **implementer**. Your authority is
[NF-WF-002-revision-foundation.md](NF-WF-002-revision-foundation.md); read it
first and in full. This brief adds only operational framing and does not
override, extend or relax it. Where this brief and the task file disagree, the
task file wins — and say so.

The contract you are implementing is
[STORY-VERSIONING.md](../docs/03-domain/STORY-VERSIONING.md) §Contract (C1–C11),
frozen and independently **VERIFIED** over three review rounds at HEAD
`45d2035`. It is not yours to change. If the contract does not answer a
question you need answered, **stop and record it in
[ISSUES-AND-GAPS.md](../docs/implementation/ISSUES-AND-GAPS.md)** rather than
choosing silently. Do not invent cross-domain recovery semantics.

## Baseline

- Repository revision at dispatch: `5b5f139216dd1cf27077e342cfc2a23e55f743ae`.
- Dirty-file set at dispatch: **empty** (`git status --porcelain` clean).
- Do not revert the M0/M1 documentation set. Every documentation change in the
  recent history is deliberate and reviewed.
- One writer per file. You are the only writer on this task.

## Environment

- PostgreSQL 16 is up and healthy (`docker compose ps postgres`, service name
  `postgres`, port 5432).
- A dev-database dump exists at `.local-backup-novelforge-dev-20261002.sql`
  (gitignored, 2.0 MB). The task requires a populated-database upgrade check;
  **restore that dump into a scratch database for it**. Never run the upgrade
  check against the live dev database or any user database.
- Never commit a `.local-backup-*.sql` file. Never commit a `.env` file.
- The reviewer is a separate dispatch. Do not review your own work.

## Reporting

Report, in this order and without padding:

1. **Status** — one of `IMPLEMENTED`, `IMPLEMENTED_WITH_GAPS`, `BLOCKED`.
2. **What was built**, file by file, with the C-number each file satisfies.
3. **Acceptance evidence** — the task's checklist items, each marked done or
   not, with the exact command and its actual result. A checklist item with no
   executed command behind it is **not done**; say so rather than marking it.
   Zero selected tests do not pass G-01.
4. **Contract questions you hit**, each with what you chose and why, or
   `BLOCKED` if you refused to choose. These go to ISSUES-AND-GAPS.md too.
5. **Deviation from the contract or this task**, if any, stated plainly.
   Silent scope reduction is the failure mode this process exists to prevent.

Do not claim a test, migration or check you did not actually run. Do not
report a passing gate whose command you did not execute. If a command failed,
paste the failure.

## Evidence discipline

Per [MODEL-EVIDENCE-POLICY.md](../docs/06-ai/MODEL-EVIDENCE-POLICY.md),
distinguish OBSERVED / DOCUMENTED / INFERRED / PROPOSED / UNKNOWN. Valid JSON
and a green test do not prove the behaviour is correct; state what the test
actually asserted. Verify current callers before assuming a function's shape.

## Documentation to update

Exactly as the task's "Documentation and handoff" section lists. Do not re-scope
the contract. Replace "(proposed)" with "(observed)" only where the
implementation actually landed.

## Engram checkpoint

Save a checkpoint at meaningful boundaries and before handoff; confirm the save
succeeded before reporting it saved. Topic key `context/NF-WF-002/main/implementer`.
Never store credentials or manuscript content.
