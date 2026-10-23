# Shared AI safeguards and reader experience — requested design amendment

Status: IMPLEMENTED AND LOCALLY ACTIVATED — independent source review APPROVE,
2026-10-22. Author inspection and human screen-reader acceptance are separate.
Date: 2026-10-22. Baseline HEAD32fe443 with earlier dirty
work and nf050b-acceptance-wip preserved. Root is the sole documentation writer;
Root implemented/integrated; /root/amendment_final_review reviewed the final
submitted source independently. No commit/push authorization added.

## Completion evidence — 2026-10-22

The original design-only statements later in this document are historical scope,
superseded by this completion record and the matching CURRENT entry. A/B/C/D are
implemented: reader/public routing, versioned shared text safeguards, group/research
decisions and character affiliations, and protected cover cleanup/retention.

Focused checks: A55 web; B51 AI +19 orchestrator +1 helper; C10 DB/HTTP +15
character +12 worker +8 restore scope +7 UI; D28 DB +12 UI. API/web/worker/AI
type checks and scoped lint passed. Real browser evidence covers EN/ID desktop
and mobile, comments/touch/focus/preferences/navigation and proposal edit/reject.
Real gateway generation IDs and captured-response revalidation limits are recorded
in CURRENT. No human or database actor ID substitutes for author acceptance.

Review: /root/proposal_design_review found two P2 defects (role representation and
nonchapter dispatch); both were corrected and regression-tested. Final independent
/root/amendment_final_review returned APPROVE across A/B/C/D. Representative final
SHA256: story-discovery.ts b5a47c49313c31f1053d14f48a0eb20426fdb0ecc9ebab7e3d2b193ff560d340;
ReaderControls.vue 74b4820d7ff9953e679080d5b3d6db8b0a8f0f46b6c541aa61b0ee1f0a9d51ee;
NovelCoverEditor.vue 62361f594e621f023c7af041dd700234bdc6fe3135aa33b9524e48cfb5c67baa.

Additive migrations 20261022020000_cover_payload_retention and
20261022030000_story_discovery passed isolated deployment and then main local
deployment. Backup/restore proof, unchanged story fingerprint, new process IDs,
resumed empty queues, /ready200, /browse200 and authenticated contract read-back
are recorded in CURRENT and private .nf-artifacts receipts. Main manuscript/canon
was not approved, rewritten or reset. No immediate cover payload sweep was run.
Temporary proof APIs and their two owned fixture databases were cleaned up;
the main environment, backup and receipts remain available.

Rollback: retain the additive tables/columns when reverting the application; group
canon approvals use normal checkpoint restore. Reference notes and operational
decision history intentionally survive story rollback. Preserve the verified dump
for payload recovery, since expired image data cannot be recovered by code revert.

Execution order: (A) reader controls/modals and compatible public/author routing;
(B) shared versioned text safeguards; (C) source/group proposals and character
links with reviewed recovery/schema design; (D) cover cleanup/retention with data
protection; (E) combined affected checks, exact independent review and live proof.
Root remains the sole implementation writer. A later phase cannot be reported
complete from an earlier phase's tests. No commit/push authorization added.

## Goal and dependencies

Consolidate the author's eight proposed changes and subsequent UI/linkage/reader
requirements into one reviewable scope. Reuse the active writer-workspace design,
EN/ID localization, existing character proposal decisions, reader APIs, published
version rendering, comment authorization and progress synchronization. No new
dependencies, external publishing, commit/push or story reset authorized here.

Required reading: AGENTS.md, START-HERE.md, CURRENT.md, matching ISSUES entries,
docs/design/writer-workspace/index.html, docs/design/DESIGN-TOKENS.md,
tasks/chapter-author-outline-and-character-reuse.md,
tasks/generated-character-proposals.md, ai.ts, context-compiler.ts,
character-discovery.ts, retrieval.ts, canon.ts, cover-generation/history.ts,
public reader/comment routes and services, reader pages/components, app.vue,
SiteHeader.vue, index.vue, sign-in.vue and affected tests.

## Retained requested scope

1. Inject a versioned shared safeguard policy at ordinary and streaming text AI
   boundaries. Preserve custom/published definitions, task contracts, JSON,
   locale, quotes and identifiers. Record the effective policy. Outline/canon
   authority, continuity, supported sources, explicit unknowns and readable prose
   apply without per-author configuration. Existing review evaluates compliance;
   no guarantee that prompt injection proves truth or supplies absent context.
2. Check relevant outline/predecessor/character/relationship/world/reference/
   narrative context, expose missing information, and retain source/version pins.
3. Prefer clear prose and explain technical terms without changing story meaning.
4. Separate real scientific sources, author-directed fictional adaptation and
   approved world rules. Rumput Tuba's weaker temporary effect is intentional
   fiction. This author's examples permit real grounding for soap/oil/sugar;
   dangerous applications mostly use invented materials/names/effects. Do not
   silently impose this novel-specific policy on all authors' worlds.
5. Surface unsupported real-world claims for research and propose source-backed
   records. Do not treat the manuscript as independent scientific evidence.
6. Discover/reuse groups and propose membership/leadership links to Characters.
7. Manual unused cover candidate removal plus proposed retention of current cover
   and two previous distinct recoverable covers. Protect active/running/referenced
   payloads, retain audit provenance, explicitly mark expired restoration targets.
8. Focused tests, independent exact-diff review and bounded actual-gateway proof.

## Author's proposal UI and identity amendments

- Group/clan/organization cards reuse the character suggestion pattern:
  Approve / Edit / Reject, supported excerpts, clear existing/new identity and
  pending/approved/rejected states. Ambiguity requires author resolution.
- Existing groups are linked rather than duplicated. New-group creation and
  membership/leadership facts require explicit decisions, scoped authorization,
  recovery/version/audit safeguards, no surname-based automatic membership.
- Character details expose the approved connected groups/roles; proposed links
  remain clearly pending. Group detail can show approved associated characters.
- Scientific-source/fictional-adaptation proposals use the same decision pattern.
  Edit can select a related/identical existing reference rather than duplicate it.
  Show source provenance and which claim it supports; approval of a reference is
  not automatic approval of a fictional rule or manuscript replacement. Existing
  source history and citations remain recoverable; do not silently merge them.

## Reader interaction amendment

Screenshots are interaction references only. Retain NovelForge's active stone/
orange tokens, literary prose and shared input/select/button/modal styling; do
not copy comic artwork, third-party branding, purple palette or image-only content.

- Tap/click the reading area toggles floating top and bottom controls. Text
  selection, scrolling and interactions with links/controls must not toggle them.
  Provide a discoverable keyboard-accessible show/hide control, labels/tooltips,
  focus visibility and mobile safe-area spacing. Hidden controls must not retain
  keyboard focus or obstruct prose.
- Top: Back to /read/:slug, novel title, active chapter number/title, Home /browse.
- Bottom, in author-requested order: Previous, Next, Comments, Reading settings,
  Chapter list, Home /browse. First/last chapter states are explicit and disabled;
  retain server-owned published chapter navigation.
- Reading settings modal: font family from existing/system fonts, font size,
  reader-local dark/light theme, line height and letter spacing. Preview changes,
  provide clear save/reset/cancel behavior, persist validated device preferences
  and retain defaults when storage is unavailable. Do not change manuscript text.
- Chapter-list modal: searchable number/title, oldest/newest ordering, active
  chapter indication, bounded scroll area and direct navigation. Do not leak draft,
  scheduled or unpublished chapter information.
- Comments modal: reuse existing live CommentThread API and authorization. Keep
  the reader on the same chapter; successful comments/replies update in place.
  Anonymous readers can read and see a clear sign-in action to participate, with
  return navigation to the current chapter. Preserve the current composer when
  closing/reopening the modal; stale chapter requests cannot replace new content.
- Modals: accessible titles/close labels, focus containment/restoration, Escape,
  bounded content scrolling, usable mobile keyboard, loading/empty/error/retry
  states and no refresh/navigation on comment submit. Keep one active modal.
- Preserve sanitization, exact published-version prose, likes/notifications and
  reading-progress behavior. Changing chapters through client navigation must
  load the new chapter and scope progress/comments/settings correctly.

## Proposed routing adjustment

The author requires / to open /browse, with manual login near Language navigation.
Recommended compatibility layout: / redirects to /browse; move the current author
library to /author; /login aliases existing /sign-in. Update author-return links,
sign-in defaults and header ownership accordingly, while preserving validated
internal return URLs (including reader comments), access checks and old login URLs.
This resolves the currently conflicting root use; it is a recommendation, not
implemented routing. Show a Writing workspace entry to reach the author library.

## Implementation boundaries, evidence and rollback

Potential affected paths: ai-services/executor entry points and tests; existing
domain/reference/group/cover services and narrowly required reviewed schema/
migrations; API routes; web reader/author/header/proposal components, locales,
tests and these progress records. Shared manifests/locks are integration-owner
only. Prohibit router changes, whole-manuscript scans, fabricated citations,
automatic canon approval/publication, deleting main acceptance data or indiscriminate
cover history deletion. Schema design/ADR implications must be resolved before
dependent implementation; no migration exists for this amendment.

Focused proof must cover custom+streaming policy, intended fiction, missing sources,
schema/locale preservation, scoped group/reference decisions, stale/concurrent
approval and recovery; cover active/reference protection; reader click/touch/
keyboard, selection, chapter change, modal comments, settings persistence and root/
login/author navigation. Run package-specific type/lint/test commands from current
manifests, real published-read/API proof and rendered desktop/mobile EN/ID checks.
No invented exact test totals or independent review assignments. Existing passed
checks are retained until a changed caller or new uncertainty warrants rerunning.

Use isolated disposable databases for mutation tests; preserve the existing Windows
Docker stack. Any later destructive retention needs reviewed metadata/reference
invariants and recoverable backup; reverting code cannot recover purged payloads.
Handoff requires exact paths/hashes, actual checks, migration/rollback impact,
observed vs retained vs unknown evidence, unresolved issues and a verified Engram
checkpoint. This amendment implements no application behavior and claims no author
or human screen-reader acceptance.
