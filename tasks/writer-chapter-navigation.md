# Writer chapter navigation

Status: IMPLEMENTED / SEPARATELY REVIEWED / VERIFIED. Task ID: writer-chapter-navigation. Owner: current Codex
executor; exact diff receives a separate read-only review. Author requests a
vertical chapter-list scrollbar and oldest/newest ordering for easier access.

Read the writer page, navigation regression, shared responsive CSS, en/id
resources and foundational design tokens. Reuse the existing sidebar, native
select, local chapter summaries and design controls. Default numeric ascending
chapter order; descending is the author's newest-first choice, not a claim about
timestamps absent from the summary contract. A computed copy must not reorder
the source array, switch the active chapter, save text or invoke generation.

Allowed paths: writer index.vue/navigation test, en/id resources, focused shared
layout CSS only if required, task/CURRENT/ISSUES and ignored browser receipts.
Forbidden: manuscript/database mutations, backend contract changes, unrelated
data-enrichment edits, dependencies, commit/push or publication. Preserve earlier
uncommitted progress documentation and existing stash. No migration or story
checkpoint is needed for this reversible presentation change.

Acceptance: constrained independent keyboard-scrollable chapter region; story
tools accessible without traversing270chapter rows; numeric1/2/10 ordering both
ways, unchanged active/dirty buffers and empty state; actual270chapter browser
proof in en/id at1440px and390px with no document overflow or write requests.
Run focused Vitest, web typecheck, scoped lint and diff checks. Verify missing-key
fallback via existing locale tests. Rollback reverts this presentation diff;
database content and current author work remain untouched.

Verification: the added numeric-sort/dirty-buffer test failed before the
implementation, then focused navigation/locale22tests passed. Web typecheck,
scoped TypeScript lint and diff-check passed. Independent reviewer approved the
exact final page SHA256
`57b5ec930c2d108cc2cbd7d4461b5efadd341f351565d9fdbd38c8e530419d60`.
Live authenticated browser verified270chapters in en1440/id1440/id390: chapter
list heights400/400/200px versus8505px content, both numeric orders, unchanged
active selection, keyboard End scrolling, localized options and no vertical or
horizontal document overflow. There were zero page errors and API write requests.
The small-screen implicit grid-column defect was fixed with a constrained
minmax(0,1fr) column, not overflow clipping. Raw source/screenshots and receipt
remain ignored under `.nf-artifacts/chapter-navigation/`. No commit/push.

Memory handoff: checkpoint429 save succeeded, but the third relation-review
write was blocked by the PreToolUse hook with engram.exe ETIMEDOUT. Until normal
retry/read-back succeeds, this task/CURRENT and private browser receipt remain
the fallback; do not claim that relation or final summary was saved.

Resolution: normal relation retry succeeded; checkpoint429 and final session
summary430 were both read back successfully. No host identity/hook changes.
