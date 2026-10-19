# NovelForge Design Tokens — Writer Workspace

Source of truth: `docs/design/writer-workspace/index.html` (OpenDesign-refined mockup, 2026-09-24). OpenDesign project: `novelforge-writer-workspace-5378`.

> **ACTIVE — NF-WF-058 reference restoration (2026-10-18):** the author
> explicitly rejected the Monokai result and selected the original
> `writer-workspace/index.html` for the whole application. Its stone surfaces,
> reserved orange accent, compact controls, literary typography and subtle
> structural borders are authoritative again. NF-WF-056 below is historical.
> Runtime mapping: `apps/web/app/assets/css/main.css`. Preserve native control
> semantics, visible focus, loading/error/disabled states and en/id resources.
>
> Documented accessibility accommodations: faint small labels use `#a8a29e`
> instead of `#79716b`; interactive input boundaries use `#79716b`, while
> decorative panel hairlines retain `#33302d`. Error `#f87171` and info
> `#7dd3fc` extend the reference's green/amber semantics. Form fields use
> 8px corners, 36px minimum height, canvas-dark input wells and 13px UI text
> (16px on narrow screens). Dialogs, dropdowns and toasts use the card surface.
> Native select popups remain OS-rendered. Writer desktop geometry is
> 52px header / 264px navigation / flexible editor / 312px context / 30px footer.
> Additional workspace routes live in a keyboard-accessible dropdown; narrow
> screens expose chapter/context panels through explicit toggles.

> **HISTORICAL — NF-WF-056 amendment (superseded by NF-WF-058):** the
> author explicitly requested a global Monokai Pro UI/UX polish of all pages.
> The stone-family surfaces and the restricted orange accent below are
> **superseded historical authority** for the application UI; they remain
> recorded here for provenance and must not be re-applied. The active palette
> is Monokai Pro Classic (see "Monokai Pro Classic tokens" section). Layout,
> typography voices, spacing, state rules, and the literary reader experience
> are unchanged by this amendment. Interpretation and provenance:
> `tasks/NF-WF-056-monokai-pro-ui-polish-contract.md`.

## Monokai Pro Classic tokens (historical NF-WF-056)

Official Monokai Pro hues (bg `#2D2A2E`, deep `#221F22`/`#19181A`, fg
`#FCFCFA`, red `#FF6188`, orange `#FC9867`, yellow `#FFD866`, green
`#A9DC76`, blue `#78DCE8`, purple `#AB9DF2`), applied through the same
semantic `--color-nf-*` token names. Depth direction (canvas deepest →
raised lighter) is preserved from the original design; the editor/canvas
well uses the deepest official dark so manuscript prose keeps maximum calm.

Derived values below were **reconciled with the commissioned OpenDesign
system** (project `novelforge-monokai-polish-5c6e`, run
`ad5da719-1622-40cc-8f4e-83a4658b8b16`, deliverable `index.html`, whose 61
measured pairings all pass); the application keeps translucent `-dim`
tints and its existing compact control density (13px UI, 26–32px controls)
instead of the specimen's 44px controls, and `--color-nf-border-focus`
stays neutral (GAP-051 D2 role) rather than the specimen's accent boundary.

| Token | Value | Use / derived from |
|---|---|---|
| `--color-nf-bg-0` | `#19181A` | app canvas + editor well (official deep) |
| `--color-nf-bg-1` | `#221F22` | raised panels (official dark-2) |
| `--color-nf-bg-2` | `#2D2A2E` | cards, inputs (official background) |
| `--color-nf-bg-3` | `#39363A` | hover step (derived: lighten bg-2) |
| `--color-nf-border` | `#8E8B8E` | control boundaries + hairlines; ≥4:1 on bg-0..bg-2 (derived neutral) |
| `--color-nf-border-strong` | `#A9A7AA` | hover/strong boundaries (derived neutral) |
| `--color-nf-border-focus` | `#A9A7AA` | persistent discovery control boundary (GAP-051 D2 role) |
| `--color-nf-text` | `#FCFCFA` | primary text (official fg; 13.8:1 on bg-0) |
| `--color-nf-text-dim` | `#BDBBBE` | secondary; ≥4.5:1 on bg-0..bg-3 (derived neutral) |
| `--color-nf-text-faint` | `#A3A1A3` | metadata/labels/placeholders; ≥4.5:1 on bg-0..bg-3 (derived neutral) |
| `--color-nf-accent` | `#AB9DF2` | purple: active nav, primary CTA, AI affordances (official) |
| `--color-nf-accent-hi` | `#BAB0F5` | text-safe purple, focus outlines (derived lighten accent) |
| `--color-nf-accent-ink` | `#19181A` | text on accent/destructive fills (official deep) |
| `--color-nf-accent-dim` | `rgba(171,157,242,0.12)` | accent tint fills |
| `--color-nf-accent-border` | `rgba(171,157,242,0.38)` | accent-tinted borders |
| `--color-nf-ok` | `#A9DC76` | success (official green) |
| `--color-nf-ok-dim` | `rgba(169,220,118,0.10)` | success tint |
| `--color-nf-warn` | `#FFD866` | warning (official yellow) |
| `--color-nf-warn-dim` | `rgba(255,216,102,0.08)` | warning callout bg |
| `--color-nf-error` | `#FF6188` | error/destructive (official red; 6.2:1 on bg-0) |
| `--color-nf-error-dim` | `rgba(255,97,136,0.10)` | error tint |
| `--color-nf-info` | `#78DCE8` | info/links (official blue) |
| `--color-nf-info-dim` | `rgba(120,220,232,0.10)` | info tint |

Official orange `#FC9867` is **reference palette only — no semantic role**
(per the generated system); it is deliberately absent from the tokens.
Pairing policy: error text sits on bg-0..bg-2 only (on bg-3 it drops below
4.5:1); `--color-nf-text-faint`/`-dim` verified bg-0..bg-3; filled accent
and destructive fills always use `--color-nf-accent-ink` text.

Contrast floors (verified against computed values in-browser during
NF-WF-056): normal text ≥ 4.5:1, large text ≥ 3:1, control boundaries and
focus ≥ 3:1 on the surface where the element sits.

## Core identity (restored by NF-WF-058)

Dark background, orange accent. Stone-family surface ladder for depth; orange reserved for active state, primary CTA, and every AI affordance. Two type voices: UI chrome (sans) vs manuscript prose (literary serif).

## Surfaces (stone family, deepest → highest) — active NF-WF-058

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0c0a09` | app canvas + editor well |
| `--bg-1` | `#161412` | raised panels (header/nav/aside/footer) |
| `--bg-2` | `#201d1b` | cards |
| `--bg-3` | `#2a2725` | card/inset hover |
| `--border` | `#33302d` | hairline dividers |
| `--border-strong` | `#48443f` | control borders |

Author-approved amendment (2026-10-14, GAP-051 D2): use the additive runtime
token `--color-nf-border-focus: #6f6a63` for discovery SearchBox, inactive genre
chips, sort select and load-more boundaries, including hover. Despite its
historical proposal name, this is the persistent control boundary, not the
keyboard focus indicator; the accent-hi focus outline stays unchanged.
It replaces the insufficient border/strong colors only at these call sites.
Decorative borders and unrelated controls retain existing tokens. Verify
contrast on bg-0, bg-1 and bg-2; do not extend to other surfaces by assumption.

## Ink

| Token | Value | Use |
|---|---|---|
| `--text` | `#f0eeec` | primary text |
| `--text-dim` | `#a8a29e` | secondary |
| `--text-faint` | `#79716b` | metadata/labels |

## Accent — orange (restricted, restored by NF-WF-058)

Orange marks exactly three things: active nav state, the primary CTA, and AI affordances (each carrying the sparkle glyph). Nothing else is orange.

| Token | Value |
|---|---|
| `--accent` | `#f97316` |
| `--accent-hi` | `#fb923c` (text-safe on dark) |
| `--accent-dim` | `rgba(249,115,22,0.11)` |
| `--accent-border` | `rgba(249,115,22,0.38)` |

Accent-on-dark text always uses `--accent-hi` (AA contrast); `--accent` fills pair with ink text `#1c1207`.

## Semantics

| Token | Value | Use |
|---|---|---|
| `--ok` | `#4ade80` | continuity pass, canon in sync |
| `--warn` | `#fbbf24` (amber) | continuity warnings |
| `--warn-dim` | `rgba(251,191,36,0.09)` | warning callout bg |

## Depth

Soft layered shadows, no gradients on surfaces (the single allowed gradient is the chapter-overline fade line).

- `--shadow-sm: 0 1px 2px rgba(0,0,0,.35)`
- `--shadow-md: 0 1px 2px rgba(0,0,0,.3), 0 10px 28px -8px rgba(0,0,0,.45)`

## Type

| Voice | Stack | Use |
|---|---|---|
| UI | `"Segoe UI", -apple-system, system-ui, ...` | chrome, nav, panels, buttons |
| Literary | `Georgia, "Iowan Old Style", "Palatino Linotype", ...` | manuscript prose, chapter titles, logo mark, character monograms |

Key sizes: prose 17.5px/1.85 (drop cap on opening paragraph), chapter title 30px, UI base 14px, panel/nav 12–13px, overline/section labels 10.5px uppercase tracked. Tabular numerals for all counts/word counts/latency.

## Layout (writer workspace, CLAUDE.md §17)

```
┌────────────────────────────────────────────┐
│ Header 52px · logo / arc breadcrumb / CTA  │
├──────────┬───────────────────┬─────────────┤
│ Nav      │ Editor            │ Context     │
│ 264px    │ (bg-0 well,       │ 312px       │
│ chapters │ 700px prose       │ scene ctx / │
│ scenes   │ column, sticky    │ continuity /│
│ story    │ AI chips)         │ last gen    │
├──────────┴───────────────────┴─────────────┤
│ Footer 30px · version / words / canon      │
└────────────────────────────────────────────┘
```

Grid: `grid-template-columns: 264px 1fr 312px`; rows `52px 1fr 30px`.

## State rules

- Every interactive element: hover + `:focus-visible` (2px `--accent-hi` outline, 2px offset).
- Hover never drops contrast below AA.
- Selection in prose: `--accent-dim` bg + 2px inset left accent bar.
- Continuity warn: amber-tinted callout card; ok: bare check rows.
- AI elements carry the sparkle SVG glyph — recognizable without hover.

## Tailwind mapping (Phase 2 `apps/web`)

Adopt as a Tailwind v4 `@theme` block in `apps/web/app/assets/css/main.css`; keep custom token names (`nf-bg-0` …) rather than overriding stone/orange defaults globally, so semantic intent survives.
