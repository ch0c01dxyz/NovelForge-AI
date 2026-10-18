# NF-WF-056 — Global Monokai Pro UI/UX polish — Task contract

Status: IMPLEMENTED / REVIEWED / VERIFIED WITH DOCUMENTED LIMITS. Historical
dispatch and earlier outcomes below are superseded by the final review addendum.
Dispatched from
`tasks/NF-WF-056-monokai-pro-ui-polish-prompt.md`.

## 1. Goal

Migrate the entire existing NovelForge web UI (apps/web, Nuxt + Vue 3 +
Tailwind v4) from the warm stone/orange dark palette to a cohesive
Monokai Pro Classic design system, polish hierarchy/spacing/control states,
and polish toast notifications. Integrated working UI, not a mockup swap.

## 2. Author scope (fixed)

- All existing pages, layouts, shared controls, dialogs, and toast
  notifications are in scope. Token renames alone do not count.
- Inputs, textareas, selects, buttons, toasts are mandatory deliverables.
- No commit/push, no deploy, no data reset, no dependency additions, no
  theme picker, no custom fonts/icon packs. Visual scope only; product
  behavior, routes, authorization, flows unchanged.
- Existing stone/orange palette is superseded historical authority for this
  task (scoped author decision, recorded in DESIGN-TOKENS.md amendment).

## 3. Default interpretation (stated assumption)

Monokai Pro **Classic** (the default "Monokai Pro" filter of the official
Monokai Pro product by monokai.pro) is used. Not original Monokai, Dracula,
One Dark, or invented values.

## 4. Palette provenance

Official primary hues, verified against the official product site and
multiple sources that extracted values from the official Monokai Pro VS Code
extension (no local installed Monokai Pro theme exists on this host):

| Role in NovelForge | Token intent | Hex |
|---|---|---|
| Background (app canvas) | bg-0 | `#19181A` |
| Raised surface | bg-1 | `#221F22` |
| Card surface | bg-2 | `#2D2A2E` |
| Primary text | text | `#FCFCFA` |
| Error/destructive | error | `#FF6188` |
| Reference palette only | orange | `#FC9867` |
| Warning | warn | `#FFD866` |
| Success | ok | `#A9DC76` |
| Info/link | info | `#78DCE8` |
| Primary accent (active/CTA/AI) | accent | `#AB9DF2` |

Sources: monokai.pro (official); `subtheme-dev/monokai-pro`
`colors/default.yaml` ("all colors pulled from the official vscode
extension"); `Kirlovon/monokai-ghostty` Monokai Pro; `monokai-pro.nvim`
palette. All list the same six accents plus `#2D2A2E`/`#19181A` (and
`#221F22` for the second dark step). Cross-checked 2026-10-18.

Derived shades (dimmed text, borders, tint fills) are documented per-value
in the amended DESIGN-TOKENS.md and must pass the contrast floor below.

Semantic accent mapping decision: purple `#AB9DF2` = primary accent (active
nav, primary CTA, AI affordances); blue `#78DCE8` = links/info; green
`#A9DC76` = success; yellow `#FFD866` = warning; red `#FF6188` =
error/destructive. Official orange `#FC9867` is reference palette only —
no semantic role (per the generated OpenDesign system). Reader manuscript
prose keeps the literary serif voice and is not indiscriminately recolored.

Reconciled derived shades (final, after the generation run): bg-3 `#39363A`,
border `#8E8B8E`, border-strong/focus `#A9A7AA`, text-dim `#BDBBBE`,
text-faint `#A3A1A3`, accent-hi `#BAB0F5`, accent-ink `#19181A`. Deviations
from the specimen: app keeps translucent `-dim` tints, its compact 13px
control density (not the specimen's 44px controls), 2px focus offset, and a
neutral `--color-nf-border-focus` (GAP-051 D2 role). Authoritative table:
`docs/design/DESIGN-TOKENS.md` (Monokai Pro Classic section).

## 5. Baseline (verified this session)

- HEAD `f42af8aecdac4c5baf4abb82dde64fd86044332b`, branch `main`.
- Working tree clean except the untracked dispatch prompt file.
- Stash `nf050b-acceptance-wip` preserved. No clean/reset/stage-all.
- Engram binding: host-verified session `01a14432-1f35-7527-835f-e757e70f28e9`,
  project `novelforge-ai`; used for compact checkpoints only.

## 6. OpenDesign provenance

- Daemon healthy; foundation project `novelforge-writer-workspace-5378`
  (writer-workspace/index.html, artifact complete) preserved untouched.
- Refinement project created: `novelforge-monokai-polish` (id
  `novelforge-monokai-polish-5c6e`).
- Brief collected and confirmed: Product UI / Evolve an existing brand /
  Foundations + core components.
- Generation run commissioned via `start_run`: agent `codex` (Local Codex
  CLI 0.163.0, no cloud billing dependency), requestId
  `a24e1f68-4df0-45d4-8b9c-58ce2a7ec05c`, runId
  `ad5da719-1622-40cc-8f4e-83a4658b8b16`. **SUCCEEDED** (~9 min): single
  `index.html` deliverable (85.6 KB, syntax-validated), 24 tokens, 54 field
  states, 7 notification specimens, 9 page families; 61 measured contrast
  pairings pass (min 4.64:1 normal text, 3.54:1 boundaries/focus). The
  inner agent's model of record: purple = primary/AI, blue = links/info,
  status = symbol + color, orange reference-only.

## 7. Page/state acceptance matrix

15 Vue page files enumerated from source (baseline; additions must be
discovered, not capped). Matrix columns: route | family | role | en/id |
viewport(s) | states exercised | evidence | result. Families:

| # | Route/file | Family |
|---|---|---|
| 1 | `app/pages/index.vue` | Author home + create wizard entry |
| 2 | `app/pages/sign-in.vue` | Authentication |
| 3 | `app/pages/admin/index.vue` | Platform admin (Gateways/Models/Profiles/Routing/Audit tabs, forms, dialogs, pager, toasts) |
| 4 | `app/pages/browse/index.vue` | Browse/discovery |
| 5 | `app/pages/read/library.vue` | Reader library |
| 6 | `app/pages/read/notifications.vue` | Reader notifications |
| 7 | `app/pages/read/authors/[authorId].vue` | Author profile |
| 8 | `app/pages/read/[slug]/index.vue` | Novel detail |
| 9 | `app/pages/read/[slug]/[number].vue` | Chapter reader (prose) |
| 10–14 | `app/pages/workspaces/[workspaceId]/novels/[novelId]/{index,recovery,simulation,moderation,endgame}.vue` | Writer workspace, recovery, simulation, moderation, endgame |
| 15 | `app/pages/workspaces/[workspaceId]/ai-studio/index.vue` | AI Studio |

Shared component families covered through the pages above:
platform-admin (GatewayList, ModelCatalog, ProfileMappings, RoutingOverview,
AdminPager), author/NewNovelWizard, ai-studio/DefinitionDetail, discovery
(SearchBox, GenreChips, NovelCard, ContinueReading), workspace panels
(ReferenceLibrary/Ingest, DnaEditor, NarrativePanel, Antagonists, PolicyList,
ScaleReviewPanel, HealthMemoryPanel), reader/ReaderChapterNav, plus the
toast stack.

States per control family: default, hover, focus-visible, active, disabled,
readonly (where applicable), invalid + inline message, loading, long-content.
Toast: success/error/warning/info where events already exist — no invented
demo events.

## 8. Regression guards (NF055 must stay fixed)

- Model sync returns `{ discovered: number }` including `0`; rendered toast
  count matches actual server responses.
- No undefined color tokens; success/error toasts readable on their fill.
- 401 expired session is not labeled a provider failure; no false success on
  partial/failed gateway output; server authorization untouched.

## 9. Verification plan

- Focused web vitest (changed surfaces: platform-admin, author home, admin
  page, axe tests, useLocale) + full web typecheck (`vue-tsc --noEmit`) +
  scoped ESLint.
- Real browser: desktop + narrow/mobile widths, keyboard navigation,
  focus-visible, 200% zoom, long en/id labels, select/option states,
  validation states, toast stacks, key dialogs.
- Measured computed contrast: normal text ≥ 4.5:1, large ≥ 3:1, boundaries/
  focus ≥ 3:1. jsdom axe noted as non-proof for color contrast.
- Screenshots of every matrix row under the ignored local artifact root.
- Independent read-only review of the exact final diff before close.

## Outcome (2026-10-18)

Implemented and verified in the working tree; **not committed** (author
review precedes separate publication authorization). Final diff: 44 tracked
files modified, 0 staged (43 reviewed + `.gitignore` from finding #3). Verification: `vue-tsc
--noEmit` exit 0; full web vitest **96 files / 613 tests pass**; scoped
ESLint exit 0; computed-token contrast 29 pairings all pass (min text
4.64:1, min boundary 4.21:1); live Chromium evidence at desktop / 390 px /
200%-layout widths, en+id, keyboard focus ring measured `2px solid
#BAB0F5`/2 px offset (`.nf-artifacts/nf056/`, now gitignored). Full table:
`.nf-artifacts/nf056/evidence.md`.

Independent final exact-diff review (read-only, separate actor): **APPROVE_
WITH_FINDINGS, no blockers**. Findings #2 (token-doc contradiction), #3
(`.nf-artifacts/` not ignored), #4 (diff-count bookkeeping) — fixed.
Finding #1 (programmatic-focus ring on the wizard `tabindex="-1"` heading
now visible via the app-wide focus baseline) — **accepted as-is**: the ring
marks dialog-open focus (a11y-positive), the heading is non-interactive,
and suppressing it again would reintroduce invisible dialog focus.

Open limits: GAP-126 (live SUPER_ADMIN admin tabs/toast pixels + data-
bearing pages not re-shot; no retained credential, live-data population
forbidden). Record-only; closure path documented there.

## 10. Boundaries

Live data (nf-pg-5433/novelforge_acceptance_050b, Redis 6399) never reset or
populated for screenshots; empty story routes use owned disposable fixtures.
No LLM calls needed for styling. Docs updated: DESIGN-TOKENS.md amendment
(annotating superseded orange rules, not erasing), CURRENT receipt, this
contract; ISSUES-AND-GAPS.md is the single blocker register.

## Final review addendum — 2026-10-18

The author subsequently authorized review/repairs then commit/push. Root final
proof and exact review are recorded in CURRENT and NF-WF-057. Added actual
disposable-DB/API browser coverage for15routes, admin/toasts/gateway form and
fixture-populated writer/public reader; GAP-126's missing rendered evidence is
closed. Real model discovery2980 matched the toast; error401contrast5.69:1.
Native select popup capture and native browser chrome zoom remain unclaimed;
CSS200%layout/text scaling doubled measured control height. Full state/role/
viewport cross-product is not claimed. Earlier613test evidence is retained;
root's full631tests plus final affected37tests and API38tests are subsequent.
No live fixtures/reset, credentials stored, or human approval inferred.
