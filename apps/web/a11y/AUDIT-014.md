# Manual accessibility audit — NF-WF-014 discovery + reading progress

## Approved D2 implementation — 2026-10-14

The author approved #6f6a63 for discovery search, inactive genre chips, sort
and load-more boundaries. Applied with existing accent focus/active states
preserved and low-contrast hover border overrides removed. Isolated Chrome
against the main working-tree web app verifies computed normal/hover borders
for search, sort, load-more and active all-genres in en/id. Corrected sRGB
ratios on bg-0/bg-1/bg-2: 3.69/3.43/3.13 (the proposal's larger values are
superseded). Inactive facet rendering lacked live data; component tests cover
both active selections and inactive boundary classes. No fixture was mutated.
This is scoped D2 evidence, not full audit closure. Prior real 200% zoom and
reduced-motion evidence remain retained; human NVDA/VoiceOver stays deferred.
See docs/14-progress/batch4-approved-integration-2026-10-14.md.

## Active author scope amendment — 2026-10-13

The author explicitly defers NVDA testing to future draft/backlog, matching
the earlier VoiceOver + Safari decision. **GAP-051 human screen-reader
verification is DEFERRED_BY_AUTHOR_DECISION**, not verified complete.
NVDA + Firefox and VoiceOver + Safari are no longer current acceptance
prerequisites. Preserve every historical result below with its original scope;
unperformed human checks, including #13/#14 announcements, remain unverified
and deferred. Do not request their repetition or completion in the active batch.

This changes test scope only: retain accessible names, semantic markup,
keyboard access, focus behavior, live regions, English/Indonesian localization
and automated accessibility protections. Technical DOM checks may proceed but
are not substitutes for deferred human speech observations. Contrast, viewport,
reduced-motion, zoom and functional-reader evidence remain separately scoped.
The author reports unavailable Indonesian speech on their Windows setup; no
general platform limitation is inferred. No installed software is removed.
Earlier active-NVDA requirements and gate conclusions below are historical
where inconsistent with this amendment. No full WCAG conformance is claimed.

**Scope:** `/browse` (listing, genre facets, search, continue-reading), reader novel page
(`read/[slug]` "you stopped at" marker), reader chapter page (`read/[slug]/[number]`
progress write). All reader surfaces keep `noindex` (Q4).

**Standard:** WCAG 2.2 AA. **Rule: no known AA failures may ship** (stop-the-task).

**Automated half:** `apps/web/app/a11y/discovery.axe.test.ts` — checked-in vitest-axe,
`wcag2aa` + `wcag22aa` tags, `en` + `id`, covering NovelCard, GenreChips, SearchBox,
ContinueReading. Result at last run: **0 violations** (2026-10-06).

## Checklist

### Keyboard (no pointer)
- [ ] Tab order on `/browse`: skip link → search box → facet chips → sort select →
      novel cards → load-more. No traps; every control reachable.
- [ ] Genre chips are real `<button>`s; arrow-key navigation is a nice-to-have,
      Tab/Enter/Space is the requirement.
- [ ] Sort `<select>` opens with Alt+Down / Space; selection re-renders the list.
- [ ] Load-more button keeps focus after new items append (focus is not dropped to body).
- [ ] Escape in the search box clears the query; debounced results do not steal focus.

### Screen reader (named: NVDA + Firefox, VoiceOver + Safari — human verification)
- [ ] **PENDING HUMAN VERIFICATION (2026-10-06; tracked as GAP-051):** a full screen-reader pass over
      `/browse` (search-as-section, facet group, results list) and the novel-page
      "you stopped at" marker has not been performed — no blind screen-reader
      access is available in this implementation environment. This is the one
      manual item that cannot be honestly completed by the implementer; it must
      be done by a human with a named screen reader before ship. The automated
      axe half (above) covers what automation can cover.

### Contrast (WCAG 2.2 AA: 4.5:1 text, 3:1 UI)
- [ ] Body/meta text on stone surfaces (text-dim, text-faint) meets 4.5:1 —
      verified against `docs/design/DESIGN-TOKENS.md` token pairs (list pairs here).
- [ ] Facet chip borders and the active-chip indicator meet 3:1.
- [ ] `<mark>` highlight in search snippets keeps 4.5:1 for the marked text.

### Viewports: 360 / 768 / 1024 / 1440
- [ ] 360px: facet chips wrap without horizontal scroll; novel cards stack single column.
- [ ] 768px: two-column card grid engages without overflow.
- [ ] 1024/1440px: content stays in the 700px reader measure (no full-bleed lines).

### Reduced motion
- [ ] `prefers-reduced-motion`: no layout animation on card hover; search debounce has
      no animated indicator to suppress.

### 200% zoom (1280px → 640px CSS)
- [ ] No clipped controls, no two-dimensional scroll on `/browse`; skip link still works.

### lang / i18n
- [ ] `lang` attribute flips `en`/`id`; all `discover:`/`progress:`/`genre:` strings
      resolve in both locales (axe suite runs both; missing-key fallback verified).
- [ ] Snippet `<mark>` markup never splits a word mid-glyph in either locale.

### Announcements / live regions
- [ ] Search result count is announced via `aria-live="polite"` (no double announcement
      with the debounce).
- [ ] The 404-drop in ContinueReading announces nothing (silent by design, Invariant 5).

## Sign-off
Automated: 0 axe violations (en+id) — 2026-10-06.
Manual items above: keyboard/contrast/viewports/reduced-motion/zoom to be completed by
human verification; **screen-reader pass explicitly pending — see the note above.**

## NF-WF-023C release-verification note (2026-10-07)

**Automated half:** NOT re-executed in the 023C battery — the battery stopped at Box 1
(`pnpm lint` failed on GAP-097, an unused type import) per the contract's battery
failure handling, so Box 7 (axe suites) was not run on the release revision in 023.
Last OBSERVED automated result remains 0 violations (2026-10-06, NF-WF-014). No new
axe evidence in 023.

**Human screen-reader gate (GAP-051):** still OPEN. The NVDA + Firefox / VoiceOver +
Safari pass cannot be performed by agents and has no named human owner yet. This is
an explicit release gate: the 023C release decision is SHIP_WITH_KNOWN_GAPS at best
until a human auditor completes it. Owner: to be named (human auditor).

## GAP-051 human-audit coordination — 2026-10-13 (CLOSED; full evidence below)

**Auditor (named):** the author (`ch0c01d.xyz@gmail.com`) — sole human auditor for this
gate. Agent screen-reader simulation, automation, screenshots and scheduling are not
acceptable evidence for this pass.

**Host environment detection (OBSERVED 2026-10-13, Windows 10.0.26200 x64):**
- Chrome `154.0.8037.98` installed; Edge `154.0.4258.x` / `155.0.4283.45` installed.
- NVDA: NOT installed. Firefox: NOT installed. VoiceOver + Safari: N/A (macOS-only).
  [Superseded in part same day: NVDA 2026.2 + Firefox 157.0.1 installed with the
  author's explicit approval — see "Tool availability update" below.]
- Therefore **the active NVDA + Firefox combination was unavailable at detection.**
  Its human pass remains PENDING; VoiceOver + Safari is deferred per the decision
  below. Windows Narrator exists but is NOT a runbook-named
  combination; substituting it would require an explicit recorded author deviation
  decision before any results are collected.
- Active enablement path: install NVDA + Firefox on this host (NVDA + Chrome is NOT
  the runbook combination). VoiceOver + Safari testing is a future draft/backlog item.

**Author scope decision (2026-10-13, verbatim: "untuk fitur VoiceOver tidak perlu dan
tidak saya gunakan, masukkan fitur tersebut ke dalam draft dulu untuk kedepannya"):**
VoiceOver + Safari is NOT required and NOT used by the author; it moves to a future
draft/backlog item. The current GAP-051 gate combination is **NVDA + Firefox only**
(Windows host). The original two-combination runbook wording above and in the 023C
report is retained as history; this decision narrows the active gate scope. The gate
still requires an actual human NVDA + Firefox pass over the full scope (en + id)
before it can close — deferral of VoiceOver does not by itself satisfy any check.

**Scope for the human run (FULL — nothing narrowed), both `en` and `id`, via NVDA +
Firefox (per the author scope decision above):**

**Tool availability update (2026-10-13, later same day):** with the author's explicit
approval, the missing tools were installed via winget on this host: NVDA `2026.2`
(ProductCode NVAccess.NVDA; FileVersion 2026.2.0.57664, `C:\Program Files\NVDA\nvda.exe`)
and Firefox `157.0.1` (`C:\Program Files\Mozilla Firefox\firefox.exe`). The runbook
combination **NVDA + Firefox is now PERFORMABLE on this host**. Acceptance stack
verified up for the audit (web `:3001` HTTP 200, API `:3000` `/health` 200 against
`novelforge_acceptance_050b`). **No audit results exist yet — every manual check below
remains UNPERFORMED and PENDING until the named human auditor actually performs it.**
1. Existing AUDIT-014 scope: `/browse` (listing, facets, search, continue-reading),
   reader novel page ("you stopped at" marker), reader chapter page (progress write);
   keyboard/focus/accessible names, contrast, viewports, reduced motion, 200% zoom,
   lang/i18n, live regions — per the checklist above.
2. 050C SCALE/S3 additions (per CURRENT 2026-10-12/13): Policies-tab roving-tabindex
   keyboard reachability; focus order; accessible names on Enable/Disable, reason
   field, confirm; dialog behavior; status/error announcements (saving/forbidden/
   saveFailed); SCALE panel surfaces including the disabled state (AI section hidden,
   deterministic checklist present) in both locales.

**Results — partial, 2026-10-13 (auditor: author; NVDA 2026.2 + Firefox 157.0.1):**

Performed and reported by the author (human observations):
- `/browse` keyboard walkthrough except load-more: **PASS** per author observation
  ("semua tampil dan berfungsi dengan normal"); NVDA announced controls normally.
- Reader novel page "you stopped at" marker: **PASS** — present below the chapter
  list on the novel detail page and read by NVDA.

Findings (recorded, NOT fixed — no code changes authorized this session):
- **F1 (navigation gap):** the dashboard exposes no menu/link to `/browse`; the URL
  must be typed manually. Discoverability issue for the audited listing surface.
- **F2 (untestable, NOT a failure):** load-more did not render because acceptance
  data holds too few novels. Load-more checks (append focus retention, aria
  behaviour) stay **PENDING** until enough novel rows exist (author may create test
  novels via the UI — normal app usage — or provide equivalent data).
- **F3 (enhancement suggestion, author):** add tooltips so public users can discover
  that keyboard shortcuts exist. Routed to backlog; not an automated-axe violation.
- **F4 (CONFIRMED i18n defect, source-verified) — REPAIRED 2026-10-13, pending
  human re-verification:** the Cancel button rendered the raw
  key `workspace.common.cancel` in the DNA editor and Policies dialogs (author
  observation; works when clicked, so behavior was intact but the visible/announced
  label was wrong). Root cause: 9 call sites across 6 components used the
  non-existent key path `t("workspace.common.cancel")` while the correct key
  `common.cancel` exists in both locales ("Cancel"/"Batal"). Repair (author-
  authorized bounded scope): all 9 call sites switched to `t("common.cancel")`
  in `DnaEditor.vue`, `PolicyList.vue`, `Antagonists.vue`, `HealthMemoryPanel.vue`,
  `ReferenceIngest.vue`, `ReferenceLibrary.vue`; no translation aliases or
  dependencies added. New regression guard
  `apps/web/app/components/workspace/cancel-label-i18n.test.ts` follows the
  GAP-121 real-dictionary pattern (asserts ≥9 call sites with ≥1 per component,
  forbids the old path, pins "Cancel"/"Batal" against the real en+id modules —
  the id assertion is the stronger check and the vue-i18n English-fallback path
  is never relied on for these labels). Checks: focused vitest
  (cancel-label-i18n + scale-review-i18n-parity) 8/8; `vue-tsc --noEmit` exit 0;
  eslint exit 0 on the new test (.vue files outside eslint scope, pre-existing).
  Frozen artifact `.git/gap-051-f4-cancel-key-repair-r1.diff` sha256
  `162ebf99c1cda421b2423541e8b7fa5936a8a162d0449506554c5d808ddb3528`; separate
  read-only reviewer (`Gap051F4RepairReviewR1`) verified hash, exact scope,
  dictionary values and non-vacuous test: **APPROVE, zero findings**. ACC-1
  files untouched. Human re-verification of the affected Cancel buttons
  (visible label + NVDA announcement, en and/or id) still **PENDING**.

**Policies / S3 card portion — PERFORMED (2026-10-13, later):** the author reports
the S3/Policies keyboard, dialog and announcement checks ran normally; PASS apart
from F4 (raw-key Cancel label in DNA-edit and Policies dialogs). "Everything else
runs normally" per author.

**Still PENDING / not performed:**
- Load-more checks (F2 — blocked on data volume).
- Locale coverage (en and/or id) of the performed items was not stated by the
  auditor; per-locale confirmation remains PENDING.
- NVDA was closed by the auditor mid-session ("NVDA sudah saya cek dan normal, jadi
  saya tutup karena saya tidak membutuhkannya sama sekali"). NVDA merely functioning
  is not the gate: the gate verifies the experience of assistive-technology users,
  so the remaining items require NVDA active while performed. Waiving the
  screen-reader gate entirely would be a separate explicit recorded author deviation
  decision; none has been made.

**F4 human re-verification — PASS (2026-10-13, later; author observation):** the
author confirms the repaired Cancel labels now read "Cancel" / "Batal" and are
synchronized ("sudah normal ... tulisan 'Cancel' / 'Batal' sudah singkron").
Per-locale itemization of this check was not separately itemized by the author;
the label set is confirmed synchronized across the locales tested.

**Locale coverage — CONFIRMED (2026-10-13, later; author):** the author tested in
both locales and provided the exact localized reader-marker strings as evidence —
en: "you stopped at chapter 2"; id: "Anda berhenti di bab 2". This confirms dual-
locale (en + id) exercise of the audited surfaces and the correctness of the
marker's localization. Combined with the synchronized "Cancel"/"Batal" labels
(F4), both locales are covered for the retained PASS observations. No remaining
locale-coverage question.

**GAP-051 remains OPEN/PENDING** — the partial PASS does not close the gate.
F4 is TECHNICALLY REPAIRED (source fix, regression guard, separate review
APPROVE — see above) and now HUMAN-RE-VERIFIED; its earlier accessible-name
concern is closed. Locale coverage is CONFIRMED (en + id). The single remaining
gate item is **load-more** (blocked on suitable authorized test data — no
bulk-created acceptance data): the author may either authorize reasonable test
data creation or decide closure-with-known-gap, explicitly recorded.

**Checklist reconciliation (2026-10-13, full existing AUDIT-014 scope):**
- PERFORMED / PASS (retained human observations): `/browse` keyboard walkthrough
  except load-more; reader "you stopped at" marker; Policies/S3 keyboard, dialog
  behavior and status/error announcements; F4 re-verification (repaired
  Cancel/Batal labels visible and synchronized).
- PENDING — human: **none.** Load-more (F2) verified by the author on 2026-10-13
  with NVDA active, both locales — labels "Load more" (en) / "Muat lagi" (id),
  focus retention and announcements normal ("semuanya sudah sesuai dan normal
  tidak ada kendala"). Locale coverage (en + id) previously CONFIRMED with
  exact localized marker strings.
- **F2 data prepared (2026-10-13, author-authorized):** the author authorized
  creating test data ("1 novel baru 10 chapter dengan panjang sewajarnya
  webnovel rata-rata"). Executed via the RUNNING API's real routes (no
  manual story-table writes): flagship novel "GAP-051 Lentera Menara Kelabu"
  with 10 full-length Indonesian chapters, plus 20 clearly-labelled slim
  published novels ("GAP-051 Kalibrasi Pagination 01–20", 3 filler chapters
  each) because /browse paginates at 20 items/page over ACTIVE novels with
  ≥1 PUBLISHED publication and the threshold must be crossed for the
  load-more control to render. Verified: `/api/public/novels?limit=20` now
  returns 20 items with `hasMore=true`. Purge path: delete novels titled
  "GAP-051 …" (chapter/publication rows cascade). Seed script:
  `scripts/gap051-loadmore-seed.ts` (canonical; `apps/api/scripts/` copy for
  module resolution; not committed — test scaffolding).
- DEFERRED (author decision, future draft/backlog): VoiceOver + Safari.
- OUT OF SCOPE here (backlog findings, not gate items): F1 dashboard→`/browse`
  navigation; F3 keyboard-shortcut tooltips.
- Automated half (vitest-axe, en+id): 0 violations, 2026-10-06 — RETAINED.

**F2 load-more human check — PASS (2026-10-13, latest; author observation):**
with the test data in place (see above), the author re-performed the load-more
checks with NVDA active in both locales: the control renders and works
("semuanya sudah sesuai dan normal tidak ada kendala"), labels "Load more"
(en) / "Muat lagi" (id), focus retention and announcements normal.

## GAP-051 gate status — CLOSED for the screen-reader gate's evidenced scope (#1–#5, #11, #15, #16); QUALIFIED overall: original announcement items #13/#14 remain PENDING (missing evidence), and items #6–#10 were never in this gate (#6 reader progress write is functional; #7 contrast, #8 viewports, #9 reduced motion, #10 zoom are visual) — see the evidence table below

All items of the manual screen-reader gate **whose scope the guided
instructions established** are now covered by human evidence:
- `/browse` keyboard walkthrough (except load-more, which passed separately): PASS.
- Reader novel page "you stopped at" marker: PASS (en + id strings recorded).
- Reader chapter page progress write: NOT evidenced as a separate
  observation — row #6: PENDING (no recorded observation specifically
  addresses it); not part of the closure set.
- Policies/S3 card portion (keyboard, focus, names, dialogs, announcements,
  disabled-state panel): PASS.
- F4 accessible-name defect: repaired, separately reviewed (APPROVE, zero
  findings), and human-re-verified ("Cancel"/"Batal" synchronized).
- Locale coverage: en + id CONFIRMED throughout (exact localized strings
  recorded: "you stopped at chapter 2" / "Anda berhenti di bab 2";
  "Load more" / "Muat lagi"; "Cancel" / "Batal").
- Automated axe half: 0 violations (en+id), 2026-10-06, RETAINED.
- VoiceOver + Safari: DEFERRED to future draft/backlog by explicit recorded
  author decision — closed-out of scope, not waived mid-gate.

Evidence classes kept separate throughout: author human observations (this
file, verbatim quotes retained), read-only DB/API verification, retained
automated results, and the separately-reviewed F4 repair diff. GAP-051 is
closed as a human-verified manual screen-reader pass performed by the named
auditor (the author) with NVDA 2026.2 + Firefox 157.0.1 on this host. The
release-gate framing in the 023C note above is satisfied for GAP-051; other
023C release conditions (battery boxes 2–7, GAP-097) remain their own gates.

## GAP-051 evidence table — 2026-10-13 reconciliation (documentation-only)

Legend: OBSERVED = recorded this audit run; RETAINED = unchanged prior
evidence reused; UNSUPPORTED = recorded claim lacks evidence at its stated
scope; PENDING = not performed.

| # | Criterion (scope) | Locale / tool | Evidence | Status | Missing evidence |
|---|---|---|---|---|---|
| 1 | Automated axe half (NovelCard, GenreChips, SearchBox, ContinueReading; wcag2aa+wcag22aa) | en+id / vitest-axe | AUDIT-014 header, 2026-10-06 run | RETAINED PASS | — (re-run only if discovery components change) |
| 2 | `/browse` keyboard tab order: skip link → search → facets → sort → cards → load-more | en+id / author, NVDA+Firefox | Author observation 2026-10-13: "semua tampil dan berfungsi dengan normal" | OBSERVED PASS **(partial scope)** | The general statement + the guided instruction list did NOT explicitly enumerate sort-select open behavior (Alt+Down/Space) or Escape-clears-search. Per-item proof for those two sub-items: UNKNOWN |
| 3 | Genre chips are real buttons (Tab/Enter/Space) | en+id / NVDA+Firefox | Same author observation as #2 | OBSERVED PASS **(partial scope)** | Sub-item covered only if the author's "semua" is taken at the instructed scope; not separately itemized — annotated, not claimed per-item |
| 4 | Load-more: focus retention + append announcement | en+id / NVDA+Firefox | Author 2026-10-13 (latest): "semuanya sudah sesuai dan normal"; labels "Load more"/"Muat lagi" | OBSERVED PASS (data prepared per author authorization) | — |
| 5 | Reader novel page "you stopped at" marker | en+id / NVDA+Firefox | Author: en "you stopped at chapter 2" / id "Anda berhenti di bab 2" | OBSERVED PASS | — |
| 6 | Reader chapter page progress write | — / author | **No recorded observation** addresses the chapter-page progress write specifically | **UNSUPPORTED → PENDING** | Author: one pass over `read/[slug]/[number]` (progress write, keyboard + announcement) |
| 7 | Contrast: body/meta marked text and body text 4.5:1; facet chip borders and active-chip indicator 3:1 (UI boundaries — separate threshold from #12's marked text) | visual / author | **No recorded observation** | **UNSUPPORTED → PENDING** | Author: contrast pass per checklist items (or recorded decision to route to a separate visual-audit task) |
| 8 | Viewports 360 / 768 / 1024 / 1440 | visual / author | **No recorded observation** | **UNSUPPORTED → PENDING** | Author: viewport pass (or separate-task decision) |
| 9 | Reduced motion (`prefers-reduced-motion`) | visual / author | **No recorded observation** | **UNSUPPORTED → PENDING** | Author: reduced-motion pass (or separate-task decision) |
| 10 | 200% zoom (1280→640 CSS) | visual / author | **No recorded observation** | **UNSUPPORTED → PENDING** | Author: zoom pass (or separate-task decision) |
| 11 | `lang` attribute flips en/id; discover/progress/genre keys resolve | en+id / axe suite + author locale switch | Axe en+id (RETAINED) + author dual-locale usage with recorded strings | RETAINED PASS (automated) + OBSERVED (manual) | — |
| 12 | Snippet `<mark>` keeps 4.5:1 for the marked text and never splits a word mid-glyph | en+id / author | Not separately itemized; search was exercised per #2 | **INFERRED (weak)** — annotated, not claimed | Author: one explicit look at a search snippet `<mark>` (4.5:1 contrast + word integrity) in both locales |
| 13 | Search result count announced via `aria-live="polite"` (no double announcement with the debounce) — **original screen-reader-scope item, not a visual check** | en+id / NVDA+Firefox | Not separately itemized under the general browse pass | **PENDING (missing evidence)** — original gate scope, so the screen-reader gate closure is qualified until this is observed | Author: one explicit search-with-announcement observation with NVDA active |
| 14 | ContinueReading 404-drop announces nothing (silent by design) — **original screen-reader-scope item** | en+id / NVDA+Firefox | Not exercised/recorded | **PENDING (missing evidence)** — original gate scope; missing evidence is NOT a proven product defect | Author: observation if a 404 state is reproducible; otherwise record the untestable-state reason |
| 15 | Policies/S3: roving tabindex, focus order, accessible names (Enable/Disable/reason/confirm), dialog behavior, saving/forbidden/saveFailed announcements, disabled-state panel | en+id / NVDA+Firefox | Author 2026-10-13: checks ran normally ("semuanya sudah sesuai dan normal") | OBSERVED PASS **(general-scope)** | Sub-items were instructed explicitly and the author affirmed the set; per-sub-item quotes not captured — annotated as accepted general-scope pass |
| 16 | F4 Cancel accessible name (DNA editor + Policies dialogs) | en+id / NVDA+Firefox | Repair `.git/gap-051-f4-cancel-key-repair-r1.diff` sha256 `162ebf99…b3528`, reviewer APPROVE; author re-verification "Cancel"/"Batal" synchronized | OBSERVED PASS (repair OBSERVED, review RETAINED) | — |

**Reconciliation notes (documentation-only; no history rewritten):**
- The earlier "GAP-051 gate status — CLOSED" entry is accurate **for the
  screen-reader gate items whose evidence the guided instructions
  established** (#1–#5, #11, #15, #16). Two original screen-reader-scope
  items — #13 (aria-live result count) and #14 (ContinueReading 404
  silence) — were NOT separately evidenced and are **PENDING (missing
  evidence)**; while they remain unobserved, the screen-reader-gate closure
  is QUALIFIED, not unconditional. Their absence is a documentation/evidence
  gap, NOT a proven product defect.
- The WCAG-AA items #6–#10 were never part of the screen-reader
  gate: #6 (reader chapter progress write) is a functional keyboard/
  announcement check; #7–#10 (contrast, viewports, reduced motion, 200%
  zoom) are visual checks. All five remain PENDING for the broader manual
  checklist and are distinct from full-platform release acceptance.
- Release-gate cross-check: GAP-097 verified CLOSED 2026-10-07 (`ab7d71d`)
  — not a current blocker. The 023C battery boxes 2–7 were never re-run
  after the Box-1 stop; the 023C SHIP_WITH_KNOWN_GAPS decision is a recorded
  historical recommendation, not a current release decision. **GAP-039's
  author FUNCTIONAL sign-off leg is CLOSED** (explicit author decision,
  CURRENT + Engram #244) — older DELIVERY-PLAN/START-HERE paragraphs that
  read as "author acceptance pending" are stale pointers to that settled
  leg, not a reopened question; no sign-off request is made. SCALE GAP-039's
  parent capability gap and the live release gates remain their own open
  items.
- Commit-scope preparation (no staging performed): see CURRENT.md commit-scope
  proposal entry of the same date; Group C documentation diff requires a
  separate exact-diff review before it is proposed as ready.

## Batch Scope A technical evidence — 2026-10-13 (token-level + DOM; documentation-only)

Scope/version/locale: working tree at HEAD main `50609c0` (uncommitted),
en+id, Chrome-only automated suites. Classes kept separate: OBSERVED =
measured this run; DEFERRED_BY_AUTHOR_DECISION = human-only, deferred per
the NVDA/VoiceOver deferral amendments — never PASS.

Evidence-table status updates (documentation-only; rows above unchanged):

- **#7 contrast — OBSERVED FAIL (new product defects D1, D2).** WCAG 2.x
  relative-luminance math on the actual `@theme` tokens
  (`apps/web/app/assets/css/main.css`), independently recomputed by the
  coordinator with identical results:
  - D1: `--color-nf-text-faint #79716b` fails 4.5:1 on every surface it
    renders on — 4.13:1 (bg-0 `#0c0a09`), 3.84:1 (bg-1 `#161412`),
    3.50:1 (bg-2 `#201d1b`). AUDIT-014-scope sites: SearchBox.vue:55
    (12px hint), SearchBox.vue:51 (placeholder), GenreChips.vue:47
    (facet count), NovelCard.vue:53 (chapter count + date meta),
    ContinueReading.vue:70 ("Chapter N"), browse/index.vue:155 (results
    count). Bounded fix (NOT applied): raise the token (≈`#918a83` gives
    4.92/5.40/5.81 on bg-2/bg-1/bg-0); token is also used outside
    AUDIT-014 scope, so re-tokening fixes all surfaces at once.
  - D2: `--color-nf-border #33302d` / `--color-nf-border-strong
    #48443f` fail 3:1 as control/UI boundaries — border 1.51:1 (bg-0) /
    1.40:1 (bg-1); border-strong 2.05:1 (bg-0) / 1.90:1 (bg-1). Boundary
    sites: search input, facet chips, genre pills, continue-reading
    rows, sort select, load-more button. Active-chip indicator PASSES:
    `border-nf-accent-hi #fb923c` = 8.73:1 (bg-0) / 8.12:1 (bg-1).
    Bounded fix (NOT applied): boundary token with L≥0.121 on bg-1
    (≈`#6a655e` gives 3.42/3.18 on bg-0/bg-1); design call is the
    author's.
  - `text #f0eeec`, `text-dim #a8a29e` and `accent-hi` text pairs PASS
    (15.88 / 7.83 / 8.12:1 on bg-1). Token-level math is NOT
    rendered-pixel proof — rendered confirmation is human/visual and
    DEFERRED_BY_AUTHOR_DECISION.
- **#12 `<mark>` — OBSERVED PASS (contrast leg), new visual defect D3.**
  `ts_headline` wraps whole tokens only and `escapeSnippet`
  (public-discovery.ts:126) restores `<mark>` after escaping, so word
  integrity is structurally guaranteed in both locales. No `<mark>` CSS
  exists anywhere in the repo → UA-default black-on-yellow ≈17.1:1
  (bg-1) to ≈19.6:1 (bg-0) — passes 4.5:1, visually off-design. Bounded
  fix (NOT applied): one token-based CSS rule.
- **#8 viewports — static analysis only (limitation recorded).** Cards
  stack 1-col <640px / 2-col ≥640 (`sm:grid-cols-2`), chips flex-wrap,
  all three reader surfaces `max-w-[700px]`; no horizontal-scroll
  mechanism found. Rendered reflow and real browser zoom are NOT
  established here; the 200% zoom item (#10) explicitly requires actual
  zoom — DEFERRED_BY_AUTHOR_DECISION.
- **#9 reduced motion — static PASS.** Only `transition-colors` is used
  on hover; global `prefers-reduced-motion` guard in main.css; no
  animated debounce indicator. Rendered confirmation
  DEFERRED_BY_AUTHOR_DECISION.
- **#13/#14 — DOM mechanics OBSERVED; human announcement leg
  DEFERRED_BY_AUTHOR_DECISION.** #13: single `role="status"
  aria-live="polite"` region (browse/index.vue:150-151) inserted for
  queries ≥2 chars, one content swap per settled query (300ms debounce
  + 150ms fetch watch); whether NVDA reads both payloads is unobserved.
  #14: ContinueReading 404-drop renders nothing and no
  announcement-capable node exists; state may be untestable (404
  reproduction) — if ever reactivated, record the untestable-state
  reason instead of an observation.
- **#6 — functional leg OBSERVED (code + tests), human leg
  DEFERRED_BY_AUTHOR_DECISION.** `markRead(slug,n)` only after a 200
  load, never on 404 ([number].vue); storage zero-network
  `nf:reading-progress:v1` with try/catch hardening.
- **New defect D4 (SR verbosity, not AA):** the entire 20-card grid
  (`<ul … aria-live="polite">`, browse/index.vue:215) is a live region —
  genre/sort switches and load-more announce the whole card set.
  Bounded fix (NOT applied): visually-hidden status line for the
  load-more count; drop `aria-live` from the grid.
- **Reader progress / sort / Escape / highlight integrity — OBSERVED
  (code + suites).** Escape clears value+timer+emits '' (SearchBox.vue:
  27-33); native sort select; marker resolves only if the stored chapter
  is still published. Automated half re-run OBSERVED 2026-10-13:
  30/30 across `useReadingProgress.test.ts` (7),
  `useSyncedReadingProgress.test.ts` (6), `discovery.test.ts`,
  `discovery.axe.test.ts` (en+id, 0 violations) — supersedes the
  2026-10-06 RETAINED run as the latest automated evidence; no
  discovery/reader component changed since.
- Provenance: read-only investigator + coordinator recompute; no source
  or data changes; fixes D1–D4 are bounded proposals awaiting author
  decision — record now, repair under separate bounded contract + review.

## Batch 2 rendered evidence + bounded repair — 2026-10-14 (Chrome CDP, OBSERVED)

Scope/version/locale: live app on :3001, working tree at HEAD `50609c0`
(uncommitted), en (id surfaces unchanged by repairs — class-only diff).
Tool: real Chrome via CDP (computed styles + state changes), app served
from the uncommitted tree. Human screen-reader items remain
DEFERRED_BY_AUTHOR_DECISION; visual/viewport/contrast/zoom checks are
ACTIVE per the author's deferral-scope correction.

Measured (computed styles, not token assumptions):

- **D1 rendered CONFIRMED** — text-faint rgb(121,113,107): placeholder on
  bg-1 input 3.84:1; 12px search hint on bg-0 4.13:1; card meta "3 bab ·
  date" and "Bab N" on bg-1 3.84:1. REPAIRED (bounded): 12 swaps to
  text-dim rgb(168,162,158) (7.29:1 bg-1, 7.83:1 bg-0) across the
  AUDIT-014-scope files; token definition untouched.
- **D2 rendered CONFIRMED — still OPEN (proposal, not repaired)**: search
  input / chips / sort / load-more borders nf-border rgb(51,48,45)
  1.40:1 (bg-1); hover border-strong 2.05:1. No compliant boundary token
  exists in the design system; changing boundary colors is a design
  decision — recorded for the author, NOT repaired in this batch.
- **D3 MEASURED (no longer assumed)** — `<mark>` computed black-on-yellow
  rgb(0,0,0) on rgb(255,255,0) = 19.6:1 (PASS; off-design). Unchanged.
- **D4 rendered CONFIRMED** — the 20-card grid UL carries
  `aria-live="polite"` in the served DOM; genre/sort/load-more changes
  would announce the whole set. Source-derived risk stands; unmodified.
- **D5 NEW reproduced — REPAIRED (bounded)**: the active genre chip
  (`aria-current="true"`) declared `border-nf-accent-hi`+`text-nf-text`
  but computed border rgb(51,48,45) / color rgb(168,162,158) — the
  always-present `border-nf-border`/`text-nf-text-dim` utilities win in
  compiled CSS order → active state visually indistinguishable. Repair:
  ternary conditional classes in GenreChips.vue (active:
  border-nf-accent-hi + text-nf-text only; inactive: border-nf-border +
  text-nf-text-dim + hover:border-nf-border-strong confined to inactive
  so hover can't erase the accent). Restores intended design; no design
  decision needed.
- **Functional checks OBSERVED**: Escape clears query + marks (0 marks
  after); sort change re-renders (21 cards); reader progress write works
  (chapter 2 recorded, fresh updatedAt); "Anda berhenti di bab 2" marker
  renders (text-dim).
- **Viewport OBSERVED (rendered)**: 360 (mobile emulation) 1-col, no
  horizontal scroll (docW 360 = winW), chips wrap; 768 two-col (cardW
  302), no overflow; 1440 no overflow, reader measure 700px.
- **NOT ESTABLISHED — recorded honestly**: actual browser zoom (harness
  could not change zoom: Ctrl+= produced no zoom/dpr change) and
  `prefers-reduced-motion` emulation unavailable in this toolset; both
  remain open, not PASS, not deferred.
- Review receipt: exact diff (worktree `.nf-batch-worktrees/scopeA-a11y`,
  7 files +16/−16, NOT integrated into main) reviewed by
  Reviewer-A11yDiff — **APPROVE_WITH_FINDINGS**, 2 Minor informational
  (pre-existing `.nf-overline` faint-token site requires main.css edit —
  next batch; no test pins the chip classes — future hardening note).
  Tests OBSERVED: discovery/a11y/composables 123/123 (2026-10-14).
