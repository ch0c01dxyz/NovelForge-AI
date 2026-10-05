# Task NF-WF-013: Public reader/novel/author routes and UI

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: DRAFT
Milestone / capability IDs: M4 (reader half); delivery-plan NF-WF-013
Implementer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (separate actor; backend MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returns APPROVE (Q1–Q7 confirmed as decided, recorded in the
Review record; the §"Open questions" wording is the author's
recommendation and the CONFIRMED resolutions are the decisions of
record). Frozen review manifest / exact artifact paths and
identity: (filled at review). Baseline revision / local changes to preserve:
repo HEAD at review time. Engram checkpoint topic key / last confirmed
observation reference: (n/a)

## Normative vs informative

Normative: the public API routes and their exact response shapes, the
no-oracle 404 rule, the visibility/draft-exclusion/spoiler-boundary rules,
the anonymous access model, the tenant-separation behavior, the GAP-046
migration and its 409 branches, the search/AI exclusion rule, the i18n
requirement, and the acceptance checkboxes. Informative: rationale
paragraphs, examples, and the §"Open questions" recommendations (the
question labels are normative — the recommendations are the author's,
for the reviewer to confirm or flip).

## Goal and reason

Give NovelForge a real public reader: an unauthenticated (or non-member)
reader can open a published novel, read its published chapters, navigate
between them, and see the author's public page — while draft, scheduled,
unpublished, and archived content stays invisible through pages, search,
and AI (the M4 minimum proof: "an unauthenticated/non-member reader can
read a published version; draft/future data remain inaccessible through
pages, search and AI").

This is the reader-facing half of milestone M4. NF-WF-012 built the
release contract (Publication rows, `isPubliclyVisible` /
`resolvePublicChapter` predicates, no-oracle 404 semantics, the
`readerVisible` spoiler-boundary primitive) and explicitly did NOT build
`/api/public` routes — this task implements exactly the shapes 012
pinned, plus the reader UI. This task also owns GAP-046: migrating the
NF-WF-007 novel page's publish action to the release path
(`POST .../publication/publish`) with wired 409 branches.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2.11 versioning/auditability,
  §2.18 server-side authorization, §11 Definition of Done).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-013
  row; M4 minimum proof; CAP-10).
- [NF-WF-012 contract](NF-WF-012-publication-release-contract.md) — the
  frozen input: §"Contract with NF-WF-013" (public API shapes),
  Invariant 4 (version pinning), Invariant 9 (visibility rule), the
  `isPubliclyVisible` / `resolvePublicChapter` service functions,
  GAP-046 (novel page publish migration, owned by 013).
- [NF-WF-007 contract](NF-WF-007-writer-ui.md) — the novel page whose
  `publish()` action this task migrates.
- [NF-WF-011 contract](NF-WF-011-author-preview-e2e.md) — the
  author-preview loop (no-regression acceptance).
- Existing implementation: `apps/api/src/services/publication.ts`
  (`isPubliclyVisible`, `resolvePublicChapter`), `apps/api/src/
  publication-routes.ts` (route conventions; "No public reader routes
  here — those are NF-WF-013's"), `apps/api/src/app.ts` (route
  registration), `apps/api/src/platform-routes.ts` (error handler),
  `packages/story-intelligence/events.ts` (`readerVisible`),
  `apps/api/src/services/canon.ts` (READER no-oracle precedent),
  `apps/api/src/retrieval-routes.ts` / `ai-routes.ts` (member-only
  precedents), `apps/web/app/pages/workspaces/[workspaceId]/novels/
  [novelId]/index.vue` (the 007 novel page), `apps/web/app/composables/
  useApi.ts` (ApiError envelope), `apps/web/app/i18n/{en,id}.ts`.

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
No new infrastructure: public routes are ordinary Fastify routes on the
existing app; the web UI is ordinary Nuxt pages on the existing app.

## Dependencies and evidence

- NF-WF-012 (IMPLEMENTED): `Publication` model, `isPubliclyVisible`,
  `resolvePublicChapter`, the member publication routes, the pinned
  public API shapes (§"Contract with NF-WF-013" — frozen input).
- NF-WF-007 (IMPLEMENTED): the novel page whose `publish()` action is
  migrated (GAP-046).
- NF-WF-011 (IMPLEMENTED): the `pnpm e2e` author-preview loop — the
  no-regression acceptance re-runs it (the loop publishes via PATCH and
  stays green; GAP-046's decision keeps it untouched).
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-046 (owned by this task — novel page publish migration),
  GAP-040 (cross-branch as-of — publication pins the head revision;
  040 stays open and orthogonal).

## Scope

### Allowed

- `apps/api/src/public-routes.ts` (new): anonymous public reader routes
  under `/api/public/…`, same conventions as `publication-routes.ts`
  (Zod validation → 400 INVALID_INPUT; uuid/slug params; the app-wide
  error handler in `platform-routes.ts` — this module never registers a
  second one).
- `apps/api/src/app.ts`: register the public routes (no auth object
  passed; they are anonymous by construction).
- `apps/api/src/services/publication.ts`: small additive helpers if
  needed to serve the pinned shapes (e.g. a `resolvePublicNovel`
  returning the novel + its PUBLISHED chapter list); no changes to the
  release lifecycle.
- `apps/web/app/pages/read/[slug].vue` (new): public novel page.
- `apps/web/app/pages/read/[slug]/[number].vue` (new): public chapter
  reading page.
- `apps/web/app/pages/read/authors/[authorId].vue` (new): public author
  page.
- `apps/web/app/components/reader/` (new): small reader components
  (chapter navigation; novel/author headers as needed) following the
  007 component pattern.
- `apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/
  index.vue`: migrate `publish()` to the release path (GAP-046) + 409
  branches. No other changes to the author UI.
- `apps/web/app/i18n/en.ts`, `id.ts`: reader + publish-409 locale keys.
- Tests for all of the above (API route tests + web vitest tests,
  following the 007 harness); docs updates (progress.md, CURRENT.md,
  test-matrix.md, ISSUES-AND-GAPS.md for deviations BEFORE workarounds).

### Forbidden

- Public search or browse/discovery UI and any `/api/public/search`
  endpoint — owned by NF-WF-014 ("Published-only results"). The reader
  UI has no search box.
- Reader accounts, sign-in/up for readers, reading progress storage,
  bookmarks/follows/likes/comments — NF-WF-019 owns reader social;
  NF-WF-014 owns reading progress. Readers are anonymous, full stop.
- Public AI surfaces (chat with the story, "ask about this chapter") —
  AI routes stay member-only.
- Changes to the release lifecycle, review gate, versioning, canon,
  memory, or compiler semantics.
- New capabilities in `packages/auth/authorization.ts` — public routes
  need none (anonymous).
- Superseded-public-version addressability (012 Q2: decided no) —
  stays out.

### Inputs

- Novel `slug` (workspace-scoped, `@@unique([workspaceId, slug])`,
  `schema.prisma:207`); chapter `number` (positive int); author user id
  (uuid). No session, no credentials.
- Member side (GAP-046): the existing novel page context (workspace,
  novel, chapter ids).

### Outputs

- `GET /api/public/novels/:slug`, `GET /api/public/novels/:slug/
  chapters/:number`, `GET /api/public/authors/:authorId` (exact shapes
  below); three Nuxt reader pages + reader components; en/id locale
  keys; the migrated novel-page publish action.

### Out of scope (with follow-up owner)

- Public novel listing / browse / search / genres / discovery →
  NF-WF-014.
- Reading progress → NF-WF-014.
- Reader accounts and social features → NF-WF-019.
- SEO strategy (index vs noindex) → Q2, product decision (014/023 may
  implement).
- CDN/edge caching of public content → Q5, future task.
- Global (cross-workspace) novel slugs → Q4, future task.

## Behavior and invariants

### Invariant 1 — Public API surface: exactly the 012 shapes, plus two pinned additive extensions

012 pinned these shapes and said "013 must implement exactly these
shapes; any deviation is a contract violation". This contract implements
them verbatim, with two ADDITIVE extensions (flagged for reviewer
scrutiny — all 012-pinned fields are present and unchanged):

- `GET /api/public/novels/:slug` → 200
  ```json
  { "novel": { "id": "uuid", "title": "string", "slug": "string",
               "author": { "id": "uuid", "displayName": "string" } },
    "chapters": [ { "number": 1, "title": "string",
                    "publishedAt": "ISO-8601" } ] }
  ```
  `chapters`: only chapters with a PUBLISHED publication, ordered by
  `number` ascending. (`author` is the additive extension — the novel's
  creator, display name only; the delivery plan names "author routes",
  and the novel page needs the byline.)
  404 `{error: "NOT_FOUND"}` when the novel is unknown, DRAFT, or
  ARCHIVED — no distinction (Invariant 5).
- `GET /api/public/novels/:slug/chapters/:number` → 200
  ```json
  { "chapter": { "number": 1, "title": "string", "content": "string",
                 "wordCount": 1234, "publishedVersionNumber": 3,
                 "publishedAt": "ISO-8601" },
    "prevChapter": { "number": 1, "title": "string" } | null,
    "nextChapter": { "number": 3, "title": "string" } | null }
  ```
  `content` comes from the PINNED `chapterVersionId` (012 Invariant 4),
  never `currentVersionId`. `wordCount` is computed server-side from the
  pinned content (the exact author-UI rule:
  `content.trim() ? content.trim().split(/\s+/).length : 0` — the empty
  guard matters: `"".split(/\s+/).length` is 1, the UI gives 0).
  `prevChapter`/`nextChapter` are the
  additive extension — computed over PUBLISHED chapters only, so
  navigation can never leak an unpublished number.
  404 `{error: "NOT_FOUND"}` when the chapter is not publicly visible
  (Invariant 3) — including "chapter exists but is a draft" and "novel
  archived".
- `GET /api/public/authors/:authorId` → 200
  ```json
  { "author": { "id": "uuid", "displayName": "string" },
    "novels": [ { "id": "uuid", "title": "string", "slug": "string",
                  "publishedChapterCount": 3 } ] }
  ```
  `novels`: ACTIVE novels created by this author with ≥1 PUBLISHED
  publication, ordered by first-publish (or title — the implementer
  picks one and pins it in the route's docstring; recommended:
  earliest `publishedAt` first). Never `email`, never workspace info,
  never membership/role data.
  404 `{error: "NOT_FOUND"}` when the author is unknown OR has no
  publicly-visible novels (no distinction — Invariant 5).

Validation (Zod, the `publication-routes.ts` convention):
`slug` = non-empty string; `number` = positive int; `authorId` = uuid.
Invalid → 400 `{error: "INVALID_INPUT"}`.

### Invariant 2 — Access model: anonymous by construction, tenant separation via slug

- Public routes take NO auth object and register NO `requireActor`
  hook. There is no 401 path on `/api/public/*`: anonymous is the only
  mode, so a session cookie (if present) is ignored and changes nothing
  (Invariant 5: no oracle either way).
- Tenant separation: `Novel.slug` is unique per workspace
  (`@@unique([workspaceId, slug])`, `schema.prisma:207`). The resolver
  takes only the slug; when several ACTIVE novels share a slug, the
  earliest-created wins (012's documented behavior,
  `publication.ts:684-713`; the GAP-046 code note). 013 keeps this
  behavior — global slugs are Q4, not this task.
- **Novel-first resolution (author decision on review P2-1):** 012's
  frozen `resolvePublicChapter` iterates ACTIVE novels earliest-first
  and returns the FIRST novel with a PUBLISHED publication at the
  chapter number — so in the collision case it can serve a LATER
  novel's chapter while the novel route lists the EARLIEST novel's
  chapters (the two routes disagree). 013 does NOT inherit this
  divergence. The chapter route resolves the novel FIRST by slug
  (earliest-created ACTIVE wins — exactly the novel route's
  resolution), then looks up the chapter within THAT novel only;
  404 otherwise. This is the "equivalent pin-based lookup" Invariant 3
  already allows (013 gains an additive novel-first helper in the
  `PublicationService`; the frozen 012 function is untouched), and it
  makes the tenant-separation acceptance mutually consistent: novel
  page and chapter page always agree.
- The public routes never accept a workspaceId: the reader addresses
  content by slug alone. A reader cannot enumerate workspaces, novels,
  or chapters beyond what the three routes return.

### Invariant 3 — Draft exclusion: the 012 visibility rule is the only gate

```
isPubliclyVisible(novelId, chapterId) :=
  novel.status = ACTIVE
  AND EXISTS Publication(chapterId, status = PUBLISHED)
```

Every public route enforces this — 013 must not invent a second rule
(012 Invariant 9). Everything else (DRAFT/IN_REVIEW chapters, SCHEDULED
not-yet-due chapters, UNPUBLISHED chapters, chapters of DRAFT or
ARCHIVED novels) resolves as 404 (Invariant 5).

The chapter route MUST resolve through an equivalent pin-based lookup
of `resolvePublicChapter` (`publication.ts:684-713`) — never through
`chapters.currentVersionId` — and MUST be novel-first per Invariant 2:
resolve the novel by slug (earliest-created ACTIVE wins), then look up
the chapter within that novel only.

### Invariant 4 — Spoiler boundary: no future metadata crosses the boundary

The reader surface shows published content and nothing else:

- The novel page lists only PUBLISHED chapters (number, title,
  publishedAt). No draft titles, no SCHEDULED fire times, no
  "coming soon" placeholders, no outline, no synopsis.
- Chapter navigation (`prevChapter`/`nextChapter`) is computed over the
  PUBLISHED chapter list only — a reader can never observe that an
  unpublished chapter N+2 exists.
- No canon facts, memory projections, timeline events, workflow runs,
  review receipts, generation drafts, or author notes cross the
  boundary. The spoiler-boundary primitive for any FUTURE canon/thread
  surface is `readerVisible(introducedAtChapter, readerAt)`
  (`packages/story-intelligence/events.ts:236`) — 013 builds no such
  surface, but the primitive is pinned here so a future task cannot
  invent a weaker one.
- The author page shows displayName + published novels only — no
  workspace names, no member lists, no draft counts.

### Invariant 5 — No-oracle 404: invisible is indistinguishable from nonexistent

Unknown slug, DRAFT novel, ARCHIVED novel, draft/IN_REVIEW chapter,
SCHEDULED chapter, UNPUBLISHED chapter, out-of-range chapter number,
unknown author, author with no public novels — ALL return the identical
`404 {error: "NOT_FOUND"}` with no distinguishing message, header, or
timing shortcut the implementer can avoid (no early "novel exists but…"
branches; resolve through the same pin-based path and map null → 404).

The public routes must not branch on authentication state at all: the
same request with and without a session cookie returns the same
response.

### Invariant 6 — Reader UI: real pages, real data, en/id, accessible basics

Pages (Nuxt file-based routing; `/read` prefix avoids collisions with
`/sign-in` and `/workspaces`):

- `apps/web/app/pages/read/[slug].vue` — novel page: title, author
  byline (link to author page), published chapter list (number, title,
  publishedAt; each links to the chapter page). Loading / error(404) /
  empty (no published chapters — reachable only if the novel flipped
  ACTIVE with zero publications, e.g. all unpublished) states.
- `apps/web/app/pages/read/[slug]/[number].vue` — chapter page: title,
  meta (publishedAt, word count), content, prev/next navigation
  (`ReaderChapterNav`), back-to-novel link. Loading / 404 states.
- `apps/web/app/pages/read/authors/[authorId].vue` — author page:
  displayName, published novels (title, published chapter count; each
  links to the novel page). Loading / 404 states.

Components: `apps/web/app/components/reader/` — at minimum
`ReaderChapterNav.vue`; novel/author headers inline in pages unless a
second use appears. Follow the 007 component pattern (props/emits,
vitest tests, no store).

Data: the `useApi()` composable (`apps/web/app/composables/useApi.ts` —
`ApiError{code, status}`, same-origin `/api` fetch). No auth needed;
`credentials: "same-origin"` is harmless. This is NOT a mock screen:
every page renders data from the real public API against a seeded
published novel in tests (web vitest tests mock `fetch` at the
`useApi` boundary, the 007 harness pattern — e.g.
`ApplyBar.test.ts`).

i18n: all reader strings via `useLocale()` with `en` + `id` keys in
`apps/web/app/i18n/{en,id}.ts`, English fallback (project language
rule).

Accessibility/responsive: semantic HTML (`main`, `article`, `nav`,
headings in order), the existing `focus-visible:nf-focus` convention,
readable line length, responsive layout (mobile-first). The full
accessible/responsive reader audit is NF-WF-014's acceptance
("accessible/responsive reader") — 013 pins the basics above and must
not regress them; 014 may tighten.

### Invariant 7 — GAP-046: the novel page publishes through the release path

Migrate `publish()` in
`apps/web/app/pages/workspaces/[workspaceId]/novels/[novelId]/index.vue`
(~lines 383-404) from
`PATCH .../chapters/:chapterId/status { status: "PUBLISHED" }` to
`POST .../chapters/:chapterId/publication/publish` (the 012 release
path, which creates the Publication row — without it the 013 reader
never sees the chapter).

Wire the 409 branches with en/id messages (the page already surfaces
`ApiError.code`, so the branch is possible — GAP-046):

- `e.code === "REVIEW_STALE"` → `t("errors.publishReviewStale")` —
  actionable: the text changed since the last review; revalidate the
  final text (constitution §11).
- `e.code === "HARD_POLICY_VIOLATION"` → `t("errors.publishHardViolation")` —
  actionable: the final-text review failed; fix the flagged issues and
  re-review.
- keep `403` → `t("errors.publishForbidden")`; everything else →
  `t("errors.publishFailed")`.

New locale keys (en + id), e.g.:

- en: `publishReviewStale: "The text changed since the last review. Revalidate the final text, then publish again."`,
  `publishHardViolation: "The final-text review failed. Fix the flagged issues and re-review before publishing."`
- id: `publishReviewStale: "Teks berubah sejak review terakhir. Validasi ulang teks final, lalu terbitkan lagi."`,
  `publishHardViolation: "Review teks final gagal. Perbaiki masalah yang ditandai dan review ulang sebelum menerbitkan."`

On success the page keeps its current behavior (`chapter.status =
"PUBLISHED"` locally). This also discharges 012's Invariant 3
implementer obligation (verify the 007 page's 409 handling covers
IN_REVIEW-source refusals): the migration IS the coverage — the release
path is the one the extended gate guards, and both refusal codes now
have actionable messages. The 011 e2e loop keeps publishing via PATCH
(the author-preview path, not the release path — GAP-046's decision).

### Invariant 8 — Search and AI stay member-only; the reader has no search box

- `retrieval-routes.ts` requires a session on every route
  (`requireActor` → 401 `{error:"UNAUTHENTICATED"}`,
  `retrieval-routes.ts:99-106`); `ai-routes.ts` likewise
  (`ai-routes.ts:118-125`). 013 changes neither and adds no public
  search or AI endpoint. An unauthenticated request to any
  `/api/retrieval*` or `/api/ai*` route stays 401.
- The reader UI contains no search input. Public
  browse/search/genre/discovery is NF-WF-014's scope
  ("Published-only results") — 013 must not pre-empt it with a public
  index or a `/api/public/search` route.
- No AI-generated content on reader pages (no summaries, no "ask about
  this chapter"). Reader pages render pinned chapter text only.

### Invariant 9 — No reader accounts, no progress, no social

Readers are anonymous, full stop. No sign-in/up for readers, no reading
progress storage (NF-WF-014 owns reading progress), no
bookmark/follow/like/comment/notification (NF-WF-019 owns reader
social). If a finding needs any of these, it stops the task for a
contract amendment (new GAP number first, per the standing rule).

### Invariant 10 — No scope creep at the public boundary

The public routes serve pinned published content only. A finding that
the reader needs a new capability, a new error code beyond
`NOT_FOUND`/`INVALID_INPUT`, a schema change, or a fourth public route
stops the task for a contract amendment. The three routes above are
the complete public surface for 013.

## Outputs

### HTTP routes (new file `apps/api/src/public-routes.ts`)

Anonymous (no auth object, no `requireActor`). Registered in `app.ts`
alongside the other `register*Routes` calls. Same conventions as
`publication-routes.ts:1-13` minus auth: Zod validation → 400
INVALID_INPUT; the app-wide error handler in `platform-routes.ts`
(`NotFoundError` → 404 `{error:"NOT_FOUND"}`, `platform-routes.ts:81`);
this module never registers a second error handler.

- `GET /api/public/novels/:slug` → 200 `{ novel, chapters }`
  (Invariant 1 shape); invisible → 404 `{error:"NOT_FOUND"}`.
- `GET /api/public/novels/:slug/chapters/:number` → 200
  `{ chapter, prevChapter, nextChapter }` (Invariant 1 shape);
  invisible → 404 `{error:"NOT_FOUND"}`.
- `GET /api/public/authors/:authorId` → 200 `{ author, novels }`
  (Invariant 1 shape); unknown or no public novels → 404
  `{error:"NOT_FOUND"}`.

Service helpers (additive, in `services/publication.ts` or a small new
`services/public-reader.ts` — the implementer chooses; the 012
predicates `isPubliclyVisible` / `resolvePublicChapter` are reused,
never re-implemented):

- novel page data: ACTIVE novel by slug (earliest-created wins on
  collision, Invariant 2) + its PUBLISHED chapters ordered by number
  (number, title, publishedAt) + author `{id, displayName}`.
- chapter page data: novel-first (Invariant 2) — resolve the novel by
  slug (earliest-created ACTIVE wins), then pin-based lookup within
  that novel only (the "equivalent pin-based lookup" of
  `resolvePublicChapter`, `publication.ts:684-713`) → pinned
  `chapterVersionId` → content + `publishedVersionNumber` +
  `publishedAt`; prev/next over the PUBLISHED chapter list.
- author page data: user by id → displayName; ACTIVE novels with ≥1
  PUBLISHED publication (id, title, slug, publishedChapterCount).

### Web UI

- `apps/web/app/pages/read/[slug].vue`,
  `apps/web/app/pages/read/[slug]/[number].vue`,
  `apps/web/app/pages/read/authors/[authorId].vue`,
  `apps/web/app/components/reader/ReaderChapterNav.vue` (+ headers
  if reused).
- i18n keys in `apps/web/app/i18n/en.ts` + `id.ts` (reader strings +
  the two publish-409 messages).
- The migrated `publish()` + 409 branches in the 007 novel page.

## Acceptance and verification

- [ ] Public novel route: anonymous `GET /api/public/novels/:slug`
      → 200 with the exact Invariant 1 shape; `chapters` ordered by
      number ascending and containing only PUBLISHED chapters;
      `author.displayName` present, no email/workspace data.
- [ ] No-oracle 404 (identical `404 {error:"NOT_FOUND"}` for each):
      unknown slug; DRAFT novel; ARCHIVED novel; draft chapter number;
      IN_REVIEW chapter; SCHEDULED (not yet due) chapter; UNPUBLISHED
      chapter; out-of-range chapter number; unknown authorId; author
      with no public novels. Same response with and without a session
      cookie.
- [ ] Tenant separation: two workspaces with the same novel slug →
      the earliest-created ACTIVE novel wins (012 behavior kept);
      the chapter route resolves within that same novel (novel-first,
      Invariant 2), so the novel page and chapter page never disagree
      in the collision case; no workspaceId is accepted or needed on
      public routes; no workspace/novel enumeration beyond the three
      routes.
- [ ] Version pinning from the reader's view: publish → the chapter
      page serves the pinned content; unpublish → edit → review →
      re-publish → the same URL serves the NEW content; the old pin is
      never served again; `publishedVersionNumber` tracks the pin.
- [ ] Spoiler boundary: the novel page exposes no draft titles, no
      SCHEDULED times, no outline/synopsis; chapter navigation never
      links to an unpublished number; responses contain no canon
      facts, review receipts, workflow data, or future metadata;
      the author page exposes no workspace/member/draft data.
- [ ] Author route: `GET /api/public/authors/:authorId` → 200 with
      displayName + published novels; unknown / no-public-novels →
      404.
- [ ] GAP-046: the 007 novel page's publish action calls
      `POST .../publication/publish`; 409 `REVIEW_STALE` and
      `HARD_POLICY_VIOLATION` show the new actionable en/id messages;
      403 keeps `publishForbidden`; success keeps the local
      PUBLISHED state. (The 011 e2e loop's PATCH publish is untouched
      — author-preview path, per GAP-046.)
- [ ] Reader UI: all three pages render real API data (seeded
      published novel in web tests); loading, 404, and empty states;
      en + id strings via `useLocale`; semantic HTML, focus-visible
      styles, responsive layout. No mock screens.
- [ ] Search/AI exclusion: unauthenticated `GET` to the retrieval and
      AI routes → 401; the reader UI has no search input and no
      AI-generated content; no `/api/public/search` exists.
- [ ] No-regression: full API suite green; `pnpm e2e` (011) green —
      the author-preview loop still publishes via PATCH and the 409
      gate path still fires; publication tests (012) green; web
      suite green; lint + typechecks clean.
- [ ] 014 handoff: the public surface is exactly the three routes
      above; no public listing/search/discovery was built; Q1–Q7 are
      decided (§"Open questions" after review).

Record actual results separately from expectations. Zero selected tests
or skipped integration checks do not pass a capability gate.

## Migration and rollback

None — no schema changes, no data rewrite. The public routes read
existing tables (`novels`, `chapters`, `chapter_versions`,
`publications`, `users`) through the 012 predicates. Rollback is
deleting the new routes/pages (the member publication lifecycle is
untouched).

## Documentation and handoff

Update `docs/implementation/progress.md`, `docs/14-progress/CURRENT.md`,
`docs/implementation/test-matrix.md` with verified scope; record
deviations in `docs/implementation/ISSUES-AND-GAPS.md` BEFORE any
workaround (standing rule). The 014 task contract should reference
§"Outputs" of this contract as its frozen input (the three public
routes and the no-search/no-listing boundary).

List unknowns, blocked checks, observed versus inferred findings, risks,
and the next dependency-ready task (NF-WF-014). Do not claim full
platform completion.

## Open questions

Genuinely open tradeoffs. The recommendations are the author's, for the
reviewer to confirm or flip before implementation.

- **Q1 — Public novel listing in 013? (Recommendation: no.)** The
  delivery plan puts "browse/search/genre discovery" in NF-WF-014
  ("Published-only results"). 013 ships no global listing; each novel
  is addressed by slug. A listing now would pre-empt 014's scope.
- **Q2 — SEO: index or noindex the reader pages? (Recommendation:
  noindex until 014/product decides.)** M4 is a "publishing preview";
  the no-oracle boundary is new and untested in production. A
  `<meta name="robots" content="noindex">` on reader pages avoids
  crawlers amplifying any boundary bug before 014 hardens discovery.
- **Q3 — Rate limits on `/api/public/*`? (Recommendation: inherit the
  global limiter, no stricter per-route limit in 013.)** The app
  already registers rate limiting (`app.ts:161`); anonymous abuse
  handling beyond that is a 023 production-operations concern.
- **Q4 — Cross-workspace slug collisions: keep earliest-created-wins?
  (Recommendation: yes, keep 012's documented behavior.)** Global
  slugs (or workspace-scoped public URLs) are a future task; changing
  the resolver now would rewrite 012's tested semantics. NOTE (review
  P2-1): novel-first chapter-route resolution is how this
  recommendation is applied consistently across routes — novel page
  and chapter page always agree on which novel wins.
- **Q5 — Caching for public content? (Recommendation: none in 013.)**
  Content is small and correctness (pin freshness on re-publish)
  matters more than speed at this stage; 014/023 may add HTTP or edge
  caching.
- **Q6 — Author page scope: displayName only? (Recommendation: yes.)**
  No bio, avatar, or contact in 013 — those need product/privacy
  decisions (and 019 owns reader-facing identity features).
- **Q7 — Reading progress in 013? (Recommendation: no — 014 owns it.)**
  Storing progress needs reader identity or device storage decisions;
  013's readers are fully anonymous.

## Review record

(Reviewer: separate actor from the contract author and the future
implementer; backend MODEL_UNVERIFIED per GAP-013.)

### Round 1 (2026-10-06): APPROVE_WITH_FINDINGS

Mechanical inline fixes applied by the reviewer: (1) `wordCount`
empty-guard pinned in Invariant 1 (`content.trim() ?
content.trim().split(/\s+/).length : 0` — `"".split(/\s+/).length`
is 1, the author UI gives 0); (2) corrected 007 line refs. P2-1 raised:
012's frozen `resolvePublicChapter` iterates ACTIVE novels
earliest-first and returns the FIRST novel with a PUBLISHED publication
at the chapter number, while the novel route lists the EARLIEST novel's
chapters — the two routes can disagree in the slug-collision case.
P3-1: the three additive shape extensions (author byline, prev/next
navigation, author route) needed a recorded legitimacy judgment
(GAP-049). Contract returned to the author.

### Round 2 (2026-10-06): APPROVE

The author adopted the reviewer's P2-1 recommendation: the chapter
route resolves the novel FIRST by slug (earliest-created ACTIVE wins —
exactly the novel route's resolution), then looks up the chapter within
that novel only, 404 otherwise, via an additive novel-first helper in
the `PublicationService`; the frozen 012 `resolvePublicChapter` is
untouched. Reworded Invariant 2, Invariant 3, Outputs, acceptance,
backend-verification, and Q4 consistently — verified mutually
consistent. GAP-049 recorded in `docs/implementation/ISSUES-AND-GAPS.md`
(before any implementation) with the legitimacy judgment: the
extensions are additive, all 012-pinned fields are present and
unchanged, 012 assigns navigation to 013, and the delivery-plan title
includes "author routes". The novel-first resolution does not
contradict 012's frozen text: 012's freeze pins response SHAPES (which
are unchanged), pins pin-based content (unchanged — the helper is the
"equivalent pin-based lookup" Invariant 3 allows), and explicitly
defers collision disambiguation to 013 ("013 should disambiguate",
`publication.ts:119-123`, the GAP-046 code note).

**Backend verification (re-reviewer, independent, repo @ `3c57739`):**
- `resolvePublicChapter` at `publication.ts:684-713` — confirmed it
  iterates earliest-first ACTIVE novels and returns the first with a
  PUBLISHED publication at the chapter number (the divergence P2-1
  names); GAP-046 code note at `:119-123` confirms 013 owns
  disambiguation; `isPubliclyVisible` at `:669-683` matches Invariant 3.
- 007 novel page `publish()` at `index.vue:385`, PATCH old path with
  403-only branch at `:393-404` — round-1 line refs correct.
- `isPubliclyVisible` service interface `:110-125` supports the
  additive novel-first helper without touching the frozen function.
- GAP-049 present at `ISSUES-AND-GAPS.md:1301`, recorded 2026-10-06
  before implementation, documents what/why + the legitimacy judgment.

**Q1–Q7 (reviewer adjudication — all recommendations CONFIRMED, now
decided, no longer open):** Q1 no public listing (014 owns discovery);
Q2 noindex until 014/product decides (conservative default for the new
no-oracle boundary); Q3 inherit the global limiter (`app.ts:161`),
no stricter per-route limit (023 owns production ops); Q4 keep
earliest-created-wins with novel-first consistency (Q4's NOTE (review
P2-1) applied); Q5 no caching (pin freshness on re-publish matters
more); Q6 displayName only on the author page (019 owns identity);
Q7 no reading progress (014 owns it).

**Normative judgment:** the collision acceptance ("novel page and
chapter page never disagree") is testable (seed two ACTIVE novels with
the same slug; assert the chapter route serves only the winning novel's
chapters and 404s a number published only in the later novel).
No new zombie paths, no shape violations, no second visibility rule.
The "014 handoff" acceptance checkbox (Q1–Q7 decided) is now
satisfiable.

**Verdict: APPROVE** — implementation may proceed.

**Still unresolved (for the parent):** the readiness header still says
"(Q1–Q7 below are genuinely open and must be resolved before
implementation)" — superseded by the Q1–Q7 resolutions recorded above;
update it (and the frozen review manifest placeholders) at commit time.
The §"Open questions" section keeps the author's recommendation
wording; the Review record's CONFIRMED resolutions above are the
decisions of record.

## Backend verification (contract author)

Every normative backend claim in this contract was verified against
source on 2026-10-05 (repo @ `3c57739`). File:line references:

- 012 predicates: `isPubliclyVisible` at
  `apps/api/src/services/publication.ts:669-683`;
  `resolvePublicChapter` at `:684-713` (pin-based; earliest-created
  wins on workspace-scoped slug collision; the GAP-046 code note).
  NOTE (review P2-1, author decision): the frozen function iterates
  ACTIVE novels earliest-first and returns the first novel with a
  PUBLISHED publication at the chapter number — 013's chapter route
  does NOT inherit this cross-novel iteration; it is novel-first per
  Invariant 2 (resolve the novel, then look up within it only) via an
  additive helper, the frozen 012 function untouched.
  Service interface (013's reuse surface) at `:110-125`.
- 012 route conventions + "no public routes here": `apps/api/src/
  publication-routes.ts:1-60`. Route registration pattern:
  `apps/api/src/app.ts:49` (`registerPublicationRoutes`), `:183`
  (`registerPlatformRoutes`), `:222` (call site). Error handler:
  `NotFoundError` → 404 at `apps/api/src/platform-routes.ts:81`.
- Spoiler-boundary primitive: `readerVisible` at
  `packages/story-intelligence/events.ts:236`. Canon READER no-oracle
  precedent: `apps/api/src/services/canon.ts:2399-2412`.
- Search/AI member-only: `requireActor` → 401
  `{error:"UNAUTHENTICATED"}` at `apps/api/src/retrieval-routes.ts:
  99-106`; same at `apps/api/src/ai-routes.ts:118-125`. Global rate
  limiter registered at `apps/api/src/app.ts:161`.
- Schema: `User.displayName` (required) at
  `packages/database/prisma/schema.prisma:41`; `Novel` (`title` :168,
  `slug` :169, `status` :170, `createdById` :171) at `:164-172`;
  `@@unique([workspaceId, slug])` at `:207`.
- Web app: Nuxt pages at `apps/web/app/pages/` (`index.vue`,
  `sign-in.vue`, `workspaces/[workspaceId]/novels/[novelId]/index.vue`);
  `nuxt.config.ts` proxies `/api/**` to the Fastify origin
  (`NUXT_API_BASE`, default `http://localhost:3000`); `useApi()`
  composable with `ApiError{code, status}` at
  `apps/web/app/composables/useApi.ts:8-35`; `useLocale()` + en/id
  resources at `apps/web/app/i18n/{en,id}.ts`; existing publish keys
  at `i18n/en.ts:175-176` / `i18n/id.ts:175-176`.
- 007 novel page `publish()` still on the old path:
  `PATCH .../chapters/:chapterId/status {status:"PUBLISHED"}` with a
  403-only branch and no 409 handling, at `apps/web/app/pages/
  workspaces/[workspaceId]/novels/[novelId]/index.vue:383-404`
  (GAP-046, `docs/implementation/ISSUES-AND-GAPS.md:1236`).
- Delivery plan: NF-WF-013 row at
  `docs/implementation/DELIVERY-PLAN.md:147`; M4 milestone at `:46`
  with the minimum proof ("an unauthenticated/non-member reader can
  read a published version; draft/future data remain inaccessible
  through pages, search and AI"); CAP-10 at `:83`; NF-WF-014
  ("Browse/search/genre discovery and reading progress",
  "Published-only results, stable reader boundary,
  accessible/responsive reader") at `:148`.
- 012 contract shapes (frozen input): §"Contract with NF-WF-013" in
  `tasks/NF-WF-012-publication-release-contract.md`.

UNVERIFIED: the exact click order inside the 007 novel page (the API
sequence is the normative pin, per the 011 pattern); the implementer's
choice of chapter-list ordering on the author page (pinned as
earliest-`publishedAt`-first recommendation, implementer to pin in the
route docstring).
