# UX/UI Architecture --- Nuxt + Tailwind CSS

## Principles

-   Desktop-first authoring workspace, responsive enough for review on
    smaller screens.
-   Progressive disclosure: do not show every intelligence subsystem at
    once.
-   Evidence is one click away from warnings.
-   AI suggestions are visually distinct from approved canon.
-   Destructive-looking actions use preview/recovery affordances even
    when backend restore is non-destructive.
-   Accessibility: keyboard navigation, focus states, semantic HTML,
    contrast, reduced-motion support.

## Main information architecture

Dashboard

Novel Workspace: - Overview - Chapters - Outline - Story Brain -
Characters - Relationships - World - Timeline - Threads -
Research/References - Story Health - Endgame - Recovery

AI Studio: - Agents - Skills - Workflows - Model Profiles - OmniRoute
Gateways - Generations

Publishing Admin

## Editor layout

Left: novel explorer/navigation\
Center: chapter/scene editor\
Right: AI assistant/context/warnings/actions\
Bottom/status: story revision, autosave, generation/job state.

## Story Brain

Natural-language exploration backed by evidence: - who knows a secret; -
why two characters distrust each other; - unresolved setup/payoff; -
possible plot holes; - impact of deleting/changing an event; - neglected
characters/relationships; - causal explanation.

## Recovery Center

Timeline of revisions/checkpoints/AI bulk operations; branch tree;
compare; semantic diff; restore preview; conflict resolution; archived
divergent chapters.

## Tailwind

Create design tokens and reusable components. Do not scatter arbitrary
one-off styling across pages. Maintain component primitives for buttons,
forms, cards, panels, badges, dialogs, tables, tree views, diff views,
editor chrome, warning/evidence callouts, and status states.
