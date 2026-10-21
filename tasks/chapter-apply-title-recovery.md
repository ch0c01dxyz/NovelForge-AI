# AI Apply recovery after title-only rename

Status: implemented and verified; final independent review recorded below.
Owner: root sole writer; independent reviewer review_enqueue_pins (read-only).
Author follow-up: explain errors and warnings in plain English/Indonesian for
writers. Cover generation, review, Apply and canon-proposal conflicts. Retain
machine codes, checks and reference placeholders; describe observed causes and
next actions without implying unproven story inconsistency or plot holes.
Read AGENTS/START-HERE/CURRENT, content-repair evidence, manuscript save/rename,
revision locks/lineage, ApplyBar/callers/tests. User reports Apply failure after
renaming chapter10; run37a6375b...SUCCEEDED, currentv2 is rename-only from pinnedv1.

Goal: deliberate recovery using the existing approved artifact without another
model call, preserving the author's current title. Original run pins/snapshot
remain immutable; annotate old/new source in the new manuscript version/audit.
Allow only bounded audited target-title-only lineage and byte-identical content.
Require fresh expectedVersion/expectedTitle, same branch, authorized approved run,
exact approved title/prose, unchanged canon/other story state, unpublished chapter.
Fail closed if proof is missing/too large. No general source-pin bypass.

Allowed: manuscript service/routes/error mapping/API tests; ApplyBar/tests/caller,
en-id resources; progress/issue records. No migrations/deps/commit/push, history
rewrite, auto-approval, auto-retry or unrelated story changes. Main verification
read-only until explicit user recovery action. Preserve existing data/work/stash.
Acceptance: opt-in UI clear and localized, no silent retry; real rename-only
fixture recovers retaining title; content/canon/other chapter/branch drift and
stale title/version refuse; audit and immutable history verified. Appropriate
types/lint/native UI/exact-source review and verified Engram checkpoint. Rollback
code only; new saves remain recoverable through existing immutable versions.

## Evidence

- API manuscript37PASS in dedicated novelforge_test_manuscript; actual rename
  fixtures, successful v3 retaining title, immutable run pins, provenance and
  content/source/other-chapter/branch/stale-CAS refusals.
- Web37PASS: Apply10, RunStatus9, locale18; web vue-tsc/scoped ESLint/diff-check0.
  English fallback remains tested; technical run/step errors remain available in
  closed support details with a plain-language primary alert.
- Native main EN1440/ID390 actual refusedPUT409: typed title-only cause, unchecked
  consent, current title shown, checking enables Apply without a request retry.
  Page errors0, unexpected mutations0; novels/chapters/runs hashes unchanged.
  No successful main Apply or model request performed. Main chapter10 stays v2.
- API idle activation20132->10304; worker4180 unchanged, readiness/Nuxt200.
  Existing queues, Docker data, stash and WIP preserved; HEAD282983f, no commit/push.
- Private receipts: .nf-artifacts/apply-title-activation-receipt.json and
  .nf-artifacts/apply-title-ui-receipt.json; screenshots apply-title-en/id.png.
- Initial nine-file source review APPROVE hash
  ccf2124b0987f4f0280e9458044dfbdbbd8bc38fb88ad13e19b05dd3d961a9d6.
  Final twelve-file independent read-only review APPROVE, no blockers, including
  writer-friendly copy and support details. Root recomputed matching hash:
  eef0d78db5b665b32712300cd312a8a331370df9e335b6871d8484100649b37a.

Author next action: reload workspace, open chapter10 and its approved draft,
choose Apply, read the title-change guidance, explicitly select keeping the
current title and Apply again if satisfied. Review the existing countdown
wording separately; any later manuscript edit requires a fresh final-text review.
Do not interpret the typed conflict, AI review result or database actor as human
story acceptance, canon approval or publication authorization.

Diagnostic note: the private native proof initially checked a nonexistent
Chapter.version/currentVersion.version field; corrected to currentVersion.number
before running browser requests. This was a proof helper error, not product data
loss or an observed application defect. Temporary proof sessions removed.
