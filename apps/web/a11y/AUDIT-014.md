# Manual accessibility audit — NF-WF-014 discovery + reading progress

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
