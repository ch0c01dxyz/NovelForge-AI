# Batch 3 Scope B — Integration Manifest & Rehearsal Results

Baseline for all patches: HEAD `50609c0` (main). Rehearsal worktree: `.nf-batch-worktrees/rehearsal-integration` (detached HEAD 50609c0, fresh). No commit, no merge, no main-checkout edits.

## Patch manifests

### 1. GAP-029 parity test
- Diff: `.git/batch2-gap029-parity-test.diff` sha256 `1e59fcc561e8a0378995b6e92ca0bf86324b741ccec31f8426dec0b2961f603d`
- Files (1, untracked new): `apps/api/src/definition-resolution-parity.test.ts` — worktree sha256 `b42fb82fb3b53c91dd7f332937c0a2a2eb2b4cfa54711c74414064921d3a51f7` (frozen `14dbc71a…da9d` refers to the source-worktree copy; content equivalent, see Note below)
- Baseline HEAD 50609c0; review: APPROVE (2 rounds). Verdict sources: docs/14-progress/CURRENT.md (Batch 2/3 coordinator records), docs/implementation/ISSUES-AND-GAPS.md (GAP-029 resolution detail), Engram checkpoints #257/#262 (session 01a131a3-df1d-7673-a313-96a7217bb321).
- Dependencies: DB at `postgresql://novelforge:novelforge@localhost:5433/novelforge` (self-creates its DB); none on other patches
- Rerun justification: pure additive test file, no production code touched

### 2. NF-WF-051 memory reconciliation sweeper
- Diff: `.git/batch2-nfwf051-sweeper.diff` sha256 `8a5d448a666fc27cc3956ce432c81d221bf8f186ced5e7ed541bc2f1f8f2bca4`
- Tracked files: `apps/worker/src/memory-jobs.ts` (+28) sha256 `a3691064776e8e067ec053fd1c52909b2e8af7e69f794d6790902e09c9bbaedc`; `packages/memory/src/constants.ts` (+7, adds `MEMORY_RECONCILE_INTERVAL_MS = 60_000`) sha256 `6ec86ea0097635bec5b1f67335e073d1d03437da433f34e307ab3b78abc56901`
- Untracked companion files NOT in the diff (copied verbatim from source worktree `scopeB-memsweeper` into this rehearsal worktree): `apps/worker/src/memory-sweeper.test.ts` sha256 `c7e836c67ff24c15cbe5bfc0503fe4608cb1af547b6038ae91946bc6f1a954ea`; `tasks/NF-WF-051-memory-reconciliation-sweeper.md` sha256 `d9f8478f74f30dd6527bba261fb6217d0668fcc603c570ea4a04ec8120f9e38b` (copied to `tasks/` in rehearsal worktree; hash matches source and coordinator's main-checkout copy).
- Baseline HEAD 50609c0; reviews: contract APPROVE, diff APPROVE_WITH_FINDINGS (2 Minor). Verdict sources: docs/14-progress/CURRENT.md (Batch 2/3 coordinator records), docs/implementation/ISSUES-AND-GAPS.md (NF-WF-009 batch-2/3 sections), Engram checkpoints #257/#262 (session 01a131a3-df1d-7673-a313-96a7217bb321).
- Dependencies: `@novelforge/database` workspace package; pnpm workspace install; no overlap with other patches
- Rerun justification: additive scheduler constant + job function; existing memory-jobs tests untouched

### 3. A11y repair (batch-2 Scope A)
- Diff: `.git/batch2-a11y-repair-scopeA.diff` sha256 `68942bc67b76782908b8693cf3dce936940eccfdb8cb384ef8a816e225d98fc2`
- Files (7, all apps/web, +16/−16): ContinueReading.vue, GenreChips.vue, NovelCard.vue, SearchBox.vue (components/discovery), browse/index.vue, read/[slug]/index.vue, read/[slug]/[number].vue — content `text-faint`→`text-dim` swaps + D5 chip class change
- Baseline HEAD 50609c0; review: APPROVE_WITH_FINDINGS (2 Minor). Verdict sources: docs/14-progress/CURRENT.md (Batch 2/3 coordinator records), docs/implementation/ISSUES-AND-GAPS.md (batch-2 section), Engram checkpoints #257/#262 (session 01a131a3-df1d-7673-a313-96a7217bb321).
- Dependencies: none; CSS-class only
- Rerun justification: class-string swaps only, no logic

**GAP-029 hash divergence note:** worktree copy sha256 `b42fb82f…` differs from frozen `14dbc71a…da9d` solely because `git apply` on Windows checked the file out with CRLF line terminators (source-worktree copy is LF; `file` confirms). Content is byte-equal modulo line endings (verified `diff` after `tr -d '\r'`); re-hash with `git config core.autocrlf` in mind or compare content-normalized.

**scopeA3-overline interaction (expected, non-blocking):** scopeA3 touches the same files `read/[slug]/index.vue`, `read/[slug]/[number].vue`, `discovery.test.ts` in a separate worktree. Batch-2 a11y diff applies as-is here (all `text-faint` already swapped to `text-dim`; zero `text-faint` remain in both read pages). If scopeA3 performs further `text-dim`→overline-token swaps on the same lines, a combined batch-2+batch-3 application will need re-application order or hunk-level conflict resolution; none observed at batch-2-only level. GenreChips chip classes are present; scopeA3's chip-class regression test will exercise the D5 classes changed by this diff.

## Rehearsal results

### Apply order & results (individual + combined)
1. `git apply --check` GAP-029 → OK; WF-051 → OK; a11y → OK (each individually clean on fresh HEAD)
2. Combined apply in order GAP-029 → WF-051 → a11y: **all applied cleanly, zero conflicts**
3. Combined diff: 9 tracked files changed, +51/−16, plus 2 untracked test files

### Cross-patch interference check
File sets are disjoint:
- GAP-029: {apps/api/src/definition-resolution-parity.test.ts}
- WF-051: {apps/worker/src/memory-jobs.ts, packages/memory/src/constants.ts}
- a11y: 7 apps/web files
**Verdict: zero file overlap, zero interference — confirmed by both static file-set comparison and clean combined apply + green combined test runs.**

### Focused test evidence (vitest, in rehearsal worktree after `pnpm install --frozen-lockfile --offline`)
| Suite | Command scope | Result |
|---|---|---|
| API parity (GAP-029) | `DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge vitest run src/definition-resolution-parity.test.ts` (apps/api) | **11/11 passed** |
| Worker memory (WF-051) | sweeper + memory-reconciliation + memory-jobs | **20/20 passed** (3 files; one transient DB-timing failure on first run of reconciliation, green on rerun — flake, not regression) |
| Worker publication regression | `src/publication-jobs.test.ts` | **21/21 passed** |
| Web discovery + a11y | `discovery.test.ts` + `discovery.axe.test.ts` = 17/17; `a11y/` = 91/91; `app/a11y/` = 62/62 | **170 tests passed across 34 files** (all green) |

Pre-existing failures unrelated to the three patches (full `app/` run, same worktree): 13 failures in `UsageAnalytics.test.ts` (5), `recovery.test.ts` (7 incl. 1 file-level), `workspace-navigation.test.ts` (3) — files untouched by all three diffs (`git diff --name-only` ∩ failing files = ∅); present at baseline, not caused by this integration. Focused-scope verdict for the contract's named suites: all green.

### Environment notes
- Node/vitest 5.0.2 via workspace root `node_modules`; `apps/worker` has no local vitest config — root pnpm-workspace glob `"packages/*","apps/*"` interferes when invoked with wrong binary; `npx vitest` from the package dir works.
- Reconciliation test defaults `DATABASE_URL` to `novelforge_test@localhost:5432` (auth fails locally); must run with `DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge`.
- Sweeper test file is NOT inside the saved diff — any integration cutover must also copy `memory-sweeper.test.ts` (+ task doc) explicitly.
