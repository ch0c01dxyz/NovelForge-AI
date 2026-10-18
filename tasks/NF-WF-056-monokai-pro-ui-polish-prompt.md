# NF-WF-056 — Global Monokai Pro UI/UX polish via OpenDesign

This is a standalone execution prompt for a fresh conversation after /clear.
Work in `C:\Users\ch0c0\Downloads\NovelForge-AI` using non-login PowerShell.
Reply in Indonesian; write project-owned content and durable records in English.

## Author request and scope

The author requests UI/UX polish and a Monokai Pro color scheme on ALL existing
pages, explicitly using the open-design MCP. Inputs, textareas, select boxes,
buttons AND toast/Toastr notifications are mandatory parts of this revision.
Deliver integrated working UI, not just mockups or a renamed color palette.
The global palette change and polish scope are authorized; this prompt is not
authorization to commit, push, deploy, reset data or change product behavior.

Use Monokai Pro Classic as the default interpretation; state that assumption.
Verify palette values against an official or already-installed theme source and
record provenance. Do not substitute original Monokai, Dracula, One Dark, or
invent purported official values. Preserve NovelForge identity and readable
writer/editor typography; this is a web app theme, not a code-editor imitation.
Do not add a theme picker, custom fonts, icon packs or dependencies unnecessarily.

## Recovery and baseline

Read AGENTS.md, START-HERE.md, docs/14-progress/CURRENT.md, the design-system
rule, docs/design/DESIGN-TOKENS.md and docs/design/writer-workspace/. Read the
actual web application, locales, shared controls, layouts, pages and tests.
Inspect relevant NF054/NF055 completion records and existing admin regressions.
The old orange/stone palette is historical design authority superseded by the
author's explicit global Monokai Pro request for this task. Record that scoped
decision in the design docs; do not ask to approve the same palette scope again.

Expected last known HEAD:f42af8aecdac4c5baf4abb82dde64fd86044332b, main.
Verify actual HEAD, branch, index, changed/untracked paths and stash yourself.
Preserve all existing work, ignored archives/worktrees and nf050b-acceptance-wip
stash. No git clean/reset, blanket staging, force push or worktree deletion.
Use only YOUR host-confirmed Engram binding; read
`C:\Users\ch0c0\.codex\docs\ENGRAM-RUNTIME-BINDING.md`.
Never invent/reuse another session identity, start/end or reopen old sessions.
Search compact relevant memory; verify recalled claims against current sources.
If binding fails, disclose it and preserve a concise file handoff.

Use the designer skill for system-level redesign and relevant UX references.
Write a short NF056 task contract and page/state acceptance matrix before edits.
Reuse actual components, existing Vue/Nuxt/Tailwind/localization patterns and
installed dependencies. One implementation writer per worktree. OpenDesign's
design-generation actor must not concurrently edit the application worktree.

## Mandatory OpenDesign execution

Discover the actual open-design MCP schemas; do not invent tool names/arguments.
Tools were exposed in the originating session, but availability is not proof
of a healthy project or a completed design run. If unavailable/auth-blocked,
record the exact blocker; never claim OpenDesign use or silently replace it
with hand-written mockups. Independent read-only inventory can continue.

Inspect active context/list_projects and verify the intended project explicitly.
Historical foundation reference: `novelforge-writer-workspace-5378`; its name
is only a lead, not proof of current identity. Preserve the existing foundation
and design history. Use a separate refinement project/artifact when needed.
Read relevant OpenDesign design-system resources and available skills/plugins.
Use collect_brief/confirm_brief according to the exposed workflow, prefill the
known scope below and avoid asking the author to repeat it. If new questions
are required by the tool, ask only genuinely missing information. Never expose
internal workflow IDs/nonces as instructions for the author to copy.

Commission a REAL generation/refinement with start_run; do not just inspect
tools or write files and claim a generated result. Discover an available
execution agent rather than guessing its ID; prefer available Local Codex to
avoid silently creating a cloud billing/login dependency. If OpenDesign Cloud
is actually selected, follow its login/billing requirements transparently.
Use one stable generated requestId per confirmed run and reuse after timeout;
never duplicate a running request. Poll get_run at30–60seconds, communicate
progress, and allow the documented5–30minute generation window. Do not cancel
or bypass generation because file timestamps are unchanged. Cancel only if
the author asks. Keep tool-created IDs separate from Engram session identity.

Brief the run to produce one cohesive Monokai Pro design system and refinements
for the real page families below, including a control/state and toast specimen.
Supply bounded UI structure and anonymized examples, never credentials, private
backups, raw logs, actual manuscripts, account details or tokens. Retrieve the
full design bundle once when source is needed, inspect the real preview, and
adapt the design into the existing application. Do not replace the app with a
standalone HTML demo, generated fake data, broken controls or a new framework.

## Complete page coverage

Enumerate actual routes, nested layouts and reachable panels from source.
Known baseline has15 Vue page files; discover additions instead of treating15
as a permanent limit. Cover all existing families:

- Sign-in and other existing authentication states.
- Author home, library list and the three-step new-webnovel wizard.
- Platform admin: Gateways, Models, Profiles, Routing and Audit, forms/dialogs.
- Workspace AI Studio, including existing definition/editor panels.
- Novel writer workspace/editor and existing chapter/story/settings panels.
- Simulation, recovery, moderation and endgame pages.
- Browse/discovery, author profile, novel detail and chapter reader.
- Reader library and notifications page.

Include headers/sidebar/navigation, tabs, tables/pagination, search/filter,
cards, dialogs, tooltips, alerts, toasts and actual loading/empty/error/forbidden
states. Token changes alone do not prove page/state coverage. Record a matrix
with route template, role, en/id, viewport, tested state, screenshot and result.

## Visual system and controls

Define shared semantic surface/text/border/accent/focus/status tokens first;
preserve compatible --color-nf-* names when practical. Map Monokai hues to
consistent actions and success/warning/error/info roles. Replace conflicting
hardcoded colors across the scoped UI, including portals/editor controls and
form pseudo-states; do not indiscriminately recolor story content. Document
derived shades honestly and verify contrast rather than assuming theme colors
are accessible. Preserve the literary reading experience and existing features.

Polish hierarchy, spacing, alignment, density, wrapping, table readability,
navigation affordances and responsive layouts. Do not remove useful actions
or change approval/publication/recovery flows to simplify the screen.

Mandatory control families, using shared existing patterns where possible:

- Inputs: text/search/password/numeric and other types actually used; visible
  labels, consistent height/padding/borders/placeholder, relevant icons, clear
  controls and validation feedback. Preserve password masking/autofill/security.
- Textareas: readable multiline spacing, sensible minimum size, responsive
  sizing/resizing and accessible error/help descriptions; preserve entered text.
- Select boxes: closed/open/native option states, readable selected value and
  placeholder, chevron/padding, focus and keyboard selection. Prefer native
  select unless the existing product already needs a custom accessible control;
  do not add a custom combobox library merely for styling native popup limits.
- Buttons: primary/secondary/quiet/destructive/icon variants; clear hierarchy,
  consistent sizes, visible labels or accessible names, focus/hover/active,
  disabled/loading states. Preserve submit semantics, duplicate-submit guards
  and pending-action behavior. Decorative icons do not replace readable labels.

For each family cover normal, hover, focus-visible, active, disabled, readonly
where applicable, invalid, loading and long-content states. Do not remove
focus outlines or signal validation only through color. Match control boundary
and focus contrast to the applicable accessibility requirements. Avoid clipping
at narrow widths, zoom, translated labels and validation-message expansion.

## Toast/Toastr notifications — explicit author requirement

Inventory all toast-like notification surfaces and reuse existing notification
code; "Toastr" here does NOT authorize installing the toastr package. Apply the
same Monokai Pro status hierarchy to success/error/warning/info where those
events already exist. Do not invent events just to demonstrate all variants.

Polish opaque surface, foreground, border/status accent, existing icon style,
message typography, wrapping, spacing, dismiss target, stack gaps, responsive
position/max-width, z-index and non-obstructing placement. Keep important
controls visible; long messages and multiple notifications must remain usable.
Preserve aria-live/appropriate status semantics, keyboard-accessible dismissal,
reduced-motion behavior, meaningful duration and any existing action affordance.
Evaluate pause/long-lived handling for actionable messages against actual UX;
keep critical inline errors visible instead of hiding all failures in a toast.
Clean up timers on unmount when modifying notification lifecycle.

NF055 regressions must stay fixed: model sync returns {discovered:number},
including0, and real toast count must match; success/failure feedback must not
use undefined color tokens or unreadable white-on-light fills. Never label
partial/failed gateway output success, or conflate expired-session401 with a
provider failure. Keep product error classifications and server authorization.

## Implementation and verification

Execute in coherent phases: OpenDesign output plus shared tokens/control
specimens; migrate shared components and ALL page families; rendered review,
targeted repairs and independent final exact-diff review. Do not stop after
the first home/admin demo or add routine permission gates per page. If a new
product/IA change outside visual scope becomes necessary, propose it separately.
Record genuine blockers before workarounds in ISSUES-AND-GAPS, the single register.

Update design tokens and the foundational design references consistently with
the approved palette; annotate superseded rules rather than erasing history.
If AGENTS/CLAUDE constitution changes are truly required, keep them equivalent;
prefer a scoped design amendment over unrelated instruction rewrites.
Keep all new UI copy in en/id resources with English fallback. Do not translate
canon/manuscripts or machine error codes. Preserve domain terminology.

Use existing local services and browser tooling. Windows working DB historically
nf-pg-5433:5433/novelforge_acceptance_050b and Redis6399/0; verify current config
privately. Root .env may be stale. Never print secrets, reset Docker/database,
flush Redis or change users/admin roles/gateway settings for a design task.
Do not assume the working database is still empty; author may now have live data.
For otherwise empty story routes use existing fixtures in an owned disposable
test environment, actual application/API and clearly labeled test data. Do not
populate the author's live database just to take screenshots. A design preview
is not real application acceptance. LLM calls are unnecessary for styling; if
a genuinely LLM-dependent check is needed, use the configured real gateway and
reported output, not fake provider acceptance.

Run focused functional/locale/component/axe regressions, web typecheck and
applicable lint; broaden only for changed shared surfaces or unresolved risk.
Verify actual browser rendering at desktop and narrow/mobile widths, keyboard
navigation, focus,200%zoom, long en/id labels, selected controls/options,
validation states, toast stacks and important dialogs. Measure real computed
contrast (normal text>=4.5:1, large text>=3:1; relevant UI boundaries/focus>=3:1).
jsdom axe cannot prove color contrast. Inspect actual screenshots; do not claim
a screenshot/route/state was inspected when it was not. Record native select
popup/platform limits honestly. Automated accessibility is not human NVDA or
VoiceOver acceptance; the author's deferred screen-reader decision remains.

Require an independent read-only review of the final exact diff. Record actual
test results, screenshot coverage, OpenDesign project/run/artifact provenance
in suitable private evidence, and concise safe summaries in CURRENT/task docs.
Keep sensitive artifacts, screenshots containing private content and raw logs
under the existing ignored local artifact root. Do not commit/push: the author
will review this design change before separately authorizing publication.
Save a compact checkpoint/summary with your own confirmed identity and verify
read-back; disclose failures and preserve a fallback. Hand off the real preview,
changed paths, evidence, known limits and next action.

## Anti-hallucination and stop condition

Distinguish observed, retained, inferred, proposed and unknown evidence. Never
invent tool availability, generated artifacts, test results, approvals, run
completion, screenshot review, model dispatch or production readiness. Do not
mark planned pages polished or treat a valid preview as implemented source.
The task is complete only when the real app uses the cohesive Monokai Pro
system across the route/state matrix, controls AND toast notifications are
polished and verified, functionality/locales/security remain intact, final
review findings are resolved, and remaining unverified limits are explicit.
