# NF-WF-058 — Reference design restoration

Status: IMPLEMENTED AND VERIFIED within the documented coverage. Owner:
current Codex executor. Independent reviewer: ci_lint_review (read-only).

## Author direction and scope

The author explicitly requests a complete application UI overhaul to match
`docs/design/writer-workspace/index.html`, using OpenDesign MCP. This selects
the existing stone/orange reference over the previous NF-WF-056 Monokai
amendment. Preserve the reference artifact and historical evidence.

Baseline: `53467f21bed2661f8b58837ee3f452ee4e28eaf1`. Existing uncommitted
novel discovery/audience API, Prisma, editor, locale and progress changes are
pre-existing work and must be preserved. One writer in this checkout.

Required reading: AGENTS.md, START-HERE.md, CURRENT.md, DESIGN-TOKENS.md,
the reference HTML, affected components and existing browser evidence tooling.

Allowed: application web UI, design documentation, this task and progress/gap
records; private verification tooling. Forbidden: database reset, account
changes, gateway/model changes, backend contract changes, generated story data
or invented approvals. No dependency additions are needed.

## Implementation and acceptance plan

1. Recover OpenDesign context; compare the reference and application in a browser.
2. Restore reference surfaces, typography, spacing, shadows and reserved orange
   affordances. Apply shared input/select/radio/checkbox/textarea/button/table,
   dropdown, dialog and toast states across all page families.
3. Reconcile author home, writer shell, administration and reader surfaces with
   the same visual language. Preserve actions, permissions, real data and en/id.
4. Verify focus/keyboard/disabled/error/loading states, reduced motion, desktop
   and narrow layouts, source typecheck, relevant regressions and rendered UI.
   Use a disposable database for visual fixtures; do not mutate the live library.
5. Obtain independent review of the exact diff, update evidence, and save/read
   back an attributed Engram checkpoint. Publication is separate from UI proof.

Success means implemented shared styles and page coverage with inspected rendered
evidence, not just palette replacement or screenshot existence. Exact source
colors/layout are the target; any contrast accommodation must be explicit.
Native OS popups and human screen-reader acceptance must not be invented.

No migration required by this task. Rollback only task-owned UI/documentation
hunks, preserving pre-existing discovery changes and all local data.

## Implementation and observed evidence — 2026-10-19

- Shared stone/orange system now covers every page through main.css, including
  input/select/radio/checkbox/textarea/button/table/dialog/dropdown/toast states.
  Input wells, card overlays and 36px fields follow the recovered companion.
  Small faint labels are lifted for contrast; decorative borders stay subtle.
- Author library cards and empty state, shared header for supporting/reader
  pages, consistent administrative headings, compact writer action dropdown,
  264px/312px desktop rails and mobile chapter/generation access implemented.
  Real editor prose uses the reference paragraph rhythm and opening initial.
- Independent review APPROVE after repairing same-page dropdown focus,
  responsive visibility, closed-drawer Escape capture, and mobile panel bounds.
  Final main.css SHA256:
  `70eea527eb7dc6bb8de2be44a895d9948e3c2c52a6a5b23d4a18b8fe36b2a87c`.
- Full web run:99files/638tests passed; subsequent100-file run had638passes
  and one new-test harness failure (missing locale setup). After repairing
  that setup, both affected files /4tests PASS. No unresolved test failures.
  Web typecheck and scoped TS lint exit0. Vue files are covered by vue-tsc,
  component tests and the production build, not by the TS/JS-only ESLint config.
  Final production build after the last CSS fix exit0; existing dependency
  export-deprecation/plugin-timing warnings remain non-fatal. No new packages.
- Real Chromium + isolated actual API on3002 /novelforge_test_nf058:
  15desktop route families, all5admin tabs, actual gateway health toast,
  native manager/wizard keyboard containment, dropdown Escape/focus, EN/ID390px
  chapter/context panels and reduced motion passed. A further15-route390px
  sweep fit the viewport. Dropdown320/390 initially clipped left; final
 320/390/768px geometry recheck passed after the scoped positioning fix.
- Inspected actual screenshots: reference, author library, workspace manager,
  populated writer, public reader, admin table/form/toast, mobile editor/menu.
  Actual input color/background contrast17.07:1; 8px radius and36px minimum
  height observed. This is not a full accessibility audit or pixel-diff claim.
- Latest live counts stayed2users/4sessions/2workspaces/1novel/0chapters.
  The author's new live novel was preserved. Fixture prose/publication exist
  only in the disposable database and do not represent author approval.

## OpenDesign provenance and limits

Host-registered tool calls returned Transport closed. Reconnected through the
installed daemon's actual MCP stdio interface to the verified running local
daemon; no host config or credentials changed. Retrieved original full bundle
and commissioned refinement in `novelforge-writer-workspace-5378`.

Run `7fd95c1e-2d0e-4ebf-bd29-f037156b8f69` ended **failed** at the provider
usage limit. It produced actual `reference-system.html`,
`implementation-notes.md` and a preview before failure; all were recovered
via MCP and used as supporting evidence. No successful run is claimed.
Original reference remained unchanged, SHA256:
`bcb714c122333d473d74045a87b424e0e90648233ee49f626886b7168061672b`.

Private receipts/screenshots: `.nf-artifacts/nf058/`. Existing functionality,
permissions and story data remain authoritative; sample characters or metrics
from the HTML were not inserted into the application. Actual controls and
content differ where the working application has different capabilities.
Native OS select popup appearance and human screen-reader acceptance are not
claimed. Commit/push/deployment were not performed by this redesign task.

## Authorized combined publication amendment — 2026-10-19

The author subsequently authorized commit/push including their other local
changes. This expands publication scope to the pre-existing discovery/audience
API, nullable Prisma enum/column migration, author editor, public rating badge,
genre tooltips and additional localization resources. No live migration/reset,
account administration, deployment or gateway configuration changes are needed.

Independent discovery reviewer `review_model_fallback` requested and approved
repairs: lock metadata editing during pending saves, await both PATCH settlements
before allowing retry, acknowledge possible partial writes, and show ratings
without requiring a genre. Two deferred component regressions plus an
audience-only card regression pass (affected2files/16tests). API3files/46tests
PASS, applying migrations only to scratch databases. Actual browser used the
current isolated API to save/read-back metadata and show the audience-only
badge on Browse; no JS errors or changed live counts. API/ai-services/web types
and lint pass. Prior design review/evidence is retained; unchanged successful
checks were reused until the discovery repairs required focused revalidation.

Rollback: revert the application changes while retaining the additive nullable
Audience column/type and any recorded ratings. No destructive rollback SQL.
The original design and all private evidence/stashes remain preserved.

The original private designer report remains bound to the pre-publication
design revision; the discovery fixes are covered by the amendment's newer
tests, browser proof and independent review. A publication-phase Engram save
was blocked by a hook timeout; no save was claimed. This task and CURRENT are
the fallback until normal attributed summary/read-back succeeds.

Final combined checks:100webfiles/642tests PASS,46APItests PASS, final production
build PASS. Both independent reviews APPROVE; typechecks/lint pass as above.
Normal Engram retry checkpoint416 succeeded and read-back confirmed it.
The author-authorized30-file combined change is ready for commit/push;
final Git state and the attributed summary record the published revision.
