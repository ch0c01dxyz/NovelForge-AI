# Author home and workspace navigation polish

Status: IMPLEMENTED AND VERIFIED; requested OpenDesign connector unavailable.
Owner: root executor; separate read-only exact-diff review.
Author requests homepage library grid/list, reference header language/account
dropdowns and admin CTA; consistent icon return links across admin/workspace
tools; tidy workspace Tools chevron; AI Studio, Simulation and Endgame return
navigation; Recovery controls aligned with the same foundation.

Baseline: clean main at 7a5cac3, preserving subsequent backup/custody commits,
all existing stashes, Windows Docker services and acceptance data. Read current
AGENTS/START-HERE/CURRENT, DESIGN-TOKENS and writer-workspace/index.html,
home/ActionMenu/pages/tests, auth session boundary and existing style tokens.
OpenDesign Cloud MCP explicitly requested; get_active_context and list_projects
both failed Transport closed. No remote design output or mutation is claimed.
Use the approved local reference and rendered checks while keeping that
capability limitation explicit. Designer skill: refine/preserve/rendered mode.

Implement compact stone/orange library cards with proportional covers and
consistent small list rows, real localized status and preserved grid/list
preference. Reuse ActionMenu, replacing the font caret with a real SVG and
allowing trigger content. Account dropdown shows real identity, Profile and
Logout. Profile is a read-only account dialog, not a broken public-author link
(public author pages correctly404when no publications exist). Add own-session
displayName/email through the existing authenticated session response only;
never expose another user's identity or credentials. No profile editing.

Create one shared icon BackLink and use explicit safe destinations. AI Studio
is workspace-scoped: a novelId query supplied by writer navigation can return
to that exact novel; without it, return to the author library. Validate the
query as UUID before building the return link. Simulation/Endgame/Recovery/
Moderation return to their own route's novel. Keep role checks, native actions,
data/error/loading/empty states and English/Indonesian localization intact.

Allowed: home/UI-author components/shared ActionMenu/BackLink, targeted tool
pages and writer Studio link, shared style tokens/classes, en/id resources,
minimal own-session profile fields+tests, docs/task and ignored visual receipts.
No dependencies, migrations, domain/gateway/backup changes, story mutations,
authentication weakening, publish/deploy or new commit/push authorization.
One writer; separate review required; no mutation from read-only reviewers.

Acceptance: home en/id at desktop/mobile, populated/empty/error states,
functional grid/list persistence, exact cover links, real account profile and
logout request/redirect, dropdown Escape/outside-click/focus; readable compact
cards with no page overflow. All named tool pages show the shared icon link;
Studio returns to supplied safe novel or home fallback. Focused regression
tests, web/API types, scoped lint/diff and real browser navigation checks.
Native auth test verifies own data only and no password/token fields. Reuse
actual local services; browser inspection permits GET only except disposable
auth fixture logout. No live story mutation or human screen-reader sign-off.
Rollback: source-only changes; no schema/data migration. Retain exact hashes,
test output, visual review and memory read-back before handoff.

## Completion evidence

Compact grid/list and the localized language/account dropdowns use the approved
stone/orange foundation. Own-account Profile is read-only; Logout remains the
native action. Shared back links cover Admin, Moderation, Simulation, Endgame,
Recovery and both Studio contexts. Recovery controls and SVG Tools caret match.

58 web tests, six native PostgreSQL auth tests, both typechecks, scoped lint and
git diff --check pass. Review actor review_character_development APPROVE:
23 app files, scope SHA256
d6627c8d592e9e243c343adcfad7a5d1e345ee3d4f6de35b0601d5f92d2576b8
(sorted path + NUL + raw bytes + NUL). No application edits after that review.
Scratch native browser verifies real logout, own profile and responsive focus/
menus. Live en1440/id390 inspection verifies both actual novels, covers, own
profile, opened shared-header dropdowns and seven clicked return journeys.
No page errors/API writes; live novel/chapter row hashes unchanged. Temporary
verification sessions removed. API alone reloaded after zero active-generation
check; Docker/worker/data retained. Receipt's final apiRestarted=false means the
successful rerun reused the API activated by the first browser attempt.

Evidence: ignored .nf-artifacts/home-polish-{web,auth,browser,live} logs/receipts;
home-live-grid-en.png and home-live-list-id.png visually inspected, plus Studio
and Recovery screenshots. Existing admin canvas notices did not fail tests.
OpenDesign two read calls failed Transport closed, so no MCP design result is
claimed. Existing Studio empty-list message limitation is retained in ISSUES.
No migration, story mutation, commit/push or human screen-reader sign-off.
