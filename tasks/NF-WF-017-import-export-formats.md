# Task NF-WF-017: All retained import/export formats

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: REVIEW_PENDING
Milestone / capability IDs: M5 (CAP-13); delivery-plan NF-WF-017
Implementer role / requested and resolved model: (separate actors per child; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor from the contract author and each implementer; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returns APPROVE (Q1–Q8 confirmed as decided, recorded in the
Review record; the §"Open questions" wording is the author's
recommendation and the CONFIRMED resolutions are the decisions of
record).
Frozen review manifest / exact artifact paths and identity: reviewed file is
`tasks/NF-WF-017-import-export-formats.md` at repo HEAD `98a32fe`
(2026-10-06); the only other changed file in this round is
`docs/implementation/ISSUES-AND-GAPS.md` (GAP-053 owner pin).
Baseline revision / local changes to preserve: repo HEAD at review time
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Normative vs informative

Normative: the child-task split (017A/017B/017C — scope, inputs, outputs,
acceptance, and the completion rule), the retained format inventory
(CAP-13), the per-format normalization and size/type-validation pins,
the Invariant-2 frozen HTML input, the no-automatic-canon-promotion rule
(Invariant 4), the GAP-053 closure pins (Invariant 3), the Import/Export
UI surface pins, the i18n/a11y rules, the forbidden paths, and the
acceptance checkboxes. Informative: rationale paragraphs, library-choice
discussions, and the §"Open questions" recommendations (the question
labels are normative — the recommendations are the author's, for the
reviewer to confirm or flip).

## Goal and reason

Complete the retained import/export formats of CAP-13. Today the platform
imports only plain-text Markdown/TXT and exports only Markdown, with no
author-facing UI at all (verified: no web component references the
import/export routes — the only `import/export` hits under `apps/web`
are Nuxt build cache). The delivery-plan acceptance is: "Per-format
fixtures, source normalization, size/type validation, no automatic canon
promotion". The retained formats are TXT/Markdown/PDF/DOCX import and
TXT/Markdown/PDF/DOCX/EPUB export (CAP-13; the original formats spec
`docs_compare/docs/specs/04-reader-publishing.md:27-41` agrees, adding
that "imports should be treated as source material until normalized and
approved").

Per the delivery plan's structural rule (lines 160-162), this row's first
contract splits the work into independently reviewable child tasks before
any coding. 017 is complete only when all three required children are
complete.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2 invariants, §11 Definition
  of Done, §13 evidence/issues, §15 design system).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (CAP-13 at
  `:86`; NF-WF-017 row at `:151`; the split rule at `:160-162`; M5 at
  `:47` and `:210-211`).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md) — the
  claim-rejection invariant (rejected/superseded/unsupported claims never
  elevated; Invariant 3) and the CanonProposal → approval → minted-fact
  flow.
- [NF-WF-015 contract](NF-WF-015-rich-editor-scenes.md) — Invariant 2
  (sanitized-HTML format, allowlist, strip rule) is 017's FROZEN input;
  Invariant 5 (conflict), and the reader dual-format rule (F2).
- Existing implementation: `apps/api/src/manuscript-routes.ts`
  (`importBody` at `:229-235`, import route at `:268-287`, export route
  at `:289-303`), `apps/api/src/services/manuscript.ts`
  (`importChapters` at `:592-718`, `exportNovel` at `:721-743`,
  `stripHtmlTags` at `:174-179`, `sanitizeChapterHtml` at `:203-208`).
- GAP-053 in [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md)
  (both downstream HTML interactions, with the closure check).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
New npm dependencies in `apps/api` (PDF/DOCX text extraction, document
generation — implementer picks per child, reviewer verifies) via the
workspace's pnpm; no new infrastructure, no new services.

## Dependencies and evidence

- NF-WF-009 (IMPLEMENTED): the canon proposal/approval flow and the
  claim-rejection invariant — 017's no-automatic-canon-promotion rule
  rests on it.
- NF-WF-015 (IMPLEMENTED): the sanitized-HTML format, allowlist,
  strip rule, and reader dual-format — 017's frozen input.
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-053 (owned by 017C — see Invariant 3), GAP-061 (owned by 017A —
  `importChapters` bypasses Invariant-2 sanitization; recorded BEFORE
  this contract, per the standing rule).

## Child-task split

The three children below are the only authorized decomposition. Each
child is independently reviewable and independently implementable; a
child's diff review verifies only that child's spec plus the shared
Invariants (4–7). **NF-WF-017 is complete only when 017A, 017B, and 017C
are all diff-reviewed and verified** — no partial completion counts.

### NF-WF-017A — Import normalization (all four retained import formats)

Bounded scope: extend `importChapters` from TXT/Markdown to
TXT/Markdown/PDF/DOCX with a unified normalization pipeline, fix
GAP-061, add the author-facing import UI.

Inputs: source files/streams in the four retained import formats;
author-supplied paste fallback. Outputs: DRAFT chapters, one version
each, `note: "import"`, content in the frozen sanitized-HTML format,
word counts computed with the strip rule — never canon facts.

Acceptance (all testable):
- [ ] Each retained import format (TXT, Markdown, PDF, DOCX) has a
      real in-repo fixture file and an end-to-end import test asserting
      chapters created, DRAFT status, one version each, `note:
      "import"`.
- [ ] Imported content is normalized to sanitized HTML through the
      SAME sequence as `saveChapter` (sanitize → strip → count);
      GAP-061 closes on a test asserting `<script>`/event-handler/non-
      allowlist markup in an import payload lands sanitized with a
      tag-stripped word count.
- [ ] Size/type validation per format (MIME allowlist, magic-byte
      sniffing, byte caps within the route's `IMPORT_BODY_LIMIT`,
      decompression-bomb limits for ZIP-based formats); oversized or
      mistyped files are rejected with actionable 400s, never
      partially imported.
- [ ] No automatic canon promotion: no import triggers extraction;
      imported chapters are DRAFT; a canon fact minted from imported
      text goes only through the 008/009 proposal→approval flow
      (Invariant 4).
- [ ] Import keeps its HIGH classification: PRE_MUTATION checkpoint,
      `advanceForMutation`, atomic single transaction, audit
      `chapters.imported` — unchanged from the frozen path.
- [ ] Import dialog UI on the writer page: file picker, format
      detection, paste fallback, per-format errors, success report.

### NF-WF-017B — Export formats (all five retained export formats)

Bounded scope: extend `exportNovel` from Markdown-only to
TXT/Markdown/PDF/DOCX/EPUB, plus the export UI.

Inputs: the frozen sanitized-HTML chapter content (current versions,
ordered). Outputs: downloadable whole-novel files in the requested
format with correct filename, content-type, and content-disposition.

Acceptance (all testable):
- [ ] Each retained export format (TXT, Markdown, PDF, DOCX, EPUB)
      has a real in-repo fixture and a test asserting the produced
      file parses/validates in its format and contains the novel's
      chapters in order.
- [ ] `GET .../export?format=` route: `md` (default, backward
      compatible with the frozen route), `txt`, `docx`, `pdf`,
      `epub`; unknown format → 400; member `chapter:read` gate and
      tenant isolation unchanged.
- [ ] Export is an author surface: it exports the author's own
      chapters (including drafts — the frozen `chapter:read` scope),
      never the public reader's published-only view; no capability
      changes.
- [ ] Sync download with a pinned byte cap; exports beyond the cap
      are refused with an actionable error (async export jobs are a
      follow-up, Q8).
- [ ] Round-trip: TXT/Markdown exports re-import as the same
      chapters (order, titles, prose intact).
- [ ] Export picker UI on the writer page: format selection,
      download action, error states.

### NF-WF-017C — HTML-consumer alignment (GAP-053 closure)

Bounded scope: pin the two downstream HTML interactions recorded in
GAP-053 against a defined HTML/strip contract, with tests. This child
writes no new user-facing surface.

Inputs: the frozen strip rule (`stripHtmlTags`) and allowlist.
Outputs: strip-aware evidence-span verification and strip-aware
discovery search.

Acceptance (all testable):
- [ ] Canon evidence: `resolveSourceEvidence`
      (`services/canon.ts:2645-2672`) verifies spans/quotes against
      tag-stripped text through the shared strip rule; spans stay
      raw-content offsets in storage with a documented offset mapping;
      `canon-applications.ts:1227`'s `.includes(firstQuote)` pin
      becomes strip-aware. Tests: quotes split by inline tags
      (`<strong>the</strong> dark forest` vs "the dark forest") verify
      and pin correctly.
- [ ] Discovery search: `services/public-discovery.ts:393-405`
      builds `to_tsvector`/`ts_headline` on stripped content — no
      tag lexemes (`strong`, `blockquote`) in the index, no raw tags
      in snippets. Tests: HTML fixture chapters rank and snippet
      correctly.
- [ ] GAP-053 closes on the tests above plus the documented
      HTML/strip contract (its recorded closure check).

## Format inventory (retained, from CAP-13)

The retained list is authoritative from the delivery plan's capability
ledger (CAP-13 at `DELIVERY-PLAN.md:86`) and the original formats spec
(`docs_compare/docs/specs/04-reader-publishing.md:27-41`). Dropping any
retained format requires an explicit author decision recorded with its
scope — never a silent omission.

| Format | Import (today) | Import (017) | Export (today) | Export (017) |
|---|---|---|---|---|
| TXT | ✅ (`format: "txt"`) | ✅ 017A | ❌ | ✅ 017B |
| Markdown | ✅ (`format: "md"`) | ✅ 017A | ✅ (existing route) | ✅ 017B (kept, `?format=md` default) |
| PDF | ❌ | ✅ 017A (new) | ❌ | ✅ 017B (new) |
| DOCX | ❌ | ✅ 017A (new) | ❌ | ✅ 017B (new) |
| EPUB | n/a (export-only) | n/a | ❌ | ✅ 017B (new) |

## Scope

### Allowed

- 017A: `apps/api/src/services/manuscript.ts` (`importChapters` and a
  new `import-normalize.ts` helper module), `apps/api/src/
  manuscript-routes.ts` (import route body schema + multipart), new
  `apps/web/app/components/import-export/ImportDialog.vue` (+ tests),
  in-repo import fixtures (`apps/api/test-fixtures/import/`), the
  `apps/api/package.json` extraction deps.
- 017B: `apps/api/src/services/manuscript.ts` (`exportNovel` and a new
  `export-render.ts` helper module), `apps/api/src/
  manuscript-routes.ts` (export route `?format=`), new `apps/web/app/
  components/import-export/ExportPicker.vue` (+ tests), in-repo export
  fixtures (`apps/api/test-fixtures/export/`), the `apps/api/
  package.json` document-generation deps.
- 017C: `apps/api/src/services/canon.ts` (evidence-span verification),
  `apps/api/src/services/canon-applications.ts` (fact-source pin),
  `apps/api/src/services/public-discovery.ts` (tsvector/headline),
  `packages/story-intelligence/canon.ts` (span helpers — additive
  only, never changing `verifySpan`'s frozen bounds semantics),
  HTML fixture rows in the existing test DBs (no fixtures on disk
  needed beyond what the tests build).
- `apps/web/app/i18n/en.ts`, `id.ts`: import/export locale keys
  (all children).
- Tests for all of the above; docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE
  workarounds).

### Forbidden

- Schema changes or migrations — none are needed (imports write
  chapters/versions; exports read).
- New capabilities — 017 reuses `chapter:create` (import),
  `chapter:read` (export), `canon:read/manage` (017C evidence paths);
  the membership tenant gate (404 for non-members) is unchanged.
- Changing chapter-splitting semantics for the frozen md/txt import
  paths (ATX `#`/`##`, TXT `===` rule) — 017A extends the format list,
  not the splitting contract.
- Automatic canon extraction or promotion on import — Invariant 4.
- Export of another tenant's data, or export through the public
  reader routes (export stays a member surface).
- Async export-job infrastructure — Q8.
- Chapter-range or single-chapter export — whole-novel only in 017;
  follow-up (Q6).
- Any change to the release lifecycle, the 012 publish gate, the 013
  reader rendering, the ApplyBar, or the 015 editor/autosave/conflict
  behavior.

### Inputs

- 017A: source documents (TXT/Markdown/PDF/DOCX) as file bytes (Q1:
  multipart vs client-side extraction) or pasted text (the frozen
  JSON `{text, format}` shape stays for paste).
- 017B: the frozen sanitized-HTML `ChapterVersion.content`
  (current versions, ordered).
- 017C: the frozen `stripHtmlTags` rule and allowlist; existing
  evidence/discovery call sites.

### Outputs

- 017A: DRAFT chapters (one version each, `note: "import"`,
  sanitized-HTML content, strip-based word counts) + the Import
  dialog.
- 017B: whole-novel files in the requested format (correct
  filename, content-type, content-disposition) + the Export picker.
- 017C: strip-aware evidence verification and discovery search +
  the documented HTML/strip contract.

### Out of scope (with follow-up owner)

- Import of non-retained formats (EPUB import, HTML import, RTF) →
  follow-up or explicit author decision.
- Async/background export jobs → future task (Q8).
- Chapter-range export → future task (Q6).
- Automatic canon extraction from imports → never (constitution
  §2.13); the 008/009 proposal flow is the only path (Invariant 4).
- Upload/normalization semantics for reference ingestion (016 Q7)
  → 016's follow-up; 017's import is manuscript-only.

## Behavior and invariants

### Invariant 1 — 017A: import normalization

Every import, in every format, ends in the frozen 015 content format:

- **TXT** (frozen semantics kept): chapter splitting on the `===`
  setext rule (`manuscript.ts:632-642`); prose → paragraphs →
  `sanitizeChapterHtml` → `countWords(stripHtmlTags(...))`.
- **Markdown** (frozen semantics kept): ATX `#`/`##` chapter
  splitting (`:625-631`); inline markdown converts ONLY to allowlist
  constructs (headings → `h2`, `**`/`__` → `strong`, `*`/`_` → `em`,
  `>` quotes → `blockquote`, lists → `ul`/`ol`/`li`, `---` → `hr`);
  everything else (code fences, links, images, tables) degrades to
  plain text — never to non-allowlist tags. The result passes
  `sanitizeChapterHtml` like every other write.
- **PDF** (new): text extracted per page (implementer picks the
  library; reviewer verifies). Page breaks do NOT create chapters.
  Chapter splitting reuses the TXT `===` underline rule on the
  extracted text (Q: heuristics for heading detection stay the
  implementer's, reviewer-verified); the whole document with no
  detectable chapters becomes one chapter. Scanned/image-only PDFs
  are rejected with an actionable "no extractable text" error — no
  OCR in 017.
- **DOCX** (new): text extracted from paragraphs; Word heading
  styles (Heading 1/2) map to chapter titles/`h2`; tables, images,
  footnotes, comments, and tracked changes are dropped with an
  import notice listing what was skipped (Q5). Result passes the
  same sanitize sequence.
- **The write** (GAP-061 fix): `importChapters` MUST write versions
  through the same sequence as `saveChapter` (`manuscript.ts:394-397`):
  `sanitizeChapterHtml` BEFORE the version insert, `wordCount` on
  tag-stripped text. No import path may write raw content.
- **Size/type validation** (acceptance-pinned): MIME allowlist
  `text/plain`, `text/markdown`, `application/pdf`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.
  document`; magic-byte sniffing (never extension alone); per-format
  byte caps within the route's `IMPORT_BODY_LIMIT` (15_000_000,
  `manuscript-routes.ts:64`); decompression-bomb limits for ZIP-based
  formats (ratio + entry-count caps, implementer pins, reviewer
  verifies). Violations → 400 `INVALID_INPUT` with an actionable
  message (en/id via the error contract); the import stays atomic —
  no partial chapters on failure.
- **Transport** (Q1): the paste path keeps the frozen JSON
  `{text, format}` shape (`manuscript-routes.ts:229-235`). The file
  path is decided in review (recommendation: multipart).
- **Kept from the frozen path**: HIGH classification, PRE_MUTATION
  checkpoint + `advanceForMutation` in the same transaction
  (`manuscript.ts:656-673`), single-transaction atomicity, novel-row
  lock, `expectedHeadRevisionId` CAS, audit `chapters.imported`.
- **UI**: `ImportDialog.vue` on the writer page — file picker, format
  detection (with manual override), paste tab, per-format error
  messages, a success report (chapters created + what was skipped).
  No import UI exists today; this is not API-only work.

### Invariant 2 — 017B: export formats

- **Source**: `exportNovel` (`manuscript.ts:721-743`) — current
  versions, ordered ascending, member `chapter:read` scope. 017B
  keeps this source contract; it changes only the rendering.
- **Route**: `GET /api/workspaces/:workspaceId/novels/:novelId/export`
  gains `?format=md|txt|docx|pdf|epub`; `md` is the default and the
  frozen shape (existing tests keep passing); unknown format → 400
  `INVALID_INPUT`. Content-disposition filename keeps the
  slug-sanitized stem (`manuscript.ts:740-742`) with the
  format-appropriate extension; content-type per format.
- **Renderers** (HTML → format; implementer picks the document
  libraries, reviewer verifies):
  - TXT: tag-stripped text, blank-line paragraphs, chapter headings
    in the setext form the frozen TXT importer splits on: the
    `{n}. {title}` line followed by an `===` underline
    (`manuscript.ts:632-642`); no `---` separators (the importer
    treats `---` as content, `:638-640`). Prose headings render as
    plain lines. The frozen md-style `# N. Title` + `---` export
    shape does NOT re-import as chapters under the TXT rule, so it
    is not the TXT export shape (review F1).
  - Markdown: the frozen shape extended — chapters as `# N. Title`
    (the only ATX level the importer may treat as a chapter
    boundary); prose `h2` renders as bold (`**text**`), NOT `## `
    (the frozen md importer splits ATX `#`/`##` into chapters,
    `:625-631` — emitting prose `##` breaks the pinned round-trip;
    review F1); `blockquote` → `> `, `strong` → `**`, `em` → `*`,
    list items → `- `, `hr` → `---`.
  - DOCX: a real `.docx` — chapter titles as Heading styles,
    prose paragraphs from the HTML blocks.
  - PDF: a paginated `.pdf` — chapter-per-section layout from the
    HTML blocks.
  - EPUB: a valid EPUB — one XHTML content document per chapter,
    OPF manifest + NCX/nav, novel title metadata.
- **Size validation**: a pinned sync-download byte cap
  (implementer pins, reviewer verifies); beyond the cap the route
  refuses with an actionable error. Whole-novel only (Q6); no
  chapter-range export in 017.
- **Round-trip**: TXT/Markdown exports must re-import as the same
  chapters (order, titles, prose) — the acceptance test for the
  md/txt pair.
- **UI**: `ExportPicker.vue` on the writer page — format selection,
  download action, loading/error states, per-format size notice.

### Invariant 3 — 017C: HTML-consumer alignment (GAP-053 closure)

- **Canon evidence (GAP-053 item 1)**: `resolveSourceEvidence`
  (`services/canon.ts:2645-2672`) verifies spans and quotes against
  **tag-stripped** text using the shared `stripHtmlTags` rule.
  Spans stay raw-content offsets in storage (no migration, no
  rescoring of existing rows); the contract pins a documented
  offset-mapping rule between raw offsets and stripped text
  (implementer designs, reviewer verifies). The
  `canon-applications.ts:1227` `.includes(firstQuote)` pin becomes
  strip-aware. Tests: a quote split by inline tags
  (`<strong>the</strong> dark forest` vs "the dark forest") verifies
  and pins correctly; a quote genuinely absent still fails.
- **Discovery search (GAP-053 item 2)**:
  `services/public-discovery.ts:393-405` builds
  `to_tsvector('english', ...)` and `ts_headline('english', ...)`
  on **stripped** content — tags are never index lexemes and never
  appear in snippets. Mechanism (Q7 decision of record): SQL-side
  `regexp_replace` strip — migration-free, per the §Forbidden list;
  the reviewer verifies correctness AND measures the cost against
  the 011 fixture scale. A stored/generated stripped column is an
  explicit 023/024 performance follow-up (schema change, needs an
  ADR). Tests: HTML fixture chapters rank correctly and snippets
  contain no raw tags.
- GAP-053's closure check (documented HTML/strip contract + tests)
  is this child's acceptance.

### Invariant 4 — No automatic canon promotion (cross-cutting)

- Imported chapters land as **DRAFT**, one version each,
  `note: "import"` — the frozen service contract
  (`manuscript.ts:587-591`) and its test (`manuscript.test.ts:457`).
  Imports are source material until normalized and approved (the
  original formats spec).
- **No import triggers extraction.** Any canon fact derived from
  imported prose enters only through the 008 CanonProposal →
  approval flow (`approveProposal` mints one CanonFact,
  `services/canon.ts:1178`); per 009's Invariant 3 and constitution
  §2.13, rejected/superseded/unsupported claims are never elevated —
  an import cannot promote its own claims.
- Tests per child: importing a document containing claim-like prose
  creates zero CanonFacts and zero CanonProposals.

### Invariant 5 — The 015 HTML format is frozen input (cross-cutting)

NF-WF-015's Invariant 2 is restated here as frozen input — 017 does
not redefine it:

- `ChapterVersion.content` is sanitized HTML; allowlist `p, h2,
  blockquote, strong, em, ul, ol, li, hr, br` — no attributes, no
  `script`/`style`/`iframe`, no event handlers, no `h1`
  (`services/manuscript.ts:182-208`; Q2 decision of record:
  `sanitize-html`).
- The shared strip rule: each tag replaced with a space (no word
  fusion), then `countWords` (`:174-179`).
- The 013 reader's dual-format rule stands: block-tag content
  renders as sanitized HTML (`read/[slug]/[number].vue:68,138`),
  plain-text rows keep the legacy paragraph split.
- 017A's normalization MUST produce content that the 013 reader
  recognizes as HTML (block tags present), the word counts must
  match the `saveChapter` rule, and exports must render identically
  to the reader's HTML path.

### Invariant 6 — i18n and accessibility

All new strings via `useLocale()` with `en` + `id` keys and English
fallback. The import dialog and export picker have accessible names,
keyboard-dismissable dialogs with focus return, and progress/error
states announced. New components get vitest-axe checks (the 014/015
precedent).

### Invariant 7 — Design: §15, no reinvention

`docs/design/writer-workspace` + `DESIGN-TOKENS.md` are the
foundational design (constitution §15). The import/export UI inherits
the writer workspace chrome, dialog conventions, and the AI-orange
restriction (import/export are not AI affordances — no orange).

## Acceptance and verification

Per-child acceptance is in the child split above. Whole-017 acceptance:

- [ ] NF-WF-017A acceptance complete (6 checkboxes).
- [ ] NF-WF-017B acceptance complete (6 checkboxes).
- [ ] NF-WF-017C acceptance complete (3 checkboxes).
- [ ] All retained formats have real in-repo fixtures (4 import +
      5 export); every fixture is exercised by a test.
- [ ] GAP-053 CLOSED (017C); GAP-061 CLOSED (017A).
- [ ] No-automatic-canon-promotion evidenced per child (zero
      CanonFacts/CanonProposals from an import, extraction never
      triggered).
- [ ] 007/015 no-regression: writer page, editor, autosave, conflict
      banner, ApplyBar, publish(), chapter list/switching behave as
      before.
- [ ] Reader no-regression: published chapters render identically,
      no-oracle 404s unchanged, spoiler boundary intact.
- [ ] i18n: en + id keys for every new string; missing-key fallback.
- [ ] Full suites green: web, API, `pnpm e2e` (011) BASELINE-OK;
      lint + tsc + vue-tsc clean.
- [ ] Q1–Q8 decided (§"Open questions" after review).

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

None — no schema changes. Imports only add chapter/version rows (the
frozen atomic path); exports read. 017C changes no stored data (spans
stay raw-content offsets). Rollback is removing the new routes,
components, and helpers; imported chapters remain ordinary DRAFT
chapters and stay editable.

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; record
deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). Each child closes with its own review
record in its handoff; 017's contract carries the parent review.

List unknowns, blocked checks, observed versus inferred findings,
risks, and the next dependency-ready task (NF-WF-018). Do not claim
full platform completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — File upload transport: multipart or client-side extraction?
  (Recommendation: multipart.)** Server-side parsing keeps
  size/type validation authoritative (the acceptance demands it);
  client-side extraction would let a hostile client bypass MIME,
  magic-byte, and decompression-bomb checks. Adds `@fastify/
  multipart` to `apps/api` (new dep, reviewer verifies).
- **Q2 — Export route shape: `?format=` param or per-format routes?
  (Recommendation: `?format=`, default `md`.)** One route keeps the
  frozen member gate and tenant isolation in a single place; the
  existing tests (no param → markdown) keep passing unchanged.
- **Q3 — Normalize md/txt imports to HTML, or keep plain-text
  storage for them? (Recommendation: normalize ALL formats to
  sanitized HTML.)** Invariant 5 demands one content contract;
  plain-text rows would fork the reader, word counts, and exports
  into two code paths. The 015 contract's plain-text→HTML judgment
  call (`plainTextToHtml` on editor load) already establishes the
  normalization direction.
- **Q4 — Which PDF text-extraction library? (Recommendation:
  implementer picks; reviewer verifies.)** Criteria: pure-JS/Node,
  no native binaries, bounded memory on large PDFs, text with
  positional/paragraph info. Pinned in 017A's review.
- **Q5 — DOCX complex structures: how much fidelity?
  (Recommendation: text + headings only; tables/images/footnotes
  dropped with a per-import skip notice.)** Full DOCX fidelity is a
  document-conversion product, not a manuscript importer; the
  notice keeps the author informed without silent data loss.
- **Q6 — Export scope: whole novel only, or chapter ranges?
  (Recommendation: whole novel only in 017.)** Range export needs
  selection UI and partial-publication semantics; a follow-up owns
  it.
- **Q7 — Discovery strip mechanism: SQL-side strip or stored
  stripped column? (Decision of record: SQL-side `regexp_replace`
  strip.)** A stored/generated stripped column is a schema change,
  and the §"Forbidden" list pins "no schema changes" — the option
  is not available inside 017. The implementer uses the SQL-side
  strip; the reviewer verifies correctness AND measures the cost
  against the 011 fixture scale. The stored column is an explicit
  023/024 performance follow-up requiring an ADR (review F2).
- **Q8 — Large exports: sync download only, or async jobs?
  (Recommendation: sync with a pinned byte cap; async jobs are a
  follow-up.)** 2,500-chapter novels will exceed any sane sync cap;
  the follow-up designs the job (progress, resume, retention) once
  real sizes are measured.

## Review record

(Reviewer: separate actor from the contract author and the future
implementers; backend MODEL_UNVERIFIED per GAP-013.)

### Round 1 — 2026-10-06 — verdict: APPROVE_WITH_FINDINGS

Reviewed `tasks/NF-WF-017-import-export-formats.md` (DRAFT) against the
delivery-plan NF-WF-017 row (`:151`), CAP-13 (`:86`), the child-split
structural rule (`:160-162`), the constitution (AGENTS.md), the task
template, and the frozen 009 (Invariant 3) and 015 (Invariant 2)
contracts. Backend claims spot-checked independently against HEAD
`98a32fe` (~30 claims: CAP-13 inventory, both format-spec sources,
import/export routes, `importChapters` GAP-061 write, sanitize/strip
helpers, save-path sequence, export service + shape, 009 Invariant 3,
reader dual-format, all four GAP-053 call sites, `approveProposal`,
`IMPORT_BODY_LIMIT`, multipart absence, no web UI for import/export,
test-file claims; the remainder trusted from the author's
verification). All 3 findings were fixed inline in this round; no
contract rewrite by the author was needed.

**Findings fixed inline (all in the contract file unless noted):**

- **F1 (P2) — Export shapes broke the pinned round-trip.** Invariant 2
  pinned TXT export with `# N. Title` headings + `---` separators and
  Markdown export with prose `h2` → `## `. Neither survives the
  frozen importers: the TXT importer splits only on the `===` setext
  rule (`manuscript.ts:632-642`; `# ` lines are prose, `---` "must
  stay content" per the comment at `:638-640`), and the md importer
  splits ATX `#`/`##` (`:625-631`) — so a prose `##` heading becomes
  a chapter on re-import. The 017B round-trip acceptance (same
  chapters: order, titles, prose intact) was unsatisfiable with both
  shapes. Fixed: TXT export now emits chapter headings in the setext
  form the TXT importer understands (`{n}. {title}` line + `===`
  underline, no `---` separators); Markdown export keeps `# N. Title`
  for chapters and renders prose `h2` as bold (`**text**`), never
  `## `. The prose-h2→bold rendering is the honest fidelity price of
  the round-trip pin.
- **F2 (P3) — Q7's recommendation contradicted the Forbidden list.**
  Q7 offered the implementer a choice between SQL-side strip and a
  stored stripped column, but a stored column is a schema change and
  the §"Forbidden" list pins "no schema changes" — the option was
  not legally available. Fixed: Q7 is now a decision of record
  (SQL-side `regexp_replace` strip; reviewer measures cost against
  the 011 fixture scale); the stored column is an explicit 023/024
  performance follow-up requiring an ADR. Invariant 3's discovery
  bullet was updated to match.
- **F3 (P3) — GAP-053's status still named the 015-era owner**
  ("a follow-up task under NF-WF-017's orbit"). Fixed:
  `docs/implementation/ISSUES-AND-GAPS.md` now pins the owner as
  NF-WF-017C.

**Q1–Q8 decisions of record:**

- Q1 multipart — **CONFIRMED** (server-side validation must be
  authoritative; client-side extraction would bypass MIME,
  magic-byte, and decompression-bomb checks).
- Q2 `?format=`, default `md` — **CONFIRMED** (single member gate,
  backward compatible; existing no-param tests keep passing).
- Q3 normalize all formats to sanitized HTML — **CONFIRMED** (one
  content contract per Invariant 5; two storage paths would fork the
  reader, word counts, and exports).
- Q4 PDF library — **CONFIRMED** (implementer picks, reviewer
  verifies; criteria pinned).
- Q5 DOCX fidelity text+headings with skip notice — **CONFIRMED**
  (full DOCX fidelity is a document-conversion product; the notice
  prevents silent data loss).
- Q6 whole-novel export only — **CONFIRMED** (range export is a
  follow-up).
- Q7 SQL-side strip — **DECIDED** (F2; not the author's
  recommendation).
- Q8 sync download with pinned byte cap — **CONFIRMED** (async jobs
  are a follow-up).

**Independent verification (checked vs trusted):**

Checked (~30 claims, HEAD `98a32fe`): CAP-13 `:86` inventory
(TXT/Markdown/PDF/DOCX import; TXT/Markdown/PDF/DOCX/EPUB export);
`docs_compare/docs/specs/04-reader-publishing.md:27-41` (same lists
plus "imports should be treated as source material until normalized
and approved"); split rule `:160-162`; `importBody` `:229-235`,
import route `:268-287`, `IMPORT_BODY_LIMIT = 15_000_000` `:64`,
export route `:289-303`; `importChapters` `:592-718` incl. the
GAP-061 raw write `:690-696` (`content: part.content.trim()`,
`wordCount: countWords(part.content)`), the frozen md/txt split
rules `:625-642`, atomic transaction + PRE_MUTATION checkpoint +
`advanceForMutation` `:654-673`, audit `chapters.imported`
`:708-716`, "NOT canon" comment `:587-591`; `exportNovel` `:721-743`
(md-only shape); `sanitizeChapterHtml` + allowlist `:182-208`,
`stripHtmlTags` `:174-179`, save-path sequence `:394-397`;
`approveProposal` mints one CanonFact `:1178`; 009 Invariant 3
`:254-263`; reader dual-format (`read/[slug]/[number].vue:68,138`,
allowlist `:73`); GAP-053 call sites — `resolveSourceEvidence`
`canon.ts:2645-2672` (`verifySpan` `:2655`, quote check `:2657`),
`verifySpan` bounds-only `story-intelligence/canon.ts:308`,
`canon-applications.ts:1227` `.includes(firstQuote)`,
`public-discovery.ts:393-405` raw-content tsvector/headline;
multipart absent from `apps/api/package.json` and app code; no
import/export UI exists in `apps/web` (grep); import/export tests
`manuscript.test.ts:431-540` (DRAFT + `note: "import"` at
`:457-459`); GAP-061 recorded BEFORE the contract
(ISSUES-AND-GAPS.md:1518) with 017A ownership and a closure check.
Trusted from the author's verification: exact 015-contract Invariant
2 internal line refs, PDF/DOCX library candidates, EPUB validation
tooling, per-format byte-cap numbers.

No new GAPs were needed this round. The implementer traps are all
pinned: the round-trip-safe export shapes (F1), the Q7 SQL-side strip
(F2), the GAP-053 owner (F3), `mode=AUTHOR` analogs where applicable,
and the one-backend-addition-per-child discipline.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-06 (repo @ `98a32fe`). File:line references:

- Retained formats: CAP-13 at
  `docs/implementation/DELIVERY-PLAN.md:86` ("TXT/Markdown/PDF/DOCX
  import; TXT/Markdown/PDF/DOCX/EPUB export; original formats");
  the original formats spec at
  `docs_compare/docs/specs/04-reader-publishing.md:27-41` (same
  lists, plus "imports should be treated as source material until
  normalized and approved").
- Split rule: `docs/implementation/DELIVERY-PLAN.md:160-162`.
- Import route: `importBody` (text ≤5_000_000 chars, format
  `md|txt`) at `apps/api/src/manuscript-routes.ts:229-235`;
  `POST .../chapters/import` at `:268-287`;
  `IMPORT_BODY_LIMIT = 15_000_000` at `:64`.
- `importChapters` at `apps/api/src/services/manuscript.ts:592-718`:
  `chapter:create` gate at `:601`; `assertHeadExpectation` at
  `:605-609`; md ATX split at `:625-631`; txt `===` split at
  `:632-642`; atomic single transaction at `:654`; PRE_MUTATION
  checkpoint + `advanceForMutation` at `:656-673`; version write at
  `:690-696` (`content: part.content.trim()`,
  `wordCount: countWords(part.content)` — the GAP-061 bypass);
  audit `chapters.imported` at `:708-716`; "NOT canon" comment at
  `:587-591`.
- `exportNovel` at `:721-743`: `chapter:read` gate, ordered
  current-version content, `# N. Title` + `---` shape, slug-
  sanitized filename at `:740-742`; route at
  `manuscript-routes.ts:289-303` (content-disposition +
  `text/markdown`).
- 015 frozen input: `sanitizeChapterHtml` + allowlist at
  `services/manuscript.ts:182-208`; `stripHtmlTags` at `:174-179`;
  save-path sequence at `:394-397`; reader dual-format at
  `apps/web/app/pages/read/[slug]/[number].vue:68,138` (reader
  allowlist mirrored at `:73`).
- No import/export UI exists today: no web component references the
  import/export routes (grep over `apps/web` finds only Nuxt build
  cache) — verified 2026-10-06.
- 009 machinery: `approveProposal` mints one CanonFact at
  `services/canon.ts:1178`; Invariant 3 (rejected/superseded/
  unsupported claims never elevated) in
  `tasks/NF-WF-009-revision-derived-memory.md:254-263`.
- GAP-053: `resolveSourceEvidence` at
  `services/canon.ts:2645-2672` (`verifySpan` at `:2655`, quote
  check at `:2657`); `verifySpan` bounds-only at
  `packages/story-intelligence/canon.ts:308`;
  `canon-applications.ts:1227` `.includes(firstQuote)` pin;
  discovery tsvector/headline at
  `services/public-discovery.ts:393-405`.
- Multipart: no `@fastify/multipart` in `apps/api/package.json`
  or app code — verified absent 2026-10-06.
- Existing import/export tests: `apps/api/src/manuscript.test.ts`
  `:431-540` ("import/export" describe; DRAFT + `note: "import"`
  assertion at `:457-459`; tenant isolation 404).

UNVERIFIED: exact PDF heading-detection heuristics (implementer
pins, reviewer verifies — the contract only requires the TXT `===`
rule as the splitting basis); the DOCX/PDF/EPUB library choices
(implementer picks, reviewer verifies — Q4/Q-reviewer); the exact
per-format byte caps (implementer pins within `IMPORT_BODY_LIMIT`,
reviewer verifies); the 017C offset-mapping design (implementer
designs, reviewer verifies); EPUB validation tooling choice
(implementer picks).
