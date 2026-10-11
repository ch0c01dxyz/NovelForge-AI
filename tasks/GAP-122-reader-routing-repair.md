# GAP-122 Reader Routing Repair — Bounded Contract (2026-10-11)

**Task:** separate reader-IA repair owning the GAP-122 fix (scenario 9 UI).
**Status:** FROZEN FOR REVIEW — implementation starts only after a separate
reviewer returns APPROVE on this contract; the final exact diff gets a second
separate review before any commit request.
**Status resolution (2026-10-11, retained evidence; historical status above
preserved verbatim):** the bounded independent re-review returned **APPROVE**
on this contract and on the companion scope-amendment proposal; the repair
was implemented the same day and browser-verified (closure evidence in
ISSUES-AND-GAPS GAP-122); the final exact-diff freeze review returned
**APPROVE** (freeze sha256 `66f1a3b091a80f382284b30978933cbaf3011b44d8b2f0776cd3c115a4eefb54`,
`.git/nf-050b-final-freeze-20261011.patch`; working-tree code byte-identical
to the frozen artifact; post-freeze edits limited to verdict-recording
status lines). Commit authority is separate and remains per the repository
authorization policy.

## Observed source (verified at dcb2f49 + GAP-120/121 WIP)

- `apps/web/app/pages/read/[slug].vue` — novel overview page (full standalone
  chrome: own `<main>`, NotificationBell slot, chapter list).
- `apps/web/app/pages/read/[slug]/[number].vue` — chapter page (full
  standalone chrome; ReaderChapterNav prev/next; CommentThread).
- Nuxt file-route nesting makes `[slug].vue` the PARENT of
  `[slug]/[number].vue`; the parent renders no `<NuxtPage />`, so the child
  never displays (`NUXT_E4016`). Server API is correct (published 200 / draft
  404 verified live); only the UI surface is broken.
- Component resolution (`.nuxt/components.d.ts`, default `pathPrefix: true`):
  registered names are `ReaderNotificationBell` (from
  `components/reader/NotificationBell.vue`), `ReaderCommentThread` (from
  `components/reader/CommentThread.vue`), `ReaderChapterNav`. The bare
  `<NotificationBell />` used by both reader pages is unresolved (observed
  hydration warning). `<CommentThread />` in the chapter page is unresolved
  by the same rule and will warn once the child renders.
  `<ReaderChapterNav />` resolves (Nuxt directory/filename prefix dedupe).

## Frozen repair (smallest change preserving URLs and existing design)

1. MOVE `apps/web/app/pages/read/[slug].vue` →
   `apps/web/app/pages/read/[slug]/index.vue`. The file gains one directory
   level, so every existing relative import is rewritten one level deeper
   (`../../composables/*`, `../../components/social/*` →
   `../../../composables/*`, `../../../components/social/*`); no other
   content change except the runtime import added in step 2. Sibling
   files `index.vue` and `[number].vue` in the same directory are independent
   routes — the unwanted parent/child nesting disappears. URLs unchanged:
   `/read/:slug` and `/read/:slug/:number`.
2. In BOTH reader pages, add explicit runtime imports (GAP-120 convention —
   explicit imports where Nuxt's prefixed auto-import names do not match the
   bare template names):
   - `import NotificationBell from "../../../components/reader/NotificationBell.vue";`
   - chapter page additionally: `import CommentThread from "../../../components/reader/CommentThread.vue";`
3. Update `apps/web/app/components/reader/reader.test.ts` import path
   `../../pages/read/[slug].vue` → `../../pages/read/[slug]/index.vue`.
4. NEW `apps/web/app/pages/read/routing.test.ts`: structure regression that
   fails if the NUXT_E4016 nesting is reintroduced — asserts
   `pages/read/[slug].vue` does NOT exist, `pages/read/[slug]/index.vue` and
   `pages/read/[slug]/[number].vue` DO exist, and the two page sources import
   `NotificationBell`/`CommentThread` explicitly (no bare auto-import
   reliance for the two non-dedupe names).
5. Docs: ISSUES-AND-GAPS GAP-122 entry updated to "fix applied, evidence
   recorded"; CURRENT.md scenario 9 disposition upgraded only with actually
   observed evidence; evidence doc annotated.

## Rejected alternatives

- `<NuxtPage />` inside `[slug].vue`: renders the overview AND the child page
  stacked (duplicate chrome) unless conditional hiding is added — larger diff,
  hydration complexity, no benefit over the sibling-route move.
- Route rules / route object rewrites in `nuxt.config.ts`: config-level
  indirection far from the pages; hides the file-structure invariant the
  regression test pins.
- Renaming components for auto-import friendliness: touches shared
  components used elsewhere; unrelated churn.

## Allowed paths (complete list)

- `apps/web/app/pages/read/[slug].vue` (delete via move)
- `apps/web/app/pages/read/[slug]/index.vue` (new; moved content)
- `apps/web/app/pages/read/[slug]/[number].vue` (imports only)
- `apps/web/app/components/reader/reader.test.ts` (import path only)
- `apps/web/app/pages/read/routing.test.ts` (new)
- `docs/implementation/ISSUES-AND-GAPS.md`, `docs/14-progress/CURRENT.md`,
  `docs/14-progress/050B-live-acceptance-evidence-2026-10-11.md` (records)

Everything else forbidden. No server/API/worker/publication-boundary changes;
no localization content changes; no design-system changes.

## Acceptance cases (all must be actually observed)

1. `/read/<slug>` renders the novel overview (title, byline, chapter list).
2. `/read/<slug>/<number>` renders the pinned published chapter body.
3. Direct load of both URLs, browser refresh on both, and client-side
   navigation overview → chapter → back all work.
4. Draft/unpublished chapters show the not-found surface, never content;
   foreign/other-novel slugs unchanged; server authorization/publication
   boundaries untouched (no API diff).
5. ReaderChapterNav previous/next links navigate between published chapters;
   reading-progress ("stopped at") behavior unchanged on the overview.
6. en renders English, id renders Indonesian, missing-key en fallback intact
   (no raw keys in the reader chrome).
7. Browser console free of `NUXT_E4016`, `Failed to resolve component:
   NotificationBell`, and `Failed to resolve component: CommentThread`.
8. Existing suites stay green: `reader.test.ts`,
   `reader-progress-sync.axe.test.ts`, `notifications.test.ts`,
   `notifications.axe.test.ts`, `library.test.ts` + new `routing.test.ts`.

## Verification stack and browser evidence

Reuse the owned 050B acceptance stack (API :3000, web :3001, PG
`nf-pg-5433`/`novelforge_acceptance_050b`, Redis `nf-redis-acceptance` :6399,
gateway :20127) after verifying actual liveness/ownership; do not trust
historical PIDs; preserve the acceptance database; child-only env overrides;
no secrets printed. Scenario 9 UI re-run happens in the actual browser
against the published chapter of the acceptance novel
(`050b-scale-acceptance-novel-c`).

## Independent reviewer

A separate read-only reviewer (different actor from this implementer) reviews
this contract before implementation, and the exact final diff afterward.
Commit only per the author's existing authorization policy.

## Review trail

- 2026-10-11 first contract review (read-only scout): investigation completed
  (root cause, registered names, importer map, dict/enum cross-checks,
  amendment numbering ≤22, import-depth defect found); actor failed to emit
  its final verdict on gateway upstream errors. Its recorded evidence was
  used to correct this contract's step 1 (relative-import depth on move).
  Verdict on the corrected contract: REVIEW_PENDING until a bounded
  re-review returns APPROVE; implementation does not start before that.
- 2026-10-11 bounded independent re-review (read-only scout, separate actor):
  **APPROVE** on the corrected contract and on the companion scope-amendment
  proposal 23–25. Implementation authorized under this verdict.
- 2026-10-11 implementation completed per the contract steps 1–5 (move +
  import-depth rewrite, NotificationBell/CommentThread runtime imports,
  reader.test.ts path update, new routing.test.ts, records). Verification:
  7 suites green (reader, notifications, 2 axe, library, routing, parity);
  `vue-tsc` exit 0; live-browser scenario 9 closure evidence recorded in
  ISSUES-AND-GAPS GAP-122.
- 2026-10-11 final exact-diff freeze review (read-only reviewer, separate
  actor): **APPROVE**, freeze_verified true, 3 info findings, no blockers.
  Post-freeze working-tree edits are limited to verdict-recording status
  lines in CURRENT.md / ISSUES-AND-GAPS.md; all code paths byte-identical
  to the frozen artifact. No commit performed; commit authority remains
  with the author under the repository authorization policy.
