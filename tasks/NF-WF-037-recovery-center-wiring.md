# NF-WF-037 — Reachable Recovery Center

Status: IMPLEMENTED / REVIEWED. Baseline: 3086e7c.
Owner: current Codex implementer. Reviewer: separate review_mutations_034 actor.

Goal: close GAP-083 by mounting the four existing recovery components on a
novel-scoped recovery page reachable from the workspace header. Preserve the
foundational writer-workspace tokens and existing recovery safety contracts.
Reading: constitution, GAP-083, NF-WF-020 contracts, recovery components and
revision routes, design tokens/mockup, existing novel pages and UI tests.
Dependency: reviewed recovery/branch backend plus NF-WF-035 lock repairs.
Allowed: new recovery page and page test; workspace header link; recovery
components' integration events and preview safety; bounded workspace navigation
guard; en/id keys; this contract and evidence docs.
Integration prerequisite: repair WorkspaceDrawer's missing closing script tag
(GAP-112), then verify the real workspace import and production build.
Forbidden: schema/backend/auth redesign, new dependencies, removing confirmations,
automatic restore/merge, direct UUID entry as the only checkpoint selection UI.
Inputs/outputs: route workspaceId/novelId; server branch/checkpoint listings;
explicit checkpoint and source/target branch selectors; existing preview/apply APIs.
Invariants: server authorization remains authoritative; only mount merge with
distinct selected source/target, target checked out; remount preview when selection
or server state changes; refresh lists after create/switch/restore/merge; no silently
discarded editor buffer (block navigation unless saved, including saving/conflict).
Acceptance: reachable header link; rendered page with all four real components;
server-backed selectors; loading/empty/error/retry; successful mutation refresh;
en/id and fallback checks; axe zero for page states; affected typecheck/lint.
Commands: pnpm --filter @novelforge/web exec vitest run recovery page/component
tests; pnpm --filter @novelforge/web typecheck; pnpm lint; diff check.
Prerequisites: installed workspace dependencies; mocked APIs for component tests;
no production mutations. Browser integration is separate from backend test proof.
Migration: none. Rollback: revert UI wiring; backend and historical data unchanged.
Handoff: task/CURRENT receipts and exact-diff independent review. Engram attribution
unavailable; preserve fallback here. GAP-051 human screen-reader gate remains open.

Contract review amendments (GAP-111): no existing navigation guard; add a minimal
block-unless-saved guard. Merge apply carries mode and preview target head; clear
and sequence preview loads. Restore selection changes clear preview/ack and reject
obsolete responses. Add create/switch/restore refresh events, checked-out checkpoint
filtering, and manual checkpoint creation with the existing API. These repairs are
part of wiring, not acceptance of the broader release or human accessibility gate.

Amended contract APPROVE by review_mutations_034, 2026-10-07.

Final review amendment: the same buffer guard also applies before chapter
selection clears editor state. Failed/in-flight saves refuse switching; a
submitted-content snapshot prevents an old save marking newer edits saved.

Verification (Windows, 2026-10-07): focused web27/27 across5 files, including
the real workspace setup/guard, four real recovery components, server-backed
selectors, pinned checkpoint/merge requests, stale mode/scope negatives,
refresh, en/id and missing-key fallback. Page axe checks report zero violations
for selected surfaces in both locales (jsdom; not manual screen-reader evidence).
Web typecheck/lint exit0 and production build exit0 (duplicate auto-import warnings
retained; no build errors). Separate review_mutations_034 APPROVE after buffer
and checkpoint pin findings resolved. GAP-051/live browser acceptance remain open.
