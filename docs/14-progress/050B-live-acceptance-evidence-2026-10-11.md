# NF-WF-050B live acceptance evidence excerpt — 2026-10-11

Persisted from the ephemeral acceptance stack logs (`%TEMP%\nf-050b-logs\`)
per disposition-review finding: raw scenario-11 worker evidence must survive
temp cleanup. Full narrative: `docs/14-progress/CURRENT.md`, section
"NF-WF-050B live author-workflow acceptance — 2026-10-11".

Environment: revision dcb2f49 + applied stash `nf050b-acceptance-wip`
(GAP-120/121 fixes, uncommitted at evidence time). Owned disposable stack:
API :3000 (pid 27732), web :3001 (Nuxt dev), worker pid 33072 (queues
workflow-runs / memory-rebuild / publication / notifications) on Redis
container `nf-redis-acceptance` :6399, PostgreSQL container `nf-pg-5433`,
database `novelforge_acceptance_050b`, gateway :20127.

## Scenario 11 — scheduled publication through the real BullMQ worker

publicationId `8141b479-2e6c-488b-a1db-e6e16544a46f`, chapter 3
(`3950d88c-8b44-4188-88fa-c9cea4c6ff02`) of novel
`61840872-d6bd-4280-9c5c-e8abd8e39876`, worker log verbatim excerpt:

```
{"level":"info","msg":"scheduled publication refused deterministically","publicationId":"8141b479-2e6c-488b-a1db-e6e16544a46f","code":"REVIEW_STALE"}
{"level":"info","msg":"publication job processed","publicationId":"8141b479-2e6c-488b-a1db-e6e16544a46f","outcome":"refused","code":"REVIEW_STALE"}
{"level":"info","msg":"scheduled publication refused deterministically","publicationId":"8141b479-2e6c-488b-a1db-e6e16544a46f","code":"REVIEW_STALE"}
{"level":"info","msg":"publication job processed","publicationId":"8141b479-2e6c-488b-a1db-e6e16544a46f","outcome":"refused","code":"REVIEW_STALE"}
{"level":"info","msg":"publication job processed","publicationId":"8141b479-2e6c-488b-a1db-e6e16544a46f","outcome":"published"}
```

Reading: scheduling itself conservatively stales 050A data, so receipts
pinned before scheduling refuse deterministically (REVIEW_STALE) with no
public flip and retained audit; after a post-schedule fresh review the same
publicationId published at due time (worker executed 113 ms after
`scheduledFor` 2026-10-11T07:39:05.409Z). Anonymous public API after
publication: HTTP 200 with the pinned content (`publishedVersionNumber: 1`,
`publishedAt: 2026-10-11T07:39:05.522Z`); before publication the same
endpoint returned 404 for the draft chapter.

## Reader-visibility negatives (scenario 9, server side)

- Published chapters 1/2/3: anonymous `GET /api/public/novels/<slug>/chapters/N` → 200 with pinned published content.
- Draft chapter: 404.
- UI chapter-reader render blocked by GAP-122 (`/read/:slug` lacks
  `<NuxtPage />`; NUXT_E4016) — recorded in ISSUES-AND-GAPS.md; server-side
  gate verified, UI repair is a separate reviewed task.

## Disposition review

Separate read-only disposition review (agent DispositionReview050B,
2026-10-11): **APPROVE** (confidence 0.95). Findings (both minor, priority 3):
working tree is 14 modified files (13 applied-stash files + this CURRENT.md
section — accounted); scenario-11 raw logs existed only under %TEMP% —
remedied by this file.

## Scenario 9 reader UI re-run (2026-10-11, post-GAP-122 repair)

Independently re-run check (NOT a persisted excerpt): after the
contract-reviewed GAP-122 repair (pages/read/[slug].vue moved to
[slug]/index.vue; NotificationBell/CommentThread runtime imports; new
routing.test.ts), scenario 9 was repeated in the real browser
(chrome-devtools, :3001, live acceptance stack, 2026-10-11):

- `/read/050b-scale-acceptance-novel-c` renders the overview (title,
  byline, chapters 1–3 listed).
- `/read/050b-scale-acceptance-novel-c/1` renders the pinned published
  body (Version 1, 66 words); NEXT CHAPTER client navigation renders
  chapter 2 (Version 2, 24 words) with correct PREVIOUS/NEXT links;
  "Kembali ke novel" returns to the overview; direct load + reload work.
- `/read/050b-scale-acceptance-novel-c/4` (never published) shows the
  localized not-found surface; API 404; no content leak.
- id locale: reader chrome fully localized (Notifikasi, BAB, kata, Versi,
  Tersinkron, Suka, KOMENTAR, Kirim); canonical content untranslated.
- Console: no `NUXT_E4016`, no NotificationBell/CommentThread resolution
  warnings. One pre-existing hydration warning observed under id locale —
  recorded as GAP-123, out of the GAP-122 contract scope.
- Suites re-run green: reader, notifications, both axe suites, library,
  new routing test, i18n parity test; `vue-tsc` exit 0.

The scenario-11 worker excerpt above remains the persisted original with
source timestamps; only this scenario-9 section is a fresh independent
re-run.
