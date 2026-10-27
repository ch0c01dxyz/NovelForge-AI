# ADR-0023: Source-pinned ZIP novel decoding

Status: accepted for implementation under the author's 2026-10-27 instruction.

Existing chapter import deliberately does not trigger semantic extraction.
Introduce an explicit workspace-scoped ZIP preview/import/decode flow, keeping
the established import semantics. Import creates a new private novel; immutable
chapter versions and original file/number mappings define analysis sources.

PostgreSQL operational job/chunk/candidate records retain progress, model usage
attribution and decisions across process restarts and STORY restores. A bounded
worker processes one chunk at a time with an expiring fenced lease. Unknown
dispatch outcomes require an explicit retry; successful chunks are not repeated.
No model call or human wait holds a database transaction. Existing gateway/model
profiles remain the sole routing boundary and external quota authority.

Candidates retain exact source quotations and chapter positions. Quotations
are anchored through server-generated excerpt IDs in the model response. Each
request labels bounded immutable source excerpts; the server resolves selected
IDs into exact quotations and rejects unknown IDs. This avoids asking models
to recopy dialogue into JSON and makes retained evidence deterministic. Legacy
explicit quotations remain subject to exact-substring/version checks.
The server anchors ID-based observations to the latest selected source chapter,
so a model cannot attach later evidence to an earlier story position. This is
source provenance, not inferred story chronology or approval of the observation.
Each observation is independently validated. A valid batch containing rejected
rows retains only validated observations and explicit exclusion counts; rejected
rows remain in private model receipts and can never be applied. An invalid
envelope or a batch with no valid supplied observations fails the section.
Partial semantic coverage is always explicit, even after all sections complete.
Exact identities
may be grouped; ambiguous aliases are never silently merged. Source-bound
reconstructions, observations and unknowns remain distinct from approved canon,
forward outlines, verified research and simulation results. Selected areas are
reported individually; processing all chunks never claims exhaustive semantics.

Author approval uses scoped authorization, source/branch/head/version CAS,
recoverable checkpoints and existing native domain services. Native mutation
and candidate decision receipt commit atomically, so interrupted clients cannot
apply the same decision twice. Canon proposals, publication and release approval
remain separate authorities. No extracted research term implies scientific
verification; no narrator knowledge automatically becomes character knowledge.

Source imports and decode receipts are private. ZIP processing validates original
paths and expansion limits without extracting to disk or fetching source URLs.
Recovery retains operational history; changed/rewound sources invalidate applying
old candidates. Full database backup remains necessary for references/settings
outside STORY restore scope. No existing author novel is overwritten.
