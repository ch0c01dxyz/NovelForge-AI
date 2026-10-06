# Task NF-WF-019: Reader social features and moderation

Project language: English for all authored/revised artifacts and generated
project content; UI uses English (`en`)/Bahasa Indonesia (`id`) locale keys
and resources with English fallback. Record any other explicit author override
and its scope.
Model selection: author-selected at runtime; separate implementer/reviewer
actors, with requested aliases distinguished from runtime evidence.

Status: PLANNED
Milestone / capability IDs: M5/M8 (CAP-12 spans both per the capability
ledger; 019 delivers the M5 social surfaces); delivery-plan NF-WF-019
(row `:153`); CAP-12 (`:85`).
Implementer role / requested and resolved model: (one separate actor per
child — 019A, 019B, 019C, 019D; each a separate actor from the contract
author, the contract reviewer, and the other children's implementers;
backend MODEL_UNVERIFIED per GAP-013)
Reviewer role / requested and resolved model: (one separate actor per child
diff review, separate from the contract author and all implementers; backend
MODEL_UNVERIFIED per GAP-013)
Readiness evidence / unresolved decisions / parent acceptance owner: contract
review returned APPROVE_WITH_FINDINGS (Round 1, 2026-10-06; 5 P3 findings
fixed inline; Q8 ruled APPROVE under GAP-068; Q1/Q3/Q4/Q6/Q9/Q10 CONFIRMED
as recommended; Q2/Q5/Q7/Q11 were decided by Klein 2026-10-06 and are
recorded as decided resolutions in §"Open questions").
Frozen review manifest / exact artifact paths and identity: (filled at
review). Baseline revision / local changes to preserve: repo HEAD `6ce0eeb`
(2026-10-06) — NF-WF-018 pushed.
Engram checkpoint topic key / last confirmed observation reference: (n/a)

## Amendment record (2026-10-06, contract amendment pass)

- Q2 (moderation model), Q5 (notification defaults), Q7 (follow author),
  Q11 (progress sync) were decided by the product owner Klein — they are
  no longer open questions. The contract below reflects his decisions.
- 019A scope now includes follow-author (follow novel + follow author).
- 019D (new child) adds server-side reading-progress sync, per Klein's
  Q11 decision. Provenance: 014's "Out of scope" handoff named 019 as the
  owner of synced progress; delivery-plan row 153 does not list it. The
  child-split deviation is recorded explicitly in §"Child split".

## Normative vs informative

Normative: the child split (019A/019B/019C/019D) and each child's scope,
the auth boundary (Invariant 1), the published-only engagement rule
(Invariant 2), idempotent engagement semantics (Invariant 3), privacy
defaults (Invariant 4), comment safety rules (Invariant 5), moderation
authority (Invariant 6), notification honesty (Invariant 7), the
no-new-capabilities rule (Invariant 8), the spoiler posture (Invariant 9),
the design/i18n/a11y requirement (Invariant 10), the exact route
signatures and response shapes per child, the rate-limit values once
confirmed, the moderation states, the deduplication keys, the additive
migration contents, and the acceptance checkboxes. Informative: rationale
paragraphs, examples, and the §"Open questions" recommendations for the
still-open questions (the question labels are normative — the
recommendations are the author's, for the reviewer to confirm or flip).
Q2/Q5/Q7/Q11 are Klein's decided resolutions of record (labels and
resolutions both normative).

## Goal and reason

Give published-novel readers the social surface webnovel platforms treat
as table stakes — bookmark, follow, like, comments, notifications — without
breaking the frozen reader boundary that NF-WF-012/013/014 built. The
013 contract made public routes anonymous by construction (Invariant 2:
no auth object, session cookie ignored, no 401 path) and 014's Invariant 9
explicitly reserved "bookmarks/follows/likes/comments/notifications" for
this task (CAP-12, M5/M8). This task lifts that reservation under a new, separate route family
(`/api/reader/*`) that is authenticated by construction for all writes
(the comment-list read is anonymous-readable per Invariant 1), while
`/api/public/*` stays exactly as frozen except the ruled Q8 additive
count fields.

The measurable goal: an authenticated reader can bookmark a published
novel, follow novels AND authors, like a published chapter, comment on a
published chapter (rate-limited, author-moderated), receive in-app
notifications for followed novels/authors and comment replies, and have
their reading progress synced across devices — while an anonymous reader
sees only aggregate counts and visible comments, no per-user state ever
leaks, and no engagement affordance touches draft/unpublished content.

## Required reading

- [Operating constitution](../../AGENTS.md) (§2.11 versioning/auditability,
  §2.18 server-side authorization, §10 development rules, §11 Definition
  of Done, §12 orchestration protocol, §13 evidence/issues, §15 Design
  system — the foundational design).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [Delivery plan](../../docs/implementation/DELIVERY-PLAN.md) (NF-WF-019
  row `:153`; the multi-child rule `:160` — "Do not send a row's entire
  feature list to one worker"; M5 milestone; CAP-12 `:85`).
- [NF-WF-012 contract](NF-WF-012-publication-release-contract.md) —
  `isPubliclyVisible`, the pinned `chapterVersionId`, the no-oracle rule.
- [NF-WF-013 contract](NF-WF-013-public-reader-routes-ui.md) — the frozen
  public routes and shapes (Invariant 1), Invariant 2 (anonymous by
  construction), Invariant 4 (spoiler boundary), Invariant 5 (no-oracle
  404), Invariant 9 (no social — owned by this task).
- [NF-WF-014 contract](NF-WF-014-browse-search-progress.md) — the
  `publiclyListed` predicate (Invariant 2), the genre capability
  precedent (`novel:update`), Invariant 5 (device-local progress),
  Invariant 9 (social reserved for 019), the "Out of scope" handoff.
- [Design tokens](../../docs/design/DESIGN-TOKENS.md) and the
  [writer-workspace design](../../docs/design/writer-workspace/index.html).
- Existing implementation: `apps/api/src/public-routes.ts` (frozen;
  read-only reference), `apps/api/src/services/publication.ts`
  (`isPubliclyVisible` at `:759` — reuse, never re-implement),
  `apps/api/src/ai-routes.ts:132-145` (the `requireActor` session→userId
  pattern this task's routes reuse), `apps/api/src/auth-routes.ts`
  (session cookie `nf_session`, `validateSession`), `apps/api/src/app.ts`
  (`@fastify/rate-limit` at `:174` — global fallback + per-route
  overrides), `packages/auth/authorization.ts` (read-only: `novel:update`
  is the staff-moderation capability; this task adds none),
  `apps/worker/src/publication-jobs.ts` (BullMQ queue/worker facade
  pattern for the 019C fan-out), `apps/web/app/pages/read/` (reader
  pages), `apps/web/app/i18n/{en,id}.ts` (the `reader:` section at
  `en.ts:183`).

## Environment prerequisites

Follow [environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md).
Native PostgreSQL 16 + pgvector and Redis on localhost (no Docker, per
project policy). All test databases are scratch `novelforge_test_*` only.
New database requirements are limited to: one additive migration per
child (new tables + counter columns, all additive, no data rewrite).
No new services, no new npm workspace, no external queue — the 019C
fan-out reuses the existing BullMQ worker infra (`apps/worker`).

## Dependencies and evidence

- NF-WF-012 (IMPLEMENTED, pushed): `Publication` model,
  `isPubliclyVisible(novelId, chapterId)`, pin-based chapter resolution,
  no-oracle semantics. Contract blob checked:
  `b815a887b027082ccf1e949189af93081ee7d77e`.
- NF-WF-013 (IMPLEMENTED, pushed): the three public reader routes and
  their frozen shapes, anonymous-by-construction access model, spoiler
  boundary. Contract blob checked:
  `423407c560693bc6ba1ef4ffddbf33c5023bf059`. This task MUST NOT change
  the 013 shapes except additive count fields with the reviewer's
  explicit ruling (Q8, GAP-049 precedent).
- NF-WF-014 (IMPLEMENTED, pushed): `publiclyListed(novel)` predicate,
  the genre capability precedent, anonymous device-local progress.
  Contract blob checked:
  `d9a77fce5e2a2eb81f658b803267c43cb3264a2f`. 014's "Out of scope"
  hands reader accounts + synced progress + social to 019 — this
  contract scopes accounts to the EXISTING auth endpoints (reused, not
  rebuilt) and brings server-side progress sync INTO scope as child
  019D, per Klein's Q11 decision (2026-10-06).
- Auth already exists: `POST /api/auth/register`, `/api/auth/session`,
  `/api/auth/logout` (`auth-routes.ts`); session cookie `nf_session`.
  019 builds NO new auth endpoints.
- Open gaps touching this task: GAP-013 (MODEL_UNVERIFIED, standing),
  GAP-015 (reader social listed as a remaining capability gap — this
  task closes the social row, not the whole gap), GAP-051 (human
  screen-reader pass — applies to the new reader surfaces).

## Child split

Per the delivery-plan multi-child rule (`:160`, the 017/018 pattern),
NF-WF-019 splits into four independently reviewable children. Each
child has its own contract section below, its own implementer, its own
diff review, and its own commit. Completion of NF-WF-019 requires all
four.

| Child | Scope | Independent verifiability |
|---|---|---|
| **019A — Reader engagement** | Bookmark/follow/like: member-gated (authenticated-user) writes, idempotent dedup keys, aggregate counts (additive public fields per Q8 + the per-user engagement endpoint), privacy defaults, reader-page affordances + private library page. Follow covers novels AND authors (Q7, decided by Klein). | Verifiable without comments or notifications: engagement CRUD, dedup, counts, privacy (anonymous sees aggregates only), library page |
| **019B — Comments + moderation** | Comment post/list/reply/edit/delete on published chapters, rate limits, comment states (VISIBLE/HIDDEN/DELETED), reports with pinned reasons, author (staff) moderation tools, sanitization | Verifiable without notifications: comment lifecycle, rate-limit enforcement, moderation states and permissions, report queue |
| **019C — Notifications + privacy** | Notification events (pinned names), async fan-out (novel followers ∪ author followers), in-app inbox, preferences (decided defaults: all ON — Q5), privacy controls surface | Verifiable against the pinned event names from 019A/019B without re-implementing them: fan-out, inbox, preferences, privacy guarantees |
| **019D — Synced reading progress** | Server-side reading progress for authenticated users (per-novel latest position, last-write-wins merge with device-local 014 progress, private to the owning user) | Verifiable without the other children: sync endpoints, merge semantics, privacy, anonymous device-local behavior unchanged |

**Justification.** 019A is pure engagement state — no trust-and-safety
surface, no background plumbing; its review focus is idempotency,
privacy, and the frozen-shape boundary. Follow-author joins 019A
because it shares 019A's exact mechanism (idempotent follow rows,
private lists, public counts) and its acceptance is checkable with
019A's evidence. 019B is the trust-and-safety surface — its review
focus is sanitization, rate limits, moderation states and authority;
it needs 019A's identity model only conceptually (any authenticated
user), so it can be implemented in parallel against the pinned auth
contract. 019C is the delivery-and-privacy surface — its review focus
is fan-out honesty (async, bounded, never blocking publish),
preference defaults, and privacy guarantees; it consumes the event
names 019A/019B pin (`novel.chapter_published`, `comment.replied`,
`comment.moderated`) and can be implemented against those names
without waiting for A/B's code. 019D is the sync surface — its review
focus is merge semantics, privacy, and the offline/anonymous fallback;
it needs the authenticated identity model only conceptually, so it
can be implemented in parallel. Each child's acceptance checkboxes
are checkable in isolation.

**Provenance note (child-split deviation).** Delivery-plan row 153
lists bookmark/follow/like/comment/notification + rate limits,
moderation, privacy, deduplication — it does NOT list progress sync.
019D exists because 014's "Out of scope" explicitly named 019 as the
owner of synced progress, and Klein decided (Q11, 2026-10-06) that it
belongs in 019. This deviation is recorded here, not silently
absorbed.

**Build order recommendation:** 019A, 019B, and 019D in parallel;
019C after (or in parallel against the pinned event names). The
parent decides the dispatch order at implementation time.

## Scope

### Allowed

- New route file(s) under `apps/api/src/` for the `/api/reader/*`
  family (implementer pins the filename, e.g. `reader-social-routes.ts`;
  one file per child is acceptable). Registered in `app.ts` alongside
  the other `register*Routes` calls, following the `ai-routes.ts`
  `requireActor` pattern (session cookie → `auth.validateSession` →
  401 `{error:"UNAUTHENTICATED"}`).
- New service module(s) under `apps/api/src/services/` (e.g.
  `social.ts`, `comments.ts`, `notifications.ts` — implementer pins).
  Reuse: `isPubliclyVisible` (`services/publication.ts:759`), the
  novel-first slug resolution is NOT needed (social routes take IDs,
  not slugs).
- Additive Prisma migrations: new models `Bookmark`, `NovelFollow`,
  `AuthorFollow`, `ChapterLike`, `Comment`, `CommentReport`,
  `Notification`, `NotificationPreference`, `ReadingProgress`;
  additive counter columns `Novel.followerCount`, `Chapter.likeCount`,
  `Chapter.commentCount` (all `@default(0)`). Relations to `User` use
  `onDelete: Cascade`. (One additive migration per child: 019A
  engagement tables + counters; 019B comment tables; 019C
  notification tables; 019D the reading-progress table.)
- New web components under `apps/web/app/components/reader/` (or a new
  `components/social/` — implementer pins): like/bookmark/follow
  buttons, comment thread, notification bell/inbox, library page
  (`/read/library`), notifications page (`/read/notifications`).
- The 012 publication worker (`apps/worker`) for the 019C fan-out job,
  following the `publication-jobs.ts` queue facade pattern.
- Additive `social:` i18n subtree in `apps/web/app/i18n/{en,id}.ts`.

### Forbidden

- `apps/api/src/public-routes.ts` and `public-discovery-routes.ts` —
  frozen. No auth-gated behavior, no new fields except the additive
  count fields explicitly ruled on in Q8 (and only if the reviewer
  APPROVEs that ruling).
- `packages/auth/authorization.ts` — no new capabilities (Invariant 8,
  Q3). The staff-moderation check reuses the existing `novel:update`
  capability read-only.
- The 012/013/014 route shapes beyond Q8's additive counts; the pinned
  `chapterVersionId` mechanics; the `isPubliclyVisible` predicate
  (reused, never re-implemented or weakened).
- Workspace member routes (`/api/workspaces/*`) — social is NOT
  workspace-scoped; a reader needs no membership.
- New auth endpoints — register/login/logout/session already exist.
- Email/push notification channels — in-app only (Invariant 7).
- Comment HTML/markdown rendering — plain text only in 019.
- Storing or returning member emails anywhere in the social surface.
- Any per-user engagement state in an anonymous response.
- Reading-progress rows exposed to anyone but the owning user
  (progress is per-user private — Invariant 4; authors and staff
  never see a reader's progress).

### Inputs

- Engagement: authenticated session + `{ novelId }` (UUID) for
  bookmark/follow; `{ novelId, chapterNumber }` for likes.
- Comments: authenticated session + `{ novelId, chapterNumber, body
  (≤5000 chars, plain text), parentId? }`; staff actions add the
  staff gate (membership + `novel:update` on the novel's workspace,
  resolved server-side from `novelId`).
- Reports: `{ reason }` from the pinned `ReportReason` enum.
- Notifications: the pinned event names (see 019C); preferences
  `{ preferences: [{ type, enabled }] }` over the pinned
  `NotificationType` enum.
- Comment/report listing: `?novelId=&chapterNumber=&cursor=` (cursor
  pagination, default 20, max 50 — the 014 discovery convention).

### Outputs

- The `/api/reader/*` route family with the exact shapes pinned per
  child below; Zod validation → 400 `{error:"INVALID_INPUT"}`;
  401 `{error:"UNAUTHENTICATED"}` for missing/invalid sessions;
  403 `{error:"FORBIDDEN"}` for staff-gate failures;
  404 `{error:"NOT_FOUND"}` for invisible novels/chapters (identical
  to nonexistent — the 013 no-oracle rule).
- The reader-page engagement components, comment thread, library page,
  notification inbox + preferences, all §15-conformant, en+id, WCAG
  2.2 AA.
- Additive migrations (one per child), updated `progress.md`,
  `CURRENT.md`, `test-matrix.md`, `ISSUES-AND-GAPS.md` entries for any
  deviation (GAP number BEFORE any workaround, standing rule).

### Out of scope (with follow-up owner)

- **Platform-wide moderation** → none in 019 by Klein's DECISION
  (Q2, 2026-10-06): there is no platform moderation team; all
  moderation is handled by the author / novel creator via the staff
  model. No follow-up task owns platform moderation.
- **Guest (unauthenticated) comments** → not in 019 (Q6 recommends
  authenticated-only).
- **Email/push notifications, notification retention/expiry policy** →
  follow-up (019C is in-app only, no expiry).
- **Comment markdown/rich text, comment search, novel-level comments**
  → follow-ups. 019B is plain-text, chapter-scoped, depth ≤ 1.
- **"Who bookmarked/followed my novel" author analytics** → follow-up.
  Staff see aggregates only in 019.
- **Public user profiles** → follow-up. `displayName` is the only public
  identity in 019.

## Behavior and invariants

### Invariant 1 — Auth boundary: `/api/reader/*` is authenticated by construction; `/api/public/*` stays anonymous

- Every `/api/reader/*` WRITE requires a valid session (the
  `ai-routes.ts:132-145` `requireActor` pattern: `nf_session` cookie →
  `auth.validateSession` → 401 `{error:"UNAUTHENTICATED"}`).
- `/api/public/*` and `/api/public/search` etc. remain anonymous by
  construction (013 Invariant 2): no auth object, session cookie
  ignored, no 401 path. The ONLY change permitted there is Q8's
  additive count fields, and only with the reviewer's explicit ruling.
- Anonymous readers of the new surfaces see: aggregate counts
  (like/comment/follower), VISIBLE comments with author
  `displayName`s. They NEVER see: per-user engagement state, bookmark/
  follow lists, notification inboxes, report queues. Engagement
  affordances (like/follow/bookmark/comment buttons) render only when
  a session exists — server-enforced, UI gating is progressive
  enhancement only.

### Invariant 2 — Published-only engagement: the 014 predicate is the only gate

```
engageable(novel) := publiclyListed(novel)   // 014 Invariant 2:
  novel.status = ACTIVE
  AND EXISTS Publication(novelId, status = 'PUBLISHED')
```

- Every social write AND every engagement/comment list checks
  `engageable(novel)` with the check IN the SQL (the 014 precedent —
  never a post-filter). Invisible novel/chapter → 404
  `{error:"NOT_FOUND"}`, indistinguishable from nonexistent (013
  Invariant 5). No oracle either way.
- Comments attach to chapter identity (`novelId`, `chapterNumber`) —
  NOT to the pinned `chapterVersionId` — so they survive republication.
  When a chapter leaves PUBLISHED, its comments are hidden from
  listing (rows retained); they reappear if the chapter is
  republished. Likes/follows/bookmarks on an unpublished novel behave
  the same way: rows retained, invisible until the novel is public
  again.
- The moment a publication leaves PUBLISHED, engagement vanishes from
  reads on the next query (no driftable index table — the 014
  Invariant 3 precedent).

### Invariant 3 — Idempotent engagement: dedup keys, never duplicates

- Dedup keys (each backed by a DB unique constraint as the backstop):
  bookmark `(userId, novelId)`; novel-follow `(userId, novelId)`;
  author-follow `(userId, authorId)` (author = `User.id`, the 013
  public author identity); like `(userId, novelId, chapterNumber)`;
  report `(commentId, reporterId)`; preference `(userId, type)`;
  progress `(userId, novelId)` (single latest-position row per novel).
- Repeat engagement → 200 with the same state (never 409, never a
  duplicate row). Unlike/unfollow/unbookmark → 204 (idempotent —
  deleting a non-existent row is still 204).
- A user cannot follow themselves: follow-author with
  `authorId == caller` → 400 `{error:"INVALID_INPUT"}`.
- Counter columns (`Novel.followerCount`, `Chapter.likeCount`,
  `Chapter.commentCount` counting VISIBLE comments only) are
  maintained in the SAME transaction as the engagement write.
  Concurrent writers cannot double-count (unique constraint +
  transactional counter update).

### Invariant 4 — Privacy defaults

- Bookmark lists, novel-follow lists, and author-follow lists are
  PRIVATE: readable only by the owning user (`GET /api/reader/
  bookmarks`, `/api/reader/follows`, `/api/reader/author-follows`
  return the caller's own rows; there is no endpoint listing another
  user's).
- Reading progress is private to the owning user (019D): no endpoint
  exposes one user's progress to another user, to an author, or to
  staff.
- Per-user like state is private; like/follower/comment COUNTS are
  public aggregates. (Author-follow counts are served by aggregate
  query — no counter column is added to `User`.)
- Comments expose `displayName` only — never email, never userId of
  other users. A comment's `userId` is visible only to its author and
  to workspace staff via the moderation queue.
- Workspace staff see aggregates and reported comments on their
  novels — never who bookmarked/followed/liked (no per-user
  engagement disclosure to authors).
- Notification preferences and inbox are private to the owning user.

### Invariant 5 — Comment safety

- Posting requires auth (Q6: no guest comments). Rate limits (Q1):
  1 comment / 10 seconds / user (burst, dedicated limiter) and
  100 comments / 24h / user; reports 20 / 24h / user. Likes/follows/
  bookmarks use the app-wide limiter only (idempotent upserts bound
  abuse).
- Body: ≤ 5000 chars, plain text only — no HTML, no markdown. Server
  validates length and rejects control characters; the web renders
  comments as escaped text (line breaks preserved). No profanity
  filter in 019 — moderation is report-driven.
- Threading: depth ≤ 1 (top-level comments + one reply level).
  `parentId` must reference a top-level comment on the same chapter;
  reply-to-reply → 400 `INVALID_INPUT`.
- States: `VISIBLE` (default) → `HIDDEN` (staff-hide; visible only to
  staff + the comment author with a "hidden by moderator" notice) →
  `DELETED` (tombstone `"[deleted]"` preserving thread structure,
  visible to everyone). The comment author may edit their own comment
  within 15 minutes of posting (Q4), then it is immutable; a comment in
  HIDDEN state is not editable by its author (→ 403 even within the
  window; staff unhide restores editability); delete is
  always available (→ tombstone).
- Reports: pinned `ReportReason` enum (`SPAM`, `HARASSMENT`, `SPOILER`,
  `OFF_TOPIC`, `OTHER`), dedup-keyed per (comment, reporter). NO
  auto-hide on report thresholds in 019 (Q10) — reports queue for
  staff review.

### Invariant 6 — Moderation authority

- Comment authors: edit (within 15 min, Q4) / delete (tombstone) their
  OWN comments.
- Workspace staff: any user who is a member of the novel's workspace
  AND holds the existing `novel:update` capability (resolved
  server-side from `novelId` → workspace; `authorization.ts` is
  read-only, no new capabilities per Invariant 8) may hide/unhide/
  delete ANY comment on their workspace's novels and view the report
  queue. Staff actions are audit-logged (actor identity only). This
  IS the moderation team: the author / novel creator and their
  workspace staff.
- No platform-wide moderation role, by Klein's DECISION (Q2,
  2026-10-06): there is no platform moderation team; all moderation
  is handled by the author / novel creator.

### Invariant 7 — Notification honesty

- In-app ONLY. No email, no push, no external channel in 019.
- Fan-out is ASYNCHRONOUS: the PUBLISHED transition enqueues a
  fan-out job; the worker inserts notifications in bounded batches
  (≤ 500/batch, following the `publication-jobs.ts` facade pattern).
  The publish path NEVER blocks on follower count — a novel with
  100k followers publishes exactly as fast as one with 10.
- Preference types are pinned: `NEW_CHAPTER`, `COMMENT_REPLY`,
  `MODERATION_NOTICE`. Defaults are DECIDED by Klein (Q5,
  2026-10-06): all ON (in-app only). Absent preference row = default
  (ON).
- A notification is never fabricated: every row traces to a real
  event (chapter PUBLISHED, real reply, real moderation action).

### Invariant 8 — No new capabilities, no schema beyond additive

- `packages/auth/authorization.ts` is untouched: no new capabilities.
  Reader social auth is identity-based (any authenticated user);
  staff moderation reuses the existing `novel:update` capability.
- Schema changes are limited to the additive migrations pinned per
  child (new tables + counter columns). No column alteration, no data
  rewrite, no new enum on an existing table except additive ones on
  new tables.

### Invariant 9 — Spoiler posture for social content

- Comments are CHAPTER-SCOPED: a comment posted on chapter N is
  listed only on chapter N's thread. The platform never surfaces a
  comment on any other chapter's page.
- The platform never lists comments for unpublished chapters
  (Invariant 2).
- `SPOILER` is a first-class report reason; spoiler-tag markup is a
  follow-up, not 019.

### Invariant 10 — Design, i18n, a11y

- All UI follows the §15 foundational design (`docs/design/
  writer-workspace` + `DESIGN-TOKENS.md`) — the same design language
  as the 013/014 reader pages. Any intentional departure is a
  documented author decision recorded with its scope BEFORE
  implementation.
- en+id for every new string (new `social:` i18n subtree); English
  fallback for missing keys; both locales verified before claiming
  i18n complete.
- WCAG 2.2 AA for all new surfaces (the 014 Invariant 7 precedent):
  vitest-axe checks on new components/pages, zero violations, plus
  keyboard operability of the engagement buttons and comment composer.

## Child 019A — Reader engagement (bookmark/follow/like)

### Goal

Authenticated readers can bookmark novels, follow novels AND authors,
and like chapters — idempotently, privately by default, with public
aggregate counts. (Follow-author was added by Klein's Q7 decision,
2026-10-06; it shares 019A's exact mechanism.)

### Routes (`/api/reader/*`; all writes require session)

- `POST /api/reader/bookmarks` `{ novelId }` → 200
  `{ bookmark: { novelId, createdAt } }` (idempotent; repeat → 200
  same state). Novel must be engageable (Invariant 2) else 404.
- `DELETE /api/reader/bookmarks/:novelId` → 204 (idempotent).
- `GET /api/reader/bookmarks` → 200
  `{ bookmarks: [{ novelId, novel: { id, title, slug }, createdAt }],
  page }` — caller's own only (Invariant 4). Cursor pagination.
- `POST /api/reader/follows` / `DELETE /api/reader/follows/:novelId` /
  `GET /api/reader/follows` — same shape as bookmarks (follow = notify
  on new chapter; the event source for 019C).
- `POST /api/reader/author-follows` `{ authorId }` → 200
  `{ authorFollow: { authorId, author: { id, displayName },
  createdAt } }` (idempotent; repeat → 200 same state). `authorId`
  is a `User.id` (the 013 public author identity); nonexistent
  author → 404; self-follow → 400. Follow = notify on new published
  chapter on ANY novel by that author (the 019C fan-out resolves
  novel followers ∪ author followers).
- `DELETE /api/reader/author-follows/:authorId` → 204 (idempotent).
- `GET /api/reader/author-follows` → 200
  `{ authorFollows: [{ authorId, author: { id, displayName },
  createdAt }], page }` — caller's own only (Invariant 4).
- `POST /api/reader/likes` `{ novelId, chapterNumber }` → 200
  `{ like: { novelId, chapterNumber, createdAt } }` (idempotent).
  Chapter must be currently PUBLISHED else 404.
- `DELETE /api/reader/likes/:novelId/:chapterNumber` → 204.
- `GET /api/reader/engagement?novelId=<uuid>&chapterNumber=<n>` →
  200 `{ bookmarked, following, liked, likeCount, commentCount,
  followerCount }` — the caller's per-user state + aggregates for one
  page render. Requires session. (Anonymous callers use the public
  count fields from Q8 instead.)
- `GET /api/reader/engagement/author?authorId=<uuid>` → 200
  `{ followingAuthor, followerCount }` — the caller's author-follow
  state + the aggregate (no per-user state of others).

### Additive public-shape extension (Q8)

If the reviewer APPROVEs the Q8 ruling: the frozen 013 shapes gain
additive count fields — chapter: `likeCount`, `commentCount`;
novel: `followerCount`. Additive-only, backward-compatible (the
GAP-049 precedent). If the reviewer does NOT approve, counts are
served only through `/api/reader/engagement` (authenticated) and a
new anonymous aggregate endpoint the reviewer specifies.

### Web UI

- `LikeButton`, `BookmarkButton`, `FollowButton` components on
  `/read/[slug]` (novel page: bookmark + follow) and
  `/read/[slug]/[number]` (chapter page: like); `FollowAuthorButton`
  on the public author page (`/authors/[authorId]`, the 013 page).
  Rendered ONLY when a session exists; anonymous readers see the
  counts as static text. Optimistic UI with rollback on failure;
  `aria-pressed` states.
- `/read/library` — the private library page: the caller's bookmarks
  + novel follows + author follows with novel/author cards (reuse the
  014 discovery card component; do not reinvent). Requires session;
  anonymous → redirect to login.
- Counts displayed from the (Q8) public fields for anonymous, from
  `/api/reader/engagement` for authenticated.

### Migration (additive)

`Bookmark { id, userId → User (Cascade), novelId → Novel (Cascade),
createdAt, @@unique([userId, novelId]), @@map("bookmarks") }`;
`NovelFollow` — same shape, `@@map("novel_follows")`;
`AuthorFollow { id, userId → User (Cascade), authorId → User
(Cascade, the followed author), createdAt,
@@unique([userId, authorId]), @@map("author_follows") }`;
`ChapterLike { id, userId (Cascade), novelId → Novel (Cascade),
chapterNumber Int, createdAt, @@unique([userId, novelId,
chapterNumber]), @@map("chapter_likes") }`;
`Novel.followerCount Int @default(0)`; `Chapter.likeCount`,
`Chapter.commentCount Int @default(0)`. No counter column on `User`
for author follows — the count is an aggregate query. Backfill: none
needed (no engagement exists; 0 is correct).

### Acceptance — 019A

- [ ] Bookmark/follow/like a published novel/chapter as an
  authenticated user → 200; repeat → 200 same state; no duplicate
  rows (unique constraints).
- [ ] Unlike/unfollow/unbookmark → 204; repeat → 204.
- [ ] Engagement on a DRAFT/ARCHIVED novel or UNPUBLISHED chapter →
  404 `{error:"NOT_FOUND"}` (no oracle).
- [ ] Unauthenticated write → 401 `{error:"UNAUTHENTICATED"}`.
- [ ] Counters increment/decrement transactionally (like → likeCount
  +1; unlike → −1; never negative under concurrency — test with
  concurrent writers).
- [ ] Anonymous reader sees counts but no per-user state; cannot hit
  a 401 path on `/api/public/*` (unchanged behavior).
- [ ] `GET /api/reader/bookmarks` returns only the caller's rows;
  another user's list is unreachable (no endpoint).
- [ ] Follow an author → 200 with `{ author: { id, displayName } }`;
  repeat → 200 same state; no duplicate rows.
- [ ] Unfollow author → 204; repeat → 204.
- [ ] Follow self → 400 `{error:"INVALID_INPUT"}`; follow
  nonexistent author → 404 `{error:"NOT_FOUND"}`.
- [ ] `GET /api/reader/author-follows` returns only the caller's
  rows; another user's author-follow list is unreachable.
- [ ] `GET /api/reader/engagement/author` returns the caller's
  follow state + aggregate count; no other user's state leaks.
- [ ] Library page renders the caller's bookmarks, novel follows,
  and author follows; anonymous is redirected.
- [ ] API + web suites green, e2e 011 BASELINE-OK (no regression),
  lint + tsc + vue-tsc clean, en/id parity, axe zero violations.

## Child 019B — Comments + moderation

### Goal

Authenticated readers can discuss published chapters in chapter-scoped
threads (depth ≤ 1), rate-limited and sanitized; novel staff can
moderate.

### Routes (`/api/reader/*`)

- `POST /api/reader/comments`
  `{ novelId, chapterNumber, body, parentId? }` → 201
  `{ comment: { id, novelId, chapterNumber, parentId, body,
  status: "VISIBLE", author: { displayName }, createdAt } }`.
  Rate-limited (Q1). Chapter must be PUBLISHED else 404. `parentId`
  must be a top-level comment on the same chapter else 400.
- `GET /api/reader/comments?novelId=&chapterNumber=&cursor=` → 200
  `{ comments: [...], page }` — ANONYMOUS-READABLE (no session
  required): VISIBLE comments only (+ DELETED tombstones to preserve
  thread shape), author `displayName`s, ordered top-level by
  createdAt asc with replies nested. HIDDEN comments excluded
  (except to staff/authors per Invariant 5).
- `PATCH /api/reader/comments/:commentId` `{ body }` → 200 — own
  comment only, within 15 minutes of `createdAt` (Q4); else 403.
- `DELETE /api/reader/comments/:commentId` → 204 — own comment only
  (→ DELETED tombstone). Staff may delete any comment on their
  novels (staff gate).
- `POST /api/reader/comments/:commentId/reports` `{ reason }` →
  201 `{ report: { commentId, reason, createdAt } }` (dedup: repeat
  → 200 same). Rate-limited (Q1).
- Staff (membership + `novel:update` on the novel's workspace,
  resolved server-side; else 403):
  - `GET /api/reader/novels/:novelId/moderation/reports?status=` →
    200 `{ reports: [{ comment, reason, reporterCount, createdAt }] }`
    (reporter identities are NOT exposed — counts only).
  - `POST /api/reader/comments/:commentId/hide` → 200
    `{ comment: { ..., status: "HIDDEN" } }` (audit-logged).
  - `POST /api/reader/comments/:commentId/unhide` → 200.
- Comment visibility summary: VISIBLE → everyone; HIDDEN → staff +
  comment author (with notice); DELETED → `"[deleted]"` tombstone to
  everyone.

### Web UI

- `CommentThread` component on `/read/[slug]/[number]`: anonymous-
  readable list; composer rendered only with a session; reply
  affordance (depth ≤ 1 — no reply button on replies); edit affordance
  within the 15-minute window; delete with confirm; report dialog with
  the pinned reasons.
- Moderation queue view on the novel settings surface (workspace
  side): reported comments with hide/unhide/delete actions. Minimal,
  §15-conformant — not a redesign.

### Migration (additive)

`Comment { id, userId → User (Cascade), novelId → Novel (Cascade),
chapterNumber Int, parentId String? → Comment (SetNull),
body String, status CommentStatus @default(VISIBLE),
createdAt, updatedAt, @@index([novelId, chapterNumber, status,
createdAt]), @@map("comments") }`;
`enum CommentStatus { VISIBLE, HIDDEN, DELETED }`;
`CommentReport { id, commentId → Comment (Cascade), reporterId →
User (Cascade), reason ReportReason, createdAt,
@@unique([commentId, reporterId]), @@map("comment_reports") }`;
`enum ReportReason { SPAM, HARASSMENT, SPOILER, OFF_TOPIC, OTHER }`.

### Acceptance — 019B

- [ ] Post a comment on a published chapter → 201; comment appears
  in the anonymous-readable list with the author's displayName
  (never email).
- [ ] Comment on an UNPUBLISHED chapter or invisible novel → 404.
- [ ] Unauthenticated post → 401.
- [ ] Rate limit: 2nd comment within 10s → 429; 101st comment in
  24h → 429; 21st report in 24h → 429 (values per confirmed Q1).
- [ ] Body > 5000 chars → 400; HTML in body is stored as text and
  rendered escaped (XSS probe: `<script>` appears as text).
- [ ] Reply to a top-level comment → 201 nested; reply to a reply →
  400.
- [ ] Edit own comment within 15 min → 200; after 15 min → 403;
  edit another's → 403. Delete own → 204 → tombstone visible.
- [ ] Report with each pinned reason → 201; duplicate report →
  200 same; invalid reason → 400.
- [ ] Non-staff hide attempt → 403; staff hide → 200, comment HIDDEN
  (invisible to others, visible to staff + author with notice);
  unhide restores.
- [ ] Report queue lists reported comments with counts (no reporter
  identities); staff-only (non-staff → 403).
- [ ] `Chapter.commentCount` counts VISIBLE only; hide/delete
  decrements transactionally.
- [ ] API + web suites green, e2e 011 BASELINE-OK (no regression),
  lint + tsc + vue-tsc clean, en/id parity, axe zero violations.

## Child 019C — Notifications + privacy

### Goal

Readers get in-app notifications for the events they asked for, with
honest async delivery and pinned privacy-respecting defaults.

### Pinned event names (the contract 019A/019B emit; 019C consumes)

- `novel.chapter_published { novelId, chapterNumber }` — emitted by
  the 012 publication worker when a publication reaches PUBLISHED.
- `comment.replied { commentId, parentCommentId, novelId,
  chapterNumber, replierUserId }` — emitted by the 019B comment
  write path.
- `comment.moderated { commentId, novelId, action: HIDDEN | DELETED,
  moderatorUserId }` — emitted by the 019B staff-moderation path.

### Routes (`/api/reader/*`; all require session)

- `GET /api/reader/notifications?cursor=` → 200
  `{ notifications: [{ id, type, novelId, chapterNumber?,
  actorDisplayName?, createdAt, readAt? }], unreadCount, page }` —
  caller's own only.
- `POST /api/reader/notifications/:id/read` → 200 (own only).
- `POST /api/reader/notifications/read-all` → 200.
- `GET /api/reader/notifications/preferences` → 200
  `{ preferences: [{ type, enabled }] }` (absent row = pinned
  default, Q5).
- `PUT /api/reader/notifications/preferences`
  `{ preferences: [{ type, enabled }] }` → 200 (upsert per type;
  unknown type → 400).

### Fan-out (Invariant 7)

- The 012 publication worker emits `novel.chapter_published` and
  enqueues a fan-out job (new queue in `apps/worker`, following the
  `publication-jobs.ts` facade). The worker resolves the notification
  set: novel followers ∪ author followers (the novel's `createdBy`
  user; deduped — a user following both gets ONE notification),
  honoring `NEW_CHAPTER` preferences (opted-out users are skipped at
  insert time), and inserts notifications in bounded batches
  (≤ 500/batch). The publish path never awaits fan-out.
- `comment.replied` → one notification to the parent comment author
  (if `COMMENT_REPLY` enabled and replier ≠ author).
- `comment.moderated` → one notification to the comment author (if
  `MODERATION_NOTICE` enabled).
- Notification rows carry NO email, NO credential material — only
  IDs, type, and display names.

### Web UI

- Notification bell in the reader header (unread count badge;
  updates on page load — polling only, no websocket in 019).
- `/read/notifications` — inbox page: list, mark-read, read-all,
  empty state. Requires session.
- Preferences section (on the notifications page): master switch +
  per-type toggles with the pinned defaults labeled. The master switch
  is a UI-only affordance with no separate preference row: turning it
  OFF writes `enabled: false` for all three pinned types; turning it
  ON writes `enabled: true` for all three. The
  `PUT /api/reader/notifications/preferences` route accepts only the
  pinned `NotificationType` values.
- Privacy controls: a short "what's private" panel (bookmarks,
  follows, likes, preferences are private; counts and displayName
  are public) — informational, no toggles in 019 (lists are
  private-by-default with no public option).

### Migration (additive)

`Notification { id, userId → User (Cascade), type NotificationType,
novelId → Novel (Cascade)?, chapterNumber Int?,
actorUserId → User (SetNull)?, readAt DateTime?,
createdAt, @@index([userId, readAt, createdAt]),
@@map("notifications") }`;
`enum NotificationType { NEW_CHAPTER, COMMENT_REPLY,
MODERATION_NOTICE }`;
`NotificationPreference { userId → User (Cascade),
type NotificationType, enabled Boolean,
@@unique([userId, type]), @@map("notification_preferences") }`.

### Acceptance — 019C

- [ ] Follow a novel → publish a chapter → follower receives a
  `NEW_CHAPTER` notification (via the async fan-out; publish
  latency does not grow with follower count — assert with a
  follower-count fixture).
- [ ] Follow an author → publish a chapter on any novel by that
  author → follower receives a `NEW_CHAPTER` notification; a user
  following both the novel and the author receives exactly one.
- [ ] Reply to a comment → parent author receives `COMMENT_REPLY`;
  self-reply → no notification.
- [ ] Staff hides a comment → comment author receives
  `MODERATION_NOTICE`.
- [ ] Preference opt-out (`NEW_CHAPTER` disabled) → no notification
  on publish; absent row → pinned default.
- [ ] Inbox lists own notifications only; another user's inbox is
  unreachable; unauthenticated → 401.
- [ ] Mark-read / read-all update `unreadCount` correctly.
- [ ] Notification rows contain no email or credential material
  (assert on the response bodies).
- [ ] API + web + worker suites green, e2e 011 BASELINE-OK
  (no regression), lint + tsc + vue-tsc clean, en/id parity, axe
  zero violations.

## Child 019D — Synced reading progress

### Goal

Authenticated users' reading progress syncs server-side across devices,
superseding the device-local 014 progress for members. Anonymous
readers keep the 014 device-local behavior unchanged.

### Provenance

014's "Out of scope" named 019 as the owner of synced progress;
Klein decided (Q11, 2026-10-06) it is in scope for 019. Delivery-plan
row 153 does not list it — the deviation is recorded in §"Child
split", not silently absorbed.

### Routes (`/api/reader/*`; all require session)

- `PUT /api/reader/progress`
  `{ novelId, chapterNumber, scrollRatio?, clientUpdatedAt,
  deviceId? }` → 200
  `{ progress: { novelId, chapterNumber, scrollRatio,
  updatedAt } }`.
  - `clientUpdatedAt` is an ISO-8601 timestamp from the device;
    `scrollRatio` is `0..1` or omitted; `deviceId` is an opaque
    client-chosen string (never PII).
  - Merge semantics (last-write-wins by client clock): the write is
    applied only if `clientUpdatedAt` is NEWER than the stored
    `updatedAt`; an older or equal timestamp → 200 with the STORED
    (newer) state, no regression. The server never fabricates
    progress.
  - The novel must be engageable (Invariant 2) else 404
    `{error:"NOT_FOUND"}` (no oracle); rows are retained while a
    novel is unpublished, invisible until it is public again.
- `GET /api/reader/progress?novelId=<uuid>` → 200
  `{ progress: { novelId, chapterNumber, scrollRatio, updatedAt } |
  null }` — caller's own only (Invariant 4).
- `DELETE /api/reader/progress/:novelId` → 204 (idempotent; clears
  the synced position).

### Client merge with device-local 014 progress

- On page load WITH a session: the client fetches the server row and
  takes `max(deviceLocal.updatedAt, server.updatedAt)` as the
  effective position, then writes the winner back (idempotent PUT).
- On page load WITHOUT a session: the 014 device-local behavior
  applies unchanged (zero network).
- Offline writes queue locally and sync on reconnect via the same
  last-write-wins PUT — no conflict UI in 019 (the newer timestamp
  always wins; ties keep the stored row, deterministic).

### Web UI

- The reader page (`/read/[slug]/[number]`) loads the server
  progress when a session exists and seeds the scroll position from
  the merged winner; it saves progress via the debounced PUT
  (the existing 014 save cadence is reused, not re-specified here).
- A "synced" indicator on the reader page when the server row is
  the current position (honest label; absent when offline or
  anonymous). §15-conformant, en+id.

### Migration (additive)

`ReadingProgress { id, userId → User (Cascade),
novelId → Novel (Cascade), chapterNumber Int,
scrollRatio Float?, deviceId String?, updatedAt DateTime,
@@unique([userId, novelId]), @@map("reading_progress") }`.
Backfill: none (no server progress exists; absent row = no position).

### Acceptance — 019D

- [ ] PUT progress as an authenticated user → 200 with the stored
  position; repeat with a NEWER `clientUpdatedAt` → overwrites;
  repeat with an OLDER `clientUpdatedAt` → 200 with the stored
  (newer) position, no regression.
- [ ] Unauthenticated PUT/GET → 401 `{error:"UNAUTHENTICATED"}`.
- [ ] `GET /api/reader/progress` returns only the caller's row;
  another user's progress is unreachable (no endpoint).
- [ ] PUT on an invisible novel → 404 `{error:"NOT_FOUND"}`
  (no oracle).
- [ ] Anonymous reader: 014 device-local progress still works with
  zero network (no regression — 014 acceptance re-run green).
- [ ] Reader page with session: merged position = newer of
  device-local vs server; the "synced" indicator reflects the
  source honestly.
- [ ] API + web suites green, e2e 011 BASELINE-OK (no regression),
  lint + tsc + vue-tsc clean, en/id parity, axe zero violations.

## Acceptance and verification (parent)

- [ ] All four children implemented, diff-reviewed
  (APPROVE/APPROVE_WITH_FINDINGS), and committed separately.
- [ ] Each child's acceptance checkboxes pass with evidence recorded
  in the child's handoff (no re-claiming across children — §13).
- [ ] Full suites green at completion: API, web, worker,
  `pnpm e2e` 011 BASELINE-OK, lint, tsc, vue-tsc.
- [ ] i18n en/id leaf parity for the new `social:` subtree
  (programmatic check, both locales).
- [ ] No `/api/public/*` behavior change except Q8's ruled additive
  counts; anonymous reader boundary verified unchanged (013/014
  acceptance re-run green).
- [ ] Contract status → IMPLEMENTED only when all four children are
  committed (the 017/018 pattern).

## Migration and rollback

- One additive migration per child (019A: engagement tables +
  counters incl. `AuthorFollow`; 019B: comment tables; 019C:
  notification tables; 019D: the `ReadingProgress` table).
  Migrations are idempotent (the project's `DO`-block convention per
  GAP-030) and additive-only: no column alteration, no data rewrite.
- Backfill: none required — counter columns default 0 (no engagement
  exists yet); preference rows are lazy (absent = default).
- Rollback: dropping the new tables/columns is safe for story data
  (engagement is non-canonical social data, not story truth), but it
  DESTROYS engagement history — document this in the migration
  header. Never roll back by resetting the database.
- Concurrent writers: unique constraints are the dedup backstop;
  counters update in the same transaction as the engagement write.

## Documentation and handoff

- Each child implementer delivers a COMPLETE handoff report: actor
  identity; every file changed; each acceptance checkbox with
  PASS/FAIL evidence; full test counts actually executed (no
  re-claiming another actor's runs — §10/§13); lint+tsc+vue-tsc
  results; every GAP recorded; UNVERIFIED/honest-gap items;
  shared-file list. Backends MODEL_UNVERIFIED per GAP-013.
- Every obstacle, confusion, unsupported claim, and deviation is
  recorded in `docs/implementation/ISSUES-AND-GAPS.md` with a GAP
  number BEFORE any workaround (standing rule). Never silently
  rewrite this contract — contradictions need an explicit author
  decision recorded with its scope.
- Update `docs/implementation/progress.md`,
  `docs/14-progress/CURRENT.md`, `docs/implementation/test-matrix.md`
  with the verified child scope.
- Engram checkpoint protocol per §14 (or the compact handoff fallback
  with the ISSUES-AND-GAPS.md entry if Engram is unavailable).

## Open questions

- **Q1 — Comment/report rate-limit values.** Recommendation: comments
  1 per 10 seconds per user (burst) + 100 per 24h per user; reports
  20 per 24h per user; engagement writes (like/follow/bookmark) use
  the app-wide limiter only (idempotent upserts bound abuse).
  Reviewer confirms; Klein may override the numbers.
- **Q2 — Moderation model. DECIDED by Klein (2026-10-06).** There is
  NO platform moderation team: all moderation is handled by the
  author / novel creator (the staff model — workspace members holding
  the existing `novel:update`, resolved server-side; Invariant 6).
- **Q3 — No new workspace capabilities.** Recommendation: social auth
  is identity-based (any authenticated user); staff moderation reuses
  the existing `novel:update`; `packages/auth/authorization.ts` stays
  untouched. Reviewer confirms.
- **Q4 — Threading depth and edit window.** Recommendation: depth ≤ 1
  (replies to top-level only); authors may edit their own comment
  within 15 minutes of posting, then it is immutable; delete anytime
  (tombstone). Reviewer confirms.
- **Q5 — Notification channel and preference defaults. DECIDED by
  Klein (2026-10-06).** IN-APP ONLY (no email/push in 019);
  `NEW_CHAPTER`, `COMMENT_REPLY`, `MODERATION_NOTICE` ALL default ON;
  master switch + per-type toggles.
- **Q6 — Guest comments.** Recommendation: authenticated-only; no
  guest comments in 019 (spam/abuse surface). Reviewer confirms.
- **Q7 — Follow author. DECIDED by Klein (2026-10-06).** INCLUDED:
  019A covers follow-novel AND follow-author (dedup-keyed
  `AuthorFollow`, private lists, aggregate counts, self-follow →
  400; 019C fan-out resolves novel followers ∪ author followers).
- **Q8 — Additive count fields on the frozen 013 shapes.**
  Recommendation: `likeCount`/`commentCount` on the chapter shape and
  `followerCount` on the novel shape are additive-only and
  backward-compatible (the GAP-049 precedent from the 013 review).
  The REVIEWER must explicitly rule APPROVE on this deviation; if not
  approved, counts move to authenticated/anonymous aggregate
  endpoints and the 013 shapes stay byte-identical. Klein is informed
  of the ruling.
- **Q9 — Like visibility.** Recommendation: counts public, per-user
  like state private (Invariant 4). Reviewer confirms.
- **Q10 — Auto-hide on report threshold.** Recommendation: NO
  auto-hide in 019 — reports queue for staff review (avoids
  brigading false positives). Reviewer confirms.
- **Q11 — Server-side reading-progress sync. DECIDED by Klein
  (2026-10-06).** IN SCOPE: new child 019D implements server-side
  progress sync for authenticated users (last-write-wins by client
  clock, private to the owning user, anonymous device-local
  behavior unchanged). Provenance: 014's "Out of scope" named 019
  as the owner; delivery-plan row 153 does not list it (deviation
  recorded in §"Child split").

## Review record

### Round 1 — contract review (2026-10-06): APPROVE_WITH_FINDINGS

Reviewer: contract reviewer — a separate actor from the contract
author, the amendment author, all future implementers, and all prior
reviewers. Backends MODEL_UNVERIFIED per GAP-013.

**Q2/Q5/Q7/Q11 faithfulness check (Klein's decisions, not re-decided):**
- Q2 (moderation model): DECIDED — recorded as decided in §"Open
  questions"; faithfully reflected in Invariant 6 (staff = workspace
  members with `novel:update`, no new capabilities) and §"Scope /
  Out of scope" ("no platform moderation team ... by Klein's
  DECISION"). ✓
- Q5 (notification defaults): DECIDED — recorded as decided; faithfully
  reflected in Invariant 7 ("all ON (in-app only)", absent row =
  default ON) and the 019C acceptance. ✓
- Q7 (follow author): DECIDED — recorded as decided; faithfully
  reflected in the 019A scope (follow novel AND follow author), the
  `AuthorFollow` migration, the routes, and the 019C fan-out
  (novel followers ∪ author followers via `Novel.createdById`,
  consistent with the 013 public author identity = the novel's
  creator). ✓
- Q11 (progress sync): DECIDED — recorded as decided; faithfully
  reflected as the new child 019D with its routes, merge semantics,
  migration, and acceptance. ✓

**Q8 ruling: APPROVE** (the reviewer's explicit ruling). The additive
count fields (`likeCount`/`commentCount` on the chapter shape,
`followerCount` on the novel shape) are ruled contract-conformant
under the GAP-049 precedent (013's additive extensions to 012's
frozen shapes, ruled LEGITIMATE by an independent reviewer), with
conditions: (a) additive-only — no existing 013 field renamed,
removed, or restructured, shapes stay backward-compatible; (b) counts
reflect only published-visible engagement (`commentCount` counts
VISIBLE comments only, per 019B; no per-user state); (c) no auth
object, no session handling, no 401 path introduced into
`/api/public/*` (013 Invariant 2 preserved); (d) the deviation is
recorded as GAP-068 in `docs/implementation/ISSUES-AND-GAPS.md`
BEFORE implementation (standing rule). The fallback (authenticated /
anonymous aggregate endpoints) is NOT needed.

**Q1/Q3/Q4/Q6/Q9/Q10: all CONFIRMED as recommended.**
- Q1: 1 comment/10s + 100/24h per user; reports 20/24h; engagement
  writes on the app-wide limiter only (idempotent upserts bound
  abuse). Reasonable for a webnovel platform; no change.
- Q3: identity-based social auth; staff moderation reuses existing
  `novel:update`; `authorization.ts` untouched. Minimal-privilege
  design; no change.
- Q4: depth ≤ 1; 15-minute self-edit window, then immutable. Standard
  for chapter comments; no change.
- Q6: authenticated-only comments. Spam/abuse control; no change.
- Q9: counts public, per-user state private. Consistent with
  Invariant 4; no change.
- Q10: no auto-hide on report thresholds. Avoids brigading false
  positives; no change.

**Findings (all P3, fixed inline in this round):**
- F1 — §"Goal and reason" said `/api/reader/*` is "authenticated by
  construction", contradicting the anonymous-readable comment list.
  Fixed: "authenticated by construction for all writes (the
  comment-list read is anonymous-readable per Invariant 1)".
- F2 — Milestone line said "M5 (author/admin tools completion)"; the
  capability ledger lists CAP-12 as M5/M8 (and 014 cites "M5/M8 per
  CAP-12"). Fixed to "M5/M8 (CAP-12 spans both; 019 delivers the M5
  social surfaces)".
- F3 — The notification "master switch" had no defined semantics
  against the pinned preference types. Fixed: UI-only affordance —
  OFF writes `enabled: false` for all three pinned types, ON writes
  `enabled: true` for all three; the preferences route accepts only
  the pinned `NotificationType` values.
- F4 — Edit-after-hide was unspecified: a hidden comment's author
  could edit within the window and evade moderation review. Fixed:
  HIDDEN comments are not editable by the author (→ 403 even within
  the window; staff unhide restores editability); delete remains
  available.
- F5 — The report rate limit (Q1) had no acceptance checkbox. Fixed:
  019B acceptance now includes "21st report in 24h → 429".

**Consistency checks (all pass):**
- Frozen 013/014 reader boundary: `/api/public/*` unchanged except
  the ruled Q8 counts; social writes are authenticated-only
  `/api/reader/*`; the 013 no-oracle 404 rule is preserved on every
  social read/write.
- No new capabilities (`authorization.ts` untouched), no new auth
  endpoints, one additive migration per child, all relations
  `onDelete: Cascade` / `SetNull` pinned.
- Privacy invariants hold: lists private, counts aggregate,
  `displayName` only in public comment shapes, authors/staff never
  see who bookmarked/followed/liked, progress private to the owning
  user.
- 019C fan-out: bounded ≤500/batch, async BullMQ, publish path never
  awaits fan-out; every notification traces to a real event.
- 019D: last-write-wins by client clock with the stored row winning
  ties (deterministic); offline writes queue locally and sync on
  reconnect via the same PUT; anonymous device-local 014 behavior
  unchanged (zero network).
- 019D provenance deviation is explicitly recorded in three places
  (§"Amendment record", §"Child split" provenance note, §019D
  "Provenance") — adequate; it names the 014 "Out of scope" handoff
  as the source and the delivery-plan row 153 gap as the deviation.
- Each child's acceptance checkboxes are concrete and independently
  checkable (019A engagement CRUD/dedup/privacy, 019B comment
  lifecycle/rate limits/moderation states, 019C fan-out/inbox/
  preferences, 019D sync endpoints/merge/privacy); handoff-evidence
  expectations (§"Documentation and handoff") require complete
  per-child reports with no re-claiming.

**Observations (not findings):** the 019D last-write-wins-by-client-clock
merge is honest about clock-skew risk (a device with a wrong clock can
clobber progress); acceptable for a v1 sync contract — a
server-received-at tiebreak is a future refinement, not a blocker.

(Round 2+: filled by child diff reviews at implementation time.)

## Backend verification (contract author)

- Verified 2026-10-06 against repo HEAD `6ce0eeb`: no social models
  exist in `schema.prisma` (no `Bookmark`/`NovelFollow`/`ChapterLike`/
  `Comment`/`Notification` models) — all 019 schema work is additive.
- Verified the `requireActor` session→userId pattern
  (`ai-routes.ts:132-145`, reused by `canon-routes.ts`,
  `character-routes.ts`, `definition-routes.ts`) — 019's
  `/api/reader/*` family reuses it; 401
  `{error:"UNAUTHENTICATED"}` is the established convention.
- Verified the app-wide `@fastify/rate-limit` (`app.ts:174`) with
  per-route overrides — 019B's comment limiter follows the
  auth register/login per-route precedent.
- Verified the BullMQ queue/worker facade (`apps/worker/src/
  publication-jobs.ts:428-442`, fake-queue test pattern at
  `:233`) — 019C's fan-out follows it; no new infrastructure.
- Verified `User.displayName` exists (the public comment identity)
  and `User.email` is unique (never exposed — Invariant 4).
- Verified `packages/auth/authorization.ts` carries `novel:update`
  (the staff-moderation capability, read-only reuse) and no social
  capabilities — none are added by this contract.
- Dependency blobs checked via `git hash-object`: 014
  `d9a77fce5e2a2eb81f658b803267c43cb3264a2f`, 013
  `423407c560693bc6ba1ef4ffddbf33c5023bf059`, 012
  `b815a887b027082ccf1e949189af93081ee7d77e`.
- Backends MODEL_UNVERIFIED per GAP-013 (standing).
