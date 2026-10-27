# Restore applied-draft status from durable history

Author request: remove the misleading unapplied-draft warning in capt.png for
Kaisar chapter 10, currently version 4. Root owns the narrow fix; a separate
read-only reviewer verifies the final diff. Preserve existing decode work.

Observed: version 1 note records chapter.apply_title_and_prose and creation run
927e7851-c052-41fb-8eb4-e4e00ed3826f. Versions 2–4 are subsequent edits; the
current chapter is DRAFT v4. ApplyBar remembers application only in component
state. Reloading loses that evidence and enables an obsolete draft; source CAS
correctly returns 409. Character proposals are already approved, but their panel
still displays an apply-first warning intended for pending proposals.

Reuse the authorized chapter versions endpoint to restore exact run application
status, scoped to the current chapter/run and versions no later than the current
version. Show historical application and latest edited version separately; never
infer application from a larger version number or overwrite edited prose.
Fence delayed history reads, disable application while history is unresolved,
and retain all server authorization/source/approval guards. Hide blocked-proposal
warnings only when no proposals are pending. No story/approval/database mutation,
migration, provider call, commit, push or deployment is required.

Acceptance: remount at v4 with run applied at v1 shows the correct status and no
reapply action; an unapplied run stays guarded; unknown history cannot enable a
write; delayed responses cannot affect another chapter. Pending stale proposals
retain warnings. EN/ID text and actual local browser state must be checked.
Use focused UI tests/typecheck and record results here/CURRENT/GAP-134.

## Completion — 2026-10-27

Implemented using existing authorized version metadata; no API or schema change.
ApplyBar restores the exact run application, hides reapply and stale warnings,
and distinguishes historical v1 from current edited v4. History reads are scoped
and request-fenced; unresolved or failed lookup cannot enable application.
Character and story suggestion warnings now apply only to pending candidates;
approval authorization and source guards remain unchanged.

Focused UI regressions 35/35 PASS; web vue-tsc and focused ESLint exit 0.
Independent review APPROVE, with matching ApplyBar SHA256
e31d4bef98ea64a5cc40b89c3438e7e9c25c8c4622480af30140a73793f201d8.
Actual local browser read-back in ID and EN shows historical applied version 1
and current version 4, with no reapply action or apply-first warning for the
already-approved character suggestions. No page errors or API mutations occurred;
chapter content/currentVersionId/status matched before and after. Temporary
verification session was removed. Private evidence:
.nf-artifacts/ch10-applied-history-browser.json and ch10-applied-history-id/en.png.
No manuscript rewrite, author/canon approval, provider call, commit/push or
deployment was performed. Existing uncommitted decode work is preserved.
