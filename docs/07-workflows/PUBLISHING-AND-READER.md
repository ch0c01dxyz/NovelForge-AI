# Publishing, Reader and Format Workflows

Owner: Phase 13, M4/M5; operations gate M8. This gives retained original
reader/publishing requirements explicit delivery ownership. Target behavior
below is not a claim that public routes are implemented.

## Publication lifecycle

Support DRAFT → IN_REVIEW → SCHEDULED → PUBLISHED, plus UNPUBLISHED and
ARCHIVED. Authorized direct publication may skip scheduling after the same
release checks. Specify exact enum/API migration against the existing schema
before implementation; do not invent existing routes.

- Review/schedule pin manuscript version and review results. Later edits
  require renewed checks; draft saves cannot alter public text.
- Release checks include capability, blocking continuity/canon conflicts,
  metadata and required approval. Soft narrative advice is not a veto.
- Resolve canon/text conflict by draft revision, canon correction, or an
  explicit authorized release policy decision; never silently promote prose.
- Scheduling uses durable jobs, specified timezone/UTC instant, cancellation,
  expected version and repeat-safe execution.
- Publishing atomically advances an explicit published-version pointer and
  records actor, version, time and outcome.
- Unpublish/archive revokes public serving without deleting manuscript/canon
  history. Invalidate public caches/search/download access as applicable.
- Story restore does not alter public pointers; compatibility findings require
  a separate authorized release action.

## Reader access and discovery

Provide public novel/author pages, chapter navigation, responsive typography,
keyboard accessibility, browse/search and genres. Non-member reader access
must work; workspace membership is not the public access model.

Server queries resolve the release, access boundary and pinned version.
Never serve current drafts because their Chapter row says PUBLISHED. Pages,
search snippets, caches, downloads and AI obey the same publication policy.
Hidden fact identifiers/counts/citations must not become spoiler oracles.

Specify anonymous versus authenticated policy per surface. Persist reading
progress for signed-in readers; treat supplied chapter positions as untrusted,
bounded by accessible publications and the spoiler policy. AUTHOR mode
requires author capabilities, not a reader-controlled request field.

## Reader interaction

Retain bookmarks, follows, likes, comments, notifications and reading progress
as M5 scope. A reader preview may temporarily omit social functions; full
completion cannot silently drop them.

Require ownership checks, rate/spam controls, comment reporting/moderation,
notification preferences/deduplication and privacy-aware progress storage.
Provide real loading/empty/error states and pagination, not simulated activity.

## Formats and ingestion

| Direction | Retained formats | Acceptance |
|---|---|---|
| Import | TXT, Markdown, PDF, DOCX | Per-format fixtures, type/size validation, extraction errors, provenance and normalization preview |
| Export | TXT, Markdown, PDF, DOCX, EPUB | Pinned versions, ordered chapters, encoding/format validity and authorized content |

Import creates source material, not approved canon. The author chooses
manuscript/reference/proposal destinations after normalization. Bulk apply
requires impact/checkpoint safeguards. Keep original source versions distinct
from derived chunks and extracted facts. Reject unsupported/corrupt/protected
inputs explicitly; empty extraction is not successful import.

Exports identify draft/published scope, actor and source versions. Reader
exports include accessible published content only. Large jobs run durably
with status/cancellation. Do not put credentials in download URLs or logs.
Inspect installed libraries first; add dependencies only for a concrete
format requirement with reviewed security/licensing implications.

## Acceptance gate

Publish V1, edit draft V2, prove a non-member still reads V1; schedule V2,
change the source, prove stale release is refused; unpublish and verify public
pages/search/caches/downloads cannot leak content. Exercise tenant boundaries,
reader spoilers, restart/duplicate jobs, keyboard navigation and each claimed
format. Record test evidence and use the single
[issues register](../implementation/ISSUES-AND-GAPS.md) for live gaps.
