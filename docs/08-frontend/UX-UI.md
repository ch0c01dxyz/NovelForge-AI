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

Public Reader: published novel/author pages, browse/search/genres, chapter
navigation, reading progress and the retained social features. See
[Publishing and Reader](../07-workflows/PUBLISHING-AND-READER.md).

## Editor layout

Left: novel explorer/navigation\
Center: chapter/scene editor\
Right: AI assistant/context/warnings/actions\
Bottom/status: story revision, autosave, generation/job state.

## Required author journey

Resolve approved outline/context → generate draft → show versioned diff and
evidence findings → accept/reject text → decide Candidate Canon separately →
apply against expected manuscript/source versions → show consolidation status
→ continue to the next chapter. Use the same services as workflow execution.

Show actual loading, empty, failed, incomplete stream, awaiting approval,
cancelled, stale-source and rebuild-pending states. Resume/reject act on the
persisted run; they must not restart completed generation steps. Never apply
AI output automatically over unsaved or concurrently changed manuscript text.

Expose current character/relationship/world/thread/timeline/DNA context and
warning evidence progressively. An API or mock panel is not completed UI.
Complete scene navigation/authoring and rich editing (Tiptap or an explicitly
approved equivalent); the current textarea is an editor baseline only.
Inline rewrite/expand/shorten/tone/dialogue/continue actions require selection
and version-aware preview/apply, not direct DOM replacement.

## AI Studio and administration acceptance

Provide usable management for gateway health/catalog, capability-based Model
Profiles/routing, encrypted credential rotation with masked display,
agent/skill/reference/workflow versions, graph validation, activation,
generation/run history and approval continuation. Include usage/failure/
latency and continuity/style evaluation evidence; unknown usage is not zero.
Backend configuration endpoints do not count as finished admin screens.

Keep platform administration separate from workspace story access. A system
operator cannot inspect a tenant's private manuscript merely by being admin.

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
