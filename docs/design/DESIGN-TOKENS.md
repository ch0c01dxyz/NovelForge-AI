# NovelForge Design Tokens — Writer Workspace

Source of truth: `docs/design/writer-workspace/index.html` (OpenDesign-refined mockup, 2026-09-24). OpenDesign project: `novelforge-writer-workspace-5378`.

## Core identity

Dark background, orange accent. Stone-family surface ladder for depth; orange reserved for active state, primary CTA, and every AI affordance. Two type voices: UI chrome (sans) vs manuscript prose (literary serif).

## Surfaces (stone family, deepest → highest)

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0c0a09` | app canvas + editor well |
| `--bg-1` | `#161412` | raised panels (header/nav/aside/footer) |
| `--bg-2` | `#201d1b` | cards |
| `--bg-3` | `#2a2725` | card/inset hover |
| `--border` | `#33302d` | hairline dividers |
| `--border-strong` | `#48443f` | control borders |

## Ink

| Token | Value | Use |
|---|---|---|
| `--text` | `#f0eeec` | primary text |
| `--text-dim` | `#a8a29e` | secondary |
| `--text-faint` | `#79716b` | metadata/labels |

## Accent — orange (RESTRICTED)

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
