# Chapter Author Outline and Character Reuse

## Goal and authorization

Author requested repair on2026-10-22: chapter10 must continue from saved chapter9,
follow the supplied personal outline, include Anton Pratama and Darma Pratama,
reuse existing Don Juan/Sofian/Husein profiles, and propose only genuinely new
characters with explicit Approve/Edit/Reject. Do not apply, approve, publish,
merge, commit or push automatically. Existing work, rejected candidates and all
author data remain intact. Source reading and correction are authorized; use one
bounded real-gateway draft as proof after regression checks.

## Reading, evidence and scope

Read AGENTS/START-HERE/CURRENT and the matching ISSUES entry, generated-character
contract, workflow executor/ports and templates, compiler, character/profile
readers, generation UI/locales and tests. Actual failing run:
49f6a150-29c8-48c5-9835-e8c468359e2d, chapter-generation-review; styleNotes exists
in input but is absent from planner/writer instructions. Exact-name-only matching
does not recognize existing profile aliases. Earlier generated-character technical
completion is retained historical evidence; this task repairs newly observed gaps.

Root is sole executor/integration writer. Scope: shared executor chapter context
and prompts, bounded read-only character resolver reused by discovery, affected
ports/callers/tests, author-facing form wording and progress records. Reuse
existing packages. No new dependencies, schema migration, router changes, entire
manuscript/catalog scans, silent published-template upgrades or historical output
rewrites. Independent review is separate from implementation/author acceptance;
record actual reviewer availability rather than inventing approval.

## Acceptance and recovery

- Both legacy generation and creation workflows carry exact author notes through
  context compilation, planning, writing, review and bounded correction. They
  outrank the approved outline for planning; hard-canon conflicts remain surfaced.
- Resolve server-owned target chapter; include bounded previous saved chapter
  prose/version provenance and relevant existing profiles before the first model
  call. Persist context in the run step; resumed steps reuse it.
- Unique explicit/derived name aliases can read/reuse existing profiles. Multiple
  matches remain ambiguous and block new-identity approval; never auto-merge/link.
- New named people requested by the author are allowed in proposed prose; they
  do not require an existing Character row and do not become approved canon.
- Regression proof: notes survive unmapped published graphs and corrections;
  canonical IDs/profile data and predecessor version appear in context; bounded
  reads, tenant/ambiguity negatives and no duplicate suggestions; EN/ID wording.
- Real proof uses stored original outline and current chapter9, retains output as
  a draft/review artifact, checks required names/beats and new-character proposals.
  No manuscript apply, new-character approval or publication without author action.

No migration planned. Reverting code restores prior behavior; retained run inputs,
outputs/attempts/decisions are audit evidence and must not be deleted. New story
mutations continue to require existing checkpoint/version/approval safeguards.

## In-progress fallback checkpoint — 2026-10-22

Root sole writer; HEAD32fe443 and earlier dirty work/stash preserved. Implemented
runtime notes/source propagation, gated chapter-source reader and shared readonly
normalized alias resolution; generation form now describes outline+style and pins
chapterId for legacy runs too. No schema or published graph/history edits.
15 database,4 executor chapter cases and46 UI/locale tests PASS. Independent
review_approved_delta APPROVE following two repaired resolver findings. Latest
API/worker types and lint pending (sessions25546,32023,25032).
Main API32456 and workflow16532 still run the previous implementation. Next:
finish checks, reload only verified idle application processes, enqueue one real
draft using stored original outline from run49f6a150-29c8-48c5-9835-e8c468359e2d,
verify chapter9 source and all requested beats/Anton/Darma plus only2new-character
proposals. Do not apply/approve/publish. Engram checkpoint attempt failed with
host-hook ETIMEDOUT; no save claimed, exact runtime session identity retained.

## Runtime proof in progress

API27368 and workflow28584 reloaded after idle queue check; queues resumed and
API/Nuxt200. No Docker or schema changes. Idempotent run
2974c625-4061-4f0f-ad15-4f7cf35bb41d uses the original outline hash
da455209dcf730085a300ccfcfdc3a2ae9a6a0e3f546c83dc899829375b0037d.
Saved chapter9 v2 source is complete (4276 chars), version
36ff8be1-192f-42b9-8e12-2c4bb642cb93. Context reuses Don Juan, Husein and Sofian
profile IDs; validated plan includes both Anton Pratama and Darma Pratama.
All65 focused cases and relevant types/lint PASS. Independent review approved
with a P3 read-only parenthetical-alias heuristic limitation (recorded in ISSUES).
The old 'dusun lain' descriptive alias false-positive is fixed and regressed.
Engram recovered: checkpoint562 write and read-back succeeded with unchanged binding.
Prose, review and new-character discovery still need final bounded observation.

## Completion and acceptance boundary — 2026-10-22

The preceding in-progress notes are historical. Relevant API/worker/web types,
targeted lint and all65 focused cases passed; independent final source review is
APPROVE_WITH_FINDINGS (P3 title-cased parenthetical alias heuristic retained).
No production/test source changed after that review. Runtime run2974c625 is now
AWAITING_APPROVAL. All successful AI-stage instructions contain the original
1594-character outline; predecessor chapter9 v2 and three existing profile IDs
are pinned. Plan has both full sons' names; draft10538 chars contains Anton/Darma
and the principal author-requested beats. Draft hash:
797819b087418b291d4ae8b79cababc1d1549c09501177d9e3f682677e9a8f56.

Initial discovery failed INVALID_OUTPUT despite successful model transport. No
original response or router request log exists; exact validation cause is unknown.
One explicitly invoked discovery-only retry captured its response privately and
passed the unchanged parser. Batch111a09c3-d35f-498c-91cb-bdc8d937fd5f now SUCCEEDED
with exactly two PENDING suggestions, Anton and Darma. Their descriptions/quotes
are generated from the draft; existing profiles are filtered. Prose uses short
names, so author may edit them to the intended full names before approval.
Final --evaluate assertions passed with unchanged manuscript/version/character/
entity/canon hashes. No new whole chapter run, automatic retry, story mutation,
draft apply, character approval, publication, commit or push.

Draft quality remains subject to author review: incorrect visitor/host count,
an impossible visual action toward an absent wife, kinship wording and minor
sequence/timing differences are recorded in ISSUES. Additional generated stakes
are not certified against all canon by this bounded inspection. These findings
must not be hidden behind schema/AI review success. Existing review/apply and
Approve/Edit/Reject controls remain the author decision path. Private receipts:
.nf-artifacts/chapter-outline-proof.json and chapter-outline-evaluation.json;
diagnostic response remains ignored, not a project artifact or Engram payload.
