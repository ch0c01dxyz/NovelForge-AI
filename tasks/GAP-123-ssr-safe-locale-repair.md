# GAP-123 SSR-Safe Locale Repair — Bounded Contract (2026-10-11)

**Task:** repair the pre-existing locale hydration mismatch (GAP-123):
server HTML always renders `en` while the client hydrates a
localStorage-selected locale (`id`), producing `Hydration text content
mismatch` + `Hydration completed but contains mismatches` on every
locale-aware SSR page (observed on the chapter reader).
**Status:** Follow-up implemented and independently reviewed — APPROVE.
See the review trail for the exact reviewed artifact and verification evidence.

## Observed source (verified at dcb2f49 + uncommitted 050B acceptance WIP)

- `apps/web/app/composables/useLocale.ts` holds the locale in a
  **module-level** `ref("en")`, initialized from
  `globalThis.localStorage` when present. On the server `localStorage` is
  undefined → SSR always renders `en`; on the client the ref initializes
  from `localStorage` before hydration → first client render disagrees
  with server HTML → Vue hydration mismatch warnings (GAP-123 evidence).
- Public shape consumed by 117 call sites: `useLocale() →
  { locale: readonly(Ref<"en"|"id">), t(path, params?), setLocale(next) }`.
  `t()` semantics: primary dict → en fallback → return the key path.
  Single switcher UI: novel workspace page (`setLocale(l)`).
- Module-level state is also a **cross-request leakage risk** in the Node
  server: one request that mutates locale state would leak to subsequent
  requests. Today the server never calls `setLocale`, but the module-level
  ref is the wrong ownership; the fix must move per-request state into
  Nuxt `useState` (request-scoped payload) so server requests are
  isolated.
- Test harness: plain vitest + jsdom, **no Nuxt runtime**. Existing
  `useLocale.test.ts` calls real `useLocale()` directly. Sibling
  convention for Nuxt auto-imports in tests: `vi.stubGlobal` (reader.test.ts).
  `useApi`/`useSession` etc. rely on Nuxt auto-imports of `ref`/`computed`,
  which work in the vitest harness only because tests stub globals or
  because `ref` is imported from "vue" explicitly in that file.
  `useLocale.ts` imports `ref, readonly` from "vue" explicitly today.

## Root cause class

Client-only persistence (localStorage) is invisible to SSR → server and
client disagree on first paint. Correct fix class: make the locale visible
to the server via a **cookie** (`useCookie`), keep localStorage as a
migration source for existing users whose preference lives only there,
and drive BOTH the server render and the client hydration from the same
request-scoped state (`useState`). Nuxt serializes `useState` payload to
the client, so hydration matches by construction.

## Frozen repair (smallest complete change at the shared locale layer)

1. `apps/web/app/composables/useLocale.ts` — rewrite state ownership:
   - `useLocale()` becomes a real composable that resolves a
     **request-scoped** ref via Nuxt `useState("locale", () => "en")`
     (server: per-request; client: hydrated from payload). Remove the
     module-level ref.
   - Server-side initial value: read the `nf-locale` cookie
     (`useCookie("nf-locale")`, httpOnly-free, `sameSite: "lax"`,
     path `/`, maxAge 1 year). Cookie value must be validated: only
     `"en" | "id"` accepted, anything else → `"en"`.
   - Client-side one-time migration, initialized once per client app/load
     (follow-up amendment): inside the client guard, resolve a
     request/app-scoped once-flag `useState("locale-migrated", () => false)`
     BEFORE scheduling; only the first consumer in a load flips it to `true`
     and registers the single `onNuxtReady` callback — later consumers register
     nothing. No module-level or server-wide mutable state (the server never
     enters the client guard). Callback body: if no `nf-locale` cookie exists
     and `localStorage["novelforge-locale"]` holds a valid locale, complete the
     migration for BOTH supported legacy values — set state only when the
     legacy value differs from the current locale, and ALWAYS write the cookie,
     including when the legacy value already equals the current locale (the
     earlier `legacy === state.value` early-return left legacy-`en` users
     permanently unmigrated). Adoption stays POST-HYDRATION via `onNuxtReady`
     (never at composable init / pre-mount — a pre-mount mutation lands in the
     hydration render and re-creates the mismatch). Precedence: cookie wins;
     localStorage is consulted only when the cookie is absent; outside
     `setLocale` the migration never overwrites localStorage. This preserves
     existing users whose preference is stored only in localStorage
     (acceptance requirement): their first post-repair load still paints the
     cookie/`en` value, then flips reactively after hydration, and every later
     SSR load renders the adopted locale directly from the cookie. Document
     this one-load limitation in the entry.
   - All storage/cookie access wrapped in try/catch; throwing or
     unavailable storage must never break rendering (falls back to `en`).
   - Public shape pinned explicitly: `useLocale()` returns
     `{ locale: readonly(state) as Readonly<Ref<SupportedLocale>>, t,
     setLocale }` — shape and readonly semantics unchanged from the
     current implementation (117 call sites).
   - Test stubs (plain vitest + jsdom, no Nuxt runtime; amended): `useState`
     stubbed as a KEYED map — `vi.stubGlobal("useState", (key, init) => per-key
     `ref` lazily created via `init()`)` — because the locale state and the
     once-flag are two distinct keys; `freshLoad()` clears the map in
     `beforeEach` (simulated new load). `vi.stubGlobal("useCookie", () =>
     cookieRef)` seeded per test (jsdom has no request cookie). `onNuxtReady`
     stubbed to QUEUE its callback into a per-test array, never to invoke it;
     tests flush explicitly via `flushReady()` (drains the queue), asserting
     the PRE-flush state first (legacy storage must not change the hydration
     state) and the adopted/persisted state after. The `onNuxtReady` mock's
     call history is cleared explicitly per test (`mockClear()`) — the
     once-per-load call-count proof must not rely on `vi.resetModules()`
     side effects. The client guard is
     `typeof window !== "undefined"` (true in jsdom; `import.meta.client`
     is NOT defined under plain vitest). Isolation acceptance case 9
     re-seeds the state stub between
     two `useLocale()` calls with different simulated cookies (no real
     Nuxt app context exists in this harness).
   - `t()` unchanged: same dict resolution, en fallback, key-path
     return. `setLocale(next)`: validates input, writes state + cookie +
     localStorage (each write individually try/catch-guarded).
2. SSR safety: because state now lives in `useState`, the server never
   holds cross-request mutable locale state; each request resolves its
   own copy from its own cookie header.
3. Tests:
   - Update `apps/web/app/composables/useLocale.test.ts`: existing 5
     tests must still pass (jsdom: `useCookie`/`useState` need
     `vi.stubGlobal` stubs — follow reader.test.ts convention; localStorage
     remains real in jsdom).
   - NEW regression cases in the same file: cookie `id` → initial locale
     `id` (hydration-agreeing); invalid cookie value → `en`; localStorage
     migration adopts `id` when cookie absent; legacy `en` with no cookie
     COMPLETES migration (cookie written `en`, locale stays `en`);
     PRE-flush assertions that legacy storage has not changed the hydration
     state (locale/cookie untouched before `flushReady()`); once-per-load
     verified by CALL COUNTS (one `onNuxtReady` registration and one legacy
     storage read per load across multiple consumers; a fresh load registers
     again); unavailable/throwing storage → no throw, locale `en`;
     `setLocale` writes all three stores; missing-key en fallback unchanged
     (already covered, keep).
4. Docs: ISSUES-AND-GAPS GAP-123 entry updated (fix applied + verification);
   CURRENT.md GAP-123 line updated; contract file itself records the
   review trail.

## Allowed paths (complete list)

- `apps/web/app/composables/useLocale.ts`
- `apps/web/app/composables/useLocale.test.ts`
- `docs/implementation/ISSUES-AND-GAPS.md` (GAP-123 entry only)
- `docs/14-progress/CURRENT.md` (GAP-123 status line only)
- this contract file

Everything else forbidden. No page/component changes (the composable's
public shape is unchanged), no i18n dict changes, no dependency additions,
no nuxt.config changes (no route rules, no global middleware), no
ClientOnly wrappers, no SSR disabling, no warning suppression.

## Acceptance cases (all must be actually observed)

1. SSR HTML for a reader page contains the cookie locale's strings
   (cookie `id` → server HTML has `Memuat…`-class id strings; no cookie →
   `en`).
2. Browser hydration on a direct load produces NO
   `Hydration text content mismatch` / `Hydration completed but contains
   mismatches` warnings in en and in id, on reader and workspace pages.
3. Existing localStorage-only user: preference adopted post-hydration;
   subsequent SSR loads render id from the cookie directly.
4. Invalid (`xx`) cookie value → en render, no crash.
5. Storage throwing/unavailable → no exception; en default still applies.
6. Locale switch through the workspace UI still works and persists across
   reload (cookie now carries it).
7. Missing-key en fallback still resolves (`review.showFullHash` in id).
8. Suites: `useLocale.test.ts` green; web typecheck exit 0; ESLint exit 0
   on both changed TypeScript files (the unused `ref` import is deleted);
   the six GAP-121 suites + reader suites stay green (public shape
   unchanged).
9. Request isolation: two simulated requests with different cookies see
   different locales (unit-level check; the state stub is re-seeded
   between calls — no module-level ref remains).
10. Divergent stores: cookie `id` + localStorage `en` → cookie wins
    (`id`); localStorage NOT overwritten outside `setLocale`.
11. Returned `locale` is readonly (typecheck rejects assignment).
12. Migration runs once per page load, verified by call counts: exactly one
    `onNuxtReady` registration and — on a load without a cookie — one
    legacy-storage read across multiple consumers (a present cookie
    short-circuits the callback before storage); a second `useLocale()` call
    in the same load registers nothing; a fresh load registers again.
    Pre-flush, legacy storage must not have changed the hydration state
    (locale/cookie untouched before `flushReady()`).

## Verification stack

Reuse the owned 050B acceptance stack after liveness check (API :3000,
web :3001, PG nf-pg-5433/novelforge_acceptance_050b preserved, Redis
nf-redis-acceptance :6399, gateway :20127). Browser verification via
chrome-devtools MCP against :3001: direct loads, refreshes, client
navigation in en and id on reader + workspace; console captured clean of
hydration mismatch warnings; one missing-key fallback exercised through
the UI.

## Review trail

- 2026-10-11 separate read-only contract review (scout): CHANGES_REQUESTED.
  Blocker: contradictory migration-timing wording (pre-mount init vs
  post-hydration). Corrections applied verbatim: single onNuxtReady
  post-hydration mechanism; explicit useState/useCookie/onNuxtReady stub
  spec; explicit readonly shape line; precedence + no-overwrite rule;
  acceptance cases 10–12 added.
- 2026-10-11 bounded re-review (same separate reviewer): **APPROVE** on
  the corrected contract; all findings addressed; no new defects.
  Implementation authorized.
- 2026-10-11 final exact-diff review (separate read-only reviewer,
  different actor from implementer): **APPROVE** on frozen diff
  `.git/gap123-exact-diff-20261011.patch` (sha256
  `926b5f5fb59e8b4edc9effeba77974ac7fe5198d2c011bfa5ae3e862f48e84e4`;
  working tree byte-identical to the patch post-image, blob hashes
  `c09a716`/`70aba02` matched, hunks verified line-by-line, HEAD
  confirmed at dcb2f49). Four info findings, no blockers: contract
  "sync localStorage" clause is a no-op by construction (adoption reads
  that same key); review-session identity method note; implementer
  browser/suite evidence not re-executed by the reviewer (read-only
  scope); minor vi.spyOn mock-restore hygiene. No commit performed;
  commit authority remains with the author under the repository
  authorization policy.
- 2026-10-11 external re-review of the applied repair (post-APPROVE,
  outside the original review scope): four defects — see the amended
  status line; recorded under GAP-123 in
  `docs/implementation/ISSUES-AND-GAPS.md` before any workaround. The
  APPROVE above covers only the earlier diff and does not cover this
  follow-up.
- 2026-10-11 follow-up amendment frozen: status line, repair migration
  clause (once-flag + both-legacy-values completion), test-stub spec
  (queued `onNuxtReady`, keyed `useState`, explicit flush), new-regression
  list and acceptance case 12 amended as quoted above.
- 2026-10-11 separate read-only contract-amendment review (scout, different
  actor from implementer): **APPROVE** on the amendment, 4 info findings,
  no blockers (pre-change blob hashes `c09a716d`/`70aba02` confirmed
  byte-identical to the earlier approved diff post-images). Info findings
  1 and 2 applied verbatim as clarifications above (case 8 adds ESLint on
  both changed files + explicit `ref`-import deletion; case 12 narrows the
  storage-read count to the cookie-absent path). Finding 3 (once-flag
  flipped at registration, before the deferred callback) accepted as
  bounded behavior. Finding 4 (stale ISSUES "Next action" paragraph)
  handled in the follow-up docs step.
- 2026-10-11 follow-up implementation done; frozen diff
  `.git/gap123-followup-diff-20261011.patch` (round-1 sha256
  `be65d058c632fdd190842bebe7833f5dd8f920a06afb33dfaabc70d5417379ca`,
  base blobs `c09a716d`/`70aba02` re-verified, patch round-trip to
  working-tree blobs `279ada86`/`31d7e349` verified).
- 2026-10-11 separate read-only exact-diff review, round 1:
  **CHANGES_REQUESTED**. HIGH finding REJECTED as a false positive on
  mechanism but ACCEPTED as fragility: the reviewer claimed the
  once-per-load call-count test cannot pass because `vi.fn` history
  accumulates (config sets no clearMocks and `vi.resetModules()` does not
  clear mocks) — empirically disproven on vitest 5.0.3 with two probe
  specs (without `vi.resetModules()` history accumulates and the probe
  fails; with it, history is cleared) plus two full 18/18 suite runs of
  the exact round-1 diff. The hidden dependence of the count proof on
  that side effect is real fragility, so the suggested fix was applied
  anyway: explicit `onNuxtReadyMock.mockClear()` in `beforeEach`, and the
  stub spec above now requires it. LOW finding accepted: no test asserted
  ZERO legacy-storage reads on the cookie-present path (acceptance case
  12 wording) — the cookie-wins test now spies `getItem` and asserts 0
  legacy reads. INFO findings: byte-identity established by full-content
  comparison (reviewer has no shell); frozen-diff sha256 and blob hashes
  now recorded in the GAP-123 entry per earlier-diff practice; bounded
  once-flag behavior re-accepted; doc anchors verified consistent.
  Suite and lint re-run after the two fixes; diff re-frozen for the
  bounded round-2 review.
- 2026-10-11 bounded round-2 exact-diff review (separate reviewer, full
  toolset, read-only): **APPROVE** on the round-2 frozen diff (sha256
  `03f3f964b6cf50d0a36ec4445464b069c199280940c82c5b8bf36eeefef387d6`;
  base blobs `c09a716d`/`70aba02`; patch applied to a fresh base copy
  yields exactly the working-tree blobs `279ada86`/`4ada15b0`). The
  reviewer independently reproduced the resetModules probe (2/2,
  vi.resetModules() in vitest 5.0.3 does clear module-scope vi.fn
  history), confirmed both fixes, zero unaccounted hunks, and accurate
  trail wording. Two INFO: the round-1 patch file was overwritten by the
  round-2 freeze, so the round-1 test-file blob (`31d7e349`) is not
  byte-recomputable — the round-1 sha256 stays recorded above and future
  freezes must use distinct filenames; the try/finally spy-restore
  restructure of the two storage-failure tests is standard hygiene
  consistent with the earlier diff review's restore note. No commit;
  commit authority remains with the author.

## Independent reviewer

Separate read-only reviewer (different actor from implementer) reviews
this contract before implementation and the exact final diff after.
Implementation actor cannot self-approve. No commit; commit authority
remains per the repository authorization policy.
