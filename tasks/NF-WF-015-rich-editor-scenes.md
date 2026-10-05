# Task NF-WF-015: Rich editor and scene authoring completion

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: REVIEW_PENDING (round 1: APPROVE_WITH_FINDINGS, findings applied inline)
Milestone / capability IDs: M2 (author half); delivery-plan NF-WF-015
Implementer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returns APPROVE (Q1–Q7 confirmed as decided, recorded in the
Review record; the §"Open questions" wording is the author's
recommendation and the CONFIRMED resolutions are the decisions of
record).
Frozen review manifest / exact artifact paths and identity: tasks/NF-WF-015-rich-editor-scenes.md reviewed at repo HEAD baaeaa2 (uncommitted working copy; review round 1 recorded in §"Review record")
Baseline revision / local changes to preserve: repo HEAD at review time
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Normative vs informative

Normative: the Tiptap choice (Invariant 1) and its integration points, the
sanitized-HTML content format (Invariant 2) with the exact word-count,
reader, compiler, and review-gate rules, the toolbar pin (Invariant 3),
the six selection-AI operations and their transport/result/stale-selection
rules (Invariant 4), the autosave contract and the no-silent-discard
conflict resolution (Invariant 5), the scene CRUD + navigation scope
(Invariant 6), the §15 design conformance (Invariant 7), the i18n/a11y
rules (Invariant 8), the forbidden paths, and the acceptance checkboxes.
Informative: rationale paragraphs, the Tiptap-vs-alternative discussion,
and the §"Open questions" recommendations (the question labels are
normative — the recommendations are the author's, for the reviewer to
confirm or flip).

## Goal and reason

Complete the writer workspace's prose surface. NF-WF-007 built the
generate/review/diff/accept loop around a plain `<textarea>` with a
decorative B/I/H2 toolbar; the actual authoring surface — rich text,
selection-based AI assistance, honest version-conflict handling, and
scene navigation — is this task. The delivery-plan acceptance is:
"Tiptap or explicitly approved equivalent, selection AI, autosave/version
conflict, scene navigation". This contract pins Tiptap (v3 stable, Q7 decision of record) and
defines exactly how it integrates with the frozen backend: the
`ChapterVersion.content` Text column, the `saveChapter` optimistic-
concurrency contract, the generations API, and the schema-only `Scene`
model (GAP-052).

## Required reading

- [Operating constitution](../../AGENTS.md) (§2 invariants, §11 Definition
  of Done, §13 evidence/issues, §15 design system).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-015 row
  at `:149`; "final gate after 011").
- [NF-WF-007 contract](NF-WF-007-writer-ui.md) — the writer page, the
  autosave contract, the ApplyBar stale-apply pin, the generation loop
  this task must not regress.
- [NF-WF-011 contract](NF-WF-011-author-preview-e2e.md) — the `pnpm e2e`
  author-preview loop (no-regression acceptance).
- [NF-WF-010 contract](NF-WF-010-state-consumer-integration.md) —
  `reviewFinalText` and the FinalTextReview receipt (Invariant 2's
  review-gate rule).
- [NF-WF-012 contract](NF-WF-012-publication-release-contract.md) —
  the publish gate (any edit invalidates the receipt).
- [NF-WF-013 contract](NF-WF-013-public-reader-routes-ui.md) — the
  reader pages whose content rendering this task changes (Invariant 2).
- Foundational design: `docs/design/writer-workspace/index.html` (editor
  section, `data-od-id="manuscript-editor"` at `:665`,
  `data-od-id="editor-toolbar"` at `:666`) and
  `docs/design/DESIGN-TOKENS.md` (orange restricted to AI affordances).
- Existing implementation: `apps/web/app/pages/workspaces/[workspaceId]/
  novels/[novelId]/index.vue` (the 007 writer page: `<textarea>` editor
  at `:612-621`, 1.5s debounced autosave at `:323-328`, `saveNow` at
  `:330+`, 409-conflict refetch at `:355-365`, static toolbar at
  `:585-592`), `apps/api/src/manuscript-routes.ts` (save contract),
  `apps/api/src/services/manuscript.ts` (saveChapter, countWords),
  `apps/api/src/ai-routes.ts` (generations API), `apps/api/src/
  services/ai.ts` (gateway-backed generate).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
New npm dependencies in `apps/web` (`@tiptap/*`, one HTML sanitizer) via
the workspace's pnpm; no new infrastructure, no new services.

## Dependencies and evidence

- NF-WF-007 (IMPLEMENTED): the writer page, autosave contract, ApplyBar
  stale-apply logic, generation loop — all must keep working.
- NF-WF-010 (IMPLEMENTED): `reviewFinalText` keyed to
  `chapterVersionId`; 015 verified 003/010 do not read chapter prose
  (Invariant 2, F5).
- NF-WF-011 (IMPLEMENTED): `pnpm e2e` — no-regression acceptance.
- NF-WF-012 (IMPLEMENTED): publish gate — selection-AI edits are
  ordinary edits (new version → receipt invalidation, constitution §11).
- NF-WF-013 (IMPLEMENTED): reader pages — content rendering changes
  from paragraph-split to sanitized HTML (Invariant 2).
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-028 (production worker AI wiring — does NOT block selection AI,
  which rides the API-served generations path; recorded in Invariant 4),
  GAP-052 (Scene rows are schema-only — 015's scene navigation depends
  on the Q5 decision; owned by this contract's review).

## Scope

### Allowed

- `apps/web/app/components/editor/` (new): `RichEditor.vue` (the Tiptap
  wrapper: `useEditor`/`EditorContent`, `<ClientOnly>`), `EditorToolbar.vue`
  (real B/I/H2/quote commands + Rewrite tone), `SelectionAiMenu.vue`
  (bubble menu), `AiSuggestionCard.vue` (result + Accept/Insert/Discard),
  `ConflictBanner.vue` (keep-mine/load-theirs/compare), `SceneNav.vue`
  (scene breadcrumb + navigator). Follows the 007 component pattern
  (props/emits, vitest tests, no store).
- `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`:
  replace the `<textarea>` (`:612-621`) with `RichEditor`; wire
  `onUpdate` → dirty/autosave; wire the conflict banner; add the scene
  breadcrumb to the editor chrome. The generation loop, ApplyBar,
  publish(), chapter list, and footer are untouched except where this
  contract says otherwise.
- `apps/api/src/manuscript-routes.ts`: additive scene routes
  (`GET/POST/PATCH/DELETE .../chapters/:chapterId/scenes`) under the
  existing conventions (session auth, Zod → 400 INVALID_INPUT,
  membership 404 gate, `chapter:update` capability, the app-wide error
  handler — never a second one).
- `apps/api/src/services/manuscript.ts`: additive scene service
  functions; server-side HTML sanitization on `saveChapter` write;
  tag-stripped `wordCount` (the shared strip helper lives here and is
  reused by the publication path).
- `apps/api/src/services/publication.ts`: tag-stripped `wordCount` in
  `resolvePublicChapter` only (F4) — no other publication-lifecycle
  changes.
- `apps/api/src/services/ai.ts` (or a small additive helper): the six
  pinned selection-AI operation prompts (project-owned English prompt
  text). No new routes — selection AI uses the existing
  `POST /api/workspaces/:workspaceId/generations` (+ `/stream`).
- `apps/web/app/pages/read/[slug]/[number].vue`: render pinned chapter
  content as sanitized HTML (`v-html`) instead of the blank-line
  paragraph split. No other 013 behavior changes.
- `apps/web/package.json`: new deps `@tiptap/vue-3`, `@tiptap/core`,
  `@tiptap/starter-kit`, `@floating-ui/dom` (v3 stable — Q7),
  one HTML sanitizer (implementer picks; reviewer verifies — Q2).
- `apps/web/app/i18n/en.ts`, `id.ts`: editor, selection-AI, conflict,
  scene locale keys.
- Tests for all of the above (API route/service tests + web vitest
  tests, 007 harness pattern); docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE workarounds).

### Forbidden

- Scene content editing or scene versioning — scenes stay structural
  anchors (GAP-052; the "scene versions deferred" Phase 2 note stands).
- An offline edit queue or localStorage draft cache — Q3, follow-up.
- AI operations beyond the six pinned in Invariant 4 — adding one is a
  contract amendment.
- Storing Tiptap JSON in `ChapterVersion.content` — Invariant 2 pins
  sanitized HTML.
- Changes to the release lifecycle, the review gate verdict contract,
  the ApplyBar stale-apply logic, canon/memory/compiler semantics, or
  the public-reader visibility rules.
- New capabilities in `packages/auth/authorization.ts` — 015 reuses
  `chapter:update` and `generation:create`.
- Collaborative editing (multiplayer cursors/presence) — out of scope.
- Superseding 007's 1.5s debounce or expectedVersion contract.

### Inputs

- Chapter content as sanitized HTML (from `editor.getHTML()`); the
  existing `saveChapterBody` caps (1M chars) unchanged.
- Text selection (ProseMirror selection) for selection AI; bounded
  selection + surrounding context (Invariant 4).
- Scene CRUD bodies: `title` (1–200 chars), `summary` (optional),
  `number` (reorder); Zod-validated.

### Outputs

- The Tiptap rich editor on the writer page; the six selection-AI
  operations; the conflict-resolution banner; scene CRUD + navigation;
  sanitized-HTML chapter content end to end (editor → save → reader).

### Out of scope (with follow-up owner)

- Import/export formats → NF-WF-017 (depends on 015; 015's HTML format
  pin is 017's frozen input).
- Offline-first editing → future task (Q3).
- Intra-chapter scene scroll anchors → future task (Q4).
- Scene-level versioning → future task (GAP-052 follow-up).
- Mobile-specific editor chrome → NF-WF-023 hardening.

## Behavior and invariants

### Invariant 1 — Editor: Tiptap v3 (stable), pinned integration points

The delivery-plan acceptance names Tiptap; this contract pins it —
no alternative was evaluated and none is needed. The explicitly-approved-
equivalent clause is satisfied by Tiptap itself.

- Packages (new in `apps/web`, v3 stable — v3 went stable in 2025-07
  and v2 is superseded with minimal maintenance capacity; the v3 pin
  is the Q7 decision of record, F1): `@tiptap/core`, `@tiptap/vue-3`
  (the official Vue 3 binding: `useEditor`, `EditorContent`; the
  selection bubble menu ships from `@tiptap/vue-3/menus` in v3),
  `@tiptap/starter-kit` (covers the design mockup's B/I/H2/quote), and
  `@floating-ui/dom` (v3's required peer for menus — Floating UI
  replaces tippy.js).
- Backend-verification reasons for the choice: (a) first-party Vue 3
  integration with a documented Nuxt install path (Nuxt 4 auto-imports;
  the editor is client-only — ProseMirror needs the DOM, so the
  component mounts inside `<ClientOnly>`); (b) the ProseMirror schema
  is restrictable to a manuscript subset (paragraph, heading level 2,
  bold, italic, blockquote, lists, hard break — the mockup's toolbar
  plus sane prose blocks; no tables, no embeds in 015); (c)
  `editor.getHTML()` / `commands.setContent(html)` round-trip an HTML
  string through the UNCHANGED `ChapterVersion.content` Text column
  (`schema.prisma:304`) — no migration; (d) Tiptap parses existing
  plain-text chapters into paragraphs, so all current content keeps
  working.
- Integration point: `RichEditor.vue` replaces the `<textarea>` in the
  writer page (`index.vue:612-621`). The page keeps owning `content`,
  `version`, `saveState`, and `saveNow`; the editor emits
  `update:modelValue` (HTML) on Tiptap `onUpdate`. The isSame guard
  (`editor.getHTML() === value` → skip `setContent`) prevents
  programmatic loads (chapter switch, conflict reload) from marking
  the document dirty or moving the cursor.

### Invariant 2 — Content format: sanitized HTML, plain-text consumers unchanged

`ChapterVersion.content` stays a `String @db.Text`
(`schema.prisma:304`). What changes is the serialization contract:

- The editor serializes with `editor.getHTML()`; the PUT body carries
  HTML. The `saveChapterBody.content` 1M-char cap
  (`manuscript-routes.ts:28-32`) is unchanged (chars, not bytes).
- The server sanitizes on write (in `saveChapter`, before the version
  append). Allowlist (pinned; Q2 covers the library choice):
  `p, h2, blockquote, strong, em, ul, ol, li, hr, br` — no attributes,
  no `script`/`style`/`iframe`, no event handlers, no `h1` (chapter
  titles are metadata, not prose). Sanitization is idempotent and
  happens BEFORE the word count and the version insert, so every stored
  version is clean.
- `wordCount` is computed on tag-stripped text: strip tags (replacing
  each tag with a space so `</p><p>` doesn't fuse words), then the
  existing `countWords` (`services/manuscript.ts:126-128`). The server
  stays authoritative; the client's footer count uses the same rule.
  The same strip rule applies to the publication `wordCount`
  (`resolvePublicChapter`, `services/publication.ts:843`, served to
  the 013 reader) — F4.
- The 013 reader renders the PINNED version's content: content
  containing block tags (`/<(p|h2|blockquote|ul|ol|li|hr)\\b/`) renders
  as sanitized HTML (`v-html` in `read/[slug]/[number].vue`); content
  WITHOUT block tags (plain-text rows never re-saved in HTML) keeps
  the 013 blank-line paragraph split with the drop cap — un-migrated
  chapters render exactly as before (F2). Same content, same pin —
  013's acceptance is unaffected.
- Verified against source: the context compiler (003) and
  `reviewFinalText` (010) do NOT read `ChapterVersion.content` prose
  today, so no consumer change is needed there (F5) — the strip rule
  applies wherever chapter prose IS consumed: the save-path word
  count, the publication word count (F4), the 013 reader (F2), and the
  editor diff. The canon-evidence and discovery-search HTML
  interactions are GAP-053 follow-ups, explicitly out of 015's scope.
  The FinalTextReview receipt stays keyed to
  `chapterVersionId`; any edit (including a selection-AI edit) creates
  a new version and invalidates prior receipts (constitution §11).
- `DraftDiffView` diffs tag-stripped base text against generation
  prose (plain text) — no HTML in the diff view.
- Existing plain-text chapters: unchanged rows; Tiptap parses them as
  paragraphs on load; the first save normalizes them to sanitized HTML
  (a new version, as with any edit — no backfill, no migration).

### Invariant 3 — Toolbar: the mockup's static row becomes real

`docs/design/writer-workspace/index.html:665-681` shows the editor
toolbar: B, I, H2, quote (“ ”), a separator, and "Rewrite tone" with
the AI sparkle glyph. 015 implements exactly this:

- B/I/H2/quote map to Tiptap commands (`toggleBold`, `toggleItalic`,
  `toggleHeading({level: 2})`, `toggleBlockquote`). Buttons carry
  `aria-label`s and the existing `focus-visible:nf-focus` convention.
- "Rewrite tone" is the toolbar entry point to selection AI: it runs
  the rewrite-tone operation on the current selection (or prompts to
  select text if the selection is collapsed). Orange with the sparkle
  glyph per DESIGN-TOKENS.md ("orange marks … every AI affordance").
- The save-status cluster keeps the mockup's "● Saved · v12" pattern
  (`saveLabel` + version); the `conflict` state surfaces the
  ConflictBanner (Invariant 5), not a silent refetch.

### Invariant 4 — Selection AI: six pinned operations, generations API, never direct writes

Operations (pinned verbatim from the foundational design mockup,
`index.html:681,700-703`): **Rewrite tone**, **Expand selection**,
**More dialogue**, **Show, don't tell**, **Continue scene**,
**Ask the writing agent** (free prompt). No others in 015.

- Trigger: non-collapsed text selection inside the editor → floating
  bubble menu (`@tiptap/vue-3/menus` in v3), Esc dismisses, focus
  returns to the editor. The menu lists the six operations; "Ask the
  writing agent" opens a small prompt input in the same menu.
- Transport: `POST /api/workspaces/:workspaceId/generations`
  (`ai-routes.ts:250-267`) with `profile: "CREATIVE_WRITER"`,
  `task` pinned per operation (`selection.rewrite-tone`,
  `selection.expand`, `selection.more-dialogue`,
  `selection.show-dont-tell`, `selection.continue-scene`,
  `selection.free-prompt`), and `messages` = system instruction (the
  operation's project-owned English prompt) + user message carrying the
  selected text (≤ 2_000 chars) plus bounded surrounding context
  (≤ 1_000 chars) — never the whole chapter (constitution §2.16).
  Capability `generation:create` (`packages/auth/authorization.ts:34`);
  member-only session auth, like every other writer action.
- Streaming: `POST .../generations/stream` (SSE,
  `ai-routes.ts:269-335`); the suggestion card shows progress and
  aborts on close (the route already aborts on socket close).
  `maxTokens` bounded per request (implementer pins ≤ 4_000; reviewer
  verifies) — selection edits are local, not chapter generations.
- Result UX: an inline `AiSuggestionCard` anchored below the
  selection shows the result (plain text) with three actions:
  **Accept** (replace selection), **Insert after**, **Discard**. The AI
  result NEVER writes to the document or the server directly — the
  author's Accept is the commit, via the normal editor → `saveNow`
  path. Every key and message is en/id.
- Stale-selection pin (015's "stale apply"): autosave may change the
  document between selection and Accept. On Accept-replace, the editor
  re-resolves the selected text in the CURRENT document; if it is no
  longer present verbatim, the result is inserted after the
  (re-resolved) cursor INSTEAD of replacing, with the
  `aiAssist.staleSelection` notice — never a silent mis-replace.
- AI authority: per constitution §2.2/§2.13 the AI proposes, the
  author commits — selection-AI output is prose for the manuscript,
  never a canon mutation, so the 008/009 claim-rejection path does not
  apply (there is no CanonProposal here). Per §11, a selection-AI edit
  is an ordinary edit: new version, prior final-text receipts
  invalidated, publish gate re-arms.
- GAP-028 does not block this: selection AI rides the API-served
  `generate` (`services/ai.ts:579-640`, `manager.generate`), not the
  production worker. If no model is routed (`NoRouteError` → 409 per
  `ai.ts:636-637`), the card shows the actionable "no model
  configured" state — no retry loop, no silent failure.

### Invariant 5 — Autosave + version conflict: 007's contract, 015's honest conflict UI

The 007 autosave contract is kept: 1.5s debounce (`onInput`,
`index.vue:323-328`), `saveState` (`saved|dirty|saving|conflict`),
`expectedVersion` optimistic concurrency
(`saveChapterBody.expectedVersion`, `manuscript-routes.ts:30`), row
lock + in-transaction re-check
(`services/manuscript.ts:296-340`), 409 `{error:"CONFLICT"}`
(`platform-routes.ts:129-140`).

What 015 changes — the conflict path. 007's page resolves 409 by
refetching, silently dropping the author's unsaved text. 015 must not
do that:

- On 409 → `saveState = "conflict"` + `ConflictBanner` (banner, not a
  modal — the editor stays visible). Autosave pauses while conflicted;
  only explicit actions proceed.
- Three explicit actions: **Keep mine** — re-PUT the local HTML with
  the fresh server version as `expectedVersion` (overwrites; same
  `chapter:update` capability as save); **Load theirs** — discard local
  text and refetch (the old behavior, now an explicit choice);
  **Compare** — `DraftDiffView` with local HTML (stripped) as the
  draft and the server version as base. The banner persists until the
  author chooses; nothing auto-resolves.
- The published-chapter 409 is envelope-identical to the version
  conflict (`409 {error: "CONFLICT"}` — no message field), so the
  client disambiguates: on 409 the page refetches chapter status; if
  the chapter is PUBLISHED it shows the existing unpublish-first
  message (`chapters.blockedPublished`, en + id) — no banner, no
  keep-mine; otherwise it shows the conflict banner (F3).
- The ApplyBar stale-apply logic (007) is untouched: diff pinned at
  review time, 409 on apply handled there. 015's selection-AI
  stale-selection rule (Invariant 4) is the editor-side counterpart.
- Offline (Q3): no offline queue in 015. Network failure → `dirty` +
  `errors.saveFailed`, retry on next edit (007 behavior kept).

### Invariant 6 — Scene navigation (+ minimal scene CRUD, pending Q5)

GAP-052: `Scene` (`schema.prisma:325-344`) is schema-only — no app code
creates scenes. Scene navigation needs scenes to exist, so 015 includes
minimal scene CRUD (reviewer must confirm Q5):

- Additive routes under manuscript conventions
  (`manuscript-routes.ts`): `GET .../chapters/:chapterId/scenes`
  (ordered by `number`: `id, number, title, summary`), `POST`
  (create: `title` 1–200 chars required, `summary` optional,
  `number` defaults to max+1), `PATCH` (rename / re-summary / reorder
  — reorder is transactional, the chapter-number-swap precedent in the
  schema comment), `DELETE`. Capability `chapter:update`; Zod → 400;
  membership 404 gate; `@@unique([chapterId, number])` enforced.
- No scene content editing: scenes stay structural anchors with
  title/summary. Chapter content remains the editable unit; the
  "scene versions deferred" Phase 2 note stands.
- UI: the editor chrome shows the mockup's "Chapter N · Scene M"
  breadcrumb (`index.html:665-681`); `SceneNav` lists the active
  chapter's scenes (with summaries) plus adjacent chapters' scenes.
  Selecting a scene in another chapter switches chapters (existing
  `selectChapter`, dirty-flush kept); selecting a scene in the active
  chapter sets the breadcrumb. 015 does NOT do intra-document scroll
  targeting (Q4).

### Invariant 7 — Design: §15, no reinvention

`docs/design/writer-workspace` + `DESIGN-TOKENS.md` are the
foundational design (constitution §15). This task inherits: the
header/nav | editor | rail / footer grid (unchanged), the editor
toolbar and AI operation names (Invariant 3/4 — pinned from the
mockup), `--bg-0` editor well, `font-nf-literary` manuscript prose,
orange restricted to AI affordances with the sparkle glyph, the
`focus-visible:nf-focus` convention. Any intentional departure is a
documented author decision recorded with its scope before
implementation.

### Invariant 8 — i18n and accessibility

All new strings via `useLocale()` with `en` + `id` keys and English
fallback (project language rule). Toolbar buttons and the bubble menu
have accessible names; the bubble menu is Esc-dismissable with focus
return; the conflict banner uses `role="alert"`; the editor region is
labelled. New components get vitest-axe checks (the 014
`apps/web/a11y` precedent); the manual screen-reader pass follows
GAP-051's owner.

## Acceptance and verification

- [ ] Tiptap editor: the writer page renders chapter content in
      `RichEditor` (not the `<textarea>`); existing plain-text chapters
      load as paragraphs; bold/italic/H2/quote apply via the real
      toolbar; edits serialize to sanitized HTML on save.
- [ ] Content format: saved `ChapterVersion.content` contains only
      allowlisted tags (attempted `<script>`/event-handler injection
      is stripped server-side); `wordCount` counts words, not tags
      (`<p>a</p><p>b</p>` → 2) on BOTH the save path and the
      publication path (`resolvePublicChapter`); the 013 reader renders
      pinned HTML content as HTML and plain-text rows with the legacy
      paragraph split (F2).
- [ ] Selection AI: selecting text shows the bubble menu with the six
      pinned operations; each operation calls
      `POST .../generations` with its pinned `task` and
      `CREATIVE_WRITER` profile; the suggestion card streams the
      result; Accept replaces the selection, Insert after appends,
      Discard closes; AI output never writes without the author's
      Accept.
- [ ] Stale selection: with a save landing between selection and
      Accept such that the selected text no longer matches, Accept
      falls back to insert-after with the `aiAssist.staleSelection`
      notice (forced-race test).
- [ ] Autosave: 1.5s debounce, `saved|dirty|saving` states, and the
      `expectedVersion` contract unchanged from 007.
- [ ] Version conflict: two concurrent PUTs with the same
      `expectedVersion` → the loser sees the conflict banner (not a
      silent refetch); Keep mine overwrites with the fresh version;
      Load theirs refetches; Compare shows the diff; the banner
      persists until resolved; autosave pauses while conflicted.
      (Forced-race API test, 007 pattern.) A 409 on a PUBLISHED chapter
      shows the unpublish-first message with no banner and no keep-mine
      (F3).
- [ ] Scene CRUD + navigation: create/rename/reorder/delete scenes via
      the new routes (capability-gated, validated); the scene
      breadcrumb and navigator work across chapters; selecting another
      chapter's scene switches chapters with dirty-flush.
- [ ] Publish gate intact: a selection-AI edit creates a new version;
      publishing without re-review → 409 `REVIEW_STALE` (012 gate).
- [ ] 007 no-regression: generation loop, ApplyBar stale-apply,
      publish(), chapter list/switching all behave as before.
- [ ] Reader no-regression: published chapters render identically
      (HTML), no-oracle 404s unchanged, spoiler boundary intact.
- [ ] i18n: en + id keys for every new string; missing-key fallback.
- [ ] Full suites green: web (incl. new component tests), API
      (manuscript + ai + publication + reader + discovery),
      `pnpm e2e` (011) green; lint + tsc + vue-tsc clean.
- [ ] Q1–Q7 decided (§"Open questions" after review).

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

None — no schema changes. `ChapterVersion.content` keeps its type;
existing rows are untouched (no backfill); plain-text rows parse as
paragraphs and normalize to sanitized HTML on their next save (a new
version, as with any edit). The scene routes only add rows. Rollback is
removing the new components/routes (member manuscript behavior is
unchanged; the reader keeps rendering whatever is stored).

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; record
deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). NF-WF-017's contract takes §Invariant 2
(sanitized-HTML format, allowlist, strip rule) as frozen input.

List unknowns, blocked checks, observed versus inferred findings,
risks, and the next dependency-ready task (NF-WF-016 / NF-WF-017). Do
not claim full platform completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — HTML vs JSON content storage? (Recommendation: HTML.)**
  Tiptap supports both (`getHTML()`/`getJSON()`). HTML fits the Text
  column, stays human-readable in the DB, renders directly in the
  reader, and strips cleanly for the compiler/review. JSON is opaque
  to every existing consumer (reader paragraph split, word count,
  compiler, diff views).
- **Q2 — Which HTML sanitizer? (Recommendation: implementer picks
  between DOMPurify (isomorphic) and sanitize-html; reviewer verifies
  the choice and the Invariant 2 allowlist.)** No sanitizer exists in
  the repo today; the contract pins the allowlist, not the library.
- **Q3 — Offline editing queue? (Recommendation: no in 015.)** 007's
  dirty+retry covers transient failures. A real offline queue (IndexedDB,
  conflict reconciliation) is a separate task's scope.
- **Q4 — Intra-chapter scene scroll anchors? (Recommendation: no in
  015.)** Scene↔text offsets need a marker scheme in the HTML; 015's
  navigation is chapter-level with the breadcrumb. A follow-up can add
  anchors once scenes carry content positions.
- **Q5 — Scene CRUD in 015 vs a follow-up? (Recommendation: minimal
  CRUD in 015.)** GAP-052: without it, scene navigation is dead UI.
  The CRUD is deliberately minimal (title/summary/number only, no
  content, no versioning) to avoid scope creep.
- **Q6 — "Continue scene" insert position? (Recommendation: after the
  selection.)** The operation continues from the selected text; the
  card's Insert-after is the natural landing. Reviewer may prefer
  end-of-document.
- **Q7 — Tiptap v2 vs v3? (Reviewer decision: v3 stable — the author's
  v2 recommendation is FLIPPED, F1.)** The author's "v3 is beta/RC"
  premise was stale: Tiptap v3 went stable in 2025-07 (official
  stable-release notes; v3.29.0 by 2026-07; the official "Upgrade v2
  to v3" guide is current), and v2 is superseded with minimal
  maintenance capacity. 015 pins v3: the bubble menu comes from
  `@tiptap/vue-3/menus` with the `@floating-ui/dom` peer. The
  implementer pins the exact v3 patch and verifies the v3 Nuxt/Vue-3
  path; the diff reviewer verifies.

## Review record

Round 1 — 2026-10-06. Reviewer: separate actor from the contract
author and the future implementer (contract-reviewer subagent);
backend MODEL_UNVERIFIED per GAP-013. Verdict: APPROVE_WITH_FINDINGS
(all findings applied inline by the reviewer; no author rework
required).

### Findings

- F1 (P2) — Q7's factual premise was false ("v3 is beta/RC"): Tiptap
  v3 went stable in 2025-07 (official stable-release notes; v3.29.0 by
  2026-07; the official "Upgrade v2 to v3" guide is current) and v2 is
  superseded with minimal maintenance capacity. Decision FLIPPED to v3
  stable; Invariant 1, the package.json deps, Q7, and the UNVERIFIED
  note updated (bubble menu from `@tiptap/vue-3/menus` +
  `@floating-ui/dom` peer).
- F2 (P3) — the 013 reader's `v-html` rendering of pinned content had
  no rule for plain-text rows never re-saved in HTML (whitespace
  collapses under `v-html`). Pinned the dual-format rule: block-tag
  content → sanitized HTML; otherwise the legacy paragraph split with
  drop cap.
- F3 (P3) — the published-immutable 409 is envelope-identical to the
  version-conflict 409 (`{error: "CONFLICT"}`, no message field), so
  the contract's "keeps its existing message" was unimplementable as
  written. Pinned the disambiguation: on 409 refetch chapter status —
  PUBLISHED → existing `chapters.blockedPublished` message (en + id,
  verified in both locale files), no banner, no keep-mine; otherwise
  the conflict banner.
- F4 (P3) — the public route's `wordCount`
  (`resolvePublicChapter`, `services/publication.ts:843`, displayed in
  the 013 reader) duplicates the naive tag-counting split and would
  count HTML tags. Pinned the same strip rule there; added
  `services/publication.ts` to the allowed paths (tag-stripped
  `wordCount` only — no other lifecycle changes).
- F5 (P3) — the claim "the context compiler (003) and `reviewFinalText`
  (010) consume tag-stripped text" was an overclaim: verified against
  source, neither reads `ChapterVersion.content` prose today. Reworded
  to the observed truth; the canon-evidence and discovery-search HTML
  interactions are recorded as GAP-053 follow-ups, out of 015's scope.
- F6 (P3) — bogus citation "constitution §7.16" → "constitution
  §2.16" (No routine generation request may scan the entire
  manuscript).
- F7 (P3) — allowed paths now name the actual consumer files
  (`services/publication.ts`) and the shared strip helper's home
  (`services/manuscript.ts`).

### Q1–Q7 resolutions (decisions of record)

- Q1 — HTML — CONFIRMED. HTML fits the unchanged Text column, stays
  human-readable in the DB, renders directly in the 013 reader, and
  strips cleanly; JSON is opaque to every existing consumer.
- Q2 — sanitizer implementer-picks (DOMPurify or sanitize-html),
  reviewer verifies the Invariant 2 allowlist — CONFIRMED. The
  allowlist is pinned, so the choice is mechanical; the acceptance
  checkboxes cover injection-stripping.
- Q3 — no offline queue in 015 — CONFIRMED. 007's dirty+retry covers
  transient failures; a real offline queue is a separate task.
- Q4 — no intra-chapter scene scroll anchors in 015 — CONFIRMED.
  Scene↔text offsets need a marker scheme in the HTML; a follow-up
  adds anchors once scenes carry content positions.
- Q5 — minimal scene CRUD in 015 — CONFIRMED. GAP-052's dead-UI
  analysis is correct: scene navigation without scene creation is a
  decoration. The CRUD is deliberately minimal (title/summary/number
  only, no scene content, no versioning; reuses `chapter:update`; no
  new capabilities; no schema change), so scope stays tight. GAP-052
  closes when 015's scene routes + navigation verify.
- Q6 — "Continue scene" lands after the selection — CONFIRMED. The
  operation continues from the selected text; the card's Insert-after
  is the natural landing.
- Q7 — Tiptap v3 stable — FLIPPED (F1).

### Independent verification (reviewer, repo @ `baaeaa2`)

Checked: `schema.prisma:304` (content `@db.Text`), `:325-344` (Scene
model, `@@unique([chapterId, number])` at `:341`);
`manuscript.ts:4-6` (schema-only scene comment), `:126-128`
(countWords), `:296-340` (saveChapter optimistic concurrency + row
lock); `manuscript-routes.ts:28-32` (1M-char cap), `:103-120` (PUT
chapter); `platform-routes.ts:129-140` (409 `{error:"CONFLICT"}`
envelope, no message field — the basis of F3);
`ai-routes.ts:75-90` (generateBody), `:250-267` (generations POST),
`:269-335` (SSE stream); `ai.ts:636-637` (NoRouteError → 409);
`authorization.ts:25,34` (`chapter:update`, `generation:create`); the
007 writer page (`:323-328` debounce, `:355-365` 409→refetch dropping
local text — the defect 015's banner fixes, consistent with 007's
frozen "never clobber" invariant); the 013 reader `:43-48`
(paragraph split — basis of F2); `publication.ts:826-843`
(`resolvePublicChapter` wordCount on raw content — basis of F4);
`canon.ts:2562-2567` (evidence span verification reads raw content —
GAP-053); `public-discovery.ts:393-405` (full-text tsvector/headline
over raw content — GAP-053); `final-text-review.ts` (no
`ChapterVersion.content` read — basis of F5);
`design/writer-workspace/index.html:665-681` (toolbar B/I/H2/quote +
"Rewrite tone"; "Chapter 85 · Scene 1" breadcrumb) and all six AI
operation names; `tasks/NF-WF-007-writer-ui.md:330` (autosave
contract), `:407-411` (forced-race tests); DELIVERY-PLAN.md:149 (015
row); no `db.scene.create` in app code (GAP-052 confirmed); no
sanitizer or Tiptap dep in `apps/web/package.json` today;
`chapters.blockedPublished` present in both `en.ts:97` and `id.ts:97`;
Tiptap v3 stability re-verified via current web sources (basis of F1).
Trusted (author's spot-checks): `planning.ts:405-434` (sceneId on
outline nodes), `manuscript.ts:308/325` (published-immutable 409s),
`design/DESIGN-TOKENS.md` (orange restriction), 007 contract `:102`
and `:171`, `final-text-review.ts:247-266`.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-06 (repo @ `baaeaa2`). File:line references:

- Content column: `ChapterVersion.content String @db.Text` at
  `packages/database/prisma/schema.prisma:304`.
- Scene model: `model Scene` at `schema.prisma:325-344`
  (`@@unique([chapterId, number])` at `:341`); "Scene CRUD is
  schema-only in Phase 2 (no API yet)" at
  `apps/api/src/services/manuscript.ts:4-6`; no `db.scene.create` in
  app code (only generated-client docs); scene links from outline
  nodes at `apps/api/src/services/planning.ts:405-434`; no web UI
  references scenes (GAP-052, `ISSUES-AND-GAPS.md`).
- Save contract: `saveChapterBody.expectedVersion` at
  `apps/api/src/manuscript-routes.ts:30`; PUT chapter route at
  `:103-120`; `saveChapter` expectedVersion check at
  `apps/api/src/services/manuscript.ts:296-308`, row lock +
  in-transaction re-check at `:315-331`, published-immutable 409 at
  `:308`/`:325`; `countWords` at `:126-128`; 409
  `{error:"CONFLICT"}` mapping at
  `apps/api/src/platform-routes.ts:129-140`.
- Generations API: `POST /api/workspaces/:workspaceId/generations`
  at `apps/api/src/ai-routes.ts:250-267` (`generateBody`: task,
  profile, novelId, messages, temperature, maxTokens at `:75-90`);
  SSE stream at `:269-335` (abort on socket close); API-served
  `generate` via `manager.generate` at
  `apps/api/src/services/ai.ts:579-640`; `NoRouteError` → 409 at
  `:636-637` (not the production worker — GAP-028,
  `ISSUES-AND-GAPS.md:689`, is worker-only).
- Capabilities: `generation:create` at
  `packages/auth/authorization.ts:34`; `chapter:update` at `:25`.
- Writer page: `<textarea>` editor at `apps/web/app/pages/workspaces/
  [workspaceId]/novels/[novelId]/index.vue:612-621`; static B/I/H2
  toolbar at `:585-592`; 1.5s debounce `onInput` at `:323-328`;
  `saveNow` at `:330+`; 409 → refetch (silent local-text drop) at
  `:355-365`; publish() via the 012 release path (013 GAP-046).
- Design: editor section `data-od-id="manuscript-editor"` at
  `docs/design/writer-workspace/index.html:665`,
  `data-od-id="editor-toolbar"` at `:666`; toolbar B/I/H2/quote +
  "Rewrite tone" at `:665-681`; "Chapter 85 · Scene 1" breadcrumb,
  "● Saved · v12" status; AI operations "Ask the writing agent"
  (`:681`), "Continue scene" / "Expand selection" (`:700-701`),
  "More dialogue" / "Show, don't tell" (`:702-703`), each with the
  AI sparkle glyph. Orange restricted to AI affordances at
  `docs/design/DESIGN-TOKENS.md` ("Accent — orange (RESTRICTED)").
- 007 contract pins: 1.5s debounced autosave PUT
  (`tasks/NF-WF-007-writer-ui.md:102`), forced-race autosave-conflict
  and stale-apply tests (`:171`, `:407-411`), autosave contract
  (`:330`).
- Delivery plan: NF-WF-015 row at
  `docs/implementation/DELIVERY-PLAN.md:149` ("Tiptap or explicitly
  approved equivalent, selection AI, autosave/version conflict, scene
  navigation"; "final gate after 011").
- 013 reader: paragraph-split rendering at
  `apps/web/app/pages/read/[slug]/[number].vue:43-48` (replaced by
  Invariant 2); `reviewFinalText` takes `chapterVersionId` at
  `apps/api/src/services/final-text-review.ts:247-266`.
- Tiptap v2 stable / v3 beta status and the Nuxt install guide
  (`@tiptap/vue-3` `useEditor`/`EditorContent`, `getHTML()`/`setContent()`,
  client-only mounting) verified against tiptap.dev docs via web
  search on 2026-10-06 (v3 in beta/RC per the public roadmap
  discussion; official Nuxt guide documents the v-model
  getHTML/setContent pattern with the isSame guard).
  [SUPERSEDED by review round 1, F1: re-verification against current
  sources shows v3 went stable in 2025-07 and v2 is superseded; the
  contract now pins v3.]

UNVERIFIED: the exact Tiptap v3 patch version and sanitizer library
choice (implementer pins, reviewer verifies — Q2/Q7); the exact
selection-context char bounds (contract pins the ≤2_000/≤1_000 ceiling,
implementer may tighten); the `maxTokens` bound for selection requests
(contract pins ≤ 4_000 ceiling); scene-list ordering beyond
`number` ascending; the implementer's `DraftDiffView` reuse for the
Compare action (contract allows it, doesn't mandate it).
