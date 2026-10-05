# Task NF-WF-014: Browse/search/genre discovery and reading progress

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT
Milestone / capability IDs: M4 (public half completion); delivery-plan
NF-WF-014; completes the M4 minimum proof for the discovery path.
Implementer role / requested and resolved model: (separate actor from the
contract author and reviewer; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor from the
contract author and the implementer; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returns APPROVE (Q1–Q2/Q4–Q9 below are genuinely open tradeoffs
and must be resolved at review before implementation; Q3 resolved
2026-10-06 by Klein — see the Review record and Invariant 4; the
§"Open questions" wording is the author's recommendation and the
CONFIRMED resolutions are the decisions of record). Frozen review manifest / exact artifact paths and
identity: (filled at review). Baseline revision / local changes to preserve:
repo HEAD at review time. Engram checkpoint topic key / last confirmed
observation reference: (n/a)

## Normative vs informative

Normative: the public discovery routes and their exact response shapes,
the no-oracle rules (404 and empty search results), the published-only
visibility rule extended to listing/search, the spoiler boundary for
search snippets, the genre mechanism, the anonymous-progress model, the
accessibility audit standard and its concrete pass criteria, the design
requirement (§15), the i18n requirement, and the acceptance checkboxes.
Informative: rationale paragraphs, examples, and the §"Open questions"
recommendations (the question labels are normative — the recommendations
are the author's, for the reviewer to confirm or flip).

## Goal and reason

Complete M4's public half. NF-WF-012 built the release contract (the
`isPubliclyVisible` gate, the pinned content, the no-oracle semantics);
NF-WF-013 built the three anonymous reader routes and pages
(`GET /api/public/novels/:slug`, `.../chapters/:number`,
`.../authors/:authorId`; `/read/[slug]`, `/read/[slug]/[number]`,
`/read/authors/[authorId]`) with a deliberate no-listing, no-search,
no-progress boundary (013 Q1/Q7, owned by this task). This task builds
exactly what was deferred:

1. **Discovery** — an anonymous novel listing with genre facets and a
   published-only search, so a non-member reader can find a published
   novel without knowing its slug.
2. **Reading progress** — anonymous, device-local progress (where the
   reader stopped), with defined behavior when content is unpublished.
3. **The full accessibility/responsive audit** of the 013 reader pages
   plus the new discovery pages — this is a delivery-plan acceptance
   item ("accessible/responsive reader"), not a vibe; it gets a named
   standard and concrete pass criteria here.

The M4 minimum proof — "an unauthenticated/non-member reader can read
a published version; draft/future data remain inaccessible through
pages, search and AI" — is complete only when search and listing are
proven to exclude draft/future data as rigorously as the 013 routes do.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2.11 versioning/auditability,
  §2.18 server-side authorization, §10 development rules, §11
  Definition of Done, §15 Design system — the foundational design).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-014
  row `:148`; M4 milestone `:46` with the minimum proof; CAP-10 `:83`;
  CAP-12 `:85` — the reading-progress scope tension named in Q1).
- [NF-WF-012 contract](NF-WF-012-publication-release-contract.md) —
  `isPubliclyVisible`, the pinned `chapterVersionId` (Invariant 4),
  the no-oracle rule, Invariant 9 (visibility rule).
- [NF-WF-013 contract](NF-WF-013-public-reader-routes-ui.md) — the
  frozen input: the three public routes and their exact shapes,
  Invariant 2 (novel-first), Invariant 4 (spoiler boundary), Invariant
  5 (no-oracle 404), the "014 handoff" acceptance (Q1–Q7 decided).
- [Design tokens](../../docs/design/DESIGN-TOKENS.md) and the
  [writer-workspace design](../../docs/design/writer-workspace/index.html).
- Existing implementation: `apps/api/src/public-routes.ts`
  (`registerPublicReaderRoutes`, the route conventions this task
  extends), `apps/api/src/services/publication.ts` (`isPubliclyVisible`
  at `:757`, the novel-first helpers at `:774`/`:870`), `apps/api/src/
  services/platform.ts` (`listNovels` at `:515` — the member listing
  shape convention), `apps/api/src/app.ts` (route registration;
  rate limiter at `:162`), `packages/auth/authorization.ts`
  (`novel:update` at `:19` — the capability for the genre authoring
  route), `apps/web/app/pages/read/` (the three reader pages, all
  carrying `<meta name="robots" content="noindex">`), `apps/web/app/
  components/reader/ReaderChapterNav.vue`, `apps/web/app/composables/
  useLocale.ts` (localStorage precedent at `:41-58`), `apps/web/app/
  i18n/{en,id}.ts` (the `reader:` key section at `en.ts:182`).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
New database requirements are limited to: (a) the additive genre
column/migration (Invariant 4), (b) an additive GIN index for
tsvector search (Invariant 3) — both additive, no data rewrite. No
new services, no external search engine, no new npm workspace (Q2
recommends against it; the reviewer confirms).

## Dependencies and evidence

- NF-WF-012 (IMPLEMENTED): `Publication` model, `isPubliclyVisible`,
  the pinned `chapterVersionId`, no-oracle semantics.
- NF-WF-013 (IMPLEMENTED): the three public reader routes (frozen
  input — this task must not change their shapes), the reader pages
  (the a11y audit's subject), the no-search/no-listing/no-progress
  boundary this task lifts, the decided Q2 noindex posture (re-decided
  here in Q4).
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-049 (013's additive extensions — 014 must not silently extend
  the three 013 shapes further; any new field is a contract question).
- Scope tension (Q1): CAP-12
  (`docs/implementation/DELIVERY-PLAN.md:85`) places "reading
  progress" (with bookmark/follow/like/comment/notification) at
  M5/M8, while the NF-WF-014 row (`:148`) and 013's Q7 assign reading
  progress to this task. Q1 resolves which progress this task owns.

## Scope

### Allowed

- `apps/api/src/public-routes.ts`: extend with the discovery routes
  below (`GET /api/public/novels`, `GET /api/public/genres`,
  `GET /api/public/search`) — same conventions as the 013 routes
  (anonymous by construction, Zod → 400 INVALID_INPUT, app-wide error
  handler). A separate `public-discovery-routes.ts` module is also
  acceptable; the implementer chooses and pins it.
- `apps/api/src/app.ts`: register the new routes alongside
  `registerPublicReaderRoutes` (no auth object passed).
- `apps/api/src/services/publication.ts` (or a new
  `services/public-discovery.ts`): discovery query helpers —
  published-novel listing, genre facets, published-only search.
  Reuse `isPubliclyVisible` semantics; never re-implement a second
  visibility rule. Visibility filtering happens IN the SQL (the
  retrieval service's Invariant 3 precedent:
  `apps/api/src/services/retrieval.ts:15` — "Tenant and spoiler
  boundaries are enforced in the QUERY, not after it").
- Prisma schema: ONE additive migration — the genre column on
  `Novel` (Invariant 4) — plus the additive tsvector GIN index
  (Invariant 3). No other schema changes.
- A member genre-authoring route (e.g. `PATCH /api/workspaces/
  :workspaceId/novels/:novelId/genres` under the existing
  `novel:update` capability, `authorization.ts:19`) — the only member
  route this task touches. No other member UI changes.
- Web: `apps/web/app/pages/browse/index.vue` (new: discovery page),
  `apps/web/app/pages/browse/search.vue` (new: search page — or a
  search section within browse; the implementer chooses and pins it),
  `apps/web/app/components/discovery/` (novel card, genre facet
  chips, search box, "continue reading" section), `apps/web/app/
  composables/useReadingProgress.ts` (new: the localStorage progress
  model, Invariant 5).
- `apps/web/app/i18n/en.ts`, `id.ts`: discovery + progress locale
  keys (new `discover:` / `progress:` sections; the existing
  `reader:` section at `en.ts:182` stays).
- The a11y audit itself: new test deps if needed (Q9 recommends
  `vitest-axe` — jsdom + @vue/test-utils are already in
  `apps/web/package.json`), the audit checklist, and any fixes the
  audit finds in the 013 reader pages or the new pages (all following
  §15 design).
- Tests for all of the above (API route tests + web vitest tests,
  the 007 harness pattern); docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE
  workarounds).

### Forbidden

- Changing the three 013 route shapes or their no-oracle semantics —
  frozen input (GAP-049 is 013's recorded extension; 014 adds routes,
  not fields).
- Reader accounts, sign-in/up for readers, server-side progress
  storage, bookmarks/follows/likes/comments/notifications — the 019
  and M5/M8 surfaces (CAP-12). Anonymous progress is device-local
  only (Invariant 5).
- Public AI surfaces; retrieval/AI routes stay member-only (013
  Invariant 8, unchanged).
- Indexing draft, scheduled, unpublished, or archived content — the
  search corpus is PUBLISHED pins only (Invariant 3). No separate
  "search index" table that could drift from the Publication truth;
  the index is a functional GIN index on the pinned rows.
- New capabilities in `packages/auth/authorization.ts` — the genre
  route reuses `novel:update`.
- External search infrastructure (Elasticsearch, Meilisearch,
  Typesense) — Q2 recommends Postgres built-ins; the reviewer
  confirms. Superseded-public-version addressability (012 Q2: no).

### Inputs

- Discovery: `?q=` (search string), `?genre=` (taxonomy key),
  `?sort=recent|title|chapters`, `?limit=` (bounded, default 20, max
  50), `?cursor=` (opaque). No session, no credentials.
- Genre authoring: member session + `novel:update`; body
  `{ genres: [taxonomy keys] }`.
- Progress: no inputs cross the network — device-local only.

### Outputs

- `GET /api/public/novels`, `GET /api/public/genres`,
  `GET /api/public/search` (exact shapes below); the member genre
  route; the browse/search Nuxt pages + discovery components; the
  `useReadingProgress` composable; en/id locale keys; the a11y audit
  report (a checked-in checklist with per-page results, not a vibe).

### Out of scope (with follow-up owner)

- Reader accounts, synced progress, bookmarks/follows/likes/
  comments/notifications → NF-WF-019 (M5/M8 per CAP-12); 014's
  progress is anonymous and device-local only (Q1).
- SEO indexing of public pages → Q4 (product decision; 023/M8 may
  implement). 013's noindex stays until decided otherwise.
- CDN/edge caching of public content → 013 Q5 deferred; 023 owns
  production operations.
- Global (cross-workspace) novel slugs → 013 Q4, future task.
- Search over draft content for authors (member search) → the
  existing member retrieval path stays as-is; this task builds no
  member search.
- Full-text search in other languages → tsvector uses the `english`
  configuration (Q2); other languages are a future task.

## Behavior and invariants

### Invariant 1 — Public discovery surface: exactly three new routes with pinned shapes

All anonymous by construction (no auth object, no `requireActor`, no
401 path — the 013 convention). Zod validation → 400
`{error:"INVALID_INPUT"}`. These are the complete discovery surface;
a finding that discovery needs a fourth route stops the task for a
contract amendment.

- `GET /api/public/novels` → 200
  ```json
  { "novels": [ { "id": "uuid", "title": "string", "slug": "string",
                  "author": { "id": "uuid", "displayName": "string" },
                  "genres": ["fantasy"],
                  "publishedChapterCount": 12,
                  "firstPublishedAt": "ISO-8601",
                  "lastPublishedAt": "ISO-8601" } ],
    "page": { "cursor": "opaque|null", "hasMore": true } }
  ```
  `novels`: ACTIVE novels with ≥1 PUBLISHED publication only —
  the `isPubliclyVisible` rule lifted to the listing (Invariant 2).
  DRAFT/ARCHIVED novels and ACTIVE novels with zero PUBLISHED
  publications never appear. `publishedChapterCount` counts
  PUBLISHED publications. Optional filters: `?genre=<key>` (one
  taxonomy key), `?sort=recent|title|chapters`
  (default `recent` = `lastPublishedAt` desc; `title` = title asc;
  `chapters` = `publishedChapterCount` desc). Pagination is
  cursor-based (`?limit=` 1–50 default 20, `?cursor=` opaque);
  offset pagination is forbidden (it breaks under concurrent
  publishing — results shift between pages). Empty result →
  `200 { novels: [], page: { cursor: null, hasMore: false } }`
  (never 404 — an empty shelf is not an oracle).
- `GET /api/public/genres` → 200
  ```json
  { "genres": [ { "key": "fantasy", "count": 4 } ] }
  ```
  Facets for discovery: every taxonomy key (Q3) with the count of
  publicly-visible novels carrying it, ordered by count desc.
  Keys with zero public novels are omitted (a zero count would
  confirm the taxonomy key exists — harmless, but omission keeps
  the response minimal; the implementer pins the choice in the
  route docstring).
- `GET /api/public/search?q=...` → 200
  ```json
  { "results": [ { "type": "novel|chapter",
                   "novel": { "id": "uuid", "title": "string",
                              "slug": "string",
                              "author": { "id": "uuid",
                                          "displayName": "string" } },
                   "chapter": { "number": 3, "title": "string" } | null,
                   "snippet": "…matched text…" | null,
                   "rank": 0.87 } ] }
  ```
  `type=novel` hits return `chapter: null, snippet: null`;
  `type=chapter` hits return the chapter ref and a bounded snippet
  (Invariant 3). `?type=novel|chapter|all` (default `all`),
  `?limit=` 1–20 default 10. Empty `q` (after trim) → 400
  INVALID_INPUT; `q` longer than 200 chars → 400. No results →
  `200 { results: [] }` (never 404 — Invariant 3's no-oracle rule).

### Invariant 2 — Published-only: the 012 visibility rule extended to listing and search

```
publiclyListed(novel) :=
  novel.status = ACTIVE
  AND EXISTS Publication(novelId, status = PUBLISHED)
```

- The listing and genre facets return only `publiclyListed`
  novels. The filter is IN the SQL (`WHERE novel.status =
  'ACTIVE' AND EXISTS (SELECT 1 FROM publications WHERE
  novel_id = ... AND status = 'PUBLISHED')`) — never a
  post-filter of a ranked list (the retrieval service's Invariant
  3 precedent, `services/retrieval.ts:15`).
- The search corpus is PUBLISHED pins only: novel title/author
  matches join novels through the same predicate; chapter
  content/title matches join `chapter_versions` through
  `publications` with `status = 'PUBLISHED'` on the PINNED
  `chapterVersionId` (012 Invariant 4) — never
  `chapters.currentVersionId`. A chapter whose publication is
  SCHEDULED (not yet due), UNPUBLISHED, or whose novel is
  DRAFT/ARCHIVED is not in the corpus: it cannot match, it
  cannot appear in a snippet, and its non-appearance is
  indistinguishable from its nonexistence (Invariant 3).
- Unpublish/schedule behavior: the moment a publication leaves
  PUBLISHED, the chapter/novel vanishes from search and listing
  on the next query (no separate index to go stale — Invariant 3
  forbids a driftable index table).

### Invariant 3 — Search semantics: tsvector, pinned corpus, no oracle, bounded snippets

- Engine: PostgreSQL `tsvector` with the built-in `english`
  configuration and a GIN index (Q2's recommendation). Rationale:
  no new extension or service (pg_trgm is NOT installed on the
  project's Postgres — verified: only `vector 0.6.0` is present;
  installing pg_trgm would be new infrastructure), the corpus is
  the pinned rows themselves so the index cannot drift, and the
  query pattern (`plainto_tsquery` + `ts_rank`) is standard. The
  implementer creates ONE additive migration: functional GIN
  indexes over the searchable text — `to_tsvector('english',
  title)` on novels and `to_tsvector('english', content)` on
  chapter_versions. The pinned-publication join (`status =
  'PUBLISHED'` on the pinned `chapterVersionId`) is a query-time
  predicate, not part of the index — a functional index cannot
  span a join, and the Publication truth stays single because
  the indexes are functional (auto-maintained, no stored
  duplication). No stored generated column that duplicates
  content.
- What is searchable: novel titles, author displayNames, and the
  PINNED chapter titles + content. NOT searchable: synopses,
  outlines, canon facts, author notes, review receipts, workflow
  data, member emails, workspace names (the 013 spoiler boundary,
  unchanged). Search never returns a field the reader routes
  wouldn't show.
- Ranking: `ts_rank` desc, ties broken by `lastPublishedAt` desc
  (novels) / `publishedAt` desc (chapters). The `rank` field is
  exposed (0–1) so the UI can order stably; it is not a
  relevance promise beyond that.
- Snippets: `ts_headline` (or equivalent) over the PINNED
  content, max ~160 characters, match highlighted with `<mark>`
  (escaped HTML — the UI renders it as HTML from a trusted
  server source; the API must escape everything except its own
  `<mark>` tags). A snippet never crosses a chapter boundary and
  never includes text outside the pinned version.
- No-oracle: a search for a draft title, an unpublished chapter's
  distinctive phrase, or a SCHEDULED chapter's content returns
  `200 { results: [] }` — identical to searching for gibberish.
  No "did you mean", no suggestions derived from invisible
  content, no result counts that distinguish "no novels" from
  "novel exists but invisible". Timing: the query path is the
  same regardless of what is invisible (no early branches on
  novel existence).
- Rate limiting: the discovery routes inherit the app-wide limiter
  (`app.ts:162`, the 013 Q3 convention). `/api/public/search` is
  the heaviest public route; if load testing shows abuse, 023 may
  tighten it — 014 does not invent a second limiter now.

### Invariant 4 — Genre: author-set, fixed taxonomy, additive migration

- There is NO genre field on `Novel` today
  (`schema.prisma:164-172` — title, slug, status, createdById; no
  genre, no tags). The only "genre" data in the schema is the
  author's private writing preferences inside
  `NarrativeDnaProfile` (`schema.prisma:2332` — "genre/subgenre
  tags" as durable author preferences, interpreted by
  `packages/narrative-rhythm`). The DNA profile is NOT the
  discovery source: it is a private authoring preference, not a
  reader-facing facet, and exposing it would leak writing
  strategy.
- Mechanism (author recommendation, reviewer confirms in Q3):
  ONE additive migration adding `genres String[] @default([])`
  (Postgres `text[]`) to `Novel`; authors set it via a new member
  route `PATCH /api/workspaces/:workspaceId/novels/:novelId/
  genres` guarded by the existing `novel:update` capability
  (`packages/auth/authorization.ts:19`), body
  `{ genres: [<taxonomy keys>] }` (Zod: array of known keys,
  max 3 (**Klein's 2026-10-06 amendment: max 5, not 3 — see the amendment note at the top of this contract**), deduped; unknown keys → 400). The taxonomy itself is a
  single frozen constant in code (e.g.
  `apps/api/src/discovery/genres.ts` or in the service) with
  en/id labels in the i18n resources — the UI renders chips from
  it, never free text. Empty `genres` is valid (novel appears in
  listing/search, in no genre facet).
- The exact taxonomy list is Q3's product input; the mechanism
  above (column + capability-guarded route + frozen constant +
  max 5 (**Klein's 2026-10-06 amendment: max 5, not 3 — see the amendment note at the top of this contract**)) is normative. **Q3 RESOLVED 2026-10-06 by Klein**: the
  taxonomy is pinned in `docs/implementation/genre-taxonomy.md`
  (research + merges + EN/ID descriptions) with the 33 trope
  items analyzed one-by-one in
  `docs/implementation/trope-research.md` (none promoted to
  genre — verdicts 32 NO, 0 YES). The final canonical genre
  list (18, max 5/novel (**Klein's 2026-10-06 amendment: max 5, not 3 — see the amendment note at the top of this contract**)): `fantasy`, `high_fantasy`,
  `urban_fantasy`, `progression_fantasy`, `xianxia`, `wuxia`,
  `litrpg`, `science_fiction`, `romance`, `family`, `action`,
  `adventure`, `mystery`, `thriller`, `horror`, `historical`,
  `apocalypse`, `slice_of_life`. Klein's definitions are
  canonical: Transmigration = pindah tubuh DAN pindah zaman;
  Northern/Southern = regional setting-style facets (not
  genres). The member UI for setting genres is
  minimal (a multi-select on the novel settings surface reusing
  the §15 design) — 014 is not a settings-page redesign.

### Invariant 5 — Reading progress: anonymous, device-local, chapter-granular

- Model: NO server storage, NO reader accounts, NO cookies sent
  to the server (013 Invariant 9 stands; 019 owns accounts).
  Progress lives in `localStorage` (the `useLocale.ts:41-58`
  precedent: feature-detect `globalThis.localStorage`, try/catch
  around access, namespaced key `nf:reading-progress:v1`).
- What is stored, per novel slug:
  `{ chapterNumber, updatedAt }` — chapter granularity only.
  Scroll position is NOT stored (recommendation; reviewer
  confirms in Q5 — position tracking is heavier, less durable,
  and adds no acceptance value at this stage).
- Write path: the chapter page (`/read/[slug]/[number]`) writes
  the entry on successful load of a PUBLISHED chapter (after the
  200, never on 404). Read path: the browse page shows a
  "Continue reading" section from localStorage entries whose
  slug still resolves (lazy: resolve on render; entries that 404
  are dropped silently per the rule below). The novel page may
  show a "you stopped at chapter N" marker — same lazy rule.
- Unpublish behavior (normative): progress points at chapter
  NUMBERS, not pins. If the chapter is unpublished (or the novel
  archived), the chapter route 404s (013's no-oracle rule,
  unchanged). The progress UI must NOT distinguish "unpublished"
  from "never existed": on a 404 the entry is removed and the UI
  shows the generic not-found state ("This novel, chapter, or
  author is not publicly available." — the existing
  `reader.notFoundBody` key). No "this chapter was removed"
  message — that would be an oracle.
- Privacy: progress never leaves the device. No analytics
  events, no server logging of progress reads/writes, no
  fingerprinting. The contract's test suite asserts no network
  call is made by the progress composable.
- Multi-device: out of scope (no accounts — 019). The
  localStorage schema is versioned (`:v1`) so a future synced
  model can migrate it.

### Invariant 6 — Discovery pages: real data, en/id, noindex posture

- `apps/web/app/pages/browse/index.vue` — the discovery page:
  novel listing (novel cards: title, author byline, genres chips,
  published chapter count, last-published date), genre facet
  chips (from `GET /api/public/genres`), sort control, "continue
  reading" section (Invariant 5), loading / error / empty states.
  Links: card → `/read/[slug]`; facet → filtered listing.
- Search UI: a search box on the browse page (and only there —
  the 013 reader pages stay search-free) hitting
  `GET /api/public/search`; results grouped or marked
  novel-vs-chapter; chapter hits link to
  `/read/[slug]/[number]`; empty state for no results. Debounced
  input (≥300ms), min 2 chars before querying, Escape clears.
- i18n: all strings via `useLocale()` with en + id keys (new
  `discover:` and `progress:` sections); English fallback.
- SEO (Q4 decides; recommendation): keep
  `<meta name="robots" content="noindex">` on ALL public reader
  surfaces (the three 013 pages already carry it) until product
  approves indexing. The no-oracle boundary is still new; 014
  hardens discovery but indexing is a product decision for
  023/M8, not this task.
- The browse/search pages have no listing of drafts, no author
  tools, no AI content — they are reader surfaces under the
  same spoiler boundary as 013.

### Invariant 7 — Accessibility/responsive audit: WCAG 2.2 AA with concrete pass criteria

This is a delivery-plan acceptance item, so the audit is specified,
not vibed. Subject: the three 013 reader pages + the new browse
page + the search surface (page or section, per the implementer's
pinned choice in Invariant 6) + the new components.

- Standard: WCAG 2.2 AA. Tooling (Q9's recommendation): automated
  checks via `vitest-axe` (or `jest-axe`) added to the web
  devDependencies — it runs in the existing jsdom + @vue/test-utils
  harness (`apps/web/vitest.config.ts:14-16`) with zero new
  infrastructure; PLUS a checked-in manual checklist (keyboard-only
  pass, screen-reader pass, 200% zoom, reduced-motion) because axe
  cannot judge focus order, reading order, or meaning.
- Automated pass criteria (per page, en and id locales):
  zero `axe` violations at `wcag2aa` + `wcag22aa` rulesets;
  the audit test file is checked in and runs in CI (`pnpm
  --filter @novelforge/web test`).
- Manual checklist (checked in as `apps/web/a11y/AUDIT-014.md`,
  every box evidenced by the auditor, not assumed):
  1. Keyboard: every interactive element reachable and operable
     (chapter nav, genre chips, sort control, search box,
     pagination); visible focus on all (the `focus-visible:
     nf-focus` convention); no keyboard traps; skip-link to
     main content on every page.
  2. Screen reader (NVDA or VoiceOver — the auditor names the
     one used): page titles announced per page (`useHead`
     title); headings in order; chapter content readable as
     paragraphs (the 013 `<p>` split); search results announced
     as a list with result counts; `aria-current` on the active
     genre facet; loading and empty states announced
     (`aria-live="polite"`).
  3. Contrast: text/background pairs meet AA (the §15 tokens are
     designed AA — the audit verifies the reader/discovery pages
     don't introduce new pairs, e.g. in snippets or chips).
  4. Responsive: 360 / 768 / 1024 / 1440 px widths — no
     horizontal scroll, no clipped controls, chapter prose keeps
     readable measure, touch targets ≥ 44×44 px on coarse
     pointers, genre chips wrap.
  5. Motion/text: `prefers-reduced-motion` disables non-essential
     animation; 200% browser zoom keeps layout usable; `html
     lang` follows the active locale.
- Fixes: any audit failure in the 013 pages or the new pages is
  fixed in this task (all fixes follow §15). The audit report
  records the tool versions, the manual pass environment, and
  per-page results. A page that cannot be made to pass stops the
  task for a contract amendment (new GAP first) — it does not
  ship with known AA failures.

### Invariant 8 — Design: the foundational design, no exceptions

Constitution §15: `docs/design/writer-workspace` (+
`docs/design/DESIGN-TOKENS.md`) is the foundational design for
every UI surface. The browse/search pages, novel cards, genre
chips, search results, and the continue-reading section follow
the same design language the 013 reader pages were reworked to
(the 013 implementer report: literary serif titles, `.nf-overline`
11px/600/0.14em, manuscript prose 17.5px/1.85, 700px column,
stone surfaces, accent orange restricted to overline/active
states). New components (chips, cards, search box) extend the
token set; they do not invent a second visual language. The
a11y auditor (Invariant 7) also checks the new components
against the design doc, not just against WCAG.

### Invariant 9 — No accounts, no social, no synced progress

Readers stay anonymous. No sign-in/up, no server-side progress,
no bookmarks/follows/likes/comments/notifications (NF-WF-019;
CAP-12 at M5/M8). If a finding needs any of these, it stops the
task for a contract amendment (new GAP number first, per the
standing rule).

### Invariant 10 — No scope creep at the discovery boundary

The discovery routes serve published content only, with the
shapes above. A finding that discovery needs a new error code
beyond `NOT_FOUND`/`INVALID_INPUT`, a schema change beyond the
genre column + search index, or a fourth public route stops the
task for a contract amendment. The 013 route shapes are frozen
and untouched.

## Outputs

### HTTP routes

Public (anonymous, in `public-routes.ts` or a new
`public-discovery-routes.ts` — implementer pins the choice):

- `GET /api/public/novels` → 200 `{ novels, page }` (Invariant
  1 shape); query params `genre`, `sort`, `limit`, `cursor`
  (Zod-validated; invalid → 400 INVALID_INPUT).
- `GET /api/public/genres` → 200 `{ genres }` (Invariant 1).
- `GET /api/public/search` → 200 `{ results }` (Invariant 1);
  `q` required (empty → 400), `type`, `limit` validated.

Member (the only member route this task touches):

- `PATCH /api/workspaces/:workspaceId/novels/:novelId/genres` →
  200 `{ genres: [...] }`; requires `novel:update`
  (`authorization.ts:19`); body `{ genres: [keys] }` (max 3 (**Klein's 2026-10-06 amendment: max 5, not 3 — see the amendment note at the top of this contract**),
  known keys only; invalid → 400; unknown novel → 404; 403
  without capability — the existing member error conventions).

Service helpers (additive, in `services/publication.ts` or a new
`services/public-discovery.ts`): `listPublicNovels` (predicate +
filters + cursor pagination), `publicGenreFacets`, `searchPublic`
(tsvector over the pinned corpus), `setNovelGenres` (member,
capability-checked). All reuse the 012 visibility semantics;
the 012 predicates are reused, never re-implemented.

### Web UI

- `apps/web/app/pages/browse/index.vue`, `apps/web/app/pages/
  browse/search.vue` (or search-as-section — implementer pins),
  `apps/web/app/components/discovery/` (NovelCard, GenreChips,
  SearchBox, ContinueReading), `apps/web/app/composables/
  useReadingProgress.ts`.
- `apps/web/a11y/AUDIT-014.md` — the checked-in audit report
  (Invariant 7).
- i18n keys in `apps/web/app/i18n/en.ts` + `id.ts` (new
  `discover:` / `progress:` sections; `genre:` labels for the
  taxonomy).
- Any 013-page fixes the audit requires.

## Acceptance and verification

- [ ] Published-only listing: `GET /api/public/novels` returns
      only ACTIVE novels with ≥1 PUBLISHED publication; a novel
      with only DRAFT chapters, an ARCHIVED novel, and an ACTIVE
      novel whose chapters are all SCHEDULED are absent.
      `publishedChapterCount` counts PUBLISHED only.
- [ ] Genre facets: `GET /api/public/genres` counts only
      publicly-visible novels; `?genre=<key>` filters the
      listing to novels carrying that key.
- [ ] Search published-only: a distinctive phrase from a
      PUBLISHED chapter's pinned content matches; the same
      phrase after unpublish no longer matches; a distinctive
      phrase from a DRAFT chapter never matches; a SCHEDULED
      chapter's content never matches before its fire time.
- [ ] Search no-oracle: searching a draft novel's exact title,
      an unpublished chapter's distinctive phrase, and random
      gibberish all return the identical `200 { results: [] }`.
      Snippets come from pinned content only and never cross
      chapter boundaries; no invisible field (synopsis, canon,
      outline, email) appears in any result.
- [ ] Pagination/sort: cursor pagination returns stable pages
      across a concurrent publish (no duplicates/skips);
      `sort=recent|title|chapters` order as pinned; invalid
      params → 400 INVALID_INPUT.
- [ ] Anonymous by construction: all three discovery routes
      take no auth, have no 401 path, and return identical
      responses with and without a session cookie.
- [ ] Genre authoring: member with `novel:update` sets genres
      (max 3 (**Klein's 2026-10-06 amendment: max 5, not 3 — see the amendment note at the top of this contract**), known keys); without the capability → 403;
      unknown key → 400; the public listing reflects the change.
- [ ] Reading progress: chapter page writes
      `{chapterNumber, updatedAt}` to localStorage on 200 (never
      on 404); the browse page's continue-reading section lists
      entries; an entry whose chapter 404s is dropped and shows
      the generic not-found copy (no "removed" oracle); the
      composable makes zero network calls (asserted in tests);
      no progress data reaches the server (assert via request
      inspection in tests).
- [ ] Accessibility: zero axe violations (wcag2aa + wcag22aa)
      on all reader/discovery pages in en and id (the three 013
      reader pages plus the new browse page and the search
      surface — page or section, per the implementer's pinned
      choice in Invariant 6; checked-in tests, green in
      CI); the manual checklist (`apps/web/a11y/AUDIT-014.md`)
      is fully evidenced (keyboard, screen reader named,
      contrast, 360/768/1024/1440, reduced motion, 200% zoom,
      lang). No known AA failures ship.
- [ ] Responsive/design: the new pages follow §15 (auditor
      spot-checks against the design doc); no horizontal scroll
      at 360px; touch targets ≥44px.
- [ ] SEO posture: noindex meta present on all public reader
      surfaces (the three 013 pages already carry it; the new
      pages add it) — unless Q4 decides otherwise.
- [ ] i18n: all new strings via `useLocale`, en + id keys,
      English fallback; both locales verified in tests.
- [ ] No-regression: full API suite green; web suite green
      (existing 58 + new); 013's public-route tests green
      (14/14 — shapes untouched); `pnpm e2e` (011) green;
      publication tests (012) green; lint + tsc + vue-tsc clean.
- [ ] Migration: the genre column migration is additive and
      idempotent (re-runnable); the tsvector GIN migration is
      additive; rollback = drop index/column (documented, no
      data loss — both are derived/nullable).

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

- Additive migration 1: `Novel.genres String[] @default([])` —
  non-nullable with an empty-array default, backfill trivially
  empty; re-runnable
  (idempotent `ADD COLUMN IF NOT EXISTS` pattern per GAP-030).
- Additive migration 2: functional GIN index for tsvector search
  over the pinned corpus (no stored column, no data duplication).
- Rollback: drop the index, drop the column — no published data
  is lost (genres are author metadata, re-settable; the index is
  derived). The member publication lifecycle is untouched.

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; record
deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). The a11y audit report
(`apps/web/a11y/AUDIT-014.md`) is a first-class deliverable. The next
task in the plan after 014 is NF-WF-015 (rich editor); the 019 reader
social task consumes this task's anonymous-progress schema (`:v1`).

List unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task. Do not claim full platform completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — Reading-progress scope vs CAP-12 (Recommendation: 014 owns
  anonymous device-local progress only; account-synced progress stays
  M5/M8.)** CAP-12 (`DELIVERY-PLAN.md:85`) places "reading progress"
  (bundled with bookmark/follow/like/comment/notification) at M5/M8,
  while the NF-WF-014 row (`:148`) and 013's Q7 assign "reading
  progress" to this task. The consistent reading: 014 implements the
  anonymous, device-local, chapter-granular progress Invariant 5
  specifies (no accounts, no server, no social — the M4 "reader can
  resume" need); anything account-synced, bookmarked, followed, or
  social is 019/M5/M8 per CAP-12. If the reviewer disagrees (e.g.
  progress should wait entirely for 019), this task's title and the
  delivery plan need an author amendment — do not silently drop the
  acceptance item.
- **Q2 — Search engine: tsvector vs alternatives (Recommendation:
  Postgres tsvector + GIN, `english`, no new infrastructure.)**
  pg_trgm is NOT installed on the project's Postgres (only `vector
  0.6.0` verified); installing it is new infrastructure. A dedicated
  engine (Meilisearch/Typesense/Elasticsearch) is new infrastructure
  plus a sync pipeline that could drift from the Publication truth.
  tsvector is built-in, the corpus is the pinned rows (no drift),
  and scale is modest. Trigram/fuzzy matching and non-English
  configurations are deferred.
- **Q3 — Genre taxonomy: source and list (Recommendation: author-set
  via the new column; frozen taxonomy constant in code with en/id
  labels; the exact list is product input.)** The DNA profile is
  private authoring preference, not a discovery facet. **Q3
  RESOLVED 2026-10-06 by Klein** — see the Invariant 4 note
  above; the taxonomy is pinned in
  `docs/implementation/genre-taxonomy.md`, the trope analysis in
  `docs/implementation/trope-research.md`; the final canonical
  list is the 18 genres recorded there.
- **Q4 — SEO: keep noindex or index discovery? (Recommendation: keep
  noindex on all public reader surfaces until product decides.)**
  013's Q2 decided noindex as the conservative default for the new
  no-oracle boundary. 014 hardens discovery but indexing amplifies
  any boundary bug to crawlers; the index/noindex call is product's,
  implemented in 023/M8 at the earliest.
- **Q5 — Progress granularity: chapter vs scroll position
  (Recommendation: chapter only.)** Scroll position is heavier, less
  durable across devices, and adds no acceptance value now. A
  future task (019/M5) can extend the `:v1` schema.
- **Q6 — Listing sort options (Recommendation: `recent|title|
  chapters` as pinned.)** More sorts (most-read, trending) need
  analytics that don't exist and would leak reader behavior. Keep
  the three deterministic sorts.
- **Q7 — Search result grouping (Recommendation: flat ranked list
  with type markers, not grouped.)** Grouped (novels-then-chapters)
  vs interleaved is a UI judgment; flat with `type` markers is
  simpler and the UI can render group headers from it if wanted.
- **Q8 — Search snippet length and chapter-hit cap
  (Recommendation: ~160 chars; chapter hits capped by the same
  `limit`.)** Longer snippets risk over-exposure; the chapter page
  is one click away for full text.
- **Q9 — A11y tooling (Recommendation: add `vitest-axe` (or
  `jest-axe`) to web devDeps; manual checklist checked in.)**
  There is no Playwright/Cypress/axe in the repo today (verified:
  web devDeps are vitest + jsdom + @vue/test-utils only; `pnpm e2e`
  is the API-driven 011 loop). vitest-axe runs in the existing
  harness with no new infrastructure; automated checks alone are
  insufficient, hence the mandatory manual checklist. If the
  reviewer prefers a real-browser tool (Playwright + axe-core),
  that is new infrastructure and needs an author decision.

## Review record

(Reviewer: separate actor from the contract author and the future
implementer; backend MODEL_UNVERIFIED per GAP-013. The reviewer must
independently verify every backend claim in §"Backend verification"
below against source — file:line — and re-run the verification
commands they rely on. Q1–Q9 are genuinely open and must be resolved
at review before implementation.)

(Rounds to be filled by the reviewer.)

- **Round 1 verdict: APPROVE_WITH_FINDINGS** (reviewer, separate
  actor, 2026-10-06, backend MODEL_UNVERIFIED per GAP-013). All
  normative backend claims independently re-verified file:line at
  repo `e0f433e`; normative judgments: spoiler boundary sound,
  anonymous progress sound, a11y acceptance genuinely testable,
  genre design sound; Q1 scope split (anonymous device-local
  progress in 014, account-synced in 019) judged legitimate — no
  delivery-plan amendment needed. 4 P3 mechanical findings fixed
  inline by the reviewer (line-ref drifts, 6-vs-5 page wording,
  column nullability wording, GIN-index wording). **Q3 taxonomy
  RESOLVED 2026-10-06 by Klein** (see Invariant 4 note):
  Transmigration = pindah tubuh DAN pindah zaman (his definition
  canonical); Northern/Southern = regional setting-style facets;
  33 trope items analyzed one-by-one in
  `docs/implementation/trope-research.md` (32 distinct, none
  promoted to genre); final canonical 18-genre list pinned in
  `docs/implementation/genre-taxonomy.md`. Reviewer judgment on
  the readiness header's Q1–Q7 note: Q1–Q9 stay open as decided
  except Q3 resolved.

- **Amendment 2026-10-06 (Klein): max genres per novel is 5, not
  3.** This supersedes the contract's "max 3" everywhere it is
  pinned (Invariant 4, the Zod validation, the UI multi-select,
  i18n copy, tests). The mechanism (column + capability-guarded
  route + frozen constant) is unchanged; only the limit changes.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-06 (repo @ `e0f433e`). File:line references:

- Delivery plan: NF-WF-014 row at
  `docs/implementation/DELIVERY-PLAN.md:148` ("Browse/search/genre
  discovery and reading progress", "Published-only results, stable
  reader boundary, accessible/responsive reader"); M4 milestone at
  `:46` (minimum proof); CAP-10 at `:83` (browse/search/genres M4);
  CAP-12 at `:85` (reading progress bundled with social at M5/M8 —
  the Q1 tension).
- 013 frozen input: `registerPublicReaderRoutes` at
  `apps/api/src/public-routes.ts:50`; the three routes at
  `:57` (novel), `:74` (chapter), `:98` (author), through the end
  of the file (`:114`); service helpers
  `resolvePublicNovelBySlug` / `listPublishedChapters` /
  `resolvePublicChapterNovelFirst` / `resolvePublicAuthor` in
  `apps/api/src/services/publication.ts` (`:774`, `:870` novel
  findMany sites); `isPubliclyVisible` at `:757`.
- 012 predicates: `isPubliclyVisible` (`:757`);
  `resolvePublicChapter` pin-based (013 contract verified at
  012's `publication.ts:684-713`, repo @ `3c57739`).
- Schema: `Novel` (`title` :168, `slug` :169, `status` :170,
  `createdById` :171) at `packages/database/prisma/schema.prisma:
  164-172`; NO genre/tags field on Novel (verified absent);
  `@@unique([workspaceId, slug])` at `:207`; `NovelStatus`
  (DRAFT, ACTIVE, ARCHIVED) at `:24-28`; `User.displayName`
  (required) at `:41`; `Publication` model at `:2787-2799`
  (`chapterVersionId` pinned, `onDelete: Restrict`); 
  `PublicationStatus` (SCHEDULED, PUBLISHED, UNPUBLISHED) at
  `:2781-2785`; `ChapterVersion` (`content` Text :299,
  `wordCount` :300) at `:293-303`; `NovelSettings.settings` Json
  at `:218-225` (created only — `platform.ts:404` — no update
  route exists); `NarrativeDnaProfile` genre/subgenre as private
  author JSONB prefs at `:2328` (doc comment block `:2328-2334`); tsvector precedent
  on research notes (`content_ts` :1037, GIN note :1044).
- Retrieval spoiler/tenant precedent: "boundaries enforced in
  the QUERY, not after it" at
  `apps/api/src/services/retrieval.ts:15`; the service is
  member-only (013 verified `requireActor` → 401).
- Member listing convention: `listNovels` at
  `apps/api/src/services/platform.ts:513` (findMany +
  orderBy createdAt, maps id/workspaceId/title/slug/status).
- Capabilities: `novel:update` at
  `packages/auth/authorization.ts:19`.
- Rate limiter: registered at `apps/api/src/app.ts:162`
  (`@fastify/rate-limit` import at `:13`).
- Postgres extensions on localhost: only `vector 0.6.0`
  (verified via `\dx`) — pg_trgm is NOT installed.
- Web: reader pages at `apps/web/app/pages/read/[slug].vue`,
  `apps/web/app/pages/read/[slug]/[number].vue`,
  `apps/web/app/pages/read/authors/[authorId].vue`; all carry
  `<meta name="robots" content="noindex">` (verified in each
  page's `useHead`); `ReaderChapterNav.vue` at
  `apps/web/app/components/reader/`; NO browse page exists;
  localStorage precedent at
  `apps/web/app/composables/useLocale.ts:41-58`; i18n `reader:`
  section at `apps/web/app/i18n/en.ts:182`; vitest jsdom harness
  at `apps/web/vitest.config.ts:14-16`; NO axe/Playwright/Cypress
  in web devDependencies (verified); `pnpm e2e` =
  `pnpm --filter @novelforge/api e2e`.
- Design: constitution §15 (AGENTS.md/CLAUDE.md) — foundational
  design `docs/design/writer-workspace` + DESIGN-TOKENS.md.
- 013 contract: `tasks/NF-WF-013-public-reader-routes-ui.md`
  (Q1 no listing — 014 owns; Q2 noindex until 014/product
  decides; Q7 no progress — 014 owns; "014 handoff" acceptance).

UNVERIFIED: the implementer's choice
between extending `public-routes.ts` vs a new
`public-discovery-routes.ts` module (pinned as their choice);
search-as-page vs search-as-section on the browse UI (their
choice); the manual screen-reader environment (the auditor
names it in AUDIT-014.md); whether `genres` should also surface
in the 013 novel/author shapes (recommendation: yes, additive
on the listing shapes pinned here — the 013 shapes stay
frozen; if the reviewer wants genres on the 013 novel page
shape, that is a GAP-recorded amendment, not a silent
extension).
