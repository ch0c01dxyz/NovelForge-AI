# Public site header polish

Status: IMPLEMENTED AND VERIFIED LOCALLY, author requested2026-10-23. Owner root; one writer.
Required reading: AGENTS/START-HERE/CURRENT, design tokens, SiteHeader, app.vue,
LanguageMenu/ActionMenu, author account/profile flow and session API contract.

Goal: a tidy shared top bar for browse/public detail and other routes already
using SiteHeader. Keep writer/author/Studio-owned headers unchanged. Desktop logo,
primary navigation and account/language actions align on one row. Mobile uses
an explicit accessible navigation toggle and bounded dropdowns; no overflow.
Keep house tokens, EN/ID labels and route-aware navigation. Show login for guests
and existing profile/logout actions for a confirmed session; Super Admin entry
is only an affordance, never authorization. Handle loading/failure/retry/logout
and unmount safely. Reuse native ActionMenu and AccountProfileDialog.

Allowed: shared header, its focused tests and narrowly needed locale/progress
records. No backend/auth changes, schema/data mutation, dependencies, commit/push.
Checks: guest/member session shapes, menu focus/Escape/route closure, logout errors,
EN/ID fallback, mobile/desktop bounds and real API/browser checks. Use temporary
test sessions only for live account reads and remove them after proof. Preserve
all existing dirty work, stashes and Windows Docker data. Run focused web tests,
affected types, independent exact-source review and save verified Engram handoff.
Rollback is restoring this component/locales; no persisted data migration.

## Completion evidence

Shared SiteHeader now provides a sticky, aligned desktop row, explicit mobile
navigation, selected browse state, language control and session-aware profile/
logout/admin actions. Existing writer/author/Studio headers remain outside scope.
Session failure offers retry; malformed or failed session reads never imply login.

10 focused SiteHeader/ActionMenu tests, web typecheck and scoped TS/locale ESLint
PASS. git diff --check PASS. Actual API/browser proof covers eight guest/admin/
author EN/ID combinations at1920/1440/390/320px: single-row header, bounded opened
dropdowns, Escape/focus, profile return, sticky position and temporary author
logout; no page errors. Private receipt: .nf-artifacts/site-header-browser-receipt.json
and site-header-*.png. Both task-owned proof sessions removed and zero remaining
verified; existing sessions and story data preserved. No restart or migration.

Independent public_presentation_review APPROVE after fixing its P2 mobile language
dropdown overflow (inherited240px width replaced with explicit180px). Final source
SHA25648e1500fe2a5405c0bd9a67f35d3e29c6b773146bcd801bd227b4b972ee474df
for SiteHeader.vue; test fd8ecbbda486b41ce6bc37a9521c336e8ca80f15604d207786efb1a41adba7ba.
Author visual acceptance and human screen-reader acceptance remain separate;
whole-suite execution unclaimed. No commit or push.
