# Chapter language polish and author-controlled suggestions

Status: implemented and verified. Owner: root sole writer; independent read-only
review by review_enqueue_pins; final exact-source hash recorded below.

Goal: improve grammar, diction and natural dialogue in future AI chapter drafts;
offer a simple selected-passage language suggestion with Before/Proposal and
Use suggestion/Ignore. Reuse existing generation review and selection-AI paths.
Author approved language polish plus explicit accept/reject UI. Both en/id UI;
story language follows author/manuscript, never silently translated.

Read: AGENTS, START-HERE, CURRENT, generation agent prompts/template loader,
selection operations/composable/editor/card/save flow and design tokens. Existing
writer/style reviewer/final reviewer and selection suggestion card are dependency
evidence. No new agent, database schema or routine extra LLM stage is needed.

Allowed: workflow-template language instructions/tests; selection operation mirrors,
transport tests, toolbar/card/page/selection application helper/tests, en/id;
task/progress/issues and private verification receipts. No unrelated rewrite,
canon mutation, old-run snapshot edit, forced overwrite, commit/push/reset.

Inputs: bounded selected text and surrounding context via existing generation
endpoint/profile/model routing. Output: plain-text proposal only. Original visible
beside proposal; explicit accept replaces only the unchanged selected text as
literal text, Ignore changes nothing. Reject stale range, oversize selection,
partial/failed stream and unsafe chapter state; no insertion fallback for polish.
Use ordinary versioned manuscript save; edits invalidate final-text review.
Keep dialogue register, meaning, facts, character voice and approved author style.
Do not mechanically formalize colloquialisms or enforce examples as universal rules.

Acceptance: focused selection/card/transport/template tests; types/scoped lint;
real gateway passage proof and native en/id desktop/mobile card acceptance/rejection
without live-story mutation; separate exact-source review. Activate prompt changes
through new definition versions while retaining custom settings and historical pins;
never equate template edits with upgraded installed definitions. If activation is
blocked, record exact affected scope. No destructive rollback: retain old versions.
Preserve Docker data, all WIP/stashes. Save/read back Engram before handoff.

## Completion evidence — 2026-10-21

- Reused the existing selection menu and toolbar. Select a sentence or one
  paragraph, click Polish language, compare Before/AI proposal, then Use suggestion
  or Ignore. Equal-prominence controls; no insert-after option for language polish.
  No-change output has an explanatory notice and cannot create an empty revision.
- Selection limited to one paragraph and 2,000 characters; oversize/multi-paragraph
  selections refuse instead of truncating. Select-all is normalized to text range;
  stale text refuses without insertion. Accepted text is literal, undoable, and
  follows the existing autosave/versioning path; Save rechecks final text.
- SSE must finish with SUCCEEDED for a polish proposal to be applicable; partial,
  failed and obsolete responses cannot replace text. Other operations retain
  their existing behavior and presentation.
- Web61PASS (transport/editor/helpers/locale); templates11PASS; API/web types,
  scoped ESLint and diff checks pass. Dedicated native proof used the actual
  MiniMax-M3 gateway, not generated mock text: EN1440 Ignore retains original;
  ID390 Use persists and survives reload in the dedicated test database. Card
  stays inside viewport; page errors0. Actual new text removes redundant color
  wording; neither schema success nor one sample proves flawless prose.
- First provider result was unchanged and initially only HTML serialization
  differed. That was insufficient language-quality evidence. Prompt clarified;
  repeated proof compares actual text, no-change UI and paragraph guards added.
  Retained earlier artifacts are historical, not the final proof.
- Main workspace b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9 now has published v2 of
  chapter-writer, voice-style-reviewer and final-reviewer. Authenticated definition
  APIs appended language policy while preserving custom instructions/model/profile/
  schema/settings. Old v1 rows read back unchanged; existing run snapshots/pins and
  main story/run hashes unchanged. New generations resolve new versions; no worker
  restart. Source templates also improved for new installations.
- Private receipts: .nf-artifacts/language-polish-activation-receipt.json and
  language-polish-live-receipt.json; EN/ID screenshots. Proof database:
  novelforge_test_ai_chapter_creation. Temporary sessions removed; no main story
  acceptance, edit, publication, commit, push or reset.
- Final sixteen-file independent review APPROVE; root/reviewer matching ordinal
  manifest SHA256:
  097bc09962d9bcb6bd62aa012a982a09aa8b7ff705f8a3e424bb18e5752f5eb8.
  Preliminary hash mismatch was culture-based PowerShell sorting versus ordinal
  sorting, not changed bytes. Final component21PASS/webtypes0 after card styling.

Limits: no automatic whole-chapter suggestion list or bulk acceptance. Initial
chapter generation self-edits and uses its existing review stages; individual
author-controlled suggestions operate on selected manuscript text after generation
has been applied. Previously approved runs are not rewritten. Full new-chapter
language quality remains a future author evaluation, not proven by this passage
test. Main imported/published chapters3/10 were not automatically edited.
