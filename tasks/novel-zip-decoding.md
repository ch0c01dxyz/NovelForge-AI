# ZIP novel import and workspace decoding

## Authorized scope and plan — 2026-10-27

Author approved the proposed import/decode/review/apply flow, placed in the
writer's Workspace tools menu as a submenu opening a modal. Use the existing
`import_demo` layout: optional wrapper directory, one or more novel directories
with info.json, optional cover image, and chapters/NNN - title.md. One selected
novel is imported per operation; the archive preview lists every detected root.
Preserve source attribution and chapter order, including source number 000.
Keep demo manuscripts private and outside commits; do not delete author files.

Root owns integration, schema/migration, durable decode execution, API routes,
shared contracts, runtime verification and tracking records. Separate isolated
writers own ZIP parsing and modal UI; a third isolated writer owns native
candidate application. No concurrent writers share paths. Independent review
of the integrated exact diff precedes completion.

### Flow

1. Authorized ZIP preview validates archive metadata before decompression:
   paths, collisions, symlinks, entry counts, expanded sizes, compression ratio,
   encryption and unexpected types. No disk extraction or remote URL fetching.
   Parse metadata and individual chapter files, never concatenate chapter
   headings into a manuscript split that could silently change chapter counts.
2. Confirm selected root and analysis areas. Create a new private draft novel
   in the current workspace, retain attribution, import sanitized immutable
   chapter versions, source filename/number mapping and optional validated
   local cover. Never overwrite the open novel or publish imported material.
3. Persist an operational job and source-version pins. Background analysis uses
   bounded chapter text chunks, explicit source quotations, structured schema
   validation and real configured analysis gateway. Persist progress after each
   successful chunk; failed/uncertain work is visible and explicitly retryable.
   No transaction spans an LLM call. No local token/spend quota is added.
4. Cover synopsis, retrospective outline, observed style, characters/states/
   development, relationships, world/lore/groups, timeline, canon candidates,
   research terms, narrative threads/promises and observed ending. Clearly
   distinguish reconstruction, uncertain identity, narrator-only knowledge,
   fictional science and scientifically verified sources. Do not fabricate
   future plans, simulation results, cover generation, approval or missing data
   just to populate panels. Report selected-area coverage and unknowns.
5. Consolidate exact identities with provenance and chronological boundaries;
   never silently merge aliases or contradictory states. Review candidates
   with Approve/Edit/Reject and original source evidence. Apply approved
   records through existing domain services and required story checkpoints.
   Author decisions, native writes and operation receipts must be atomic and
   idempotent. Check stale chapter/branch/revision pins before application.
6. Read back actual native records, retained manuscript/publication state,
   job progress, review decisions, provenance and cross-tenant isolation.

### Frozen seams for isolated writers

ZIP parser: `apps/api/src/services/novel-zip.ts`, exports
`parseNovelZip(buffer: Buffer): Promise<NovelZipArchive>`. Types:
`NovelZipArchive { archiveHash: string; novels: NovelZipNovel[]; warnings: string[] }`;
`NovelZipNovel { root: string; title: string; metadata: Record<string, unknown>;
chapters: { sourceNumber: number; filename: string; title: string; rawText: string;
htmlBody: string }[]; cover?: { mimeType: string; dataBase64: string }; warnings: string[] }`.
Use installed JSZip, existing ZIP central-directory parser and markdown renderer;
limits 50 MiB compressed, 200 MiB expanded, 10,000 entries, 5,000 chapters per
novel, 1 MiB per chapter, 200:1 ratio. Reject rather than truncate.

API base `/api/workspaces/:workspaceId/novel-decodes`:
- POST `/preview`, multipart `file`: `{ archiveHash, novels: [{root,title,
  chapterCount,firstSourceNumber,lastSourceNumber,hasCover,warnings}], warnings }`.
- POST base, multipart `file` plus string fields `root`, `archiveHash`,
  `areas` (JSON string array), `requestId` (UUID): returns `{ job }`.
- GET base: `{ jobs }`, recent jobs in workspace.
- GET `/:jobId`: `{ job }`.
- POST `/:jobId/retry`: `{ job }`, explicit resume from retained progress.
- POST `/:jobId/cancel`: `{ job }`.
- GET `/:jobId/candidates?area=&status=&skip=&take=`: `{ candidates,total }`.
- PATCH `/:jobId/candidates/:candidateId`: `{ expectedVersion,title,summary,
  subject?,target? }` returns `{ candidate }`; evidence remains immutable.
- POST `/:jobId/candidates/:candidateId/approve` or `/reject`:
  `{ expectedVersion,expectedHeadRevisionId }` returns `{ candidate }`.

Job view: `{ id,novelId,novelTitle,status,areas,totalChunks,completedChunks,
candidateCount,errorCode,unknowns,coverage,expectedHeadRevisionId,createdAt }`.
Statuses: IMPORTING, QUEUED, RUNNING, REVIEW, FAILED, UNCERTAIN, CANCELLED.
Areas: SYNOPSIS, OUTLINE, STYLE, CHARACTER, CHARACTER_STATE, CHARACTER_ARC,
RELATIONSHIP, WORLD, TIMELINE, RESEARCH, NARRATIVE, ENDGAME, CANON.
Candidate view: `{ id,area,title,summary,subject,target,chapterNumber,
citations:[{chapterVersionId,chapterNumber,quote}],status,version,result }`.
Statuses: PENDING, APPROVED, REJECTED. Native application seam in a new
`apps/api/src/services/novel-decode-apply.ts`; root coordinates atomic DB
transaction, author gates, pins/checkpoint and receipt. Adapter accepts typed
candidate payload, scoped actor/workspace/novel, DB and native services; no
direct provider calls or implicit public publication. Finalize its exact TS
interface with the isolated writer before dependent integration.

Native fields confirmed by contract inspection: optional candidate `details`
contains WORLD.entityKind, RELATIONSHIP.stance, NARRATIVE.recordKind/threadKind,
ENDGAME.legacyKind or CANON.predicate. CHARACTER_ARC requires at least two
distinct cited chapter milestones. The adapter receives the real retrieval
service bound to the same transaction client, not the outer DB connection.
Editing details is explicit and schema-bounded; source evidence is immutable.

### Acceptance, negative cases and recovery

Unit and dedicated-database checks cover hostile ZIP paths/bombs/collisions,
demo shapes/prologue/metadata, exact one-file-one-chapter preservation, source
quote validation, schema failure, resume without repeating successful chunks,
cancel/lease fencing, existing identity ambiguity, stale pins, duplicate apply,
cross-tenant denial, approved native records and no automatic canon/publication.
Both UI locales, focus trapping, modal reopen/progress/retry, mobile layout and
missing-key fallback must be checked. A real configured-gateway fixture run
proves analysis and author-controlled application; no repeat of unrelated tests.

Schema additions are operational history, not story restore targets. Review
migration in a dedicated database first. Preserve existing Windows Docker data,
stashes and untracked demo files. Take a recoverable backup before authorized
local migration, never reset working data. Keep story and configuration recovery
limits explicit; checkpoint plus retained import source/DB backup cover rollback.
No commit/push/deployment is newly required by this task; preserve prior standing
authorization and avoid publishing private source artifacts.

## Runtime memory note

Initial Engram runtime binding timed out. User restarted it; host registration
and save/read-back observation 708 now confirm the current binding again.
Session identity is runtime-owned; no replacement session was created.

## Implementation evidence — 2026-10-27

Implementation includes bounded ZIP preview/import, durable leased decoding,
hierarchical synopsis/style synthesis, source-pinned review and atomic native
application across the 13 selected areas. Imported novels remain private.
Research remains draft/unverified; canon remains proposed; observed endings
do not approve endgame gates. Coverage explicitly remains non-exhaustive.

Observed checks: ZIP parser 43 PASS (including all four demo layouts and
2,489 chapter-file smoke); job integration 8 PASS; native application 9 PASS;
source observation parser 9 PASS; restore scope 8 PASS; buffered transport
matrix 4 PASS plus all 56 AI service cases; decode modal 18 PASS. API and web typechecks exit 0; focused
ESLint and diff whitespace checks pass. The existing locale suite also passed
19 cases, including missing-key English fallback; this is separate from the
18 decode-modal cases. Browser proof exercises actual preview on an isolated
database in English desktop (1440px) and Indonesian mobile
(390px), four roots, 13 areas, confirmation cancellation and Escape, with no
page errors. No model call or novel creation is hidden in preview acceptance.
The modal retains its request ID across uncertain imports and component reloads.

Independent backend review APPROVE after correcting edited-details bounds:
stored immutable area determines validation; arcs allow at most eight
chronological cited milestones, each summary at most 2,000 characters.
Pre-response-limit-fix reviewed SHA256: processor 3a6534770a63d846564dfe00f32b5c26488b06a1b311c05d89596b9d16cf5085;
services 911da460ddbfc704d410b3164e97d928b020c5443b8f1162a062e3e81a37fb0b;
native adapter 2131dfe966e014503e9af31171a753418ed743623f1adcf40c349b26d3c47fd2;
routes db6821c0cf7c1a036ac17373a250c7221ba497002a507b22156042ab7857940d.

Local additive migration was rehearsed after backup restore to the dedicated
novelforge_test_decode_restore_20261027 database, then applied to the working
database. Before/after row hashes match for users, workspaces, memberships,
novels, chapters, chapter_versions, gateways, models and profile mappings.
Private backup .nf-artifacts/novel-decode-pre-migration.dump SHA256
b2d19f569a535e47ca6ce0b7d35c3c1d228f35f58a87b67620ea90d6dcabeeb3.
API and a dedicated local decode worker were reloaded; existing workflow/cover
workers and Docker data were preserved. API ready and web HTTP 200; anonymous
decode access 401. Local worker startup read back without runtime errors.

Initial real gateway acceptance was pending in novelforge_test_decode_live using
only the first two Solo Leveling demo chapters. Retained responses from the
current Dahono/DeepSeek routes were empty or an explicit stream failure, not
invented successful extraction. A tiny real MiniMax JSON-mode probe succeeded;
its historical incompatible marker was corrected only in the isolated database
through the audited settings service. Production model defaults are unchanged.
Measured full output then hit the 9,000-token response limit; increasing it
alone to 32,768 returned 48,242 answer characters but still truncated JSON.
The current contract bounds each section to 20 important observations,
1,200-character summaries, 400-character exact quotes and ten short unknowns.
Source sections remain 12,000 characters. The model gets 32,768 output tokens
to allow reasoning plus the bounded answer; this is not a local spend quota.
Private receipts retain finish reason and truncated output is never accepted.
The focused regression proves even parseable JSON with finishReason=length
produces no candidates. These observations describe the initial failed phases;
the final bounded acceptance result follows below. They do not imply author
literary approval.

Separate narrow review of the response-limit fix: APPROVE. Reviewed SHA256
processor e467aee8b3862f9161c408fbb5e857c9a2040a500f64fc2cb2bed90de0f10f96;
AI service f4bc6081156a1711f0b3e159d5bef6224230561b07049617c307689c4c91c7d5;
dialog 297257f635437bccad58c3341e6e47779b09421d991ee4d01e08259830764e5c;
EN 73037e23785f832ea571f0e8b21ea17660b9b26fe886526c187e771c1a627318;
ID 595624bc15cca4e6b3a13b75529c248fde693d1fc8c10513d7eda2498b7400ed.

Subsequent evidence transport review APPROVE: server excerpt IDs resolve to
exact pinned quotes; ID-based source position is owned by the server, while
legacy supplied quotation positions remain strict. A source-ID regression
proves an invented chapter 999 resolves to the latest actual cited chapter,
and invented IDs fail. Eight observation/parser tests pass. A separate
cancelled-job UI regression aligns the terminal UI with API behavior; 17 modal
tests pass. Earlier hash entries are retained historical review snapshots.

## Completion — bounded local author flow

GAP-133 is CLOSED for this implemented ZIP import/decode/review scope.
Real gateway job 5e987bd3-fa0c-4399-8041-cb3f95ebe5f1 reached REVIEW 5/5 in
novelforge_test_decode_live: three source sections plus synopsis/style
consolidation. It produced 34 valid suggestions in 11 areas; CHARACTER_ARC and
ENDGAME remained unsupported by the two-chapter fixture. The gateway served
bansosmontera/claude-haiku-5-5. Automated native character approve/read-back,
idempotent repeat approval, candidate edit/reject and mandatory checkpoints
passed, with zero publications and zero canon facts. Two unchanged retained
real responses were revalidated after parser repairs; no fabricated provider
call or duplicate generation/usage record was added. One unsupported empty
ITEM row was excluded with an explicit warning and private raw provenance.
No existing author novel or production model preference was changed.

Final browser proof read actual pending suggestions through the API, opened
source quotes and verified enabled approval controls in EN/1440 and ID/390.
Ten rows were measured per paginated view; no page errors or overflow. Browser
performed ZIP previews only; state mutation evidence comes from the separate
automated native-service acceptance, not hidden browser clicks or author sign-off.
Private receipts: .nf-artifacts/novel-decode-live-resume.json,
novel-decode-browser-proof.json, novel-decode-migration.json.

Final independent review APPROVE. SHA256 processor
e782bba2d74da0eec2dfc936b103014bd77efdbc90f046fdad965240d6fb5441;
dialog 0dd196df55c0da54e8c885a38b68e693036d87d99d41b1fd03a81485053d64a5;
EN 673abc11acc181655c78e5988d91f3c6360fee0a9e2e615b87c140a0c125d051;
ID 290f058c01d97aecd00777ef376b1118b40c6faaf94a6265311bebc98ca9aa0e.
Final local API PID23928 and decode worker PID42892 load the reviewed code;
API ready200, existing workflow/cover workers preserved. No commit/push or
staging deployment. Limits: no exhaustive whole-book extraction claim, no
human screen-reader or author literary acceptance, and provider behavior varies.

Publication preparation, 2026-10-28: the author explicitly authorized commit
and push. Staged whitespace checks removed one extra EOF blank line from six
new files. Native adapter SHA256 is now
39ef45cd9cbeac85287a5a576f13c723f1e14ff2a3bea4001cd784b19c5a1d5b;
dialog SHA256 is now
90826b3271bba5f672cf5380bee389094acb250a3632d70274522dd486055a85.
Appending only the removed newline reproduces each prior reviewed hash exactly;
there is no behavior change. Full repository lint and staged whitespace checks
pass. README receives two privacy-scoped native browser captures; original
manuscripts, backups, full verification captures and helpers stay ignored.
