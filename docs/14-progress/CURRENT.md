# Current Project State

## Author-authorized repository publication and README showcase — 2026-10-28

Author authorized committing and pushing the accumulated ZIP decoding and draft
history changes, then requested additional GitHub README showcase screenshots.
README now includes actual browser captures of the import modal (original demo
fixture, no manuscript creation/model call) and the version-aware draft status
card (no manuscript prose or chapter mutation). During this fresh capture the
author chapter was already v19; the UI correctly retained historical application
at v1 without changing current text/status. Earlier v4 acceptance remains
historical evidence. All eight linked PNG assets exist; selected new images were
visually inspected. Private source archives, full screenshots, backups and local
helpers remain ignored. Full repository lint passed; reviewed application bodies
match the previously tested implementation. Staging removed extra EOF blank
lines in six new files; restoring that one newline reproduces the reviewed hashes
for the affected application components. Commit/push receipts are recorded
in the current Engram handoff after execution.

## Applied draft history survives reload and later edits — 2026-10-27

Fixed the author-reported capt.png warning for Kaisar chapter10: persisted
version1 records run927e7851 application; current version4 is later edited text.
The UI now restores that exact application history, distinguishes historical
and current versions and removes the obsolete reapply action. Pending-only
warnings no longer appear for already-decided character/story proposals.
History lookup errors/races remain guarded; no source or approval gate changed.
Task tasks/applied-draft-history-status.md / GAP-134 CLOSED. Focused35 tests,
web types/lint and independent review pass; actual local EN/ID browser proof
shows appliedv1/currentv4 with no API writes and unchanged chapter text/status.
Private receipts/screenshots retained; no commit/push or story mutation.

## ZIP novel decoding: local integration and bounded real acceptance passed — 2026-10-27

Author-approved Workspace tools submenu opens a ZIP import/reconstruction
modal using the private import_demo layout. New private novels preserve source
chapter numbering, cover and attribution. Durable background analysis covers
13 selected workspace areas with source quotations, explicit unknowns and
Approve/Edit/Reject. Canon stays proposed, research stays draft/unverified,
and no import publishes chapters. See tasks/novel-zip-decoding.md, ADR-0023
and GAP-133 for bounds, review hashes, checks and recovery evidence.

Local backup/restore rehearsal and additive migrations passed; key story,
account and model tables have identical pre/post row hashes. API/web return
200; anonymous decode access returns 401; dedicated decode worker starts.
Existing workflow/cover workers, Docker data, source manuscripts and stash
remain preserved. Backend/UI/source tests and independent review pass.
Real gateway acceptance passed in an isolated database using two complete
Solo Leveling demo chapters: three source sections and two hierarchical
synthesis sections reached REVIEW, retaining 34 valid suggestions across
11 areas. Missing character-arc and ending evidence remained explicit. The
configured gateway served Claude Haiku for the successful run; production
model defaults were not changed. Two unchanged completed responses were
revalidated after source-contract repairs, not requested or billed twice.
Automated test approval/replay, edit/reject and native character application
passed, with zero publications and zero canon facts. Browser read-back of
real suggestions and source quotes passed in EN desktop and ID mobile.
The bounded extractor rejects truncated output, excludes invalid rows with
visible warnings, and never applies rejected suggestions. Final separate
review APPROVE; task record retains exact reviewed hashes.
This is partial reconstruction evidence, never exhaustive extraction or
author acceptance. No commit/push/deployment performed for this feature.

## Kaisar Bab 10 language polish republished as version 4 — 2026-10-27

Author-requested wording polish for Bab 10 "Tamu Sebelum Panen" of novel
e36d568b-aecf-476a-8e3f-f47ca709672b in novelforge_acceptance_050b, continuing
today's per-chapter language pass. Fresh reads corrected the author's stated
premise: chapter 10 had only versions 1–3 (latest and current v3
91e375bc-e46b-4045-9516-4a8bbb23bffe, the 2026-10-26 copyedit, 1,467 words);
no version 4 had ever been saved. The chapter sat DRAFT with its publication
UNPUBLISHED because this morning's 08:23 returned-to-draft cycle stopped
before any save/review/publish. No other environment holds a v4 (single novel
row; both Postgres instances checked; snapshots scanned).

The v4 candidate applies 14 phrase-level substitutions (clarity, grammar,
natural dialogue; word count 1,467→1,469) preserving all events, characters,
amounts, timing, chapter title and scientific terms (Persicaria hydropiper,
dialdehida seskuiterpen, polygodial, warburganal). Required checkpoint
3af14bd8-30c4-4603-b6b6-faa162c72d8e precedes the application-service CAS
save; the chapter was already DRAFT, so no unpublish step was needed.
Deterministic final-text review PASS ca48797f-9d97-4b23-ab29-b7ae11c44af8
precedes publication. Read back: v4 80de5df5-cf44-457f-a968-dad8b78c80a2
PUBLISHED, 1,469 words, publication pinned to v4; versions 1–3 preserved
verbatim (v3 SHA a25f51e313e95ca146930e77db967a8355cc8ed4f7ee12165a87e98861
fe1c64 unchanged); other chapters, canon, citations, references and outline
rows matched their pre-operation hash. Exact v4 SHA256
167fa51eff5ba8c2e33a553e719a55e5832e3612b4e384bab0f30130d639ca79. Artifacts
(original/candidate/edits/receipt) remain private/ignored under
.nf-artifacts/editorial-10-v4/. These are automatic checks, not the author's
literary sign-off. Engram remains unbound; fallback handoff recorded in
ISSUES-AND-GAPS.md.

## Kaisar native Don Juan background and public synopsis revised — 2026-10-27

Author's chapter 3 correction now establishes scholarly/wealthy origins,
rigged state examination, false treason family collapse and exile with Sofian
to established Dusun Maspati, followed by depression, alcohol and gambling.
Sofian's steadfastness does not erase her fear or excuse his harmful conduct.
Education references in chapters 6, 8, 9 and 12 now align; Juan Cleverton's
modern origin remains separate. Independent exact narrative/helper reviews
APPROVE. Required checkpoint `56567fdc-f67b-4d27-a097-0f6e3cb8ac07` precedes
five immutable versions and five current final-text PASS receipts.

Read back: chapter 3 v15 DRAFT (940 words), 6 v3 PUBLISHED (1,023), 8 v5
PUBLISHED (798), 9 v5 PUBLISHED (589), 12 v3 DRAFT (2,727). Existing author
edits, old versions, titles and original publication states are preserved.
Planning synopsis is replaced through create/archive services; public reader
synopsis updated separately and verified by anonymous HTTP 200 exact text.
DNA receives only a scoped backstory note. Cover/settings, ten unaffected
chapters, canon/citations, references, character/state and outline records
compare unchanged. No automatic canon approval or newly published draft.

See `tasks/kaisar-native-don-juan-background.md` (GAP-132 closed) and ignored
`.nf-artifacts/kaisar-exile-background/` receipts. GAP-131 remains a product
follow-up. No application-code/provider/staging change or browser visual claim.

## Kaisar chapter 1 prototype presentation revised — 2026-10-27

Author-requested single-paragraph edit replaces the generic half-suitcase box
with a labeled modular research-prototype diagram, thermal/output measurement
and cooling details. Three-year development period, performance numbers, plot
and prior Tesla explanation are unchanged; no new physics validation is claimed.
Independent exact prose/helper review APPROVE. Required checkpoint
`14d902f6-f9fd-467d-9466-b1dd602f7ead` precedes immutable chapter 1 v7 (846 words).
Current final-text review PASS, original PUBLISHED state restored, exact
content/title/version/publication pin and old-version preservation read back.
Protected chapters 2–15, references, canon/citations and other scoped metadata
compare unchanged. No new reference/model test or application-code change.
See the 2026-10-27 follow-up in `tasks/kaisar-aetherion-tesla-reference.md` and
ignored private `.nf-artifacts/aetherion-prototype/` receipts. Browser rendering
and author literary sign-off are not claimed.

## Kaisar Aetherion/Tesla reference correction — 2026-10-26

Author-requested early-chapter correction applied in the local novel. Surveyed
chapters 1–9; only 1–2 contain affected Aetherion technical/motivation passages.
Juan now explicitly draws inspiration from Tesla's wireless-electricity vision,
develops his own fictional aether conversion model and aims for broadly available
free electricity. Prototype limits, existing test numbers and plot are preserved.
Historical Wardenclyffe and radiant-energy sources are separated from fictional
industrial aether mechanics in two new Riset > Referensi glossary entries.

Independent editorial/source and technical reviews APPROVE. Required checkpoint
`1f34c37b-a38f-4943-857d-d01ec1a098fd` precedes immutable chapter 1 v6 (805 words)
and chapter 2 v3 (601 words). Two final-text reviews PASS; original PUBLISHED
states, exact text/title/version/publication pins and retained old versions
read back correctly. Chapters 3–15, canon/citations, old references, outline,
entities, characters, synopses and DNA compare unchanged.

Both new references are ACTIVE with two embedded chunks each. A real retrieval
query ran LEXICAL+VECTOR and returned both through VECTOR, zero withheld;
audit `c05ab0d3-d7d5-43c5-8754-ce84c918b906`. No indexing failures or fake vectors.
See `tasks/kaisar-aetherion-tesla-reference.md` and ignored private receipts under
`.nf-artifacts/aetherion-tesla/`. No application source/schema/provider changes,
production mutation, new canon approval or newly published draft chapters.

## Primary text model changed to Dahono — 2026-10-26

Latest author routing amendment replaces Lightvela with the exact catalog model
`dahono/dahono/deepseek-v4.1-flash` at priority 0; secondary
`bansosmontera/deepseek-v4.1-flash` stays at priority 1 across the same five
Studio text profiles. Audited before/after receipts and live registry read-back
verify order and no explicit Kaisar override. Earlier mappings remain lower;
image/embedding configuration and credentials are preserved.

Real primary readiness generation `7a530c62-de38-483d-8492-07ff8939799c`
passed JSON parsing through the built-in chapter buffered-stream transport in
46,450ms. This is a provider readiness check, not a new full chapter quality
acceptance. Reuse prior separately accepted chapter evidence. Active Studio
definition versions and scoped DNA still read back correctly; no reactivation,
manuscript application, canon approval or publication was performed.

Private `active-model-priority-dahono.json` retains rollback data through audited
mapping services. The retained helper now rejects its obsolete clone alias before
database access. No runtime source change or repeat of passing chapter tests.
The earlier Lightvela-first paragraphs below describe historical routing.

## Kaisar Studio defaults activated and verified — 2026-10-26

Author replaced the secondary model with `bansosmontera/deepseek-v4.1-flash`;
`bansoslightvela/auto` remains first. Audited five-text-profile configuration
and live registry order read back correctly, with no explicit Kaisar agent,
workflow or novel preference overriding them. GLM remains at lower priority.
Image/embedding configuration and credentials are preserved.

Explicit-secondary DeepSeek run `93d6e5a4-a8cd-4e9e-acfd-80b3705717eb`
passed bounded runtime acceptance: 3,389 words, eight real successful streaming
calls, two bounded rewrites, final review with only minor findings, extraction
validated and AWAITING_APPROVAL. Exact policy/skill grants and version pins match.
Independent technical review APPROVE and semantic review PASS for default
activation. Prose SHA256
`e6a3865705d2645478824795397ad2908759bda66cb443f32e62c2cf19c668a8`.
This does not prove Lightvela primary success or automatic fallback after
deterministic validation failure; earlier failed runs remain historical evidence.

After exact-hash acceptance and an idle workflow/queue check, created required
checkpoint `e0de0bd7-1ea1-40b9-bcaf-547a8754858d` and applied immutable versions
through application services: context/continuity skills v2, planner v2,
writer/final/early reviewer v3 and both chapter workflows v2. Extractor unchanged.
Merged Kaisar DNA now pins minimum 2,500 words and the scoped story profile.
Exact versions, DNA and effective routing were read back successfully; prior
definition versions, manuscript, canon and other novel DNA remain unchanged.
API /ready and Nuxt both return 200. Docker, Redis and stash remain preserved.

Private `.nf-artifacts/studio-alignment/` holds acceptance hashes, independent
review receipt, baseline backup and application/routing receipts. To revert only
these defaults, restore preserved prior DNA through the scoped narrative service,
append preserved agent/skill/workflow content as new versions and restore routing
through audited mapping services. The novel checkpoint does not rewind workspace
Studio definitions; a broad checkpoint restore also rewinds covered story state.
Never delete historical versions. No author literary acceptance, manuscript
replacement, canon approval, publication or production deployment occurred.
Minor acceptance-draft copyediting advisories remain separate from these defaults.

The blocked activation paragraphs below are historical and superseded by this
verified completion; they must not be redispatched as current failures.

## Author-requested routing priority and activation attempts — 2026-10-26

Applied through audited configuration services and verified on read-back:
`bansoslightvela/auto` priority 0, `bansosmontera/glm-5.3-flash` priority 1
for STRUCTURED_EXTRACTOR, DEEP_PLANNER, CREATIVE_WRITER,
LONG_CONTEXT_REVIEWER and CONTINUITY_REVIEWER. These are platform profile
priorities; existing mappings remain lower, image/embedding profiles unchanged.
Live registry checks confirm the exact order and no explicit agent/workflow/
novel model preference overriding it for Kaisar. Private before/after receipts
retain prior configuration for rollback. Both short real JSON probes passed.

Activation testing was repeated in isolated, restored databases:

- `d02fd98b-8a6d-4a62-a72d-cffe39ec69c7`: Lightvela plan succeeded; write
  transport succeeded, but 1,698 words failed the pinned 2,500-word minimum.
- `fac50b67-fc65-4430-8f40-91100d947c13`: GLM explicitly selected per-run as
  the secondary test; plan succeeded, write failed after 183,135ms with an
  INTERNAL provider-stream error. No successful draft was adopted.

Both failures remain preserved. No automatic secondary fallback after a
deterministic length failure is claimed. Active routing is updated; active
Studio definitions/DNA remain unchanged because latest runtime acceptance did
not pass. No manuscript/canon/publication mutation or runtime code change.
Next: diagnose structured provider streaming failure before another bounded
acceptance attempt. Do not lower the minimum or bypass the retry gate.

## Kaisar Studio latest acceptance and pushed source — 2026-10-26

Source commit `8db056333733a4aa5df2f483bc42587f2f71b1b7` is on origin/main;
GitHub CI `40292092498` completed successfully. Earlier no-commit and in-progress
paragraphs below are historical evidence, not current delivery status.

Latest completed isolated run `b79f00a5-6fc2-4929-9d6f-a6c8ba862efe` passed
runtime checks: 3,296 words, five successful real gateway calls, exact definition
pins and wire-level policy/skill presence, unchanged manuscript. Independent
semantic review HOLD found unsupported historical agreement witnesses. Model
minor-only review findings do not override that independent result. Preserve
the held sample under private `attempt-7` and clone suffix `_witness`.

Clarified scoped witness boundaries passed independent semantic review in run
`8ca06496-d345-422b-93e4-40de78043956`: final rewrite 3,482 words, SHA256
`be731ed0ce2e3e758b6e6e0d25a3ea0a1cba1804efbf9ed298918ead64609d19`.
Two bounded rewrites corrected early findings; the final provider review then
failed after 16,839ms. Read-back confirms FAILED / INTERNAL, with only a safe
generic stream-error message. The official retry gate permits TRANSIENT or
RATE_LIMIT, so this failure is not eligible. No retry or SQL bypass was made.
Local router diagnostics did not establish an underlying transient status for
this exact request; older logs are not evidence for reclassification.

Runtime code was reloaded after proving the author workflow queue idle:
API PID 35380, workflow worker PID 24464; API /ready and Nuxt both return 200.
Docker, Redis, cover worker, author manuscript/canon and existing stash remain
preserved. Active Studio defaults and novel DNA remain unchanged until final
runtime acceptance. Next: obtain structured gateway evidence for this failure
before a justified retry/classification repair; preserve the accepted prose and
successful prefix. Semantic PASS is not runtime completion or author acceptance.

## Kaisar AI Studio transport repair and early continuity — 2026-10-26

The earlier long-response gateway block below is diagnosed and repaired locally:
real saved-chapter non-streaming returned503 at60s; SSE completed64s/2817words.
Built-in chapter workflows now buffer streaming through the same adapter and
logical request, require terminal completion, reject malformed/error frames,
stop fallback after partial content and persist INCOMPLETE. Other task transport
defaults and provider/model settings remain intact. Core transport103 cases and
API55 cases pass across focused runs; affected typechecks/lint pass.

Full run `a90d5df9` wrote past the old limit (143s), then correctly blocked major
story contradictions found only at final review. Existing early reviewers now
receive the same installed continuity skill within their existing calls, so
evidenced hard-story errors can enter the existing bounded rewrites. Revised
instructions/helper have separate approvals; fresh real run
`e2cf10d3-c102-4f5e-aea4-16a70c8dcff2` is in progress on owned clone checkpoint
`464715e3-0505-4ba3-b3be-86eaa2422b9b`. Thin real-fetch observations verify actual
instructions/skill grants in outgoing messages without retaining raw prompts.

Active defaults, manuscript and canon remain unchanged pending semantic
acceptance. Author has now authorized commit/push after verification; previous
no-commit notes remain historical scope. No production deployment is requested.

## Kaisar AI Studio alignment — 2026-10-26, gateway acceptance blocked

Author approved scoped defaults after successful tests. Optional DNA authoring
policy is pinned on server enqueue, injected independently of droppable context,
and checked after every write/rewrite. Both chapter forms honor the minimum;
DNA editor loads the actual response envelope. Reviews with contradictory
correction flags or unresolved final findings are rejected, including recovered
artifacts; previous successful step rows remain historical evidence.

Twelve pure policy tests, all 43 executor regressions (including nine
fresh/recovered negatives), and focused UI/enqueue checks pass. Technical source
review APPROVE (executor SHA256
`d80f49111c9fe1fc799b48714211bd5b7e7474a39b2c9d64fc76c7d1372dc27b`).
First real draft was held by independent review; revised real-gateway run
`0a7647b1-e9f1-4064-bf28-012c40700eb7` failed write on six transient routes.
After a successful short readiness probe, bounded retry
`72dda8d6-438a-452b-88f0-a588670fe20d` reuses its successful prefix and exact
pins in the owned clone and also failed write (six TRANSIENT routes; no draft).
Latest instruction corrections passed separate review and replacement checks,
but are not yet rehearsed through the gateway. Acceptance remains pending;
no further blind retry. Next: diagnose/repair long-response gateway behavior,
then rehearse the exact latest candidate before default activation. No active definition/DNA changes, manuscript application,
publication, commit or push. See `tasks/kaisar-studio-alignment.md` and private
`.nf-artifacts/studio-alignment/` for source/clone/rollback evidence.

## Kaisar chapters 12–15: social revision, rescue and enterprise — 2026-10-26

Author-requested local draft work completed in `novelforge_acceptance_050b`, novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`. Current chapter 13 v2, including the
author's intervening edit, was used as the baseline and preserved historically.
Chapter 12 now includes scoped brick-house costs and fictional social/marriage
customs. Chapter 13 prepares clean white granulated sugar and improved bathing
soap, retaining its six-silver shopping and twenty-silver gross-sales ledger.

| Chapter | Current version | Words | Status |
| --- | --- | --- | --- |
| 12 — Jalan Menuju Kota | 2 | 2,687 | DRAFT |
| 13 — Dua Puluh Perak | 3 | 2,586 | DRAFT |
| 14 — Dua Perak di Hadapan Saksi | 1 | 2,623 | DRAFT |
| 15 — Pekerjaan untuk Maspati | 1 | 2,652 | DRAFT |

New chapters cover Sofian's rescue, defensive help from Husein/Anton/Darma,
witnessed settlement before the seven-day deadline, voluntary paid work and
realistic savings/food arrangements. Wira Santosa is the recurring village head:
surprised by Don Juan's change, yet actively checking evidence and employment
commitments. Rangga Sembada is the new moneylender antagonist. Karta, Leman and
Sari are the three initial trial workers. All five have character records,
explicitly linked CHARACTER identities, and chapter-scoped states. Existing
characters/identities were reused and preserved; no canon facts were approved.

Required pre-operation checkpoint: `5cc45fe9-ac5f-46bf-bac6-7b215e54258e`.
Independent exact-text/character review and separate helper review APPROVE;
all four application final-text reviews PASS. Exact content/title/status/word
counts, immutable prior versions and character identity/state read-back passed.
Chapters 1–11 and publication rows, existing characters/states/entities, canon,
historical citations, references and outline nodes matched pre-operation hashes.
No publication, provider run, production mutation, commit or push.

See `tasks/kaisar-ch12-ch15-rescue-and-enterprise.md` and ignored private
`.nf-artifacts/kaisar-12-15/` receipts. The new narrative's settlement and business
facts remain draft material, not automatically approved canon. Browser rendering
and author literary acceptance were not claimed. Earlier sections below retain
historical versions and evidence.

## Kaisar chapters 1–9 prose and continuity copyedit — 2026-10-26

Author-requested Indonesian wording, dialogue, explanation and narration edits
were applied in local `novelforge_acceptance_050b`, novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`. All 165 changed paragraphs received
independent exact-artifact literary/continuity approval. Existing chapters 10–13
were read as forward constraints, not rewritten. Repairs include chronology,
speaker attribution, memories of events after death, duplicated meal actions,
broken wording, beginner-level physical limitations and accessible exposition.
Scientific names and fictional effects remain story data, not verified claims
about real-world plants. Existing educational-background dialogue remains a
character claim; canonical debt-text and later fish-allocation ambiguities were
documented without inventing facts or silently changing canon.

Required checkpoint: `9e6a2bb4-4577-4333-9c5c-5f8edd722800`. Separately reviewed
service helper performed CAS saves through DRAFT, current final-text review and
republication. All nine reviews returned PASS; exact saved hashes and public
version pins matched the reviewed artifacts. Existing PUBLISHED status was
preserved for chapters 1–9. New current version numbers: 1/v5, 2/v2, 3/v6, 4/v3,
5/v3, 6/v2, 7/v2, 8/v4, 9/v4. Original immutable versions remain unchanged.
Chapter titles, chapters 10–13 including their publication rows, canon, historical
citations, references and outline nodes matched pre-operation content hashes.

Evidence: `tasks/kaisar-ch1-ch9-copyedit.md` and ignored private
`.nf-artifacts/editorial-1-9/{editorial-checks.json,approved-hashes.json,application-receipt.json}`.
No production mutation, canon approval, provider run, commit or push. These
automated checks do not constitute author literary acceptance or browser-rendering
evidence. Existing dirty copyedit/city-market documentation was preserved.

## Kaisar chapters 12–13 city-market drafts — 2026-10-26

Author-requested Indonesian chapters were saved through application services in
the existing local `novelforge_acceptance_050b` novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`:

- Chapter 12, `Bab 12 — Jalan Menuju Kota`: DRAFT v1, 2,199 words;
  chapter `78557d8e-2cec-4c2c-8da1-c610feea88bc`,
  version `82b76a5f-c169-4578-b1a6-047e7b762fc7`.
- Chapter 13, `Bab 13 — Dua Puluh Perak`: DRAFT v1, 2,328 words;
  chapter `7ce24f0d-858b-4fb1-a5d9-07d3e0fb8803`,
  version `47824529-33f1-4773-a69e-30352870441d`.

The supplied outline covers defensive training, village/city contrasts,
demonstrated market techniques, relatives' growing admiration, twenty silver
gross receipts, shared proceeds and shopping. Required pre-operation checkpoint:
`e1d78896-2470-4b69-939b-53e603e4e06e`. Independent literary review approved the
exact submitted text; separate helper review approved the guarded service flow.
Both deterministic final-text reviews returned PASS. These are automated checks,
not the author's literary acceptance or canon approval.

Six Indonesian GLOSSARY references were added with real source links and explicit
research/fiction limitations. All six are ACTIVE; fresh database read-back found
one chunk and one persisted `text-embedding-3-small` vector per reference,
with chapter visibility boundaries 12 or 13. No indexing failure occurred.
Earlier chapter rows, canon and historical citations matched their original
hashes; exact new manuscript hashes matched the reviewed artifacts. No chapter
was published, no canon was approved, and production was not changed.
See `tasks/kaisar-ch12-ch13-city-market.md`; private evidence lives under
`.nf-artifacts/kaisar-ch12-13/`. No commit or push performed.

## Kaisar chapters10–11 language and dialogue copyedit — 2026-10-26

Author-requested Indonesian prose copyedit completed in the local
novelforge_acceptance_050b database, novel e36d568b-aecf-476a-8e3f-f47ca709672b.
Thirty phrase changes in chapter10and35in chapter11improve clarity and natural
dialogue without adding story events, characters or canon. Numbers and scientific
terms were retained. Separate automated copyedit review approved both artifacts.

Required checkpoint b28dc48a-1f61-4b16-914c-477a76a2d45b precedes application-service
CAS saves. Chapter10is now PUBLISHEDv3 (91e375bc-e46b-4045-9516-4a8bbb23bffe),
1467words; chapter11remains DRAFTv9 (09c9c5c0-7ba5-422c-8d1b-63146fb280e6),
1816words. Both deterministic final-text reviews returned PASS. Exact content,
publication pin/status and preserved original versions were read back. Other
chapter rows, canon and historical citations matched their pre-operation hashes.
These are automatic checks, not author sign-off. No production-server change or
new chapter publication occurred. Earlier v6/v8 records below remain historical.
See tasks/kaisar-ch10-ch11-copyedit.md; manuscript artifacts remain private/ignored.

## Kaisar dari Masa Depan: terminology repair and antagonist closure — 2026-10-26

Author decisions that scope this work: (1) the mastermind behind Juan Cleverton's
murder is considered resolved because he lives in a different world and era and
will not meet Don Juan or be discussed again; (2) the story uses
"transmigrator", not "reinkarnasi", because the soul moved into another body in
another time instead of being born again. Novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`, workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9`, staging database
`novelforge_acceptance_050b`.

**Antagonist (`62338cd1`, Atasan Juan Cleverton):** advanced through the audited
`narrative.antagonist-stage-advanced` API to stage `RESOLUTION` with outcome
`NEUTRALITY` (the enum has no "out of reach" value; NEUTRALITY is the honest
mapping of "no longer an active threat, never meets again"). The purpose text
was corrected to "perkaranya selesai — ia hidup di dunia dan zaman yang berbeda,
tidak akan bertemu Don Juan lagi dan tidak akan dibahas lagi" with audit action
`narrative.antagonist-purpose-corrected`.

**Chapter 3 (PUBLISHED, new version 5):**
`5c34abaa-f3b1-439d-809b-ed8b76ed5a01`, 714 words. "Ia telah direinkarnasikan"
became "Ia telah menjadi transmigrator. Jiwanya yang dahulu hidup sebagai Juan
Cleverton kini terbangun di dalam tubuh Don Juan—". Applied through the
supported flow — unpublish, save with `expectedVersion`, final-text review PASS
`cdd89c35-a2ba-4c10-8967-83f567b3b228`, republish. Versions 1–4 are preserved
verbatim as history.

**Synopsis (internal and public):** new internal synopsis
`c8728926-20b1-4e66-be3b-3490a5f94153` (ACTIVE, 814 chars) describes
transmigration ("jiwanya berpindah ke masa lampau dan masuk ke dalam tubuh
seorang pria bernama Don Juan"); old synopsis `7fc85bbb` is ARCHIVED. The public
reader synopsis was updated with the `expectedPublicSynopsis` CAS.

**Canon evidence:** fact `6f9ee985` ("adalah reinkarnasi dari") was retracted
with an authored reason; replacement fact `8e8a1477` ("adalah transmigrator
dari", same object "Juan Cleverton, penemu Aetherion dari dunia lain",
available from chapter 3) carries a verified source span on chapter 3 version 1
(quote "Ia yang dahulu hidup sebagai Juan Cleverton kini terbangun sebagai Don
Juan", offsets 1629–1704) and Don Juan knowledge row `8db9a2a0` (KNOWN,
REMEMBERED, chapter 3). The span stays on the historical version deliberately:
the sentence is narrator-only, so sourcing it on the current version would flag
every cast member whose state window covers chapter 3, including Sofian, who
does not know about the transmigration in-story (GAP-128). The source claim is
literally true for the version it cites and the meaning is unchanged.

**"Cerita" text corrections (audited SQL, no edit API exists):** character
summary `7e726bd2` ("jiwanya berpindah ke tubuh Don Juan", "di masa asalnya"),
state summary `fc5839a2` ("Transmigrasi: jiwa Juan Cleverton berpindah …"),
outline beat node `e3430d78` ("Transmigrasi di dapur gubuk"), and the antagonist
purpose above. Actions: `character.summary-edited`, `character.state-edited`,
`planning.outline-node-edited`, `narrative.antagonist-purpose-corrected`. Scene
`6f188a23` was corrected through the scene PATCH route.

**Approved outline:** outline version 4 `2e65c4ec-96e4-4362-bc55-58bd6a83d5c5`
is APPROVED (v3 `03e4ced0` SUPERSEDED); content is v3 byte-for-byte except beat 2
"Transmigrasi di dapur gubuk", so the approved plan no longer carries the old
term.

**Derived projection:** canon summary `f7141e93` rebuilt at revision
`82ece3ba` (number 413) by an operator script calling `rebuildCanonSummary`
(RepeatableRead, revision-pinned) because the running API process predates the
summary routes. Counts: 24 entities, 27 active facts, 1 retracted; the digest
lists "adalah transmigrator dari" and no "adalah reinkarnasi dari". The previous
row `61383967` remains as revision-pinned history.

**Verification (OBSERVED):** story-health returns 0 findings and 0 unresolved
for chapters 1–11 (`health-final-1.json` … `-11.json`). A database scan for
"reinkarnasi" now matches only historical or explanatory artifacts: chapter
versions 1–4, the retracted fact, the archived synopsis, cover-generation
prompts, workflow step instructions, and the version notes that record the
replacement. Active character/state/scene/outline text, the active synopsis,
the public synopsis and the published chapter 3 are clean. API read-back
confirms the fact, source, knowledge row, outline statuses and scene summary.

**State:** Bab 11 remains an unpublished DRAFT. The temporary author session
used for audited API calls is deleted after this record.

## Kaisar dari Masa Depan: Bab 8 plan repair and Bab 11 harvest draft — 2026-10-26

Author decision that scopes this work: keep Bab 10, fix the plan line in Bab 8,
stage the fish sale in Bab 12, and make Bab 11 the abundant harvest. Novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`, workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9`, staging database
`novelforge_acceptance_050b`.

**Bab 8 (PUBLISHED, new version 3):** `6dce946c-fd3f-492e-a2f0-45f20e46cc54`
replaces the closing plan "besok pagi, ikan; siang, pasar" with "besok pagi,
panen besar di liku sungai; lusa, kota"; 906 words. Applied through the
supported flow — unpublish, save with `expectedVersion`, deterministic
final-text review PASS `9958a9a3-4beb-4d0d-903a-6a9fff147aa4`, republish. The
v2 review no longer covers the current text. Bab 10 text is unchanged per the
author's scope; its "hari pertama" reads as the first day of the harvest plan
instead of implying a same-day market sale.

**Bab 11 (DRAFT, not published):** `5f789d14-957c-40fc-97a9-567e9f955c64`
"Bab 11 — Panen Seratus Lima". The initial version
`f20506eb-b4af-4011-afdd-cd09a6010e25` (1,836 words, review PASS
`26e6152a-cca6-4718-81aa-64642b905fdd`) was followed by four un-noted saves
(versions 2–5, observed timestamps 2026-10-25 18:04–18:12) that changed three
lines of wording, so that receipt covers only v1. The author's clarity pass is
version 6 `f418874b-7879-465d-8258-6f88722e2b82`, 1,860 words, final-text
review PASS `0d3cf318-f486-4094-b14a-103e6ded88f5`.

- 4 scenes: `f4fc8606`, `4baf5c82`, `914bef3b`, `93488e8c`.
- Outline node `fba68029` (order 10); outline version 3 `03e4ced0` APPROVED
  against head `87fb9b29` (v1/v2 SUPERSEDED), 11 beats, last beat links the
  chapter.
- 4 canon facts with chapter-version sources at verified offsets: `db6c7071`
  (105 fish, 40/30/35, quote 3711–3904), `f11217a4` (pond doubled), `687b8994`
  (city plan), `da83573f` (wages 8/5/5). Fact count is now 27.
- 20 `character_knowledge` rows, 4 per present character: Don Juan
  EXPERIMENTED; Husein, Anton and Darma REMEMBERED; Sofian LEARNED_IN_WORLD;
  all KNOWN from chapter 11.
- 5 `character_states` windows closed at 11 and reopened `[11, NULL)` in one
  transaction, with `character.state-window-advanced` and
  `character.state-window-closed` audit rows.
- Story event `92609866` and timeline entry `1f5149be` (order 6) carry the
  harvest consequences into "Cerita".

**Clarity pass on Bab 11 (version 6, author request):**

- Sofian's serving line now states equal portions for five people and that
  everyone eats until full, replacing the ambiguous "tidak menghitung apa pun".
- The old-world memory now reads "sibuk membicarakan angka dan keuntungan,
  tetapi tidak pernah bertanya siapa yang menyiapkan makanan mereka".
- Anton asks "Apa yang akan kita lakukan di kota?" and Don Juan answers
  "Menjual ikan" before the 80/4/21 split; the split is now arithmetically
  explicit against the 105-fish harvest and the pre-existing pond stock.
- "pedagang" became "pembeli", matching a direct sale to townspeople rather
  than to traders.
- The debt line now reads "Dua perak, sudah termasuk bunganya", consistent with
  Bab 4's "Total 2 perak dengan bunganya!".
- The four canon fact sources were re-pinned to v6 at recomputed offsets
  (`72f73e17`, `7b6dfa8b`, `9cfc170c`, `be8b4c71`; exact slice check true for
  all four). The v1 citations remain as history.

**Author rules check for Bab 11:** no new characters, marga, locations or
enemies — the existing cast, Keluarga Pratama/Magani and Liku Tenang entity
cover it; no research reference matches harvest or pond material, so no
reference link was added; neither antagonist is defeated, so no antagonist
outcome changed.

**Story-metadata corrections (Cerita):** the promise/thread routes expose no
text edit, so four fields were corrected by SQL with audit rows
(`story.promise-edited` ×2, `story.thread-edited` ×2):

- Promise `285e22f1` payoff no longer claims repayment in Bab 8 "verified in
  Bab 9"; it now records the Bab 11 harvest sold in Bab 12.
- Promise `b8790b64` now quotes the actual Bab 9 line "Jika aku makan, kamu
  juga harus makan" instead of the absent "yang makan banyak, bayar banyak".
- Thread `c5ec7fa6` payoff window moved from Bab 8-9 to Bab 11-12.
- Thread `408d8dde` lost the unsupported "35 ikan" Bab 8 count and the
  misquoted meal rule.

See GAP-130 for the missing API.

**Verification (OBSERVED):** story-health returns 0 findings and 0 unresolved
for chapters 9, 10 and 11 (`health-ch11-ch9.json` … `-ch11.json`), and chapters
1–10 remain at 0 findings (`health-after2-*.json`). The same three chapters
return 0 findings after the v6 save and source re-pin
(`health-ch11-v6-9.json` … `-11.json`). API read-back confirms 11 chapters,
outline v4 APPROVED with the corrected Bab 3 beat, 4 scenes, 4 facts with
current-version sources, 20 knowledge rows, the story event, the timeline entry
and the corrected promise/thread text.

**State:** Bab 11 is an unpublished DRAFT, now version 6, awaiting the author's
review and publication decision. Chapter 12 is the planned market sale. The
temporary author session used for audited API calls is deleted after this
record.

## Kaisar dari Masa Depan: canon, antagonist and knowledge-boundary repair — 2026-10-26

Data-only repair of novel `e36d568b-aecf-476a-8e3f-f47ca709672b` in workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9` (staging database
`novelforge_acceptance_050b`). No application source file changed; no chapter
text was edited. A verified `pg_dump` was taken before any mutation
(`.nf-artifacts/kaisar-review/backup-before-repair.dump`, 913 TOC entries).

**Baseline (OBSERVED):** 30 OPEN `KNOWLEDGE_BOUNDARY_VIOLATION` findings across
chapters 2 (4), 6 (11), 8 (4) and 10 (11). Four independent causes:

1. Character-state windows were broader than actual chapter presence, which
   put absent characters into the knowledge-boundary cast.
2. Chapter-sourced facts had no `character_knowledge` row for cast members,
   which the rule reports as a violation.
3. One fact (`f521983f`, fish-stunning method) was sourced to chapter 6, where
   the line states only intent ("Saya ingin membuat…"), not the creation in
   chapter 7.
4. Each newly added chapter-sourced fact created a cast-wide obligation, so the
   affiliation facts added in this repair needed their own stance rows.

**Repairs (all audited):**

- 8 `character.state-window-repaired` rows. Windows narrowed/split to actual
  presence (Sofian, Husein, Ketua Penagih, Don Juan). Applied with SQL because
  no API exposes state update/delete; every row carries an `audit_logs` entry.
- 32 `character.knowledge-recorded` rows via the audited API, covering the
  facts cited by chapters 1–10 for each present character.
- `f521983f` source moved chapter 6 → 7 and `availableFromChapter` 6 → 7;
  `fb5742d2` and `e9403711` visibility `NULL` → 10. Audit:
  `canon.source-unlinked` (1), `canon.fact-source-added` (6, five of them
  research links), `canon.fact-visibility-repaired` (3).
- 4 canon entities: Laboratorium Aetherion `90fb3838` and Liku Tenang di Bawah
  Pohon Beringin `c7613107` (LOCATION), Keluarga Pratama `3d4b9c1e` and
  Keluarga Magani `eb0325e6` (FACTION).
- 6 canon facts: `8460bbab` (laboratory location, ch2), `f858b54e` (river
  feature, ch7), `667b4bec` / `a411ecc8` / `d71bdb4a` (Pratama affiliation,
  ch6/ch10) and `cba9530a` (Magani affiliation, ch3).
- 5 research reference links over 4 facts (`f521983f`, `d15ec60d`, `2271cd16`,
  `e9403711`) against the six chapter-6 research references. Two references
  were deliberately not linked: the asam oksalat note has no matching canon
  fact, and the gill/oxygen note explicitly disclaims the story mechanism.
- 2 antagonists via the audited API: `62338cd1` Atasan Juan Cleverton
  (MAIN, CONFRONTATION, ch1–2) and `be4c4e8d` Ketua Penagih Hutang (PERSONAL,
  CONFRONTATION, ch4–null). Neither has been defeated or killed in chapters
  1–10, so `outcome` stays null rather than being invented.

**After (OBSERVED):** story-health returns 0 findings and 0 unresolved for each
of chapters 1–10 (`health-after2-ch1.json` … `-ch10.json`). The author-facing
lists confirm 24 entities, 23 facts, 10 characters and 2 antagonists; Husein,
Anton and Darma list Keluarga Pratama and Sofian lists Keluarga Magani in
"Marga dan organisasi".

**Open author decisions (resolved 2026-10-26):** chapter 8's plan line was
corrected in version 3, Bab 11 became the harvest and Bab 12 the sale, and Bab
10 was left unchanged per the author's decision. See the Bab 8/Bab 11 section
above and GAP-129.

**Working-context fallback:** the Engram MCP is not bound in this runtime; this
section plus GAP-127…GAP-129 is the handoff record.

## Derived intent post-review repairs verified — 2026-10-25

The author authorized repairing the review findings, committing all safe project
changes and pushing main. Production deployment is not authorized by this repair.
Canon summaries now read one RepeatableRead view: live canon only for the exact
checked-out head, otherwise the exact revision's scoped snapshot or an explicit
failure preserving the old artifact. Timestamp attribution is removed; review
also found callers that write canon before creating their revision.

Worker artifact publication and FRESH commit atomically under the exact attempt
lock; expired owners cannot finalize reclaimed work. Failed transitions compare
attempts too. Local ticks share one sweep, and shutdown drains it before closing
the database. Separate read-only review approved the repaired source layers.
Local verification:32database/API cases and the retained13pure cases passed,
with ai-services/API/worker typechecks. Earlier test failures were fixture/import
errors and are recorded in ISSUES. Historical acceptance below is retained, but
its timestamp source approximation and earlier no-commit status are superseded.
The two additive migrations were exercised only in disposable test databases in
this repair; production code/data/configuration remain unchanged.

## Derived rebuild intents: audit end-state, consumer, canon pipeline — 2026-10-25

The author selected ADR-0017 Option B and ordered three phases: (1) contract/
schema amendment plus a read-only status surface, (2) a generic per-projection
consumer, (3) the first real pipeline (`canon`, ADR-0022 / NF-WF-060).
Implemented and verified; **NOT committed** (author has not asked for a commit).

- Contract: dated C6/C7 amendment in STORY-VERSIONING.md; schema comments now
  mark PENDING as terminal for projections without a registered pipeline and
  reserve the lifecycle columns. `GET .../derived-intents` is read-only,
  branch-scoped (`novel:read`).
- Consumer: PostgreSQL as the queue; newest eligible intent per
  `(projection, branch)` claimed by CAS; older eligible intents superseded to
  STALE; 5 attempts with 30s→300s backoff; RUNNING lease reaper; unregistered
  projections untouched.
- Canon: additive `canon_summaries` and two intent lookup indexes; bounded
  deterministic digest; as-of bound fixed to `< next revision.createdAt` after
  acceptance showed the old bound dropped the revision's own three facts;
  `GET/POST .../canon/summary[/rebuild]`.

Acceptance (2026-10-25, `novelforge_acceptance_050b`, 58 migrations): 317
PENDING before; sweep claimed 1 / fresh 1 / superseded 36 / failed 0; canon is
now 1 FRESH (rev 300) + 36 STALE while the other six projections remain
PENDING; one summary row (entity 20, active 17). Read service reports FRESH,
head 312, pendingAfterSummary 0. Worker 14, API 10, story-intelligence 5 and
story-versioning 8 tests pass; affected typechecks exit 0. Independent reviewer:
APPROVE_WITH_FINDINGS, all resolved. The six unregistered projections still have
no derived artifact or rebuild route (ADR-0017 Option B), and no UI consumes the
summary. Closure/limits: [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md)
"2026-10-25 closure — Option B accepted".

## Initial public production release — 2026-10-25

The author explicitly authorized public release at https://novamind.my.id after
accepting the initial release limits. Existing native API/web/worker configuration
already sets NODE_ENV=production and canonical PUBLIC_ORIGIN; HTTPS and autostart
are active. No artificial mode switch, restart or data reset is required.
Task: [public-production-release](../../tasks/public-production-release.md).
Release recorded at2026-10-25T11:00:37Z. Actual API/web/worker process environment,
all six native services active/enabled, readiness and six deployed-source hashes
passed. Real browser verified public browse/novel/chapter, root redirect, sign-in
and registration form, with zero page errors; anonymous session returned401.
Root-private operator receipt was saved and read back equal. No configuration,
story/account/provider changes or service restart was required.
The author will publish further models personally; private cover credentials stay
local. Existing browse/reader noindex policy is retained, so public availability
does not claim search-engine indexing. Earlier staging evidence below remains the
tested deployment baseline, not a separate untested replacement environment.

## Production-readiness completion authorized — 2026-10-25

The reviewed embedding patch is published as `ffd2746`; CI40160422273 SUCCESS,
five runtime files deployed, API/worker ready. Permanent Nemotron1B embedding is
active; actual public HTTPS ingestion indexed the six existing Bab6references
into30finite/nonzero1536-dimensional vectors, with LEXICAL+VECTOR retrieval.
Independent read-back confirmed unchanged original chapter/reference/canon rows.
Operator revocation returned HTTP401 and its temporary app helper was removed.

Author chose manual backup files, no new automated offsite/external alerts, and
release without staging cover generation. A new encrypted manual backup was
decrypted and actually restored into an isolated PostgreSQL database in4.23s
outer elapsed time; source versions/cover hash matched, scratch DB removed.
Recovery key requires the same Windows DPAPI user profile. Manual snapshots do
not establish continuous15-minute host-loss RPO.

The approved larger2,500chapter/25,000canon/10,000memory test FAILED its initial
2s p95 target despite all4,034HTTP200/noOOM. Memory batching alone also FAILED
the mixed workload(4,180HTTP200), with9.67MBcanon responses remaining. The repair
now combines bounded memory reads with actual service/API/UI canon pagination;
183focused tests, affected typechecks/lint and separate review passed. The new
explicitly paginated workload PASSED against the same full-size dataset:
6,000HTTP200/302.23s,20clients, p95canon54.58ms/chapter77.68ms/global98.24ms,
max memory28.37%, noOOM/abort. All25,000facts were traversed before timing.
Commit`cc89901` CI40183753393 SUCCESS; desktopEN/mobileID built-browser paging
passed. Six runtime sources and the388-file web artifact were deployed reversibly;
API/web/worker/router/storage are active and public browse returns200. Owned clone,
Redis15, overlay and browser services were cleaned; original chapters unchanged.
This closes the revised manual-backup/bounded-scale release scope, not continuous
PITR, automated offsite/alerts or staging cover generation. See
[completion evidence](PRODUCTION-READINESS-COMPLETION-2026-10-25.md)
and [task contract](../../tasks/production-readiness-completion.md). Earlier
temporary-only/blocked statements below are historical, not the current embedding
configuration. Human screen-reader acceptance remains separately author-deferred.

## Remaining staging gates: bounded scale and recovery verified — 2026-10-25

Latest embedding result supersedes the blocked8Bparagraph below: author-selected
lighter `openrouter/nvidia/nemotron-3.5-embed-1b:free` passed actual isolated
staging API ingestion and hybrid retrieval through the real local router over a
loopback-only SSH tunnel. Provider honored1536dimensions; optional dimensions now
flow through existing application ports, with ingestion and query both requesting
the storage width. Seven new unit cases and one focused PostgreSQL API regression,
affected typechecks/lint and separate exact review passed.

Two harmless test references/vectors, reported model `nvidia/nemotron-3.5-embed-1b`,
cross-language VECTOR rank1and first fused result, exact source spans, query audit
generation linkage and repeat-ingest skip without another model call PASS.
Three generations SUCCEEDED with33/35/12reported input tokens. No private
manuscript or existing live embedding was changed. Patched source used a reviewed
read-only overlay; live application sources were not replaced or deployed.
Scratch DB/owned Redis15/overlay/tunnel removed and separately read back absent;
no selected model or temporary gateway in the live DB; original chapter rows
unchanged. This is bounded real embedding evidence, not a permanent staging
provider installation. Other unproved release gates below remain separate.

Embedding follow-up: the author explicitly authorized temporary local
`openrouter/nvidia/nemotron-3.5-embed-8b:free`. Exact model exists in OpenRouter's
embedding catalog, but local retry and a staging-origin1536-dimension request
both returned upstream504afterapproximately60seconds, with no vectors. No model
substitution, vector truncation/padding, application contract change or live
embedding replacement. No temporary provider/model/key file was installed;
credential was used in process memory only. Final read-back PASS: key absent
from16checked files/recent router journal, original2connections preserved,
temporaryOpenRouter connections and selected-model database rows both0.
Earlier pending-authorization wording below is historical for this selected model.

At source baseline `6d9e25c`, the author approved an isolated structural
2,500-chapter read workload:20virtual users/five minutes,p95<=2seconds,
servererrors<1%,noOOM, abort on85%memory or main-service failure.
Actual API result:6,000requests,allHTTP200,worstp95104.64ms,maxhostmemory29.76%,
OOMcounterdelta0. Actual loopback API/DB/Redis were used; no fake gateway claim.
Canon/memory remain the small source dataset; this is not full M8 or LLM load.

New evidence also passed: consistent router SQLite backup/integrity/restore,
PostgreSQL cover-payload restore with original327,440-byte hash, encrypted Windows
off-host recovery using saved/read-back DPAPI key, and tamper refusal. On-demand
monitor checked live readiness/services/authenticated catalog/archive freshness;
an actual bad-port control failed as expected. Five focused new Linux tests and
independent exact reviews passed. Seven live queues had no pending/active/delayed
or failed work. Scratch API stopped, owned database dropped, Redis15 emptied;
live original chapter-row hash unchanged. Private archives remain ignored.

Earlier embedding blockage is retained historically: the resident catalog is
empty, Qwen returned500and the selected8Bmodel returned504. The later lighter
1Bmodel proved the bounded flow in isolation, then its temporary setup was removed.
Unattended offsite schedule, external alerts, PITR and full-size memory/canon
load remain separate. No new commit/push or general production approval.
See [report](STAGING-EMBEDDING-SCALE-OPERATIONS-2026-10-25.md) and
[task](../../tasks/staging-embedding-scale-operations-acceptance.md).

## Real local novel and cover acceptance — 2026-10-24–25

One private staging copy of *Kaisar dari Masa Depan* is available in the owner's
original workspace. Reviewed INSERT ONLY transfer:43 tables/1,035 rows,
10 chapters/18 versions,10 characters,14 canon facts and6 references. Native
clone rehearsal, exact row read-back, collision refusal and fresh checkpoint
48ff3ced-ff30-453c-a7bd-9004d18561b2 passed. Local source comparison confirmed
all selected rows unchanged. Old publications/reviews/snapshots/credentials
were excluded; staging novel/chapters remain DRAFT.

Correct modern chapter workflow66d0f5c1-7f7a-4c52-86de-b6928714f5ee produced
a1,261-word Indonesian alternative using actual Qwen3.8Max after generation,
two corrections, review and extraction. Browser preview matched the saved
artifact. Status is AWAITING_APPROVAL: one minor final finding remains, not a
clean/human-approved review. Independent automated review confirmed prior
grounded fixes;16/19 citations contiguous, all23/23 newline/omission-separated
fragments matched. One citation silently joins excerpts across omitted text.
Original Bab10 remains1,484 words/version1; canon14, publications0. Historical
failed requests and the prior1,309-word candidate remain retained. Planner,
writer/continuity defaults now use working Qwen; historical mappings retained.

Real gpt-image-2 cover succeeded after repairing a missing staging POST route
and isolated router build. Image327,440 bytes, hash18a0cb82…61d2a5d0; normal
apply and saved-image read-backs matched. Temporary provider, upstream key,
NovelForge gateway/models/mappings removed and verified; original provider/key
IDs preserved, SQLite/WAL/journal/preimage scans clean, image still readable.
Desktop/mobile editor/references, cover studio and tenant boundary checks passed.
All five services active, no active jobs or temporary gateway/catalog entries.

This proves the recorded real-data staging flow, not every production release
gate. Embedding-backed retrieval, full scale/load and remaining off-host/PITR/
router+image backup/external alert acceptance are not newly proved. Author
approval and deferred human screen-reader acceptance remain separate. No
commit/push; existing WIP/stash preserved. See
[real-novel acceptance](STAGING-REAL-NOVEL-ACCEPTANCE-2026-10-24.md),
[task](../../tasks/staging-real-novel-and-temporary-cover-acceptance.md) and
[issue register](../implementation/ISSUES-AND-GAPS.md).

## MiniMax retest after author-reported peak-time — 2026-10-24

The author requested a working alternative to DeepSeek/GLM for current testing.
Peak-time is author-reported context, not independently proved failure causality.
Live MiniMax nested-JSON probe passed, normal stop, reported
`MiniMaxAI/MiniMax-M2.7` (151 input/491 output tokens). Separate exact review
approved the atomic operator change before activation: six DeepSeek/GLM mappings
disabled, six `bansosinfoapi/gw/gonka-minimax-m2.7` mappings enabled at the same
priorities. IFM planner/writer/classifier primary routing remains intact. That
activation retained twenty-five mappings/nine enabled. Root-private preimage 921,864 bytes,
TOC validated; no new restore drill. Timeouts/validators/source are unchanged.

Native extraction-only retry `780701bd-67d2-4114-8e6b-9b5e1157cf42` failed its JSON
contract despite a fast 5,278ms response: 256 reported output tokens cut the
response inside `<think>` before final JSON; pinned maxTokens was null.
The reviewed capacity helper then created immutable version 2 for only the
isolated workspace's voice-style-reviewer, final-reviewer and chapter-extractor,
setting maxTokens4096 and preserving all other content/configuration. Native
API field/history read-backs passed; preimage 930,980 bytes, TOC validated.
This sets request output capacity, not quotas. Fresh full run
`8d49c5fd-fd30-4c79-aa15-861d6b5fdc9b` passed compile/plan/write/voice-style review
and their validators with all three version2/maxTokens4096 pins confirmed from
the live database. Final review FAILED because MiniMax echoed the schema and
placed the data under `$_instance`, despite explicit instance-only instructions.
No unwrapping or fabricated acceptance. Qwen3.8Max's real nested JSON probe passed
(reported qwen3.8-max, normal stop, 784 input/105 output tokens). A reviewed,
backed-up role-specific change then activated Qwen3.8Max for final review and
extraction, retaining MiniMax continuity review and IFM primary routing. Current
total twenty-seven mappings/nine enabled; DeepSeek/GLM and old Qwen3.7Plus remain
disabled. Pre-change archive 947,434 bytes, TOC validated.

Native retry `73681068-c85e-4352-8e94-e2a1b7517856` reached SUCCEEDED after final
review, extraction, validators and an explicitly labeled automated test-actor
approval. Fifteen reused prefix steps matched the failed parent exactly (outputs,
statuses, generation and definition-version IDs). The successful test lineage
used IFM plan/write (2,812ms/5,184ms), MiniMax continuity review (93,456ms),
Qwen3.8Max final review (23,618ms) and extraction (17,851ms). Final review:
needsCorrection=false, five findings. Six extraction proposals have citations;
all fifteen ellipsis-separated citation fragments match the draft artifact
after whitespace normalization, including one citation to its title metadata.
This is not a semantic canon approval or a claim of perfect literary quality.
The alternative test draft is 595 words and remains unapplied. Saved original
682-word title/content/version1/DRAFT read-back passed. No publication or human
acceptance; this proves normal source-checked retry completion, not an uninterrupted
fresh run with no failures. Other custom agents were not updated or accepted.
Preserve the saved original 682-word chapter/version1/DRAFT. Earlier
DeepSeek/GLM routing below is historical; no failures were removed.

Engram fallback history: one capacity/run update was blocked by the host
PreToolUse hook, `spawnSync engram.exe ETIMEDOUT`. The local handoff retained
the state; a later attributed update of checkpoint627 succeeded. Confirm the
final checkpoint/summary read-back before handoff. No hook failure was suppressed.

## Qwen replacement and fresh AI verification — 2026-10-24

Author explicitly authorized replacing Qwen and repeating the latest workflow.
Real nested-JSON probe for `bansosinfoapi/gw/gonka-deepseek-v4-flash` passed,
reported `deepseek-ai/DeepSeek-V4-Flash-0731`, normal stop, 202 input/113 output
tokens. Independently reviewed operator transaction activated six DeepSeek
mappings at Qwen's former priorities and disabled, rather than deleted, all six
Qwen mappings. IFM routing is unchanged. Eighteen mappings retained/nine enabled;
six-profile author options read-back verified nine choices, six DeepSeek/zero
Qwen. Root-private pre-change archive: 885,515 bytes, TOC validated (not a new
restore drill). JSON capability marker reflects the real probe, not full role
acceptance. No account, manuscript or validator changes by the routing helper.

Fresh run `bd571841-9d38-46dd-87c1-cb4f553375ca` FAILED at write after a successful
IFM plan: IFM then DeepSeek fallback both returned TRANSIENT at about 60 seconds.
Router source confirmed its response-header wait defaults to 60,000ms, while
NovelForge allows 180,000ms. An independently reviewed, reversible systemd
drop-in now sets FETCH_CONNECT_TIMEOUT_MS=150000. Only the gateway restarted;
readiness and active process environment passed read-back. This changes a timing
boundary, not validators, retry counts or provider credentials. The initial
installer cleanup race was fixed before activation and independently re-reviewed.
Run `f76bade4-2209-406f-985e-6ad015d47ec2` passed planning/writing and both
DeepSeek reviews/validators; the reviews succeeded at 118,059ms / 97,878ms.
Extraction then failed TRANSIENT at the NovelForge client deadline, 180,002ms.
The gateway's supported request timeout is now 300,000ms via a separately
reviewed, guarded/audited transaction with a root-private preimage (904,391 bytes,
TOC validated). Router header wait remains 150,000ms. Native retry child
`b77920df-65f1-4b04-bd9f-bb397c166b66` reused all 17 prefix steps, then FAILED
extraction validation: returned JSON was truncated mid-string, 256 reported output
tokens at 276,833ms; no missing fields were invented. The deeper upstream output
default/stop cause remains unconfirmed (agent maxTokens=null).
GLM Flash passed a normal-stop nested JSON probe (510 output tokens), then a
reviewed transaction changed only STRUCTURED_EXTRACTOR to
`bansosinfoapi/gw/gonka-glm-5.3-flash`. Nineteen mappings retained/nine enabled;
author options now contain five DeepSeek/one GLM/three IFM entries, zero Qwen.
Pre-change archive 913,320 bytes, TOC validated. Retry child
`69a4f5f4-efa4-4b96-a3cf-c55e5a42a57a` FAILED extraction TRANSIENT at 300,001ms,
reported serving model unknown. No more unchanged requests were submitted.
Qwen replacement is implemented; full current workflow acceptance remains OPEN
for extraction. DeepSeek reviewer success does not establish extractor success.
Next: isolate the extractor's actual upstream stop/default-output behavior and
verify explicit output capacity against its exact schema before another full run.
Do not invent a provider token cap or silently repair truncated JSON.
Final read-back: nineteen mappings/nine enabled/zero enabled Qwen, gateway
timeout300000, one SUPER_ADMIN, fixture publications zero, all five services
active. Saved 682-word chapter content/title/version1 are unchanged, DRAFT.
The new 602-word test draft remains unapplied; no canon approval/publication or
human acceptance. No commit/push; existing stash preserved.
A fresh unit configuration backup is root-private; no router source-code change
was needed. The exact timeout drop-in is
`/etc/systemd/system/akanesia-router.service.d/20-novelforge-text-timeout.conf`;
rollback removes only this newly created file, daemon-reloads and restarts the
gateway. Database routing/timeouts have separately retained audited preimages.
The initial start correctly refused the synthetic IN_REVIEW chapter with 409.
Source confirms the chapter-creation workflow requires DRAFT. A guarded normal
status API transition returned only that fixture to DRAFT, retaining exact
saved prose/title/version 1; source-pinned start then succeeded. New run uses a
separate private receipt; earlier failed runs and evidence remain retained.
Do not infer completion or apply alternative prose over the saved 682-word text.
No commit/push; images/covers remain excluded.

## Owner registration and public reader staging proof — 2026-10-24

The author explicitly authorized automatic registration using local account data.
The exact `ch0c01d.xyz@gmail.com` identity and Argon2id password hash were imported
from the active Windows acceptance database; server read-back matched the hash.
This is the only SUPER_ADMIN (one total). Local data was read-only; manuscript,
workspace data, provider credentials and existing sessions were not transferred.
Plaintext is unavailable: actual owner-password login was not observed. Fresh
operator-issued sessions tested authenticated administration, not human acceptance.

Observed: five admin API reads 200; wrong password 401; branding save 200/stale CAS
409; six admin tabs, searchable profile-model selector and 390px mobile layout
passed in Chromium without page errors. Branding remains Novamind / N / #1c1207;
same-value CAS checks advanced its version to 3. The first browser helper stopped
on an asynchronous form-read race; an explicit enabled/value wait completed the
remaining checks. Both newly issued owner-test sessions were revoked and HTTP
read-back returned 401. Pre-import root-private archives remain retained.

The isolated synthetic chapter passed final-text review and temporary publication.
Anonymous published text/title matched the saved version exactly; unpublished
chapter 1 stayed 404. Bookmark/follow create/list/remove and older-progress-write
nonregression passed. Actual reader settings, searchable chapter list and comment
modals passed at desktop, with mobile settings layout checked at 390px. Test
comment deleted (204), chapter unpublished (200), public chapter now 404. Saved
682-word text and version 1 are unchanged; lifecycle status is now IN_REVIEW.
Private helper schema/status/wrapper assumptions were corrected against source;
these are not product defect claims. Ordinary test session logged out (200).

Fresh combined-policy run `64ee85a0-8e46-494b-971c-d15e597162e7` passed compile,
plan, write and their validators, then FAILED review_vs with gateway temporarily
unavailable. Persisted attempts attribute planner/writer success to IFM; Qwen
review failed TRANSIENT after 73,410ms with no reported serving model. No approval
or replacement text was applied. Recent router logs contain HTTP 502 failures;
all five app/router/nginx services are active. The latest failure's deeper
provider cause is unconfirmed; earlier connect-timeout evidence is historical.
Current combined-policy full-workflow acceptance remains OPEN for provider
availability. Earlier complete Qwen workflow proof retains its original scope.

Images/covers excluded by author; embedding remains untestable with catalog zero.
Human acceptance, offsite recovery and production release remain separate gates.
No commit/push. HEAD `9d82964` and existing stash preserved. Private receipts:
`.nf-artifacts/staging-owner-test-receipt.json`,
`.nf-artifacts/staging-reader-journey-receipt.json`, and the final-policy workflow
receipt. Earlier absent-owner/unpublished-test descriptions below are historical.

## Automatic staging configuration and real chapter proof — 2026-10-24

Final routing: IFM is primary for CREATIVE_WRITER, DEEP_PLANNER and FAST_CLASSIFIER,
with Qwen fallback. Qwen is primary for CONTINUITY_REVIEWER, LONG_CONTEXT_REVIEWER
and STRUCTURED_EXTRACTOR. Twelve mappings are retained, nine enabled; IFM's three
unproven reviewer/extractor mappings are disabled. This replaces the interim
all-IFM-primary policy after its actual review_vs output omitted required evidence
versions and correctly failed validation. Its planner/writer contracts and actual
classification API passed. Do not claim the new combined policy passed a complete
fresh workflow: Qwen's two observed upstream connect timeouts remain unresolved.
The earlier complete Qwen workflow proof below remains valid for that snapshot.
All operator configuration changes were separately reviewed, privately backed up,
atomic and explicitly audited without account/role changes. Initial bootstrap used
an advisory lock; subsequent routing transactions added bounded table locks. The saved
682-word draft is unchanged. Validators and application source were not modified.

Initial activation: separately reviewed operator bootstrap COMMITTED on the
staging database (not a Git commit): one encrypted gateway, 251 catalog models,
six primary Qwen text-profile mappings and one IFM creative fallback. Branding
read-back is Novamind / N / #1c1207 / version 1. No account or role changed.
Root-private pre-configuration PostgreSQL archive retained. Initial advisory-lock
void-result P2010 aborted with zero gateway/mapping rows; a text cast retained
the lock and passed a focused live probe, separate re-review, then activation.
Actual AI chapter-creation run reached SUCCEEDED for isolated fixture chapter 2.
Seven model attempts succeeded across planning, writing, review and extraction,
with requested/reported model attribution retained. A stale approval was rejected
with 409 before an explicitly labeled automated test-actor decision. The final
682-word draft, "The Rain Beneath the Bridge", was applied as version 1/DRAFT;
exact content/title read-back and actual Chromium desktop/mobile editor visibility
passed. No publication or canon approval, and no human author sign-off inferred.

Author authorized automatic gateway/catalog/text-profile setup, name Novamind
through platform settings, and testing except images/covers. Main-account
registration is absent. The account-based helper stopped before mutation;
operator first-install configuration proceeded independently without account
creation/elevation, with a truthful null-actor maintenance audit and atomic DB
transaction. Prepared ignored helpers: `.nf-artifacts/staging-bootstrap-config.mjs`
and `staging-bootstrap-config-run.py` (root-private database snapshot; execute
application imports as the verified `novelforge` account). Separate review approved
the exact helper and its focused advisory-query correction. Embedding catalog is
empty; no fake embedding mapping. No image/cover discovery or generation performed.

Isolated audit workspace now has the starter agents/skills, AI chapter-creation
workflow, reserved chapter 2 and a synthetic approved outline via actual HTTPS
APIs and internal checkpoint flow. This is test-fixture approval, not human
acceptance or the author's manuscript. `.nf-artifacts/staging-text-journey.py`
prepare passed. Final browser checks verified nine selectable options across six
explicit text profiles, public branding, ordinary-user admin refusal, and no mobile
overflow or page errors. Earlier missing-horizon/outline-node fixture failure was
corrected through planning APIs before starting a fresh source-pinned run. No
application code change or commit/push in this configuration follow-up.

Engram initially failed with host-hook `engram.exe ETIMEDOUT`; a later update to
621 succeeded and was read back. Retain that failure as history. Final checkpoint
must contain the completed workflow result before handoff. Remaining: actual owner
registration/admin setup, a real embedding-capable route, and separate publication/
release/offsite recovery acceptance. Following provider-refresh/audit paragraphs
describe earlier snapshots; their empty-configuration prerequisite is superseded.

## Staging provider refresh verified — 2026-10-24

The author removed RadoxAI and requested a fresh check. Observed replacements:
active `bansosinfoapi` and `bansosifm` connections; actual catalog 251 models,
zero RadoxAI entries. Through NovelForge's existing adapter, real JSON generation
and streaming passed with `bansosinfoapi/gw/qwen3.7-plus`. A separate real nonce
probe passed with `bansosifm/IFM/K2-Horizon-375B-A23B`, finishing normally.
The prior RadoxAI balance blocker below is historical, not a current blocker for
these successfully tested routes. No provider configuration was changed.

NovelForge's gateway/model/profile-mapping tables remain empty. Next: establish
the author's account/admin and application gateway/profiles, then verify the full
chapter/publication journey. Adapter connectivity is not integrated acceptance.
The first IFM probe hit its small output limit; it was classified incomplete,
then one bounded probe with a larger response allowance finished with `stop`.
No commit/push or release approval is implied.

## Direct staging audit — 2026-10-24

Author supplied `https://novamind.my.id` and authorized SSH audit/fixes on the
dedicated staging host. Baseline HEAD `9d82964`; copied deployment initially
matched 797 tracked application/package files and has no Git metadata.
HTTP origin protection, bounded proxy trust and loopback listeners are now
repaired and active. Separate exact-diff security and backup reviews approved;
focused tests/types/lint passed. Actual HTTPS login, editor desktop/mobile,
tenant isolation, stale-save rejection and private draft boundaries passed.

Daily PostgreSQL archive is scheduled; a real restore into a disposable database
matched all 106 table counts and 56 migration records before the scratch database
was dropped. A mismatched Garage secret was corrected with a private configuration
backup; authenticated PUT/read-back/DELETE passed without changing existing data.

Author confirmed RadoxAI setup. The actual adapter reads 273 models, but a real
generation request was rejected upstream with 402 insufficient balance. NovelForge
persisted gateway/model/profile setup remains empty; router setup alone does not
configure application profiles. Real chapter/publication acceptance remains open,
along with owner setup and independent offsite recovery. No production release
approval or commit/push. Repairs are active on staging but remain uncommitted;
redeploying baseline source would remove them. See
[the audit record](STAGING-AUDIT-2026-10-24.md) for proof and remaining limits.

## Showcase revision: 60fps and feature exploration — 2026-10-24

Supersedes the initial 30fps artifact below. Author requested smoother video and
more interaction, then explicitly asked to continue. Same two local deliverable
paths now contain a 15-second 1080p60 H.264/AAC film and a standalone interactive
HTML. Original music retained. Video was rendered at 900 distinct timestamps;
all decoded frame intervals are 1/60 second, with actual consecutive-frame motion
verified in five scene regions excluding the frame counter. Full decode and six
source/decoded-frame comparisons passed; decoded audio peak remains -0.82 dBFS.

HTML adds Watch/Explore modes, five scene jumps, nine feature descriptions,
hotspots, embedded-image detail dialogs with next/close, pointer parallax and
keyboard navigation. Offline desktop/mobile checks passed, including dialog focus,
reduced-motion behavior and async Play/Pause/Play race regression. Independent exact
artifact review approved. Images/music remain embedded; no network dependencies.
The previous version is preserved in ignored local artifacts. No application/data
changes or commit/push. Verification remains Chromium-scoped, without acceptance
of subjective music quality, human screen-reader behavior or the author's player.

## Offline motion showcase — 2026-10-24

Author requested a 15-second motion showcase in video and standalone HTML,
with music composed and synthesized from scratch. Deliverables are local at
showcase/novelforge/index.html and novelforge-showreel.mp4; no commit/push requested.
The stone/orange/literary design uses reviewed product captures and vector motion.
Original 128 BPM stereo score uses generated tones/noise, without music samples.
Verified: H.264 1920x1080, 30fps/450 frames, AAC 48kHz stereo, exactly 15 seconds;
complete decode; six decoded frames compared with source; audio peak -0.82 dBFS.
Chromium offline player checks passed: playback/end/replay, seek, pause/mute,
keyboard sound toggle, fullscreen, no autoplay and 390px layout without overflow.
Independent visual/player review approved; other browser engines and subjective
audio listening were not verified. No application data or services changed.

## README screenshot gallery — 2026-10-23

Author requested interface/feature screenshots and authorized commit/push.
README now links six visually inspected existing development captures, copied
unchanged into docs/screenshots with provenance: chapter workflow, language
suggestions, AI Studio, public novel details, mobile covers and reading settings.
Examples are explicitly illustrative; no fresh runtime or acceptance claim.
Documentation/assets only; no live data mutation or generation required.

## CI fixture compatibility repair verified locally — 2026-10-23

GitHub39971942675 at3a4d9dd passed lint/typecheck but failed83tests/10suites.
Nine test fixtures now match current production contracts: canonical embeddings
capability, role-based agent/user prompt checks after safeguard injection, real
target chapter fixtures, and saved chapter1 for post-restore determinism rather
than a blocked draft predecessor. Safeguard presence, original output hashing,
approval/citation/authorization assertions remain; no production guard weakened.
Test Redis endpoints honor supplied environment for isolated execution.

Local proof: ten affected suites250PASS/1FAIL before the last fixture correction;
then the complete corrected author-preview suite3PASS. API types/scoped lint and
diff check PASS; separate final nine-file manifest APPROVE. Two task-owned
disposable PostgreSQL/Redis containers reused cached Docker images; existing
working stack and104databases untouched. Remote CI confirmation follows the
repair push; this paragraph is local evidence, not a claim of green GitHub CI.

## Accumulated authoring update prepared for publication — 2026-10-23

Author explicitly authorized committing/pushing the remaining project changes
after README6fe8d80. Final integration includes character identity/discovery and
author-reviewed story suggestions, shared chapter context/safeguards, cover
retention, reader controls/public presentation, branding, embedding catalog and
reference details, plus failed-step/settings recovery. README now describes these
as included development features. Four additive migrations are included; prior
local application/rehearsal receipts remain retained, not repeated on working data.

Fresh verification: all129web suites/893tests PASS; six isolated API suites/64tests
PASS, AI core146, text safeguard1 and restore-scope8 PASS. API/web/worker/services
typechecks, root lint and diff check PASS. Backend62file and frontend62file final
source manifests independently APPROVED. Review found and fixed late comment
report responses crossing closed/reopened views and proposal edits remaining
enabled during pending save. Deferred-response/field-lock regressions PASS.
Initial web run's two stale ChapterActions warning-copy assertions corrected
without changing payload/nonmutation proof; final full web rerun passed.

Publication excludes private imports/evidence/backups and author screenshot
capt.png (now ignored); existing stash retained. API test receipt confirms all104
preexisting databases remain and no scratch databases remain. No working story,
model mapping, service restart, deployment or human acceptance performed here.
Full backend/E2E suite, fresh OS install, production build and new CI outcome are
not claimed. Engram writes recovered after the earlier transient hook timeout.

## README installation refresh published — 2026-10-23

README-only commit6fe8d8025335e90d268bc3199d84f5f14826b068 pushed to origin/main;
remote hash matches local HEAD. Features, explicit local-WIP distinction and
Windows/Linux/native/Docker-assisted installation updated. Separate exact review
APPROVE, 20 relative links/entry paths verified; Prisma validate, Compose config,
Prettier and diff checks PASS. No fresh OS installation, full suite, CI monitoring
or deployment performed. Unrelated WIP/stash preserved, index empty.
Engram checkpoint600/summary601 saved and read-back verified. Subsequent conflict
judgment/update hit PreToolUse engram.exe ETIMEDOUT; writes blocked, so final
relation review remains pending. Correction to memory's count: final status has
136 remaining dirty paths, not135. This is the fallback handoff for that memory
failure; do not infer lost checkpoint data or repeat the successful push.

## Model configuration failure recovery action verified — 2026-10-23

Author run5395b845 failed at plan before model dispatch because selected model
was not enabled/compatible. Direct step retry remains correctly refused; the
writer failure panel now offers Review settings & try again / Atur model & coba
lagi. It reuses the existing scoped loader for prior notes/model choices, scrolls
to generation settings, and explicitly explains starting a new process from the
beginning after review. No automatic retry or model mapping changes.
41 focused UI tests/web types/diff check PASS, independent exact review APPROVE.
Actual main ID1440/EN390 browser confirms visible action and settings preparation,
zero mutation requests/page errors; screenshots inspected. Original failed run
unchanged/no generation; temporary session removed. Private retry-config-browser
receipt retained. No commit/push, story mutation, full-suite or human acceptance.

## Failed AI step retry and brighter selection verified — 2026-10-23

tasks/workflow-step-retry-and-selection.md completed locally. Writer/AI Studio
offer an explicit localized retry when server evidence permits it. A deterministic
audited child reuses successful steps, pinned definitions/models and unchanged
chapter source; original failure remains intact. Duplicate/uncertain submissions
return the same child; terminal children are not requeued. Authorization, changed
source/configuration, deterministic validation and approval safety stay enforced.
Selected text now uses brighter house orange with dark text in editable controls.

Proof: independent UI/backend APPROVE; 10 actual PostgreSQL/service/executor/HTTP
tests and 34 existing executor tests PASS, 24 focused web tests and corrected
11-case retry test PASS; API/web types and scoped backend lint/diff check PASS.
Real gateway retry on disposable copied story reached AWAITING_APPROVAL with five
prefix steps unchanged, one retry audit and zero author decisions. ID1440/EN390
browser retry and input/textarea Ctrl+A selection PASS with no page errors;
screenshots inspected. Receipts: .nf-artifacts/workflow-retry-live-receipt.json
and workflow-retry-browser-{id,en}-receipt.json. Clone dropped/Redis12 emptied;
main failed run untouched, no approval/application/publication. API8324/ready200,
workflow36196 activated when idle; Nuxt3001/browse200. Temporary main session
removed. Stash/WIP/Docker data retained; no commit/push/full-suite/human acceptance.

## Platform identity and reference indexing verified — 2026-10-23

tasks/platform-identity-and-reference-indexing.md implemented locally. Admin has
an Identity tab for platform name, logo letters/case and foreground color with
preview/color picker; settings use validated SUPER_ADMIN CAS and atomic audit,
safe public projection and shared branding across five headers. Reviewed additive
branding migration passed backup/restore/rehearsal and actual PostgreSQL auth/CAS
proof before main application. Default branding remains unchanged.

Reference detail crash fixed at actual API versions[] contract; saved content is
now readable in a safe bounded scroll region. Six previously DRAFT Chapter6
references are ACTIVE with30chunks and real1536-dimensional embeddings from
openrouter/openai/text-embedding-3-small. Author LEXICAL+VECTOR search10exact-span
hits PASS; reader withholding and repeat-ingest skip without model calls PASS.
Only EMBEDDING mappings changed (preimage retained); other profiles/story hashes
unchanged. Newly discovered unverified catalog rows, including Gemini, disabled.

Proof:29retrieval API,16branding/catalog API,27research UI,24identity/locale and
8restore-scope tests PASS; retained builder112core tests and selected60web PASS.
API/services/web types, scoped TS lint/diff check, independent final source review
and actual EN1440/ID390 admin/reference browser proof PASS. All6details open with
no page errors. Temporary sessions removed; clone proofs dropped. Private receipts
chapter6-index, platform-identity-activation, platform-branding-db-proof and
identity-reference-browser under .nf-artifacts. API6216/ready200, Nuxt35384/browse200;
workers38544/29380 preserved. No commit/push/full-suite/human acceptance claim.
Earlier DRAFT/indexing-unknown paragraphs below are historical, superseded here.

## Chapter 6 research references filled — 2026-10-23

tasks/chapter6-research-references.md: six Indonesian novel-scoped entries saved
through live reference API in the owner's Kaisar workspace, all version1 DRAFT.
Five source-backed research records cover Persicaria, polygodial/drimane,
warburganal, oxalic acid and respiration; one guide preserves intentional fictional
Rumput Tuba effects. Source review APPROVE; exact API content/source/scope
read-back PASS. Story/manuscript/publication/canon/character/revision snapshots
unchanged, temporary session removed/absence verified. Private receipt:
.nf-artifacts/chapter6-research-receipt.json. No product code changes/commit/push.
Indexing not attempted: existing EMBEDDING mappings advertise no embedding
capability; compatibility remains unknown. References are visible in the library,
but automatic AI retrieval/activation is not claimed. See the issue register.

## Shared public top bar polished — 2026-10-23

tasks/public-site-header-polish.md implemented locally: aligned sticky desktop
header, mobile navigation toggle, language menu and confirmed-session account/
profile/logout with Super Admin entry. Reuses existing components and auth API.
10 focused tests, web types, scoped TS/locales lint and diff check PASS. Actual
API/browser eight guest/admin/author EN/ID desktop/mobile combinations PASS,
including320px opened dropdown bounds, Escape/focus, profile, sticky and logout.
Independent review APPROVE after correcting mobile language dropdown width.
Evidence: .nf-artifacts/site-header-browser-receipt.json and site-header-*.png.
Both task-owned sessions removed and absence verified. Existing data/services/
stash preserved; no migration, restart, commit or push. Full suite and human
screen-reader acceptance unclaimed; author visual acceptance remains separate.

## Public covers, novel details and skewed discovery tags — 2026-10-23

Author screenshot follow-up: fixed narrow desktop-card genre stacking by placing
genres in a full-width row below cover/title, with content rating separate in the
footer.11 discovery tests PASS and actual ID1920/EN1440/ID390/ID320 browser geometry/
screenshots PASS (horizontal genres, no overflow/errors). Independent source review
APPROVE, NovelCard SHA2567cc3b1300923ba1feff7f71c3709d0fa592b805f00c5dc23e4eb326635be7cb0.
Evidence: .nf-artifacts/genre-card-layout-receipt.json and genre-card-*.png.
No backend, data, localization, service restart, commit or push in this follow-up.

tasks/public-novel-presentation.md is implemented and locally active. Browse
cards now show the applied cover via a public image URL, with gently skewed genre/
rating chips and upright text. Public novel pages show cover, explicit public
synopsis, genres/rating, author, published chapter count/date range and start/resume
reading. Missing cover/synopsis/genre states do not fabricate metadata.

Novel details now includes an author-editable public synopsis, separate from private
planning. The capability/tenant/CAS-checked save preserves other JSON settings and
cover atomically, with metadata audit. Current Kaisar publicSynopsis is unset;
the author can supply it through Novel details. No planning text was made public.

Visibility repair: the earliest ACTIVE slug owner must have a published publication
before any public novel metadata is returned. Public covers enforce that rule
before conditional304, reject stale hashes and validate bounded image bytes.
No private settings, image payloads in lists, workspace paths or planning content
are exposed by the new projection.

Observed proof: API24 public-discovery +14 public-reader, web30 focused cases;
API/web types and scoped lint PASS. Independent public_presentation_review APPROVE
with exact source hashes in the task record. Actual anonymous EN1440/ID390/ID320
browser and API proof PASS on current Kaisar data: cover decoded in both views,
conditional304, five tilted tags, no overflow/page errors and correct published
navigation/empty synopsis. Private receipt/screenshots: .nf-artifacts/public-*
and public-presentation-browser-receipt.json. API PID41788 /ready200; main story
and publication data unchanged. No migration, LLM call, commit or push performed.
Whole-suite/human screen-reader acceptance remains unclaimed.

## Shared AI safeguards, story proposals, cover retention and reader — implemented locally, 2026-10-22

This completion record supersedes the design-only/unfinished statements below
for tasks/shared-ai-and-reader-design-amendment.md. Historical records remain
as evidence of the implementation sequence. HEAD remains 32fe443; uncommitted
work and stash nf050b-acceptance-wip are preserved. No commit/push performed.

- Reader: floating controls, settings/chapter/comments dialogs, device preferences,
  selection/touch guards, published chapter navigation and EN/ID mobile layouts.
  Root opens /browse; writing library is /author; /login redirects to /sign-in.
- AI: versioned shared text safeguards cover ordinary/streaming requests and
  preserve custom definitions and policy provenance through orchestration.
- Groups/research: evidence-bound Approve/Edit/Reject, existing identity/reference
  search, character affiliation projection, structured role correction, source CAS,
  scoped permissions and checkpoint/restore. References remain draft/source notes;
  neither scientific verification nor world canon is inferred from a quotation.
- Covers: unused candidate removal, current plus two previous distinct recoverable
  covers, active/reference protection, durable metadata and explicit expired state.

Observed checks across the amendment: 55 reader/routing web cases; 51 AI, 19
orchestrator and 1 policy case; 10 story-discovery DB/HTTP, 15 character regressions,
12 worker, 8 restore-scope and 7 proposal UI cases; 28 cover DB and 12 cover UI
cases. Package type checks and scoped lint passed. These are focused executions,
not a claim that the whole repository suite was rerun.

Actual browser/API receipts cover reader EN1440/ID390/ID320, touch/selection,
comment persistence without navigation, report focus/Escape, settings persistence,
and proposal edit/reject/read-back EN1440/ID390. Actual gateway policy generation
ceb7049d-6ee7-489b-a19b-b8fac4e5125e passed. Story extraction generation
bdba7ccd-b025-43ca-bcc2-8ec82751bd30 returned three research suggestions; its
captured response passed the repaired source-spelling validator without another
model call. That revalidation is distinct from a fresh live request. All story
approval/edit/reject proofs used isolated databases; no main draft was approved.

Independent reviewer /root/amendment_final_review returned APPROVE for the exact
submitted source after two P2 fixes and smaller race/preview repairs. Review
included A/B/C/D; it is source review, not human author or screen-reader acceptance.

Local activation verified: migrations 20261022020000 and 20261022030000 applied;
API12872, workflow38544 and cover29380 restarted using the existing runtime entry.
API /ready and Nuxt /browse respond200. Each queue has one worker, no pending
work, and is resumed. Authenticated read-back confirms new cover expiry and
character affiliation contracts plus the story-discovery route; its temporary
session was removed. Main story fingerprint is unchanged before/after migration.

Recoverable private backup: .nf-artifacts/shared-amendment-pre-rollout.dump,
5,013,497 bytes, SHA256 ed55d778a569d58b4d66ef149037ca6b507dc3fdb2160b2f4590b0b68e0d78ce;
restore proved 1 novel/10 chapters/24 versions/2 users/3 cover versions in an
isolated clone. Receipts: shared-amendment-backup-receipt.json,
amendment-rollout-receipt.json, amendment-runtime-readback-receipt.json,
story-live-clone-receipt.json and story-ui-proof-receipt.json under .nf-artifacts.
Retain this backup: reversing code alone cannot recover expired image payloads.
Temporary reader/story APIs and their two explicitly owned fixture databases
were removed after proof; the main Docker stack, backup and receipts remain.

Remaining acceptance: author inspection of the new workflows; human screen-reader
acceptance remains separate/deferred. No source blocker remains in this amendment.

## Reader and proposal UX amendments consolidated — 2026-10-22

See tasks/shared-ai-and-reader-design-amendment.md (PROPOSED, no product changes).
Captures author-requested floating reader controls, settings/chapter/comments
modals, default /browse and manual login navigation; character-like group/source
proposal decisions and Character group links. Current root author library creates
a routing conflict; /author plus /login alias is the proposed compatibility fix.
Shared design remains the writer-workspace template, not the screenshots' palette.
Read-only source inspection only; implementation/rendered acceptance not claimed.

## Shared safeguards proposal and chapter6 source gap — 2026-10-22

Author clarification: Rumput Tuba is fictional; its weaker, temporary
incapacitating effect is intentional worldbuilding, not a real-world scientific
claim to reject. Safeguards must preserve that author instruction and validate
internal story consistency. The audit below predates this clarification. No
chapter/canon database changes or external-source claims are authorized by it.

Read-only inspection confirms chapter6 v1 contains the four scientific terms
reported by the author, but there are0 novel/workspace-wide references available
for this novel. Scientific terminology has external support; the chapter's
temporary fish-incapacitation mechanism/safety remain unverified. No references
or story data were inserted/changed. Proposed next bounded slice: shared versioned
text-request safeguards at generate+generateStream, covering custom definitions,
with outline/canon/source boundaries and plain-language prose; preserve JSON,
quotes, locale and role instructions. Existing review can surface unsupported
claims for research. This is a design proposal, not implemented behavior; source
evidence and research limits are in ISSUES 'Shared AI request safeguards'.

## Generation capability questions audited — 2026-10-22

Read-only source and actual pinned-run/workspace-definition inspection completed;
see ISSUES 'Generation capability audit'. Context domains are wired, but latest
run2974c625 has no state/reference rows and memory is unavailable. People-only
discovery does not implement clan discovery. Cover response limits are not
retention and there is no candidate-delete action. Actual agents and installed
starter skills contain anti-invention/evidence rules, not a factual guarantee.
Group proposals and cover cleanup/three-cover retention are recommendations,
not approved/implemented changes. No model requests, data deletion or application
behavior changes were performed for these questions.

## Chapter outline propagation and existing-character reuse — 2026-10-22

Implemented and locally activated; task tasks/chapter-author-outline-and-character-reuse.md.
Both chapter workflows now carry the author's outline/style notes into every AI
stage, retain the previous saved chapter/version and relevant existing Character
profiles in a bounded server-owned context, and reuse that frame on continuation.
The input is labeled Chapter instructions (outline and style), localized EN/ID.
Shared scoped alias matching filters existing people from new-character proposals;
ambiguous matches block approval rather than merging identities.

Observed:15 disposable-DB,4 executor and46 UI/locale tests PASS; relevant types,
targeted lint and diff checks PASS. Independent review APPROVE_WITH_FINDINGS after
resolver fixes; a P3 title-cased parenthetical alias heuristic remains documented.
No schema, published graph or historical output changes in this repair.

Real gateway run2974c625-4061-4f0f-ad15-4f7cf35bb41d is AWAITING_APPROVAL.
Original1594-character author instructions occur in every successful AI stage;
context pins chapter9 v2,36ff8be1-192f-42b9-8e12-2c4bb642cb93, and the existing
Don Juan/Husein/Sofian profiles. Plan includes Anton Pratama and Darma Pratama;
10538-character prose follows the main requested beats and names both sons.
Discovery batch111a09c3-d35f-498c-91cb-bdc8d937fd5f initially failed validation;
one explicit discovery-only retry succeeded, returning exactly two PENDING
suggestions, Anton and Darma, with source-backed descriptions/quotes. Existing
characters were filtered. Original failed generation remains in the ledger; its
exact parser failure is unknown because its response was not retained. No whole
chapter retry or automatic discovery retry was added.

Author review remains required: prose has headcount/kinship wording defects and
an impossible visual action; the sons' surnames appear in the plan but not the
prose, so evidence-backed suggestions retain the short names (editable by author).
No draft apply, character approval or publication performed. Novel chapters,
versions, characters, entities and canon hashes remain unchanged. Private proof:
.nf-artifacts/chapter-outline-{proof,evaluation}.json. API27368/workflow28584
replace the earlier processes; Docker, cover runtime, queues and stash preserved.
No commit/push. Automated checks are not author or human screen-reader acceptance.

## Generated character proposals — 2026-10-22

Implemented and locally activated under tasks/generated-character-proposals.md.
Generation review now shows evidence-backed new-character suggestions with
Approve / Edit / Reject (EN/ID). Approval requires the exact reviewed draft to be
applied first, then atomically creates a linked Character + CHARACTER StoryEntity
with a prechange checkpoint, revision, both change-set entries, rebuild intent
and audit. Editing/rejection are operational; no facts are approved implicitly.
Operational decisions survive restore and approved replays never remint data.

Discovery uses its own character-discoveries BullMQ queue; a long AI request does
not occupy the parked chapter job. Workflow recovery now redelivers aged PENDING
runs whose terminal queue job was retained. Independent review identified and
verified fixes for source branch/chapter identity, concurrent uniqueness/deadlock
handling and queue lifecycle. Reviewed 22-file implementation manifest:
cdf2a127053c74ba058765541bc89530a1b7b060506bc4ecad55171bf1fc7d97.
Root reproduced this exact hash after excluding only the subsequently appended
task Completion evidence section. All reviewed production/test bytes are unchanged.
Current 22-file hash including that completion supplement:
db565b4c4e9f14614cb1570da887531fd9e2b93fdeb0e6815674c7741778b2c1.
The reviewer's later usage limit prevented separate review of the documentation
supplement only; it does not replace the earlier source APPROVE or runtime proof.

Observed: backend12, panel9 (including actual Setujui/Ubah/Tolak labels), locale18,
restore-scope8, sidecar2 (real BullMQ deferred extraction), worker10, recovery5 and
studio11 tests PASS. Relevant types and targeted lint PASS. Web vue-tsc exit0
retains the existing router plugin warning; automated accessibility is not a human
screen-reader or author acceptance result. No manual browser sign-off claimed.

Encrypted 4,754,439-byte preactivation dump passed decryption/read-back and isolated
clone restore; clone dropped. Migration20261021160000_character_discovery applied
and read back. Existing novel/chapter/version/canon/character/entity/user/workspace/
model/mapping hashes unchanged. API32456 and workflow16532 replace only verified
local application processes; queues resumed, Docker/Redis/cover runtime preserved.
API readiness200, Nuxt200 and unauthenticated discovery401.

Real gateway request: STRUCTURED_EXTRACTOR, requested
bansosmontera/deepseek-v4.1-flash, reported deepseek-v4.1-flash, SUCCEEDED.
Run37a6375b-01d6-43fd-a8cd-b448caed2898, batch
97e20231-8d50-407a-a2a1-eef74aa64617, generation
f4c64bdd-895e-4cf9-ab20-8f6d17534e39: one PENDING candidate, canApprove=true;
zero main author approvals and no story mutation. Private receipts:
.nf-artifacts/character-discovery-{backup,migration,live-proof}.json.
Historical runs without adequate immutable source/branch provenance can be
conservatively refused. HEAD32fe443, prior dirty work and stash preserved;
no commit/push. Cover title overlay remains an unapproved separate proposal.

## Explicit character identity resolution — 2026-10-21

Author approved the Health & Memory link flow in
`tasks/character-identity-resolution.md`. Current character findings now explain
the missing connection and offer Link identity: bounded searchable/paged
same-novel CHARACTER choices, no automatic name match, review and explicit
confirmation. Unknown results use read-only status checks; historical findings
cannot directly mutate current data. Both health lists refresh after success.
CharacterSheet no longer advises deleting/recreating a character to resolve it.

New tenant/capability-gated character identity options and null-to-ID API use
checked-out branch/head CAS. A pre-link checkpoint, revision, change-set, rebuild
intent, link and author audit commit atomically. Same-ID replay adds no history;
foreign/wrong-kind/claimed/stale choices are refused. Canon identity deletion now
shares lock ordering and refuses character-linked identities, preventing silent
unlinking. Broader GAP-011 timeline/event identity work stays open; GAP-058's old
read-only pin is superseded for this operation only.

Observed proof:13 database cases PASS together in a unique disposable database,
including knowledge preservation, pre-link snapshot/actual restore, checkout,
claim races, checkpoint failure, linked-delete refusal and delete/link races.
UI/locale/automated accessibility54 PASS; web/API/ai-services types, root lint and
final focused test lint PASS. Exact separate11-file review APPROVE, manifest
`63d26a41b7e0bd9c773872a9f49a67c436d8b4b663f9118ecabe51837768bd87`.
Live Sofian Magani was inspected read-only: null link, five knowledge rows and
one same-name candidate. This is not author identity approval; no live link or
story mutation performed. Prior uncommitted warning-message work is preserved.
No schema/dependency changes, commit or push.
Local API reloaded to PID35812; API readiness/Nuxt200 and the new unauthenticated
identity endpoint401 observed. Read-back still confirms Sofian unlinked with
five knowledge records. Existing workers, Docker, stash and private data retained.

## Author warning and error wording — 2026-10-21

Author requested continued simplification of warning/error messages. Updated
English and Indonesian copy for cover recovery, model availability, chapter
changes, draft application, publication review, SCALE access/validation, starter
pack conflicts, AI Studio uncertain saves and unsafe imports. Messages explain
the next action without HTTP status jargon or unsupported claims about story
consistency. Unknown results still require checking the same request; new image
requests retain the duplicate/charge warning. Machine codes and backend behavior
are unchanged.

AI Studio step and generation details now use the existing plain explanation /
closed support-details pattern. Full escaped diagnostics remain accessible;
successful outputs remain visible. Focused component regressions28 PASS and
locale/fallback/SCALE parity22 PASS. Final web typecheck and root lint PASS;
ledger5 tests PASS after the test-fixture typing correction. Separate final
six-file review APPROVE, manifest
`39ea802c0036c13620d1e014172c3a3678215de20fc4f033c182b9f608792376`.
This is a bounded author-facing pass, not proof that every platform message was
audited. No new generation, story mutation or router change.

## Resumable Horde jobs activation — 2026-10-21

Author approved the prior recommendation and cross-repository implementation.
Durable authenticated gateway jobs, request-scoped idempotency/ownership, pinned
connection recovery and bounded binary results are implemented. NovelForge pins
request identity before dispatch, resumes the same Generation with GET only,
fences recovered executors and atomically records one terminal attempt. The
cover drawer can explicitly check the existing job without requesting an image.

Observed verification: core142, API cover24 and cover UI10 tests PASS; core,
ai-services, API, worker and web types plus root lint PASS. Independent source
reviews APPROVE. Gateway18 tests and production build PASS, including exact
official Horde R2-host regression after the live proof exposed its omission.
The2-file R2 amendment has independent APPROVE, manifest
`611b84c2f0d231c98b3e5286a2c080441d61c16e63e5b4f92636357769d9f7ba`.

After the author's gateway restart, authenticated job lookup is available on
20127. Audited catalog read-back confirms16 Horde image models with async and
30-minute settings; current mappings/priorities/defaults are preserved, Gemini
remains disabled. Dedicated API/cover consumers were safely reloaded; API ready
and Nuxt return200, workflow/Nuxt processes and notification backlog preserved.

One real scratch AbsoluteReality image SUCCEEDED after an isolated worker restart
and the author's second gateway reload: same persisted job/Generation, one
SUCCEEDED terminal attempt,278560 provider bytes ->154667 normalized bytes.
Result retrieval exposed the official transient R2 host missing from the strict
allowlist; the reviewed correction is now active. An intermediate status429
recovered without resubmission. Total observation lasted20m09s including diagnosis,
build/reload and retrieval; this does not establish a20-minute provider queue.
Reported model/usage remain unknown. Main story/cover hashes and scratch cover
unchanged, no Gemini request. Private receipt `.nf-artifacts/horde-live-receipt.json`
records the proof. No main cover Apply, commit or push. Earlier analysis-only/
pending implementation paragraphs below are historical, superseded by this entry.

## AI Horde queue investigation — 2026-10-21

Author reports satisfactory real Horde images with15–20-minute waits and requests
analysis of akanesia-router before gateway changes. Standing author instruction:
inspect that repository for streaming, buffering, model/API/catalog and other AI
integration problems; inspection is not blanket write authorization.

NovelForge has a bounded optional per-image deadline selected by model capability
`nf:image-timeout-ms=1800000`; sixteen current Horde image rows are configured
with30 minutes, with audited pre-change rollback/read-back. Current author Horde
mappings/priorities/defaults and shared gateway600000ms timeout are preserved;
the earlier NanoBanana default must not be restored. Core133/types/focused lint
PASS; independent code/config review APPROVE. Runtime reload is pending current
analysis; do not claim the new deadline affects already-running consumers.

Gateway20127 root returns200/Akanesia-Gateway. Earlier Windows socket inspection
found no listener; this did not establish HTTP unavailability. Checkout287253b5
source/local compiled/standalone images use Horde10-minute polling,5-second checks,
six consecutive check-failure cutoff, request-local upstream job ID and URL image
results. Exact serving process/build for the author's long test is unverified.
No router change/restart, new image test, commit or push.

Recommendation for author review: align bounded client/gateway/proxy deadlines;
retain job identity and retrieve after reconnect instead of resubmitting. Reuse
existing cover batches/queue/gallery. A durable authenticated gateway image-job
submit/status/result contract is proposed follow-up, not implemented work.

## Cover generation integration and temporary Gemini disable — 2026-10-21

Latest resolution: author-approved bounded gateway binary transport fixes the
NanoBanana response mismatch. Serving runtime is installed 9router0.5.104;
its NanoBanana JSON output contains URLs even when the body asks for base64.
Model capability `nf:image-output=binary` opts into the same gateway's binary
query mode. JSON default remains available; no provider URL fetch, redirect,
automatic POST retry or Gemini reactivation. Existing decoder/normalizer applies.
One genuine scratch NanoBanana Flash binary request SUCCEEDED: 1,995,068 input
bytes -> 223,479 normalized JPEG bytes, one attributed attempt, reported model/
usage unknown and prior cover unchanged. No repeat of the ten-image proof.

Audited main configuration/read-back selects `nb/nanobanana-flash` as default;
both NanoBanana models have the binary marker because they share the verified
runtime adapter, while Pro remains individually untested. A separate rollback
plan was written/read-back before mutation; completion receipt followed final
checks. Main hashes unchanged, zero main image requests, Gemini157/0enabled,
eleven eligible author image models. API PID35940 and cover PID20404 replace the
previous API/cover processes only; workflow4180/Nuxt29248 stay. Cloudflare rate
limit remains an external issue, but a non-Gemini cover route is now proved.
Final binary regression: core123 and cover UI9 PASS, core/web types and root lint
PASS. Independent binary delta and corrected configuration script APPROVE.
The earlier "current non-Gemini success unknown" statements below describe the
pre-fix state, superseded by this observed Flash success.

Approved parent lane D implementation includes the bounded active-novel brief,
image-only profile/catalog routing, durable 1–9-slot generation, isolated BullMQ
consumer, authenticated API, searchable model picker, EN/ID cover drawer,
recommendation badges, editable notes/prompt, gallery, explicit Apply and cover
history/restore. Generation does not replace the current cover. Source revision,
cover-version identity and current-cover CAS protect Apply; retries retain
attribution and require explicit acknowledgement of uncertain submissions.

Observed verification: ai-core 115 PASS; API/AI 69 PASS (20 cover cases);
normalizer 12 PASS; restore classification 8 PASS; final cover/admin UI 13 PASS;
root lint and typecheck PASS. Independent read-only final source/rollout review
APPROVE; retained 40-file implementation manifest SHA256
`afb24c986a798a918ee67f99ea087bab51c42bc3d38d07b72f925e1ae18eabf9`.
Actual scratch worker/gateway produced count1+count9 = ten genuine Gemini images.
Native EN desktop/ID mobile proof covers polling, decoded gallery images,
explicit Apply, library refresh and byte-exact old-cover restore. A later native
recovery proof reuses these images with zero additional image dispatches.
Main story hashes and another novel's cover remained unchanged. Fixture actors
prove programmatic behavior, never human author acceptance.

Latest author amendment: Gemini is temporarily disabled after the author's Google
quota-limit report. Audited local configuration disabled 154 matching catalog
models; read-back found zero enabled Gemini entries and unchanged story, cover,
account and workspace hashes. Historical image successes do not prove current
availability. One actual Cloudflare Lucid request returned RATE_LIMIT with one
recorded attempt and no cover change; no blind retry. Custom bansosmontera image
transport remains unsupported. Other catalog entries are not assumed working.

Local activation completed with read-back: migration
`20261021042000_cover_generation` applied; no pending migrations; author catalog
contains eleven eligible non-Gemini models. Image-catalog sync added three more
Gemini entries, also disabled: final 157 matching entries, zero enabled. API
`/ready` and Nuxt return 200; the new protected cover route returns 401 without
authentication. API PID8344 and dedicated cover consumer PID36932 are running;
existing workflow PID4180 and Nuxt PID29248 were preserved. Cover/workflow queues
are idle with one consumer each; the two waiting notifications are untouched.
No main image request, story/cover/account/workspace hash change or Docker reset.
NanoBanana flash's single real probe failed INVALID_REQUEST; successful current
non-Gemini generation remains an external availability gap, separate from the
historical ten-image success and completed implementation tests.

An encrypted 1,181,403-byte preactivation dump was
decrypted/read-back and restored into a disposable clone; source counts/hashes
matched and the clone was removed. Keep candidates/history on code rollback;
do not drop additive tables or restore the main database without authorization.
No commit/push. OpenDesign MCP is unavailable;
UI follows the approved checked-in design without claiming an MCP run.

Retained publication evidence: ce6f361 is on origin/main; GitHub CI39525189557
succeeded with 245 files / 2966 tests, lint, types and Compose checks. This is the
published baseline, not validation of the subsequent uncommitted image changes.

## Authoring batch publication preparation — 2026-10-21

Author explicitly authorized committing and pushing all current changes.
Earlier no-commit records below describe historical phases. New encrypted local
backups are ignored; private imports/evidence/credentials are excluded. Stashes
and existing Docker acceptance data are retained. Full lint/typecheck/Compose
config pass. Initial whole-repository run: 2961PASS/5FAIL across245 files; repaired
restore classification and outdated cover/model fixtures, isolated worker-test
queues, and corrected the previously failing remote publication-race assertion.
Focused repair regression52PASS; broad initial results are retained, not relabeled
as a complete post-repair rerun. Source controls/validation remain strict.
Publication commit/remote result is recorded in the verified Engram handoff;
GitHub CI will provide the fresh whole-suite result after push.


## Language polish with explicit author decisions — 2026-10-21

Author-approved language editing reuses existing AI/editor paths. New Polish
language toolbar/menu action handles a selected sentence or one paragraph:
Before/AI proposal, Use suggestion/Ignore, no insertion fallback. No-change,
stale/oversize/multi-paragraph/partial response states are explicit and safe.
Accepted text follows normal immutable save and needs fresh final-text review;
Ignore never edits the manuscript. Both en/id and mobile design supported.

Writer/style/final templates now cover grammar, idiomatic diction and dialogue
without changing facts, meaning or character register. Three active workspace
agents appended publishedv2 through authorized APIs; original custom instructions,
model/settings and old versions preserved/read back. Old runs remain immutable.
This does not add an automatic whole-chapter suggestion list or another routine
LLM stage. Full new-chapter quality remains author evaluation.

Web61PASS/templates11PASS, API/web types/scoped lint/diff0. Final real gateway
MiniMax-M3 proof in novelforge_test_ai_chapter_creation: EN1440 Ignore preserves
text, ID390 Use persists/reloads, actual redundant wording removed, card inside
viewport/page errors0. Main story/run hashes unchanged; no main prose edit,
publication, commit/push/reset. Private receipts language-polish-live-receipt.json
and language-polish-activation-receipt.json in .nf-artifacts. Sixteen-file
independent exact-source APPROVE/root-matching ordinal manifest SHA256:
097bc09962d9bcb6bd62aa012a982a09aa8b7ff705f8a3e424bb18e5752f5eb8.
Final component21PASS/webtypes0 after card presentation changes. Details and
author instructions: tasks/chapter-language-polish.md.


## Title-only Apply recovery and writer-friendly messages — 2026-10-21

Observed run37a6375b... now SUCCEEDED; chapter10 v2 is the author's rename of v1,
with unchanged content. This updates the earlier AWAITING_APPROVAL observation
below; actor IDs alone do not establish author acceptance. Apply now offers
explicit recovery retaining the current title after server proof of audited
title-only lineage. Real content/source changes still refuse. Original run pins
and approval snapshot remain immutable; recovered versions record provenance.
API37PASS in dedicated database; web37PASS (Apply10, RunStatus9, locale18), web
types/scoped lint0. Plain English/Indonesian generation/review/Apply/canon and
AI Studio approval messages describe causes/actions; raw AI errors are collapsed
under support details. No invented plot-hole warning for a rename.

Main native EN1440/ID390: actual PUT409 typed conflict, unchecked recovery consent,
current author title shown, checking enables Apply without retry; page errors0,
unexpected mutations0, story/run hashes unchanged. Successful main Apply remains
the author's next action. API10304 activated; worker4180 unchanged, readiness/
Nuxt200. Preserve editorial countdown wording issue and all uncommitted work.
No commit/push. See tasks/chapter-apply-title-recovery.md for final review evidence.

## Chapter context/preview repair and actual Chapter10 regeneration — 2026-10-21

Bounded rendered story content now travels in consumed RETRIEVAL JSON, alongside
provenance. Explicit blocked artifacts fail in executor/API/UI rather than becoming
chapters. Strict creation refuses missing outline context before model dispatch.
Readable prose preview opens from history, comparison is opt-in, and scalar scope
watching prevents fresh chapter objects from clearing the preview. Same-run
reselection reloads safely. Executor31/API30/web35PASS, worker/API/web types/scoped
lint/diff0; independent16-file APPROVE hash
2b48dd60a89bd53648efa6a4c17967b652751d15a5dfdf8b0eca901a759e78fd.
Actual isolated5-stage gateway run and native EN1440/ID390 pass; no mock result
is presented as gateway evidence. API20132/worker4180 refreshed idle, readiness/
Nuxt200, notification wait2 preserved; no reset/commit/push.

Author explicitly requested main Chapter10 regeneration. Recoverable checkpoint
9ab08d1e-67e1-4ccb-a47c-44bde7d3648a read back; absent horizon initialized under
CAS, original approved outline/canon retained. First actual candidate4ccd62d1...
contains1078 Indonesian words but final review identifies blocking/major narrative
defects. Never accepted/applied. Main native preview passes both locales/viewports,
survives rerenders/reselection, errors0/mutations0. Corrective real run
37a6375b-01d6-43fd-a8cd-b448caed2898 is now AWAITING_APPROVAL: Harga Pasar,
Harga Kolam,1364 Indonesian words/9207chars; final AI review needsCorrection=false,
blocking0/major0. Corrected main native preview passes both viewports/locales.
Root still flagged elapsed/remaining countdown wording for author editorial
review; do not claim perfect prose or acceptance from AI flags. Errorv1 remains
until deliberate approval/Apply; other chapters/canon retained. Final title-before-
prose16-file source APPROVEhash
ffb821f38d5975d2622ddd1cf299b200ae482fb899979d542addb2097ca855c0 supersedes2b48
for final bytes; webtypes/scoped lint/diff0. No active main model/run; workflow
queue idle/one worker, notificationwait2 retained, no commit/push/publication.
Complete evidence/next action: tasks/chapter-generation-content-repair.md.

## Structured planner failure repair — 2026-10-20

Reported plan rejection is addressed with effective schema and required-key system
instructions plus existing gateway JSON-object mode for object contracts. Strict
validation remains; rejected output/instruction/generation attribution is retained
on FAILED steps. Run history can explicitly reuse failed setup on the same chapter,
restoring notes/word target/models with fresh previews and a separate Start action.
No automatic retry, duplicate chapter, schema defaults or historical run rewrite.

Executor29/web17PASS, worker/web types/scoped lint/diff0. Independent eight-file
APPROVE, final localized source hash
04fb1784c85d9489101d40e34c4bf2a9936416dd92a9e30637ef32ca84b0d98f.
Actual Agnes scratch executor plan+validator passed then AWAITING_APPROVAL, one
attempt; this is not author acceptance or a full new novel run. Main native
EN1440/ID390 reuse passes with errors0/mutations0 and unchanged story/run hashes.
Idle workflow worker34804→34364 activated, API10396 unchanged/readiness200,
Nuxt200/one worker; notification wait2 preserved. HEAD282983f/WIP/stash retained,
no commit/push/migration/reset. Original failed response was discarded by old code
and remains unknown. Future malformed provider output still fails explicitly.
Evidence/next author action: tasks/workflow-structured-output-repair.md. Select
the existing chapter, reuse the failed run setup, inspect models, then Generate.

## AI chapter creation and active-chapter Draft — 2026-10-20

Add chapter now offers Write it myself / Generate with AI. AI setup accepts author
notes, target words, approved outline and searchable eligible per-step models.
Enable the new workspace chapter-creation-review template explicitly on first use;
existing starter roles must be installed/published. Historical templates and
definition versions are retained. Generation reserves one chapter identity, pins
the server-resolved target/outline/head and recovers uncertain create/enqueue
requests without duplicating chapters or silently replaying work. Own immutable
creation receipts resolve changed/deleted reservations; an unresolved workflow
start cannot be discarded. Review shows the title and prose from one artifact;
strict Apply verifies the approved SUCCEEDED snapshot and locked source/version,
then saves title/text, immutable provenance and audit atomically.

Author explicitly scoped Draft and Save to the active chapter. Draft retains text
and version history, atomically withdraws its publication/cancels its schedule, and
leaves other chapters unchanged. Existing Publish behavior was not changed. Draft,
Save and Publish are visible on mobile. Actual gateway proof exposed and fixed the
shared review reader's outcomes/priorOutcomes mismatch without changing snapshots
or approval hashes. Context drift, stale title/version and delayed Apply responses
refuse safely. No automatic publication or canon acceptance.

Focused native checks: API40PASS, web39PASS, templates11PASS, executor22PASS (112
unique tests); API/web types, scoped TS/JS lint and diff check exit0. Final manuscript
29PASS includes audit rejection rolling back Draft/publication and paired title/text.
Independent read-only29-file APPROVE, source hash
6224561b5e8d2551404ad05c5faf35f744315d47205bfc3fc9fe4deeff8551e2.
Actual isolated Docker DB/Redis queue + native browser ID390/EN1440: one chapter,
five successful real MiniMax-M3 stages, retained author notes/model, coherent title
and prose reviewed/fixture-approved/applied as v1 (The Blue Lantern, 249 words),
Draft works and mobile actions are enabled/visible; page errors0. Continued the
same parked artifact after browser diagnosis, with no repeated model calls.
This is programmatic fixture approval, not author or human acceptance. Main novel/
chapter hashes unchanged. Receipts: private ai-chapter-live-receipt.json and shots.

Reviewed API17604→10396 and workflow worker32164→34804 refreshed only after idle
preflight (no active generations/workflows; workflow queue empty), readiness/Nuxt
200, one workflow worker, main story unchanged. Existing notification wait1 was
preserved; no Redis flush or Docker reset. Actual main read-only smoke15:12:36Z
EN1440/ID390 passes: three actions visible/enabled, Manual/AI choice, first-use
setup available, Escape/opener focus, page errors0/mutating requests0. Main stories,
definitions and session count unchanged; strict template not silently installed.
HEAD282983f and existing WIP/stash preserved; no commit/push/migration/dependency.
Contract/evidence: tasks/workspace-ai-chapter-creation.md. Parent program and
unrelated accepted work remain separate; this does not mark full platform delivery.

## Eligible author models and searchable SUPER_ADMIN Profile catalog — 2026-10-20

Latest author decision supersedes previous show-disabled UI: workspace model API
and picker now expose only eligible mapped models. SUPER_ADMIN administration
retains full live gateway catalog via privileged global model-catalog endpoint.
Profile mapping picker searches model name/ID/gateway with bounded batches;
known disabled/unmapped models can be configured without enabling generation,
unsynced null-ID entries remain disabled until admin sync. Explicit loading/error/
retry, reference tokens and viewport-aware popup above/below. No auto-sync or
mapping mutations. Existing author stale choices retained as unavailable only.
Native API49PASS/web10files85PASS incl axe/types/lint/diff0, separate13file APPROVE
69e16a697be0196e8b523b1f36df595b4c17f6eb858c0cdcb68090fab01a8675.
Actual router/native EN1440/ID39011:25:20Z admin3051models vs author7eligible,
ordinary global403/unauth401, admin unmapped search/author hidden, Enter/Escape/
popup bounds passes/errors0; screenshot inspected. No main model/mapping/story
writes or generation call. Earlier full-author catalog paragraphs are historical.
Reviewed API refresh15056→17604 readiness/Nuxt200, actual same-origin readback
11:27:47Z author7/7selectable versus SUPER_ADMIN3051catalog models. Main novels1/
chapters9/agents5/skills2/workflows1/sessions2 unchanged; worker unchanged.

## Editable Profile in definition versions — 2026-10-20

Author reported profile locked in existing-definition edits. Agent/Skill New
version now exposes the same canonical capability Profile menu as creation;
changing it updates catalog eligibility while preserving all JSON draft fields
and explicit model choice (unavailable choices remain visible for correction).
Server mapping gate unchanged. Workflow has no aggregate Profile; localized copy
explains per-step Agent/Skill profiles and the independently selected default.
Final5files50PASS/types/lint/diff0, separate4file APPROVE/root hash
1497e9c72ec5fb8d1727ded661993b72b1cc6fcc9a1ec1a72b0ef4c6a104a33c.
Native scratch API/actual router EN1440/ID39011:08:59Z appends6versions and reads
back changed profiles/models/instructions; immutable original versions and
Workflow graphs retained. Page errors0, screenshot inspected. No main story or
definition mutation, generation call, backend restart or commit/push. Next parent
work remains selected-model unsaved AI drafts and remaining authoring scopes.

## Full live searchable model catalog — 2026-10-20

Author requested full Akanesia-Router list and explicitly retained Profile gates.
Shared picker now reads authorized live model-catalog through GatewayManager,
shows all remote models with search by name/ID/gateway, disabled reasons for
unmapped/disabled/unsynced models,100row batches and Show more. No invented IDs,
local sync/mapping writes, stale or partial success; old model-options and
dispatch/fallback authorization remain unchanged. All shared picker callers
(definitions, novel defaults and workflow steps) inherit the behavior.
Native API49PASS/web13files104PASS/types/lint0, separate12file APPROVE/root hash
efb146ffc3b7fbcfb96391e4327a653c4f4c618be00a688fc32ee6f6b43497fe.
Actual router parity10:48:45Z:3051models/7selectable for CREATIVE_WRITER; en/id
desktop/mobile readonly browser search/disabled reasons/no-match/focus/Escape/
panel geometry passes, errors0, screenshot inspected. Catalog inventory varies.
No generation/story/catalog writes or new routing policy. Full Studio work still
OPEN: selected-model unsaved AI drafts and remaining parent scopes.
Reviewed API refresh33076→15056, readiness/Nuxt200. Actual same-origin catalog
read-back10:51:27Z returned3038models/7selectable; the router inventory changed
since the earlier3051 parity probe, confirming a live source rather than a frozen
local list. Main novel/chapter/definition/session counts unchanged; no worker
restart, commit or push.

## Starter-pack Skill omission repaired — 2026-10-20

Author reported empty Skills after installing the pack. New checked-in reusable
Chapter Context Distillation and Chapter Continuity Check Skills now install as
published WORKSPACE v1 with structured contracts and selectable model profiles.
Existing packs gain missing Skills additively; custom keys refuse atomically.
Existing Agent/Workflow versions and chapter graph are unchanged. Skill templates
operate on supplied context; no invented retrieval or automatic approval.
Actual owner workspace upgraded/API read-back10:34:22Z: both Skills present,
old versions/story/run/generation counts unchanged. API PID33076 ready/Nuxt200.
Native API9PASS/web6files40PASS/types/lint0; separate8file APPROVE/root hash
566f5ac709e3745f734156511fc5fdbbabd2b30e908666d347b4b5066a24a4da.
Native scratch EN1440/ID390 both Skill rows visible, safe lost-response retry,
custom Skill conflict and role refusal; no page errors, screenshot inspected.
Earlier no-Skill inventory below is historical. No real LLM execution claimed,
commit/push, or full B3 completion. Next remains selected-model unsaved AI drafts.

## Workspace Studio starter pack — 2026-10-20

Explicit manager action now installs the checked-in chapter-generation-review
template (five agents + one workflow) as published WORKSPACE v1 definitions.
The localized UI requires publication consent. Nothing runs or changes a novel.
Serializable installation and audit commit atomically; exact published content
is reused, customized/status/model key differences fail without partial writes.
No template Skills exist, so none are fabricated. Immutable versions and PLATFORM
definitions remain untouched. Unknown responses permit safe explicit retry.
Actual dedicated PostgreSQL/API7PASS; web8files65PASS, API/web types/scoped TS
lint/diff0. Independent13file APPROVE/root-matched hash49f7957f…4e5f1c30.
Native actual scratch API/browser EN1440/ID390 passes install/readback, lost200
same-ID retry, visible409key and AUTHOR-hidden controls; no story/run/generation
changes or gateway call. Screenshot inspected; receipt10:18:19Z.
Next: selected-model AI definition drafting with validated unsaved output, then
remaining expanded CRUD/recovery. This does not close the full B3/program gate.
Reviewed API refreshed to PID19376: readiness/Nuxt200 and new unauthenticated
route401; main novels1/chapters9/agents0/workflows0/sessions2 unchanged. No starter
pack installed in the author's workspace, no worker restart or migration.

## Workspace authoring program: policy, chapter actions and routing foundation — 2026-10-20

Approved parent plan: `docs/superpowers/plans/2026-10-20-workspace-authoring-program.md`.
Source remains uncommitted; external HEAD282983f and all existing work/backups
are preserved. No root commit/push or live story mutation.

Implemented workspace ownership policy (ordinary accounts max1owned workspace,
SUPER_ADMIN unlimited, unlimited novels) and manual chapter creation, labeled
toolbar, reference-aligned ordering menu, version-bound rename and safe deletion.
Native workspace17/chapter25PASS; combined focused web93PASS. Independent scoped
reviews APPROVE. Final native scratch browser EN1440/ID390 PASS with no page
errors, opened dropdown bounds, create/rename/delete and SUPER_ADMIN exemption.

Admin profile mapping controls now use stable model UUIDs, disambiguate gateways
and atomically audit mapping writes/removal; native42PASS and component4PASS,
separate B1 review APPROVE. Shared routing and buffered/streamed generation APIs
support explicit eligible model preference with attribution and live eligibility
recheck before fallback: manager98/API44/orchestrator17PASS, relevant types0.
Separate exact propagation review APPROVE; scoped lint0. ADR-0018 records the design.

Real configured gateway proof in a dedicated scratch database succeeded for
MiniMax-M3 and deepseek-v4.1-flash with persisted requested/reported model IDs,
actual responses and reported token usage. Live novel/chapter fingerprints were
unchanged. This is routing evidence, not chapter generation/acceptance evidence.

Update: nullable immutable Agent/Skill preferences and Workflow default are now
implemented with authorized API validation, direct/stream and production worker
propagation. Definitions+resolver parity64/orchestrator19/executor22/worker path4
PASS; API/worker types and scoped lint0. Separate exact review APPROVE. Real
isolated-prefix BullMQ plus configured gateway completed three steps with
persisted model choices/outputs/usage. Reviewed additive migration applied locally
after scratch old-client/history/NULL proof; historical definition and novel/
chapter fingerprints unchanged. API reloaded and all three definition list routes
returned200; the owner's lists are empty, so live populated-row field proof is
NOT_OBSERVED, not inferred from empty arrays. Scratch API tests cover actual rows.

Update: server-owned enqueue-time definition pins and recovery are implemented.
One REPEATABLE READ transaction captures exact Agent/Skill versions, including
granted Skills; FK retention, authenticated idempotency, approval resume and
orphan recovery preserve them. Incomplete/foreign pins fail closed; historical
NULL markers retain legacy behavior without backfill. Completed steps are not
rerun or rejected solely because their former model is later disabled.
Native API87/executor22/worker-path4PASS (113 total); API/worker types and scoped
lint0. Independent scoped review APPROVE. Actual isolated BullMQ + configured
gateway retained v1 definitions/models after v2 edits and resumed after fixture
approval. This is technical evidence, not author or human acceptance.
Reviewed migration applied locally with unchanged novel/chapter/run/step history;
matching workflow consumer started before API reload. Read-back observed one
workflow consumer, ready200, no active generation/workflow, and preserved queues.
Memory/publication/notification consumers remain absent; one notification waits.
Do not infer complete worker readiness. Receipts and scope are in the ledger.

Update: optional SCALE S3 extract/advice accept an internal model UUID. The author
picker uses shared ActionMenu, retains unavailable choices, distinguishes gateways
and discloses fallback. Deterministic review and untrusted output checks remain.
Fixed stale extraction response ownership and nested-menu Escape in the drawer.
Native API70/web41PASS (picker/races/drawer/menu/axe/i18n), API/web types and scoped
lint0. Real authenticated scratch API/gateway: extract201 MiniMax-M3, advice200
deepseek-v4.1-flash, persisted model/usage; disabled choice409/zero new generation.
Scratch browser EN1440/ID390 PASS, opened menu fits, model/Automatic/Escape focus,
no page errors. Separate eleven-file review APPROVE. API-only reload ready200;
main novel/chapter hashes unchanged. See ledger for retained receipts and limits.

Update: novel operation defaults now have append-only configuration versions,
authorized CAS writes/atomic audit and immutable enqueue snapshot/FK retention.
Explicit CHAPTER generation and optional SCALE analysis consume them below
request/definition/workflow preferences. Legacy and no-default queued runs do
not inherit later defaults. API158/executor22/worker-path4PASS; API/worker types0,
scoped lint0. Separate thirteen-file backend review APPROVE. Fresh scratch
migration preserved2 actual runs/history; actual BullMQ/gateway proof retained
v1 through fixture approval/resume after v2 edit, while new requests used v2.
Reviewed migration applied with main novel/chapter/run/step hashes unchanged;
matching idle workflow worker replaced before API reload ready200. Owner GET
read-back matches configuration version0 (Automatic), without config writes.
Checkpoint464 saved/read back. Defaults author UI is now implemented in the
existing workspace drawer under Novel AI models. Two shared model pickers,
reason, versioned save and explicit reload handle CAS/unknown-save outcomes;
rejected drafts remain until explicit reload. Request selector discloses novel
inheritance. Web51PASS including axe, locale parity/fallback and navigation/save
races; web types/scoped lint0. Separate six-file UI review APPROVE. Final native
scratch EN1440/ID390 browser PASS: actual saves/read-back, retained history,
desktop CAS conflict/reload, custom menu bounds and inherited label, pageerrors0.
No owner configuration was changed; live owner read-back remains version0.

Update: workflow request-wide/per-AI-step model preferences are implemented,
reviewed and activated. Bounded shared validation, server-owned run JSON,
graph-aware effective-choice preflight and scoped dependency fingerprints prevent
arbitrary input or stale UI from changing queued choices. Existing idempotency,
definition pins, approval/resume and orphan recovery retain the captured request.
Native validation71/executor22PASS; API88 retained PASS plus corrected focused
recovery case1PASS; API/worker types/scoped lint0. Separate ten-file APPROVE.
Actual isolated BullMQ/configured gateway used MiniMax then deepseek across
fixture approval/resume after definition edit. Stale preview refused without row;
altered idempotent replay retained original choices. Migration preserved historical
data and NULL legacy markers; matching worker32164 started before API reload200.
Other consumer absences and notificationwait1 remain as previously recorded.

Generation UI now provides per-step catalog choices and inherited source/identity,
preview readiness gating and explicit reload after409. Uncertain POST retries
retain the exact payload/key while the panel remains mounted; new starts and
request controls stay disabled until resolved. Reload/remount reconciliation is
still OPEN. Five focused web files45PASS, web types/scoped lint/diff-check0;
separate nine-file review APPROVE. Actual scratch browser EN1440/ID390 at04:51:21Z
enqueued selected choices/fingerprint through native API and isolated BullMQ,
verified stored preferences, then cancelled both test runs. Pageerrors0, model
menu horizontal bounds pass. Browser made no gateway call; backend gateway proof
is separate. Programmatic fixture approvals are not author/human acceptance.

Update: same-tab reload/remount recovery is now implemented. An account-scoped,
validated sessionStorage journal stores the exact bounded request/key before POST,
with write/read-back verification. Restore never dispatches automatically; explicit
retry checks the session and reuses the saved request. Unreadable, unavailable or
competing records block new starts. Matching cleanup follows confirmed response;
overlapping recovery and old/unmounted responses are fenced. Account-change failure
clears the old in-memory banner without deleting its journal. Private author notes
may be held in this tab's journal, never credentials; no TTL or silent discard.
Tab closure/new tab/device recovery is outside this browser-session mechanism.
Focused3file27PASS, web types/scoped TS lint0; independent final6file APPROVE.
Native scratch EN1440/ID390 browser05:01:30Z deliberately lost committed202,
reloaded without POST, then exact-payload/key retry200 returned the same run ID.
Four POSTs produced exactly two logical runs; both cancelled, queue empty,
generations unchanged/pageerrors0. No new gateway calls or main story writes.

Update: Studio definition model selectors are implemented and separately reviewed.
New-version JSON and shared selector remain synchronized; Agent/Skill uses its
profile, Workflow uses an authorized deduplicated enabled-model union. Empty
choice means inheritance; arbitrary union membership does not prove all-step
compatibility. Versioned save retains other fields/graph and existing history.
Native API47 retained PASS + corrected union focused1PASS; UI23PASS before mobile
containment, final sequential23PASS including list/dialog axe after containment;
web/API types/scoped lint0. Final11file source review APPROVE. Native EN1440/ID390
scratch browser saved/read back six immutable definition versions, preserving all
earlier rows/content, with no workflow/gateway execution or main story writes.
API-only activation05:16:48Z ready200/owner catalog DB parity/story hashes intact.
Mobile inspection found overflow from history table and a long list button;
constrained both, gave table its own distinct named keyboard scroll region.
Final native width readback05:26:27Z PASS: all three kinds viewport390/document390,
open dialog/menu and closed page fit, no configuration writes repeated.
Author also reported absent mobile left sidebar/toggle; affected-page clarification
pending. Writer currently has a Bab toggle opening a stacked panel, not leftdrawer.
Sidebar change is not implemented or part of the model-selector review.

Runtime memory interruption: latest host hook reports ENGRAM UNBOUND due
engram.exe ETIMEDOUT. Attributed writes stopped. Checkpoint472 is intermediate;
current verified source/evidence/remaining scope are preserved in the execution
ledger. Do not infer a final checkpoint save or reuse the formerly bound identity.

Update: author clarified editor story menus, not Chapters. Mobile editor now has
a dedicated hamburger + Novel menu using all11 existing sidebar actions (Novel
details/Characters/Relationships/World/Timeline/Canon/Research/Planning/Narrative/
Novel models/Health). Bounded native dropdown opens the existing drawer and
preserves unsaved text. Desktop sidebar retained, extra menu hidden>=1024.
Regression18PASS, web types/scoped lint/diff0; separate exact5file APPROVE.
Actual readonly native browser ID320/390, EN768 all11 panels opened/bounds/Escape
pass; desktop1440 hidden. Landscape667x375/844x390 also fits and last item opens.
No story/config/gateway writes. Receipts and current file handoff are in ledger.
The above pending-sidebar and runtime paragraphs are historical: author clarified
scope, implementation complete; host temporarily rebound and checkpoint472 was
updated, then latest hook again reported UNBOUND/ETIMEDOUT. Stop attributed writes
under that latest state; do not infer a new final memory checkpoint or summary.

Update: B3 manual Studio creation is implemented/reviewed/verified. Managers see
Create definition for Agent/Skill/Workflow, using current workspace only, immutable
v1 DRAFT and explicit later publish/run. Form includes name/key/description,
Agent/Skill instructions/profile/execution model or Workflow graph/default model.
Unknown POST freezes exact draft and supports explicit same-key retry or matching
tenant/full-content read-back. Closing a dialog does not cancel a sent request.
Page capability/run reads and submissions are scoped/fenced across navigation;
modal focus correctly includes native menu summaries and skips closed options.
Canonical profile list reused by admin; existing read-only mapping prop corrected.
11file80PASS plus final focused dialog9PASS; web types/scoped lint/diff0;
independent final13file APPROVE. Actual initially empty scratch workspace browser
EN1440/ID390 created/read6 v1DRAFT definitions, retained model choice, recovered a
deliberately lost201, and verified AUTHOR/nonmember/cycle/cross-workspace refusals.
No main story data/gateway execution, automatic publication or workflow run.
No migration/API-worker restart/commit/push. Details and receipts in ledger.
Latest host reconfirmed binding after earlier UNBOUND interruptions; checkpoint479
for completed mobile menu saved with current session and read-back verified.
Follow current host binding, not the historical interruption paragraphs above.

Remaining: Studio starter pack/AI drafts/expanded CRUD,
pack, AI chapter title+prose mode, real image cover batches and whole-novel atomic
publication. These remain planned, not delivered. Execution details and exact
review scopes: `tasks/workspace-authoring-execution-ledger.md`.

Earlier Engram UNBOUND fetch failure is historical. Host reconfirmed this session
binding; checkpoints456–460 saved and read back. File fallback remains retained.
Author sign-off and human screen-reader acceptance remain separate from tests.

## Kaisar dari Masa Depan: character development connected — 2026-10-20

Continuing the gap list. Character states, knowledge, and arcs created for
the Kaisar cast via the audited API, all grounded in the author-approved
Bab 1-9 drafts, the 14 canon facts, and canonized lore:

- **Character states** (7 rows): Don Juan (ch1-3 reinkarnasi; ch4-9
  perjuangan 7 hari sampai komitmen meja makan), Sofian (ch1-3; ch4-9
  ancaman jual → meja makan), Husein (ch1-5; ch6-9 budi 4 ikan), Ketua
  Penagih Hutang (ch4-9 tenggat aktif). Tokoh jauh (Raja Wajradhara,
  Yuwaraja, Kaisar Wanita, Atasan) sengaja tanpa state — belum muncul
  di Bab 1-9; menambahkan state sekarang berarti mengarang.
- **Character knowledge** (25 rows, 25/25 expected pairs): Don Juan 13
  (semua facts — pengalaman langsung/ingatan dunia lama), Sofian 5,
  Husein 3, Ketua Penagih 2 (hutang+tenggat), Atasan 2 (kejahatannya
  sendiri). Semua stance KNOWN dengan source beragam (REMEMBERED/
  LEARNED_IN_WORLD/EXPERIMENTED); tokoh jauh tidak diberi knowledge —
  mereka belum tahu apa pun dari Bab 1-9.
- **Character arcs** (3, ACTIVE, dengan disclosure wajib "[rekonstruksi
  Bab 1-9, belum direview author]" di judul sesuai aturan
  ISSUES-AND-GAPS — arc status enum tidak punya DRAFT): Don Juan (6
  milestones ch2→9), Sofian (3, ch4→9), Husein (3, ch6→8). Total 12
  milestones, semua beranchoring ke bab nyata.

SQL verified: 7 states, 25 knowledge (25/25 expected pairs present),
3 arcs + 12 milestones. Sessions temporer dihapus (1 sesi lama milik
proses lain dibiarkan).

Sisa gap Kaisar: cover (BLOCKED — butuh aset gambar author), references
(butuh materi author), narrative policies + planning horizon (pilihan
policy author), endgame ledger (thread utama kini tersedia; dihubungkan
saat author menyatakan arc berjalan selesai).

## Kaisar dari Masa Depan: story threads + promises connected — 2026-10-20

Continuing the Kaisar gap list (post-Solo-deletion). Three story threads and
three story promises created via the audited API (temporary author session,
deleted after), all grounded in the author-approved Bab 1-9 drafts and
canonized lore — no invented events:

- Threads (OBJECTIVE/CONFLICT): "Lunasi utang keluarga sebelum tenggat
  tujuh hari" (imp 5, ch4), "Musuh dusun: penagih hutang + tetangga yang
  meremehkan" (CONFLICT, imp 4, ch4), "Kebangkitan Maspati: ilmu Aetherion
  untuk kehidupan desa" (imp 5, ch6) — each with payoff intent anchored to
  Bab 8-9.
- Promises: "Yang makan banyak, bayar banyak" (ch9 dinner commitment,
  imp 4), "Tenggat tujuh hari: lunas atau Sofian dijual" (ch4, imp 5,
  payoff: panen ikan Bab 8 / verifikasi Bab 9), "Barter ikan pertama
  dengan Pak Husein" (ch8, imp 3).

SQL verified: 3 threads + 3 promises persisted. Note: the API host process
had fully stopped (port 3000 refused); restarted as `nf-api-3000-v11`
(same env contract: acceptance 5433 / redis 6399). Remaining Kaisar gaps:
cover (BLOCKED — needs an author-supplied image asset), character
states/arcs/knowledge (needs the character-development follow-up with
source citations), references (needs author material), narrative
policies/planning horizon (author policy picks), endgame ledger (needs
real threads → now satisfiable: the main-objective thread can anchor a
MUST entry when the author declares an ending; the story is ongoing, so
not done now).

## Solo Leveling deleted (author-directed) — pre-delete backup secured — 2026-10-20

The author asked to delete the "Solo Leveling" webnovel (`bdab82a0`, ws-c)
after the many changes. Safety sequence before the destructive step:

1. Fresh whole-database backup taken first:
   `backup/pre-delete-2026-10-20.dump.enc` (pg_dump -Fc → AES-256-CBC
   PBKDF2 600k, passphrase `backup/.passwd`); round-trip decrypt verified
   (`PGDMP` header). It is NOT committed to git (untracked) — author may
   commit via LFS or keep local. It captures the full post-endgame/
   post-grammar-correction state (270 chapters, 90 characters, 217 facts,
   315 proposals, endgame gate, all today's work).
2. `DELETE /novels/:id` via API → 409 CONFLICT by design: canon facts are
   RESTRICT on novel delete and no fact-DELETE route exists (only retract),
   so the API path cannot complete for a novel carrying facts. The
   ConflictError message documents the intended resolution.
3. With the author's explicit instruction and the backup secured, the
   deletion completed via author-authorized SQL in one transaction, in
   FK-safe order: character_knowledge (14) → canon_facts (217) →
   scale/publication/story_events (273) → novels (1, cascade for the
   rest). Zero orphan chapter_versions after; `Sung/Seong Jin-Woo`
   duplicate character rows removed with the novel.

Verified after: 0 novels/chapters/characters/entities referencing the id;
Kaisar novel untouched (9 chapters). Workspace ws-c now carries only
"Kaisar dari Masa Depan". Recovery path: decrypt
`pre-delete-2026-10-20.dump.enc` with `backup/.passwd` and pg_restore into
a fresh database (runbook procedure) — restores the novel exactly as it
was before deletion.

## Solo Leveling grammar audit phase 2 applied (poin 1-2, Bab 1-10) — 2026-10-20

Phase-1 audit (~460 findings) reported; the author ordered poin 1-2 first.
Applied as NEW chapter versions via the audited API (PUT /chapters/:id with
expectedVersion CAS; nothing overwritten — v-old remain in history):

- Kanon nama (poin 1, author-decided): protagonist → `Jin-Woo`
  (fixed Jin-Wuo 44, Jinwoon 1, Jin Woo 24, Jinwoo 14, Jin-woo 11);
  healer → `Ju-Hee` (fixed Ju-Hui/Yu-Hui/Joo-hee/joohee);
  `Yu-Rah` → `Yu-Ra` (perawat Choi Yu-Ra, ch10).
- Tanda baca (poin 2): ellipsis dinormalisasi ke `...` (unicode `…` dan
  runs ≥2 titik), spasi-sebelum-tanda-baca 43×, koma/titik tanpa spasi
  21×, tanda baca di luar kutipan, kapital awal kalimat setelah titik
  tunggal (ellipsis tetap lowercase — lanjutan kalimat).

Post-check live read-back: 0 sisa anomali poin 1-2 di kesepuluh bab.
Version map: ch1 → v6, ch2-10 → v2 (versi lama tetap tersimpan; non-
destructive). NOTE: ch1 was PUBLISHED → unpublished first (lifecycle
PUBLISHED → IN_REVIEW), status kini IN_REVIEW — author republishes from
the UI after phase-2 completes. The corrected ch1 (v6) is NOT yet
republished by design. Character DB still holds duplicate rows
(`Seong Jin-Woo` vs `Sung Jin-Woo` vs `Jin Woo`; `Ju Hee`/`Ju-Hui`/
`Lee Ju Hee`) — cleanup is a separate follow-up.

Remaining audit items (NOT applied, awaiting author): poin 3 manual
repairs (~40 lokasi kalimat orphan/mistranslation/A-kompor) dan poin 4
sentence-splitting (6 kalimat >40 kata).

## Solo Leveling endgame connected — ending gate READY (author sign-off) — 2026-10-19

Author instruction: the endgame domain was not connected to Solo Leveling
(`bdab82a0`, ws-c) and the novel is tamat. Connected through the NF-WF-022
condition-based flow (no forced ending; author sign-off only), entirely via
the audited API with a temporary author session (deleted after):

1. One author-directed story thread created — OBJECTIVE, importance 5:
   "Alur utama — Perjalanan Sung Jin-Woo (tamat)", introduced at chapter 1,
   then set RESOLVED at chapter 270. This is the real main storyline of the
   imported manuscript, not fabricated filler; the endgame ledger requires
   a thread anchor and the extraction had produced none.
2. Endgame ledger entry (MUST) created against that thread with the
   closure criteria "alur utama tuntas; epilog Bab 270 menutup perjalanan
   tanpa utang naratif terbuka" and the author instruction as rationale.
3. Ending gate approved by the author's account → verdict READY
   (`blockingItems: []`, approvedById `5c0005c6…`, approvedAt
   2026-10-19T19:03:49Z). Debt report: zero unclosed MUSTs, zero unpaid
   callbacks, zero open threads, zero sequel hooks.

SQL + audit verified: endgame_ledger 1, endgame_gate_approval 1, thread
RESOLVED; audit trail story.thread-opened → story.thread-status-changed →
endgame.ledger.created → endgame.gate.approved under the author's user id.
Gate state is append-only approvals; the ledger status remains
author-editable. Novel status stays ACTIVE — the enum (DRAFT/ACTIVE/
ARCHIVED) has no "completed" value; tamat is recorded by the READY ending
gate, which is the designed representation.

## Approved workspace authoring program; implementation planned — 2026-10-20

Author approved chapter controls/manual+AI creation/title+notes, rename/delete,
model selection, profile mapping actions, whole-novel all-or-nothing publication,
cover generation and workspace Studio customization. Additions:1–9 generated
cover candidates and recommendation badges; individual agent/AI-skill model
preferences with workflow default; manual or selected-model AI definition drafts.
No application implementation or runtime acceptance for these additions yet.

Accepted design: docs/superpowers/specs/
2026-10-20-workspace-chapter-lifecycle-design.md. Proposed execution plan:
docs/superpowers/plans/2026-10-20-workspace-authoring-program.md, linking chapter,
routing/Studio, cover and ownership-policy slices. Native execution recommended;
plan review/method selection pending. Every slice retains independent exact-diff
review, real configured gateway acceptance and disposable mutation-test data.

Workspace cap: author requested one owned workspace for ordinary authors and
no novel cap, owner/admin exempt. Exact exemption awaits clarification because
all creators become membership OWNER and only SUPER_ADMIN exists globally.
No membership/role/data changes inferred; existing workspaces preserved. Image
provider capability also remains unverified; adapter/storage/worker acceptance
must be real. Both limitations are explicit in ISSUES and the plans. Prior
homepage/navigation source remains uncommitted and preserved at baseline7a5cac3.

## Author homepage and tool navigation polish — 2026-10-19

Implemented compact grid/list library cards, reference-aligned account/profile/
logout and language dropdowns, styled Admin CTA, shared icon return links,
workspace Tools SVG caret and consistent Recovery controls. Studio preserves
the source novel through a validated query; direct visits return to the library.
Own-session API projection selects only displayName/email after authentication.

Evidence: 58 focused web tests, six native auth tests, web/API typechecks,
scoped lint and diff check pass. Separate exact-source review APPROVE; app scope
SHA256 d6627c8d592e9e243c343adcfad7a5d1e345ee3d4f6de35b0601d5f92d2576b8.
Native scratch + live Chromium en1440/id390 verify profile, dropdown geometry/
focus, grid/list and seven clicked return journeys. Live inspection performs
no API writes and retains identical novel/chapter row hashes; temporary auth
sessions removed. API reloaded safely; Docker and worker retained.

Requested OpenDesign MCP is unavailable (two reads: Transport closed); no remote
design output is claimed. Local authoritative reference and rendered inspection
used. Existing Studio blank empty-list panel is recorded in ISSUES for follow-up.
See tasks/author-home-and-workspace-navigation-polish.md and ignored
.nf-artifacts/home-polish-{browser,live}-receipt.json. No commit/push or human
screen-reader acceptance claimed.

## Backup pocket: encrypted snapshots, restore drill, passphrase custody — 2026-10-19

Commit `f1317f3` originally pushed plaintext pg_dump snapshots; the author
then required encryption. Commit `ab2d204` removes the plaintext dumps from
the git tree and replaces them with `backup/*.dump.enc` (AES-256-CBC,
PBKDF2, 600k iterations, salt). The passphrase lives ONLY in
`backup/.passwd` (55 chars, author-provided) and is Git-ignored
(`backup/.passwd` line in `.gitignore`); it is NOT in the repo, LFS, or
history of that file's directory. Recovering it requires the local file —
recorded here as custody, not a value.

Restore procedure (runbook-aligned, `BACKUP-RESTORE-RUNBOOK.md`):
1. pull `backup/<name>-<date>.dump.enc`;
2. `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <name>.dump.enc
   -out <name>.dump -pass file:backup/.passwd`;
3. verify header `PGDMP` + `pg_restore --list` TOC;
4. create disposable target, `pg_restore --no-owner --username novelforge
   -j 4 -d <target> <name>.dump`;
5. compare `_prisma_migrations` counts + spot tables, then drop the drill DB.

Restore drill 2026-10-19 (both dumps, disposable `nf_restore_drill` on the
compose pair, then dropped): acceptance novels 2/2, chapters 279/279,
characters 98/98; primary users 4/4, novels 4/4; `_prisma_migrations`
47/47 — source vs restore identical. Temp decrypt files removed after.

GitHub push cascade: `f1317f3` (compose+backups, LFS 131 MB),
`ab2d204` (encrypted backups at rest) pushed; CI runs in cascade
(`39282410881`, `39282780606`). Irrelevant to backups: LFS object of the
first plaintext commit (`f1317f3`) stays visible in remote LFS history
until GitHub GC — the encrypted replacement is authoritative. If the
author wants plaintext LFS objects purged, that needs a support/history
rewrite decision, not an ordinary push.

## docker-compose becomes the one-group NovelForge stack — 2026-10-19

Author requested one group: `docker compose up -d` starts everything,
`docker compose down` stops everything. The compose file now carries four
services: postgres/redis (unchanged defaults, ports 5432/6379) plus
postgres_acceptance/redis_acceptance on 5433/6399 — the previously
standalone `nf-pg-5433` and `nf-redis-acceptance` containers. Their data
volumes are declared EXTERNAL (`nf-scratch-5433`, the acceptance redis
anonymous volume id) so `down`/`-v` can never touch the live acceptance
database or BullMQ queues; `compose config` validated.

Transition (no reinstall, no data reset): the standalone containers were
removed (`docker rm -f` keeps volumes), then `docker compose up -d` recreated
the pair inside project `novelforge-ai`. First `up` hit a stale 5432 port
proxy (Docker Desktop lingering after the postgres recreate); a second
`up` started cleanly. Verified after the swap: 4/4 healthy, both databases
retain data (2 acceptance novels incl. `novelforge_acceptance_050b`; 4 primary
users), redis acceptance queues intact. The swap briefly killed the worker
and API host processes: `nf023-worker-r3` (with
`--experimental-transform-types` — worker entry needs it, unlike the API
server; env contract unchanged: DATABASE_URL → 5433 acceptance, REDIS_URL
→ 6399/0) and `nf-api-3000-v10` restarted, `/ready` shows database+redis
up. The earlier `nf023-api-r2`/`nf023-worker-r2` service records remain
historical.

`docker compose down` now stops all four; data survives unless `-v` is
passed. Host-side node processes (API/worker) are outside Compose by
design and are not affected by compose lifecycle events.

## CI repair: migration baselines keep the audience migration — 2026-10-19

CI on main had been red since the audience migration landed: the 050A/050B
scale-migration tests build historical baselines that dropped every
migration newer than their cutoff, including the independent
`20261018_novel_audience`, while the HEAD Prisma client reads
`novels.audience` while seeding — ColumnNotFound on the baseline deploy.
Fix (commit `fb73668`): both tests keep a KEEP_MIGRATIONS set (independent
of the cutoff tables) in their temp homes and derive baseline/ledger
expectations from the live migration set instead of fixed counts (41/42).
16/16 migration tests PASS locally on the acceptance cluster; web suite
(41 workspace + 17 author-home) and typecheck/lint PASS. Pushed runs:
`39264165487` CI success (17m58s, all jobs green) at HEAD `fb73668`; the
older in-flight run for the pre-fix commit was auto-cancelled by GitHub as
a higher-priority run superseded it.

## Health & Memory panel and author-home library revisions — 2026-10-19

Author-requested UI revisions, verified in the real browser (authenticated
live loop, temporary session deleted after):

1. Health filter row alignment: the `ID revisi` hint span previously sat
   inside the label column, lifting the button and inputs off one baseline.
   The hint now renders below the form row; Chapter / Revision id /
   Severity / Refresh share the same `items-end` baseline (en screenshot).
2. The UNRESOLVED-identities register no longer renders a raw JSON `<pre>`.
   It is now per-finding cards with a header `Re-check` button
   (`data-testid=unresolved-refresh`, en "Re-check" / id "Cek Ulang") and a
   per-card `Go to` button ("Menuju") that emits `goto {kind, id, rule}`.
   The writer page maps character → Characters panel (preselects and
   flash-highlights the card via `nf-review-highlight-card`, the
   writer-workspace accent-dim + inset-bar treatment from
   docs/design/writer-workspace and the same tokens as the editor's
   `nf-review-highlight`), entity → Canon panel, timelineEvent → Timeline.
   The register stays read-only: the machine opens the surface, the author
   decides the fix. CharacterList scrolls the focused card into view.
3. Author home (`/`) library redesign: view toggle (grid | list icon
   buttons, `aria-pressed`, persisted in localStorage
   `novelforge.libraryView`). Grid = cover-first 2:3 cards with status
   badge over the art and slug; List = compact rows with 56px thumb and a
   chevron. Novels without a cover get a deterministic per-id hue
   placeholder gradient (`--h` inline, hsl-based, design tokens) carrying
   the literary title — the 2:3 geometry keeps the grid stable even
   though live reads proved Solo Leveling shows its real cover.
4. Tests: HealthMemoryPanel unresolved test rewritten to the new cards
   contract (asserts card detail text, goto payload, and a second
   unresolved fetch on Re-click). All 41 workspace tests, 17
   author-home tests, web typecheck, and repo-wide `pnpm lint` PASS.

## Solo Leveling story-health repair: identity links + Baek Yoonho knowledge — 2026-10-19

Author-directed switch to the Solo Leveling novel (`bdab82a0`, ws-c, DRAFT).
The "Kesehatan & Memori" panel showed 13 findings: 10 UNRESOLVED_IDENTITY
(WARNING) and 3 KNOWLEDGE_BOUNDARY_VIOLATION (WARNING) against Baek Yoonho.

Root causes, verified against the live acceptance DB before any write:

1. UNRESOLVED_IDENTITY × 10 — rule (b) flags characters holding
   `character_knowledge` rows while `story_entity_id` is NULL. All 90 Solo
   Leveling characters were unlinked because the import created characters
   with keys `nf059-<hash>` while their mirror entities use
   `nf059-character-<hash>`; the C9.1 exact-key backfill therefore matched 0
   rows. The 24-char hash suffixes are 1:1 (100 entities / 90 characters).
   Author authorized the repair; a PRE_MUTATION checkpoint
   ("pre character-entity link backfill (nf059 identity repair)") was created
   via the API first, then the 90 links were set by a suffix-equivalence
   UPDATE mirroring the C9.1 discipline (kind=CHARACTER, same novel, no
   name matching, uniqueness re-verified 0 duplicates). Direct SQL is
   justified by the character-routes GAP-058 note: no route or service
   writes this link — it is migration/author-action owned.
2. KNOWLEDGE_BOUNDARY_VIOLATION × 3 — chapter 270's version cites 3 canon
   facts; Baek Yoonho is the only cast row covering ch270 (states 95-96,
   117-118, 270-271) and held 0 knowledge rows. Remediation through the
   audited API: `KNOWN/REMEMBERED` for the fire-scene fact
   (3ecee8c9: Baek Yoonho appears in the quote verbatim), explicit `UNKNOWN`
   rows (fromChapter 270, toChapter 271) for the two scenes he does not
   appear in (0ffcdbf5 Jin Woo vs blue-mist monster; c745bec6 Jin Woo/Cha
   Haein flight epilogue) — recording the author check without fabricating
   knowledge.

Re-evaluated after the fixes: UNRESOLVED_IDENTITY 10 → 0 (register empty).
KNOWLEDGE_BOUNDARY_VIOLATION 3 → 2: the two facts carrying explicit UNKNOWN
rows initially still fired, because the KBV rule treats an in-window UNKNOWN
row as the boundary signal itself. After the author's follow-up correction
(passed on 2026-10-19), a live re-check returned 0 findings and an empty
unresolved register — the KBV pair cleared with the final window/stance
state. Author confirmed the remaining warnings are gone; verified live:
findings 0, unresolved 0.

A temporary author session was used for the API calls and deleted after;
0 sessions created by this work remain. Earlier same-day session rows
belong to other work and were not touched.

## Solo Leveling planning data, Save review and publication repair — 2026-10-19

COMPLETE, separately reviewed and locally active. Solo Leveling has outline
version 1 (DRAFT, 270 source-linked nodes) and horizon bands FULL/5, BEATS/20,
SKETCH/60, VAGUE/tail, verified through API/database and actual author UI.
Original/current source hashes retain chapter 1's author name corrections;
the imported summaries remain explicitly derived, unapproved observations.
Pre-change native checkpoint/backup are recorded in
`tasks/solo-planning-and-publish-review.md`.

Writer Save now saves then runs the native final-text review, including when
blur autosave is already in flight. Publish first reviews and releases only
on confirmed PASS for the version selected by this click; the native locked
publication guard rejects a different current version. Existing HARD/SCALE
gates remain enforced. Failed findings appear above Generation; Show selects
verified unique quoted text with the reference design's temporary orange
highlight. Edit in place, then Save to review again. Edited findings become
stale; policy-only/missing-data findings never invent text positions.

Observed 42 focused web + 26 native PostgreSQL planning/publication tests PASS;
affected types/scoped lint/diff PASS; independent review APPROVE. Native scratch
browser EN desktop/ID mobile Save/Publish, real SCALE refusal, editable
highlight and re-review PASS with database read-back. Live chapter 1 version 5
Save-review PASS, 270 source chapters and 315 canon proposals preserved,
0 published chapters. Updated local API readiness 200. No commit/push,
automatic outline/canon approval, live publication or human screen-reader pass.
Temporary Engram hook timeout recovered only after fresh host confirmation.

## Canon proposal batch decisions — 2026-10-19

Completed and independently reviewed: Canon > Proposals now supports pending
multiselect/select-all, counted confirmation, shared rejection note and visible
per-item results. Native pre-batch checkpoint and per-approval HIGH recovery
remain intact. Both decisions chain committed revision CAS through new
novel-scoped routes. Batch approval never supersedes a live fact; conflicts
require individual review. Stop at first failure/uncertainty or unmount;
earlier successes remain committed and unprocessed items remain undecided.

Observed: 44 focused web + 67 native PostgreSQL canon API tests PASS; web/API/
ai-services types, scoped lint and diff check PASS; separate review APPROVE.
Real browser/native scratch DB EN desktop approve, ID 390px reject and partial
conflict stop PASS with persisted decision/checkpoint read-back. Main database
retains 315 identical proposal rows, 2 novels/279 chapters. Local API activation
verified no unsettled generation, readiness 200 and missing-head 400 for both
new routes. No migration/commit/push, live candidate approval or human
screen-reader acceptance. Full task/evidence:
`tasks/canon-proposal-batch-decisions.md`.

## Outline version 1 approved for "Kaisar dari Masa Depan" — 2026-10-19

The Kaisar novel (`e36d568b`, ws-c, DRAFT) now has outline_versions populated
and approved. Outline version 1 ("Babak 1 — Kebangkitan di Maspati") was
created via the real API as a structured draft: 9 beats, each carrying its
existing outline node id, chapter id/title and the 3-4 scene ids seeded for
that chapter. Approved through
`POST .../planning/outline-versions/:id/approve` with the tri-state head
omitted (matches the OutlineVersionsView UI contract).

SQL-verified after approval: 1 outline version, number 1, status APPROVED
(one-APPROVED-per-novel partial unique index intact); audit trail
`planning.outline-draft-created` + `planning.outline-approved` under the
author's real user id; `outlineVersion.approve @ R172` PRE_MUTATION
checkpoint recorded; main-branch head revision advanced inside the
transaction. The temporary author session used for the calls was deleted
afterwards (0 lingering sessions for that window). The approved content is
projection-only metadata: the 9 `CHAPTER_GROUP` outline nodes remain
CHAPTER_GROUP in `outline_nodes` (kind is immutable without a delete+create
path), so the chapter/scene links live in the version content, not the nodes.

Remaining gaps for this novel are unchanged: cover unset, character
states/arcs/knowledge 0, story events/threads/promises/causal edges 0,
references 0, narrative policies/planning horizon/endgame ledger 0.

## Writer chapter scrollbar and sorting verified — 2026-10-19

Author-requested chapter navigation now has its own keyboard-scrollable bounded
region and localized oldest/newest select. Numeric chapter order is computed
from a copy; active selection, source array and unsaved text remain unchanged.
Story-tool buttons follow the constrained list rather than270unbounded rows.
Explicit shell/grid constraints also fix a390px mobile intrinsic-width overflow.

Focused navigation/locale22tests, web typecheck, scoped lint and diff-check PASS;
separate exact-diff review APPROVE. Live270chapter browser in en/id desktop and
Indonesian390px verifies sorting, keyboard scrolling, preserved active selection
and no document overflow, page errors or API writes. No database/story mutation,
dependency, commit/push or publication. See tasks/writer-chapter-navigation.md.

## NF-WF-059 character development applied — 2026-10-19

The author specifically authorized this follow-up.90existing Solo Leveling
entries were assessed;74labelled reconstruction arcs for57entries,268sourced
milestones and11chapter-local knowledge observations were applied through native
scoped/audited services.33entries remain without unsupported development arcs.
Separate review approved the exact final-plan hash after50corrections, removing
dream events, mixed identities, failed remembering, narrator/knower confusion
and false progression across the chapter243 reset. This is bounded source
reconstruction, not exhaustive all-prose semantic certification or human sign-off.

Verified full-row hashes preserve315PROPOSED semantic candidates,90characters,
266existing states,270current manuscript versions/content, novel metadata and
other novels.11new quoted learning-observation facts support the knowledge rows;
no semantic-proposal approval or alias merge occurred. The existing product's
ACTIVE arc status is explicitly presented as reconstruction, without inventing
story resolution. Current primary workspace/account and audience are preserved.

API read-back checks chronological progress, citations and knowledge windows.
Authenticated read-only browser confirms arc milestones through its progress
form and the Knowledge tab, with no page errors or writes. Final checkpoint
`a82a210d-8de0-47a7-9244-4d84da9fd26f` was read back; fresh pre-operation DB
backup and private source/review/application receipts are retained. No product
code changes, full CI rerun, commit/push or publication are part of this phase.
Remaining indexing/memory, timeline/relationships, author policies and semantic
approval gaps from the earlier inventory are separate, still-open work.

## NF-WF-059 private source import verified — 2026-10-19

Completeness clarification after the author's follow-up: the import and bounded
initial extraction are verified; full structured story intelligence remains
incomplete. Live inventory finds no reference chunks/memory projections,
structured relationships, timeline/causal edges, character arcs/knowledge,
threads/promises, narrative DNA or endgame records. Relationships exist as
157reference observations;315semantic claims remain PROPOSED. The generic saga
and270editable outline nodes are not a reconstructed approved arc structure.
See ISSUES-AND-GAPS, NF-WF-059 structured-data completeness follow-up. No story
mutations or candidate approvals were authorized or executed by this inventory.

Imported Solo Leveling from the author's ignored local source directory into
the explicitly selected primary MySpaces workspace, preserving source author
attribution and Indonesian manuscript/derived descriptions. The separate
existing Kaisar novel, including its concurrent nine-chapter author work,
remained unchanged during enrichment. No public publication or author approval
was inferred from the import or database actor IDs.

Read-back verified270chapters /493625words with original immutable version1
content hashes, source synopsis/metadata, original JPEG cover,90characters,
266chapter-scoped character observations,275story entities (including158world
groups),148verbatim source excerpts with validated immutable-version spans,
315PROPOSED semantic candidates,270retrospective outline nodes,270linked story
events and5source/reference documents. Relationship/lore descriptions and
203uncertainty notes remain explicitly attributed extraction material. No
outline is approved; no generated interpretation was promoted by an invented
human decision. This is a bounded extraction, not proof of exhaustive semantics.

The minimal authenticated cover configuration/display path is integrated and
independently reviewed by the integration owner against the isolated worker's
diff. Root verification: cover validator12tests, cover API4tests on a dedicated
database, affected web23tests, scoped ESLint and API/web typechecks PASS.
Authenticated live browser verified the exact cover bytes/image, primary
workspace editor,270chapter API result,90character selector, world entities,
canon excerpts and pending proposals; no page errors or approval actions.

Pre-import backup restore succeeded in a dedicated disposable database, then
the clone was dropped. Pre/post enrichment checkpoints were created; final
checkpoint `46fda59f-5797-4144-b27b-b62ab453eda5` was read back. Private receipts,
source, raw outputs, screenshots and pre/post database backups remain ignored.
References and cover settings are excluded from story snapshots: retain their
original files and database backups. Never restore a whole database over newer
unrelated author work automatically. See task NF-WF-059 for recovery evidence.
No commit, push, database reset or Docker replacement was performed.

## Authorized combined publication — 2026-10-19

The author explicitly authorized commit and push of NF-WF-058 and all other
current changes. The included discovery slice adds author-managed genres and
nullable teen/mature/adult audience, genre tooltips and additional en/id copy.
Independent review found and verified repairs for pending metadata-save races
and hidden audience-only badges. API3files/46tests and affected web2files/16tests
PASS; API/ai-services/web typechecks and global/scoped lint PASS. Actual isolated
API/browser verified UI write/read-back and public audience-only rendering,
without changing the author's live novel. Final publication checks and Git
identity are recorded in the task and Engram handoff.

The Audience migration is additive and was verified on dedicated databases.
Reverting application code can leave the nullable column/type in place;
dropping them would discard ratings and is not part of this publication.
Private tooling, screenshots, backups and raw output remain Git-ignored.

Final combined checks: full web100files/642tests PASS, API3files/46tests PASS,
final Nuxt production build PASS, and both independent source reviews APPROVE.
The transient Engram hook timeout recovered through a normal attributed retry;
checkpoint416 saved and read back. The combined30-file change is ready for the
explicitly authorized commit/push; Git and final Engram handoff own its identity.

## Reference design restoration — 2026-10-19

The author explicitly selected `docs/design/writer-workspace/index.html` over
the Monokai redesign. NF-WF-058 restores its stone/orange surfaces, typography,
compact controls, subtle borders and desktop editor proportions throughout the
application. Shared form/table/dialog/dropdown/toast states, author cards,
supporting-page headers and narrow writer navigation are implemented.
Pre-existing discovery/audience changes remain preserved and separate.

Independent source review APPROVE. Real isolated API/browser verification
covered15desktop and15narrow route families,5admin tabs, gateway health toast,
EN/ID390px editor panels, focus/Escape, reduced motion and corrected dropdown
bounds at320/390/768px. Full web638passes plus final focused4passes after a
test-harness correction; typecheck/scoped lint and final production build pass. See
`tasks/NF-WF-058-reference-design-restoration.md` for exact evidence and limits.

OpenDesign MCP connection was recovered and the actual original/companion
bundles retrieved. The commissioned refinement failed at a provider usage
limit after producing usable artifacts; no successful run is claimed.
The source reference is unchanged. Live data preserved, including the author's
new novel; no reset, commit, push or deployment in this task.

## Final Monokai/workspace review and verification — 2026-10-18

The author authorized inspection, concrete fixes, then commit/push of current
changes. Two independent read-only reviewers found and re-reviewed fixes for
workspace deletion races (novel insertion and revoked ownership), atomic
rename/delete auditing, protection of novel-independent definitions/references,
pending-form identity, initial-list races, ambiguous outcomes, visible deletion
errors and modal keyboard isolation. Shared explicit Tab containment supplements
native showModal background isolation; radio/checkbox accents use Monokai.

Root checks: full web97files/631tests PASS before the final shared Tab helper;
affected3files/37tests PASS after it. API3files/38tests PASS on disposable DBs,
including actual PostgreSQL lock interleavings and audit-failure rollback.
API/ai-services/web typechecks exit0. Root lint exit0 after excluding only the
private .nf-artifacts directory;3ESLint boundary/scope regressions PASS, preserving
API/web/worker coverage. jsdom canvas warnings do not prove rendered contrast.

Actual Chromium used an isolated real API on3002 and disposable
novelforge_test_ws_mgmt via transparent request forwarding; responses were not
mocked. Verified15route families including a fixture-populated writer and
public chapter, real workspace create/rename/delete, protected-history409,
modal/nested-confirm keyboard loops, five admin tabs, actual gateway health
and actual model discovery2980 with matching toast. Error401 after explicit
logout rendered at5.69:1 contrast. Screenshots for the writer, AI Studio,
mobile/id manager, gateway/toast and confirmation were inspected. The published
chapter state is an explicit disposable visual fixture, not author approval or
publication-workflow acceptance. No LLM prose generation. CSS zoom200% doubled
the measured control height; native browser chrome zoom is not claimed.

Live counts preserved:2users/4sessions/2workspaces/2memberships/0novels/0chapters.
Only the verified live API was refreshed24784->43232 to activate reviewed fixes;
ready200 and authenticated read-only workspace list200. Temporary verification
session removed; worker, Nuxt and Docker unchanged. No reset/account cleanup
was repeated. Current receipts: .nf-artifacts/nf056/final-browser-receipt.json,
final-browser-extra-receipt.json and review-api-activation.json (private).
Source reviews APPROVE; see tasks/NF-WF-057-workspace-management-review.md.

## Workspace ownership transfer + demo-user cleanup (live data, author-directed) — 2026-10-18

Author-directed live-data administration on
`nf-pg-5433/novelforge_acceptance_050b`:

1. **Ownership transfer** — `050b-acceptance-ws-c` moved from the tester
   account `nf050b.authorc+20261011@test.local` to
   the designated administrator account via the audited product path (membership
   AUTHOR→OWNER promotion, then old-owner demotion to AUTHOR — two
   `member.role-changed` audit rows) plus a conditional `workspaces.owner_id`
   update (out-of-band, ADR-0005-precedented) so the owner column matches the
   membership truth.
2. **Demo-user deletion** — author then ordered deletion of all demo users;
   only the designated administrator and separate author accounts are real. Deleted in one
   ON_ERROR_STOP transaction: 3 empty demo workspaces (`nf-050b-acceptance-ws`,
   `050b-acceptance-ws-r2`, `050b-workspace-b` — verified 0 novels/canon
   facts/workflow runs/chapters first), with retained history detached not
   erased (21 workspace-scoped + 761 actor-scoped audit rows and 2 generation
   rows → NULL tenant/actor, preserved anonymized), authorc's remaining
   AUTHOR membership in the transferred workspace, and the 5
   `@test.local` users (sessions cascade).

Verified post-state: exactly 2 users remain; 2 workspaces —
`050b-acceptance-ws-c` (designated administrator owner) and
`nf054-live-1792234844032` (separate author owner); 2 memberships; 0
novels (unchanged since the NF054 story reset); 0 orphaned workspace-scoped
audit rows. RBAC reflected live: the demoted tester session now reads
`role: AUTHOR, canRename/canDelete: false` on the transferred workspace;
its sessions are deleted, so the tester browser session is invalid — the
author signs in with the designated owner account to manage the workspace.

## Workspace management (create/rename/delete) — implemented, verified live, NOT committed — 2026-10-18

Author request: workspace creation + edit/delete for authors, entry button
placed next to "Create webnovel". Implemented on top of the uncommitted
NF056 tree (0 staged).

Backend: `packages/ai-services/src/platform.ts` — `updateWorkspace`
(`workspace:update` = OWNER/ADMIN; display name only, slug immutable;
audited `workspace.updated`), `deleteWorkspace` (`workspace:delete` =
OWNER-only; refuses non-empty with typed `WorkspaceDeleteError` → 409
`WORKSPACE_NOT_EMPTY`; detaches nullable Restrict-FK history — audit rows +
generation analytics keep existing with `workspaceId: null` — then deletes;
audited `workspace.deleted` with null tenant boundary);
`WorkspaceListView` += `canRename`/`canDelete`/`novelCount`.
`apps/api/src/platform-routes.ts`: `PATCH` + `DELETE /api/workspaces/:id`
(zod-validated; typed-refusal mapping before the generic ConflictError
branch). No migration: delete is gated on empty workspaces, so the novel
cascade is unreachable and retained history is detached, never erased.

Frontend: `WorkspaceManagerDialog.vue` (create form with auto-derived
editable slug; per-row rename inline + delete through the shared
`ConfirmDialog`; actions permission-hidden via the server-derived flags;
409/403 mapped to en/id copy); home `index.vue` "Manage workspaces" button
beside "Create webnovel" (aria-haspopup/expanded, focus returns on close);
i18n `authorHome.ws*` keys en+id. `ConfirmDialog` fix: its document-level
Escape capture listener now ignores events while `open=false` (it was
swallowing Escape for any layered surface hosting it — regression-tested).

Verification: `tsc --noEmit` + `vue-tsc --noEmit` exit 0; API integration
`workspace-management.test.ts` 9/9 (dedicated `novelforge_test_ws_mgmt` db)
+ platform-admin suite updated for the extended view (21/21 combined);
web suite **97 files / 623 tests pass**; ESLint clean on all changed files;
live Chromium E2E on the real app: created `NF Feature Check` (slug
auto-derived `nf-feature-check`), renamed it, deleted it via confirm —
net-zero data, evidence `.nf-artifacts/nf056/shots/ws-mgmt-button.png` +
`ws-manager-e2e.png`; Escape closes the dialog and focus returns to the
opener button.

Environment note: the stale root `.env` (`DATABASE_URL` → 5432 with invalid
password, flagged "may be stale" in the NF056 prompt) was confirmed broken;
the dev API now runs from this session (`nf-api-3000-v6`, pid 46988,
:3000) against `nf-pg-5433/novelforge_acceptance_050b` — the historical
working database — with credentials taken privately from the container
definition. The author's previous API process (started before the workspace
routes existed) was stopped to load the new code; web dev server untouched.
Ops follow-up: after the audience column shipped, the API had to be
restarted once more (v6) because the previously loaded Prisma client predated
`prisma generate` — every novel `findUnique` 500'd on the unknown
`novels.audience` field until the regenerated client was loaded
(`tenant-isolation` 7/7 re-run as proof).

Follow-up (same day): `NewNovelWizard` now renders as a modal (same
backdrop/Escape/focus pattern as the workspace manager dialog); Escape is
guarded against dismissal while a request is `busy`/`ambiguous`/`completed`
so ambiguous outcomes stay visible. Home tests 16/16 (modal render +
localized label + close). Live-browser proof of this modal is gated by the
demo-session cleanup above (no retained real-account credential) — same
limit class as GAP-126; the wrapper is identical to the live-verified
workspace manager modal.

## Novel genres + target audience (author-set, reader-facing) — implemented, NOT committed — 2026-10-18

Author follow-up: genre and target-audience management for novels. The
genre backend existed (NF-WF-014 PATCH `/genres`) but had no author UI;
audience did not exist at all.

- Schema: `Audience` enum (`teen`/`mature`/`adult`) + nullable
  `novels.audience`; migration
  `20261018_novel_audience/migration.sql` (additive, idempotent-guarded;
  NULL = unset, renders nowhere). Prisma client regenerated.
- API: `PATCH /api/workspaces/:ws/novels/:n/audience`
  (`novel:update`; null clears; unknown value 400; 403/404 per RBAC via the
  shared gate) + `setNovelAudience` in the public-discovery services;
  `audience` flows into the anonymous listing payload (`DiscoveryNovel`);
  `getNovel` now returns `genres` + `audience` to members.
- Web: workspace drawer gains a "Novel details" (`discovery`) panel —
  `NovelDiscoveryEditor.vue`: 18 canonical genre chips (max 5, cap
  disables unselected chips), audience select (incl. "Not set" to clear),
  full-replace save through both PATCH routes (so edit = same flow as
  add), 403/400 mapped to en/id copy, saved-state timer cleaned up on
  unmount; `NovelCard` renders the audience label beside genres.

Verification: `public-discovery.test.ts` 22/22 (5 new audience tests:
set/change/clear, invalid 400, 401/403/404, public payload flow; migration
applies via the suite's fresh-DB `migrate deploy`), editor component tests
4/4, author-home 16/16 (wizard modal), `prisma validate` clean, vue-tsc +
tsc exit 0, ESLint 0 errors on changed files. Limits: browser walk-through
of the editor still gated by GAP-126 (no retained real-account credential);
audience is set-only for now (no reader-side filter).

Follow-up (same day, author-reported): 17 missing en/id keys under
`workspace.{world,canon,timeline,planning}` (tab labels, form placeholders
for fact editor/entity form/timeline forms/synopses/outline
versions/horizon, canon application ID placeholder) added to both locales;
locale parity now differs only by `review.showFullHash`, which is a
deliberate en-fallback fixture (comment in id.ts) and stays. Two typecheck
errors from the audience slice fixed (NovelView completeness in
`listNovels`/`listNovelsForUser`; VTU `exists()` assertion). Author-home +
useLocale + editor suites 38/38 after the additions.

## Lore seeding for "Kaisar dari Masa Depan" + consistency review — 2026-10-19

Author-directed content seeding into novel
`e36d568b` (ws-c, DRAFT) via the real API with a temporary session for the
author's real account (session row deleted after; harness pattern).
Created: 5 characters (Don Juan/Juan Cleverton, Sofian Magani, Husein
Pratama, Ketua Penagih Hutang, Atasan Juan Cleverton), 10 world entities
(4 LOCATION, 2 ORGANIZATION, 2 ITEM, 2 CONCEPT), 1 saga "Babak 1 —
Kebangkitan di Maspati" + 9 ordered outline beats (CHAPTER_GROUP interim —
SCENE/CHAPTER require real chapter/scene links that do not exist yet), 4
timeline entries, 1 MONOGAMY bond (Don Juan × Sofian), 3 stances (ENEMY ×2,
ALLY ×1), and a Narrative DNA profile (tone, protagonist, romance, style,
era/conflict/currency/bureaucracy notes). Throwaway scripts deleted.

Consistency review (author-requested): currency math, names, era, timeline
vs outline, and bond/stance graph all consistent with the author's
material. Reported (not auto-fixed): (a) synopsis typo "insyinyur";
(b) open question — Wajradhara's supreme ruler is called both "Raja"
("pihak Raja langsung" forming Bhayangkara Surya) and "Sri Maharaja Diraja
(Kaisar Nusantara)" while the novel title targets "Kaisar"; (c) novel
genres/audience still unset — recommendation offered, awaiting author pick;
(d) debt-collector group abstracted as a single "Ketua Penagih Hutang"
character; (e) canon facts intentionally not created — they require a
chapter/reference-version citation and the novel has no chapters yet.
Receipt of this review lives here; single-issue register not needed (no
product defect).

Author revision round 2 (2026-10-19, applied): (1) synopsis typo fixed —
"insyinyur" → "insinyur" (delete+recreate; the API has no synopsis update
route). (2) Naming corrected: "Sri Maharaja Diraja (Kaisar Nusantara)" is
the Kekaisaran Mahasagara title, not Wajradhara's — Wajradhara is led by a
Raja (own structure); bureaucracy concept entity renamed to "Struktur
Pemerintahan Wajradhara & Kekaisaran Mahasagara". (3) Genres set
{fantasy, high_fantasy, historical, progression_fantasy} + audience
**adult** (adult scenes appear semi-censored as "adegan dihilangkan").
(4) Debt-collector abstraction approved. (5) Outline beats enriched
(proses/kejadian/narasi + in-scene dialogue), dialogue/culture canonized in
DNA: Dusun Maspati villagers mostly polite (husband-wife respect; ~7/10
women well-mannered, old culture), other dusuns + the debt collectors
differ (ENEMY stances; that dusun will be wiped out by the protagonist);
New lore canonized in characters + DNA: Raja Wajradhara = good-hearted but
foolish, quick to anger (unlike his predecessor), influenced by the
Yuwaraja; Yuwaraja = equally foolish, actually neutral/ignorant, tempted by
imperial spies; BOTH will be killed directly by the protagonist in a
far-future chapter that auto-triggers once the protagonist's achievements/
innovations (life + war) mature and he has foiled the spies'/empire's long
plans. Mahasagara is ruled by a Kaisar Wanita (beautiful, gentle, firm,
cold-blooded) who will eventually become the protagonist's selir — not
killed. Aetherion's re-creation is a far-future arc (when protagonist is
Raja→Kaisar). The boss character appears only in the prologue (elsewhere
only as memory).

Ops notes: character delete via API failed with an empty-body JSON DELETE
(Fastify 400) — script fixed to omit content-type/body on DELETE. After
characters were deleted, the old bond remained empty and was rebuilt on the
new ids; the mis-scoped bureaucracy entity was deleted and recreated with
the corrected name. Final state verified in SQL: 8 characters, 18 entities
(8 CHARACTER mirroring the characters — added so canon facts about them are
authorable —, 4 LOCATION, 2 ORGANIZATION, 2 ITEM, 2 CONCEPT), 9 outline
beats, 4 timeline entries, 1 bond, 6 stances, genres + audience set, 0
lingering sessions.


## Chapter drafts 1-9 seeded for "Kaisar dari Masa Depan" — 2026-10-19

Author requested refined chapter drafts (diperhalus: proses, kejadian,
narasi) from the approved outline. 9 chapters created via live API
(POST /chapters then PUT /chapters/:id with content + expectedVersion:null)
as HTML paragraphs (Tiptap format): Bab 1 Malam Sangganya (Aetherion
presentation + world reaction), Bab 2 Lab yang Terbakar (funder betrayal +
death + lab fire), Bab 3 Dapur (reincarnation + memory-transfer sequence +
Sofian reunion + door knock), Bab 4 Tujuh Hari (debt collectors, in-scene
dialogue verbatim, mental combat simulation, sickle intimidation,
7-day deadline), Bab 5 Aku Bukanlah Don Juan (canonical dialogue verbatim,
environment survey + asset/constraint inventory), Bab 6 Rumput Tuba
(taste-test protocol, botany identification, neighbor mockery, Husein
scene, sesquiterpene dialdehyde explanation), Bab 7 Pelumpuh Ikan (paste
recipe process, 2-fish test, mass river dispersal), Bab 8 Kolam Kecil
(35-fish harvest, pond build, fish revival, 4-fish payment to Husein),
Bab 9 Janji di Meja Makan (canonical dinner dialogue, night scene ending
with "(Adegan dihilangkan.)"). Author's established dialogue lines are
preserved verbatim; adult-scene elision marker kept.

SQL-verified: 9 chapters, 1 version each, latest=1; verbatim dialogue and
the elision marker present in the right chapters. Ops: chapter create
response version is not 0 — save with expectedVersion:null; save loop made
idempotent by title to avoid duplicate chapters on rerun. Service note:
the supervised API wrapper (pnpm) exited while the node child kept the
port; orphan killed, API restarted as nf-api-3000-v8 on the acceptance DB
(5433/novelforge_acceptance_050b, Redis 6399/0), probe: /api/auth/session
→ 401 (alive). Not committed.


Scene nodes seeded for chapters 1-9 (2026-10-19, author-approved next
detail): 33 scenes total via POST /chapters/:id/scenes (structural anchors
only — title + summary + number, no content, no versioning per NF-WF-015).
Per-chapter counts: 3/3/4/4/4/4/4/4/3. Scene titles and summaries are in
Indonesian, same author-directed manuscript scope as the outline beats and
chapters. Idempotent: chapters with existing scenes are skipped. SQL-
verified counts; throwaway script deleted. Not committed.

## NF-WF-056 Monokai Pro UI polish — implemented, verification complete, NOT committed — 2026-10-18

Global Monokai Pro Classic migration of `apps/web` (44 tracked files
modified = 43 reviewed + `.gitignore` from review finding #3; 0 staged). Tokens in `main.css` `@theme` + `docs/design/DESIGN-TOKENS.md`
(now authoritative for the app UI; historical stone/orange annotated
superseded). Provenance: official Monokai Pro hues, cross-checked against
the official site and extension-derived mirrors; derived shades reconciled
with the commissioned OpenDesign generation (project
`novelforge-monokai-polish-5c6e`, run `ad5da719-1622-40cc-8f4e-83a4658b8b16`,
agent `codex` local, deliverable `index.html`: 24 tokens, 54 control states,
7 notification specimens, 9 page families, 61 measured pairings pass).
Scope: all 15 pages' families, 126 components' raw palette utilities (136
occurrences → semantic tokens), undefined-token defects fixed
(`nf-danger` ×7 sites, bare `bg-nf-bg` ×3, missing `-dim`/`-border` tokens
added, `shadow-nf-lg` token added for 7 pre-existing no-op usages),
`text-white`/`bg-white`/hardcoded `accent-[#f97316]` eliminated, toast
stack polished (status dot, wrap, error=`role=alert`), destructive confirm
buttons moved to `bg-nf-error` + ink text, dark `color-scheme`, placeholder
and focus baselines, native-select chevron.

Verified: `vue-tsc --noEmit` exit 0; full web vitest 613/613 (2 class-pinned
tests updated to token names); scoped ESLint exit 0; computed contrast table
29 pairings — min text 4.64:1 (`faint`/bg-3), min boundary 4.21:1
(`border`/bg-2), all ≥ 4.5/3.0 thresholds; live Chromium screenshots at
desktop/390px/200%-layout widths, en+id, keyboard focus ring measured
`2px solid #BAB0F5`/2px, no layout clipping. Screenshots:
`.nf-artifacts/nf056/shots/`. NF055 guards intact (toast count semantics,
`{discovered:number}` tests pass, no undefined tokens — the sweep that found
and fixed the pre-existing `nf-danger`/`bg-nf-bg` no-ops).

Limits: live SUPER_ADMIN surfaces (admin tabs/toast pixels) and data-bearing
reader/workspace pages not re-shot live — no retained admin credential and
no live-data population allowed; GAP-126 records the closure path. Native
select popup is platform-drawn dark (`color-scheme`); `select option`
styling applies only where the platform honors it. Independent final exact-diff review (read-only, separate actor):
**APPROVE_WITH_FINDINGS, no blockers**; findings #2–#4 (doc contradiction,
`.nf-artifacts/` gitignore, diff-count bookkeeping) fixed, finding #1
(visible programmatic-focus ring on the wizard heading) accepted as
a11y-positive. Verdict + rationale: the task contract, Outcome section.
No commit/push — author review required before separate publication
authorization.

## Admin revision final verification — 2026-10-18

Author authorized review, relevant personal testing, then commit/push if sound.
Independent review identified two blockers in the previously reported revision:
sync discovered is numeric, not an array; toast error background was undefined
and white success text lacked contrast. Both repaired and regression-proven;
see the CLOSED admin review entry in ISSUES-AND-GAPS. Final focused run:
5 files / 44 tests PASS (catalog, action toasts, platform-admin axe, locale,
admin composable). jsdom axe cannot measure canvas color contrast; real
Chromium measured success10.54:1,error9.57:1 on opaque surfaces instead.
Final vue-tsc --noEmit and scoped TypeScript ESLint both exit0; .vue templates
are covered by typecheck/rendered checks, not the repo's TS/JS-only lint scope.

Real configured gateway model discovery returned200 and discovered2960; toast
displayed that number. Browser also verified five tabs, 20-row model paging,
query resetting page2 to1, no-match state, en/id and real401 request-error
toast after logout. No page errors. Existing enabled flags and nf:observed
markers preserved. Models were actually refreshed and sync audit recorded;
the older no-sync statement below describes only that prior acceptance.
Novel/chapter counts stayed0/0, temporary session removed (41 before/after).
No database reset or LLM prose generation performed. Independent final review
APPROVE. Known limit: client-side pagination; Audit filters only its fetched
server-capped50entries. Private final receipt/screenshots under local-accounts/.

## Platform-admin pagination/search/toast/capability revision — 2026-10-17 (uncommitted)

Author-requested admin page revision (`/admin`, all five tabs). Implemented:
client-side filter + 20-row pagination on Gateways, Models, Profiles, Routing
and Audit (shared `usePagedList` composable + `AdminPager.vue`; localized
search/no-match/pager keys, en+id; server lists unchanged — upgrade path
documented in-code); hand-rolled toast stack (no new dependency) on the
Gateways actions — "Check health" toasts green/red per gateway result and
"Sync models" toasts green with discovered count / red on failure; Models tab
context window localized via `Intl.NumberFormat` and capability chips with
localized labels including the observed `nf:json_object=ok|incompatible`
markers. Verification: new focused suites (`ModelCatalog.test.ts` 5,
`pages/admin/index.test.ts` 5 toast cases) plus the platform-admin axe suite
10 → 20/20 PASS; full web suite 96 files / 611 tests PASS; `vue-tsc --noEmit`
exit0; scoped ESLint 0 errors (`.vue` outside flat-config scope by existing
convention). Real Chromium acceptance on 127.0.0.1:3001 through a short-lived
minted SUPER_ADMIN session (one `sessions` row, inserted and deleted; count
41 → 42 → 41 read back): five tabs, gateway search+pager, models 3010 rows →
page 1 of 151, search "deepseek" 200 rows, capability search "vision" 1671,
chips (Vision/PDF/JSON mode) and formatted `1,000,000` context cell, audit
pager page 1 of 3 (50 rows server-capped) with working text filter, health
toast "Akanesia-Router: healthy (25 ms)" green. Footprint: exactly two
audited `gateways.health-checked` rows (both successful); no sync-models run,
no story/config data changed, no commit/push. Acceptance scripts and
screenshots under the ignored `.nf-batch-worktrees/` (`nf055-acceptance.py`,
`nf055-search-check.py`, `nf055-shots/`).

## NF-WF-054 completed; story data reset executed — 2026-10-17

Home create CTA, three-step wizard, scoped workspace list and role-gated admin
navigation implemented locally on base367b8b9. Authorized account separation is
verified. The focus-restoration delta passed 12/12 focused tests, scoped
typecheck and ESLint, and an independent read-only exact-diff review returned
APPROVE with no required change (actual Chromium focus verification retained as
the behavioral evidence). The author-approved all-novel/story reset then ran on
`novelforge_acceptance_050b` after a fresh full backup
(`nf054-post-acceptance.dump`, SHA256 dd426e44…3419f1aa, TOC 861 entries,
restore-proof clone 28/75/5/7) and a clone rehearsal of
`nf054-reset-plan.sql`. Live post-state: zero rows in all 77 story/derived
tables except one workspace-scoped `novel_id IS NULL` configuration-check
generation (not story data); preserved fingerprints unchanged (users=7,
workspaces=5, memberships=6, sessions=40, audit_logs=782, ai_gateways=1,
ai_models=2498, model_profile_mappings=43); five BullMQ queues idle before and
after; completed queue history and Redis keys preserved. API `/ready` 200,
Nuxt 200. Subsequent coordinator read-back closed the API/browser boundary:
actual author session through the Nuxt proxy returned GET /api/novels200 []
and admin models403; Chromium displayed the empty library and create CTA with
no admin entry. A short-lived verification session was removed afterward;
session count returned to40, no password was needed and no novel was created.
Private receipt:local-accounts/post-reset-library-receipt.json. Feature
remains uncommitted at HEAD367b8b9; no new commit/push/deploy authorization.
Engram checkpoint saved under the next harness's own binding; prior hook
UNBOUND episodes are historical.

## Local artifact categories and privacy protection — 2026-10-17

The author authorized organization, suitable local commits and verified-safe
cleanup. Curated safe summaries now live under
`docs/14-progress/evidence/windows-local-2026-10-17/`; raw local evidence and
harness memory are root-ignored in Git. A private category index/catalog
organizes receipts, backups, tooling, drafts, review packages and worktrees
without breaking referenced legacy paths. Five unreferenced snapshots and
imported output were archived with hash read-back; two exact duplicates
were deleted only after confirming a retained copy. All15 registered nested
worktrees, their14 dirty states, backups, memory and active logs were retained.
No product behavior change, push, deployment or repeated release battery.

## Windows local cleanup verified — 2026-10-17

Executed the author's selected follow-ups on HEAD74572cca plus preserved
documentation WIP: canonicalized Nuxt auto-import export owners and excluded
only local evidence folders from lint. Observed: Nuxt prepare exit0 without
duplicate warnings; generated imports map ApiError to useApi and WorkspaceRole
to useAiStudio;18 focused composable tests PASS; web vue-tsc exit0; original
checkout pnpm lint exit0. ESLint assertions preserve API/web/worker coverage.
Local sign-in200 and models proxy401 observed without authenticated story
mutation. See the two issue-register resolution updates and test matrix.

Earlier seven-stage release/hostedCI receipts remain historical evidence for
74572cca; this small source/config delta is verified by the focused checks,
not a new claim of hosted CI or complete release-battery execution.
All earlier record updates remain preserved. No new commit/push/deploy has
been performed. Exact-diff review and Git disposition are recorded in
`.nf-batch-worktrees/WINDOWS-LOCAL-CLEANUP-RECEIPT.md`.

## Author target decision: Windows local use first — 2026-10-17

The author chose Windows local use; server/domain deployment is deferred
until they have a server. It is not a current local-use blocker or remote
deployment authorization. Retain the completed NF023/NF039 automated evidence.

Coordinator found API :3000 healthy but no frontend listener on :3001,
then started the existing Nuxt dev entrypoint hidden from apps/web, bound
to 127.0.0.1:3001 (PID37132 at this boundary). HTTP read-back: root200,
sign-in200 with Nuxt root, /api/models401 UNAUTHENTICATED through the existing
same-origin proxy. API /ready reports database/Redis up; existing API/worker,
Docker/data and stash preserved. No browser-authenticated journey or repeat
release battery was performed. Nuxt import-collision warnings are recorded
in ISSUES-AND-GAPS; HTTP startup is not a claim of a warning-free build.
Local handoff: `.nf-batch-worktrees/WINDOWS-LOCAL-USE-HANDOFF.md`.
No automatic Windows-startup service or new commit/push was configured.

## NF023/NF039 final-published-revision automated battery GREEN at `74572cca` — 2026-10-17

Executed `.nf-batch-worktrees/NF023-PUBLISHED-REVISION-ACCEPTANCE-PROMPT.md` on the published NF053
artifact `74572cccaf45fa94e5459f2b2bdaed4346ce271e` (origin/main verified equal; exact-head CI run
39015506803 read back COMPLETED/SUCCESS; parent-run substitution avoided; stash and untracked local
evidence untouched). Verification ran in an owned detached worktree
`C:\Users\ch0c0\Downloads\nf-verify-74572cca` (clean, exact commit, frozen-lockfile install,
worktree-private `.env` aligned to the documented live runtime contract nf-pg-5433/
`novelforge_acceptance_050b`; author Redis :6399 db0 177 keys before/after; real-BullMQ suites bound
the established disposable compose :6379 db0 `bull:*` surface; no queue purge; no stack change).
Seven-stage sequential battery (stop-on-failure honored), all exit 0, zero skipped tests:
1 `pnpm lint` 0; 2 api `tsc --noEmit` 0; 3 web `vue-tsc --noEmit` 0; 4 API `unit` project
`--no-file-parallelism` 76/76 files, 1331/1331 tests; 5 full web suite 93/93 files, 589/589 tests;
6 dedicated `pnpm e2e` 3/3 files, 21/21 tests (GAP-076 lock uncontended, single
`novelforge_test_e2e`); 7 all 21 `*.axe.test.ts` files 21/21, 93/93 (8 `a11y/` + 12 `app/a11y/` +
`ScaleReviewPanel.axe.test.ts`; `vitest list axe` confirmed exactly these). Reconciliation:
76 non-E2E + 3 e2e = 79 = all API test files. Two environment-blocked stage-4 attempts are retained
honestly (stale author root `.env` pointing at the known auth-drift 5432 instance; then a shell
export no-op leaving `DATABASE_URL` unset for the two suites reading `process.env` directly); the
recorded stage-4 receipt is the third, clean full-suite run. No product/test file edited at any
point. Report: `.nf-batch-worktrees/NF023-FINALREV-RELEASE-REPORT.md`; logs:
`.nf-batch-worktrees/nf023-finalrev-logs/`; separate read-only report reviewer: see the report's
§8 verdict file. Automated release evidence only — remaining gates unchanged in kind: GAP-051
human screen-reader DEFERRED_BY_AUTHOR_DECISION (never PASS); live-dependent outage/429 and
beyond-first-hop JSON multi-hop failover PENDING; ADR-0017 PROPOSED/non-gate; GAP-125 remains OPEN
(stage 1 passed via worktree isolation, not a GAP-125 fix); target deployment, story publication
and author release sign-off distinct and not authorized/performed. All new records uncommitted;
no commit/push/merge/deploy/canon mutation by this task.

## Coordinator: delivery package refreshed; NF023 local green steps closed at this artifact — 2026-10-17

Executed `.nf-batch-worktrees/NF053-PACKAGE-REFRESH-AND-NF023-GAPS-PROMPT.md`
at HEAD `4227594…` plus the preserved WIP (0 staged, stash untouched; no
commit/push/merge/deploy; no application source change). Scope A: refreshed
package `.nf-batch-worktrees/nf053-prepub-package-v2/` — same 47-file
allowlist; final delta vs the frozen v1 package is exactly five files — the
reviewed GAP-124 fixture fix (Git blob `91ee6e1b…` re-verified) plus task
records in CURRENT, ISSUES-AND-GAPS (GAP-124 RESOLVED + new GAP-125),
test-matrix (refresh + missing-evidence map) and DELIVERY-PLAN (suite-count
correction); 42/47 byte-identical; per-file SHA256 + full patch regenerated; v1
kept frozen as history. Separate read-only delta review:
APPROVE_WITH_FINDINGS (F-1 missing REVIEW-REPORT.md at review time — written
after the verdict; F-2 deleted prior test-matrix heading — RESTORED; F-3
stale mid-task delta snapshots in records — CORRECTED to the final 5-file
state; F-4 build-hashes.sh now referenced in MANIFEST reproduce section).
Final v2 patch identity is recorded in the package's own MANIFEST.md
(repo records do not embed the package's self-hash). Scope B: criterion-to-receipt map for NF023/NF039 written to the
test matrix — none of the four carried unknowns (live outage/429 failover,
JSON multi-hop beyond the first eligible hop, real all-ineligible 409,
real A-T7/T-conc-dup timing) is a required local gate under the effective
contracts; each is labeled PENDING with its live/target dependency or NOT
required with its unit-pinned retained evidence. Repo `pnpm lint` exits 1 on
this host solely from untracked `.nf-batch-worktrees/` tooling (205 errors,
bisected; GAP-125 recorded, record-only); the 37-file delivery surface lints
0 errors. Newly OBSERVED at this
exact artifact: `npx tsc --noEmit` (api) exit 0 and `npx vue-tsc --noEmit`
(web) exit 0, completing the locally runnable NF023 battery legs alongside
the retained full suite. Remaining gates unchanged in kind: author WIP
commit/push disposition, hosted CI on the pushed revision, NF-WF-023 release
acceptance on a published revision, live deployment, story publication;
GAP-051 stays DEFERRED_BY_AUTHOR_DECISION (never PASS); ADR-0017 stays
PROPOSED/non-gate. Refreshed-package review: separate read-only reviewer on
the incremental delta — see the v2 package REPORT/REVIEW for the verdict.

## Coordinator: GAP-124 repaired and independently reviewed before publication — 2026-10-17

The prepublication package's minor fixture issue is resolved before any
commit/push decision. `scale-review-migration.test.ts` now excludes all later
migration directories using the existing 050A cutoff pattern and checks
actual before/after Prisma-ledger bounds. Focused suite: 8/8 PASS, exit 0;
separate read-only reviewer APPROVE, file blob
`91ee6e1b1969b692f7d596d60b3493b7d4cc1095`. See GAP-124's resolution update.
The old 47-file package hash remains valid for its frozen historical bytes,
not for the now-current working tree. Coordinator hash read-back also found
CURRENT and ISSUES changed after that package; refresh the manifest/patch
and distinguish documentation drift from the reviewed fixture fix.

Next bounded dispatch:
`.nf-batch-worktrees/NF053-PACKAGE-REFRESH-AND-NF023-GAPS-PROMPT.md`.
No publication or fresh full-suite run was performed or authorized.

## NF053 prepublication package frozen + independently reviewed — 2026-10-17

Executed `.nf-batch-worktrees/NF053-PREPUBLICATION-REVIEW-PROMPT.md` at HEAD
`4227594…` plus the preserved 50-path WIP (0 staged, stash untouched; no
commit/push/merge/deploy; no application change). Exact reviewed package:
`.nf-batch-worktrees/nf053-prepub-package/` — MANIFEST.md (47-file allowlist
with per-file sha256/bytes; excluded: `.harness-memory/`, `.nf-batch-worktrees/`,
`output.txt`), full.patch sha256 `4a6ee968…ea31238` (42 tracked + 5 new-file
diffs incl. arc-summarizer/validator/migration/contract), untracked raw copies
hash-verified, secrets scan clean (only pre-existing disposable
`novelforge_test`@localhost test-role matches, classified NON_SECRET).
Independent separate read-only reviewer (scout agent, zero modifications,
runtime MODEL_UNVERIFIED per GAP-013): verified 47/47 hashes + patch identity;
composed-artifact source review PASS on schema/migration preservation,
authorization/auditing, pin/claim fencing + terminal validation, retries/usage
+ ordinary-routing preservation, JSON eligibility + marker preservation, test
DB isolation, D2 scope (3 one-line changes), rollback. Verdict
**APPROVE_WITH_FINDINGS**: F-1 MINOR recorded as GAP-124 (050B-upgrade
baseline no longer excludes post-050B migrations; one-line fix, not applied —
fixing would change the reviewed bytes), F-2/F-3 notes (test-DB fallback;
app/worker restart dependency). Post-review recheck: 46/47 byte-identical;
only ISSUES-AND-GAPS.md changed by the GAP-124 append itself (sha256
`525d7fb2…ccf644`); frozen review artifacts untouched. Remaining gates
unchanged in kind: author WIP commit/push disposition (COMMIT-PROPOSAL.md
prepared, NOT executed), hosted CI on the pushed revision, GAP-124 follow-up,
NF-WF-023 release acceptance on a published revision, live deployment, story
publication — each distinct and unauthorized here. GAP-051 stays
DEFERRED_BY_AUTHOR_DECISION (never PASS); ADR-0017 PROPOSED/non-gate.
Author-facing report: `.nf-batch-worktrees/nf053-prepub-package/REPORT.md`.
Engram checkpoint `novelforge-ai/nf-wf-053-prepub` saved + read-back verified.

## Live local runtime refreshed onto current source — 2026-10-17 (NF023/NF039)

Executed `.nf-batch-worktrees/NF023-LIVE-RUNTIME-REFRESH-PROMPT.md` at HEAD
`4227594…` plus the preserved 50-path WIP (stash untouched; no commit/push/
merge/deploy; no source changes). The pre-rollout author processes (API :3000
PID 43884 and worker PID 35348, both started 07:02, positively identified via
launch command + working DB/Redis targets) were stopped in a verified
zero-active window (all five db0 queues 0 active/waiting/delayed; the
Windows cross-process graceful-signal limitation from the 2026-10-14
diagnostic applies, so no in-flight-drain claim is made) and relaunched from
the current tree with the same env contract (working `DATABASE_URL`
nf-pg-5433/`novelforge_acceptance_050b`, `REDIS_URL` localhost:6399 db0,
`APP_ENCRYPTION_KEY` from repo-root `.env`, never printed). New processes:
API PID 41492 on :3000, worker PID 39984; persistent services
`nf023-api-r2` / `nf023-worker-r2` with bounded logs. The old
`nf023-api`/`nf023-worker` service entries showing `failed (exit 127)` are
the harness wrappers' record of that intended stop — retained as history.

Verified (OBSERVED, receipt
`.nf-batch-worktrees/NF023-LIVE-RUNTIME-REFRESH-RECEIPT.md`): `/ready` 200
database up / redis up; authenticated `GET /api/models` shows all seven
`nf:json_object` markers; ONE authorized idempotent PATCH re-asserting
deepseek-v4.1-flash's already-correct `jsonOutputMode:"ok"` returned 200,
added exactly one `model.updated` audit (7 → 8, DB clock
`2026-10-17 05:28:36.395+00`), and produced zero capability/configuration
drift; minted harness session deleted (0 admin sessions in the last hour).
Worker: exactly 5 db0 `bzpopmin` consumers matching the five workers of the
single node process (no duplicate memory worker), all five
started-proven flags true, memory reconciliation `checked:1 stale:0
failed:0`, publication reconciliation clean, no startup errors. Postimage ==
preimage: db0 176 keys, projection `f27f9af5…` OK/OK 272 chars @ head
revision `1a385bba` (6), generations 25, attempts 19, mappings/markers/
enabled gateway identical. Retained evidence reused, not re-run: suite log
213 files / 2608 tests / 1 skipped exit 0, clone generation
`a2c69645…` receipt, prior NF023/NF053/D2 receipts. Local operational
readiness: READY. Remaining gates unchanged in kind: GAP-051 human
screen-reader acceptance DEFERRED_BY_AUTHOR_DECISION (never PASS); ADR-0017
PROPOSED/non-gate; live deployment / final release verification separate;
author sign-off and WIP commit/integration disposition author-owned.

## NF053 working JSON configuration rolled out to the live working database — 2026-10-17

Executed `.nf-batch-worktrees/NF053-WORKING-JSON-ROLLOUT-PROMPT.md` at HEAD
`4227594…` plus the preserved WIP (stash untouched; no commit/push/merge/
deploy; NO source changes by this task). Scope A: the seven evidence-backed
`jsonOutputMode` markers were applied to the WORKING database
`novelforge_acceptance_050b` (nf-pg-5433) through the existing audited
`PATCH /api/models/:modelId` (task-owned API instance, server-side role
verified): MiniMax-M3/mimo-v2.6-flash/claude-haiku-5-5 `incompatible`,
deepseek-v4.1-flash/agnes-2.5-flash/laguna-s-2.1/muse-spark-1.3 `ok`; 7
`model.updated` audits; preimage (`nf053json/working-preimage-20261017.json`,
non-secret) shows zero markers before; read-back shows all seven markers and
identical priorities/enabled/context sizes; projection `f27f9af5…` OK/OK 272
chars, generations 25 and head revision `1a385bba` (6) unchanged; minted
harness session deleted; redis db0 unchanged (176 keys / 5 consumers).
Rollback scope: per-marker `jsonOutputMode:"unknown"` only. Resolves the
issue-register entry "NF053 JSON compatibility rollout missing from working
database" (see that entry for closure evidence).

Scope B: a FRESH `pg_dump` of the CURRENT working database (carrying the new
markers — the old pre-marker backup was NOT used) was restored into owned
clone `novelforge_nf053rollout_clone` (redis db5 verified empty, sole
task-owned `bull:memory-rebuild` consumer, API 3100, real
`startMemoryWorkerApp` worker). Only the cloned derived projection row was
deleted (declared precondition); one real rebuild ran: 202 → queue → worker
→ gateway → strict validation → persisted projection → API read-back.
Generation `a2c69645-30ed-4ffb-8996-c0d5d4641f62`, attempt 1/1
requested/reported `bansosmontera/deepseek-v4.1-flash` SUCCEEDED (1288 in /
170 out, 2686 ms, NONE) — priority-10 MiniMax-M3 skipped WITHOUT a forced
outage, proving the working marker configuration reaches real execution.
Projection `680d6e2a…` OK/OK 207 chars, 3/3 covered fact ids, source pinned
to `1a385bba` (6) = head; `/memory/status` 200 FRESH/OK; `/memory/global`
200 with provenance. Receipt: `nf053json/nf053-rollout-receipt.json`.
Cleanup verified: clone dropped, db5 back to 0 keys, working invariants
re-checked after cleanup.

Working-runtime readiness (separate from cloned acceptance, OBSERVED): the
author's API on :3000 is healthy (/ready 200) but started 07:02 with
pre-rollout source, and the live db0 worker set predates the rollout — the
OWNER must restart those processes to load `setModelJsonMode` and the
routing eligibility filter; this task deliberately did not reload
non-task-owned processes. Retained model limits unchanged (MiniMax fences /
mimo trailing garbage on ordinary non-JSON selection; claude rejects the
parameter outside recorded-incompatible routing). GAP-051 stays
DEFERRED_BY_AUTHOR_DECISION; ADR-0017 stays PROPOSED/non-gate; live
deployment/final release verification remain separate gates.

## Coordinator assessment: JSON code verified; working configuration rollout pending — 2026-10-17

Observed: current routing filters recorded-incompatible candidates only for
JSON requests; ordinary generation retains authored order. The retained final
log `nf053json/fullsuite-after.log` reports 213 passed files, 2608 passed tests,
1 skipped, `SUITE-EXIT:0`. Real clone receipt and Engram #355 describe successful
DeepSeek summary generation `712a3c23-57b3-4c0d-a9f6-4d9c6aee718c`;
independent exact-diff APPROVE is a retained harness claim, not a new coordinator
review. No duplicate suite or acceptance run was performed here.

Direct working-database read-back reveals all seven requested models still
lack `nf:json_object` markers. The clone-only configuration was not rolled
out. See the issue-register entry "NF053 JSON compatibility rollout missing
from working database". Next dispatch:
`.nf-batch-worktrees/NF053-WORKING-JSON-ROLLOUT-PROMPT.md`.
Preserve HEAD `4227594f8349b175648cc47b8b8019133935af05`, all uncommitted work
and stash. No commit/push/merge/deploy permission is inferred. GAP-051 remains
deferred by author decision; ADR-0017 remains PROPOSED/non-gate.

## NF053 request-aware JSON eligibility + E2E scheduling repair IMPLEMENTED and verified — 2026-10-17

Executed `.nf-batch-worktrees/NF053-JSON-COMPATIBILITY-AND-SUITE-REPAIR-PROMPT.md`
at HEAD `4227594f8349b175648cc47b8b8019133935af05` plus the preserved 39-path
WIP (stash `nf050b-acceptance-wip` untouched; no commit/push/merge/deploy).
Both scopes implemented on the real system; no new contract chain.

**Scope A — request-specific JSON candidate eligibility.** Smallest
request-aware check at the existing routing boundary, no new schema/platform/
dependency: `Candidate.capabilities?` carried from the registry
(`resolveProfile` now selects the mapped `AIModel.capabilities`),
`GatewayManager.planFor/requestEligible` filter candidates ONLY when
`outputMode:"json_object"` is set, excluding candidates whose recorded
capability data contains `nf:json_object=incompatible`; absence of capability
data stays UNKNOWN (eligible; strict terminal validation remains the
authority); authored mapping order is filtered, never reordered; ordinary
(no-outputMode) requests are unchanged and still route through marked
models. If every mapped candidate is excluded, the request fails explicitly
(`NoRouteError` detail "no candidate model … eligible for the requested JSON
output mode" → 409) with zero adapter calls — no fallback to an incompatible
candidate; `generateStream` shares the same plan path. Observed markers are
application-managed under the reserved `nf:` namespace
(`JSON_MODE_OK`/`JSON_MODE_INCOMPATIBLE`, packages/ai-core/types.ts):
`syncModels` preserves `nf:`-prefixed entries across ordinary catalog
refresh; the existing audited `PATCH /api/models/:modelId` accepts an
additive `jsonOutputMode: "ok"|"incompatible"|"unknown"` (same
`model:manage` gate, `model.updated` audit; `"unknown"` clears the marker).

**Scope B — shared E2E scheduling repair.** Root cause distinguished with
evidence: the GAP-076 whole-lifecycle lock was correct; the defect was
scheduling — all three `src/e2e` files start their `beforeAll` at t≈0 and
wait for earlier files' ENTIRE lifecycles, so the long-novel measurement
file consumed its fixed 600 s hook budget purely waiting (0 tests run;
captured log shows exactly 600000 ms, suite total 611.81 s, solo file 453 s).
Fix in `apps/api/vitest.config.ts` (test-harness scheduling only, budgets
NOT raised): nested vitest projects — `e2e` project
(`fileParallelism: false`) runs the three files strictly one-at-a-time so
the lock is never contended and each hook budget covers only its own
setup+fixture; the `unit` project keeps the default parallel schedule and
no unrelated suite is serialized. `acquireE2E` now logs
`[e2e-lock] acquired after Nms` as permanent wait evidence. The
`endgame-projection` unique-DB-name fix is preserved and verified: only
`endgame.test.ts` uses `novelforge_test_endgame`; focused parallel pair
2 files / 27 tests PASS.

**Checks (OBSERVED).** packages/ai-core `vitest run` 91/91 (5 new
eligibility tests: skip-and-preserve-order, explicit all-incompatible
failure with zero attempts, ordinary requests unchanged, UNKNOWN eligible,
stream parity); apps/api `src/ai.test.ts` 39/39 (2 new: audited marker
record/clear incl. empty-patch 400, marker preserved across catalog
resync); typecheck ai-core/ai-services/api clean; scoped ESLint clean on
all ten touched files; combined real e2e run
(`nf053json/e2e-combined.log`): 3 files / 21 tests PASS, 518.32 s, all
three lock acquisitions `after 1ms`.

**Real acceptance (owned clone `novelforge_nf053compat_clone` on nf-pg-5433
restored from backup `0e37b3ba…74bd5` SHA re-verified; redis db5 verified 0
keys before, sole `bull:memory-rebuild` consumer during; API port 3100;
real `startMemoryWorkerApp` worker only).** Observed JSON-mode evidence from
the retained seven-model sampling applied through the REAL audited API
(`PATCH jsonOutputMode`): MiniMax-M3 (priority 10), mimo (50),
claude-haiku (70) → `incompatible`; deepseek (20), agnes (30), laguna (40),
muse (60) → `ok`; 7 `model.updated` audit rows; read-back shows markers
alongside gateway-reported capabilities. Cloned derived projection row
deleted as declared rebuild precondition (canonical sources, revisions,
Generation history preserved; generations baseline 25). Normal
authenticated POST → 202 → queue → worker → JSON-mode generate → strict
validation → persisted projection → API read-back: generation
`712a3c23-57b3-4c0d-a9f6-4d9c6aee718c` (MEMORY_ARC_SUMMARY,
LONG_CONTEXT_REVIEWER, attempt 1/1 requested/reported
`bansosmontera/deepseek-v4.1-flash`, 1288 in / 156 out, 2839 ms, NONE),
projection `9fb0e70f…` OK/OK 225 chars, covered fact ids = exactly the 3
structural facts, source revision `1a385bba` (rev 6) pinned;
`/memory/status` 200 FRESH/OK, `/memory/global` 200 with provenance. The
priority-10 authored first candidate (MiniMax-M3) was skipped WITHOUT any
provider outage or forced failure — eligibility exclusion demonstrated by
attempt rows alone. Receipt: `.nf-batch-worktrees/nf053json/nf053compat-acceptance-receipt.json`.
Cleanup: worker+API stopped, clone dropped, db5 back to 0 keys.

**Full suite after fixes (once):** `nf053json/fullsuite-after.log` —
**213/213 files, 2608 passed / 1 skipped, exit 0, 979.43 s** (recorded in
the test matrix, 2026-10-17). Separate exact repair-diff review: APPROVE
(10/10 items, file:line evidence).

Remaining true limits (unchanged model facts, retained): MiniMax-M3 can
still emit fenced output and mimo trailing garbage when these models ARE
selected for ordinary (non-JSON) requests or by future callers that do not
set `outputMode`; JSON validity proves shape only. `GET
/api/workspaces/:id/generations` etc. unchanged. Human GAP-051 screen-reader
pass stays deferred; ADR-0017 remains PROPOSED/non-gate.

## JSON hardening coordinator assessment / repairs still pending — 2026-10-17

Observed source contains the additive outputMode pass-through and adapter
response_format mapping; the summarizer opts in. Retain reported real
DeepSeek summary acceptance and model compatibility results. They are not
proof that all seven candidates honor JSON mode: MiniMax fenced samples,
Mimo trailing content and Claude Haiku parameter rejection remain actual
reported limits. Request-aware candidate eligibility is an implementation
compatibility concern under existing gateway capability rules, not a new
author decision to accept invalid output or globally reorder their models.
Preserve the seven-model ordinary-request list and strict terminal validation.

The latest full suite is NOT green (211/213 files; reported 2573 pass /
29 skip, two failed suites). The endgame DB-name fix's 27/27 pair pass and
long-novel 7/7 solo pass do not close the combined run. The earlier 2597-pass
receipt predates these shared-source changes and is not current completion.
Next bounded task: request-specific JSON compatibility plus a root-cause
shared-E2E DB scheduling/isolation repair, then final applicable checks and
real read-back; do not merely raise hook budgets or repeat until green.

## NF053 real JSON-output hardening IMPLEMENTED + real acceptance — 2026-10-17

Executed `.nf-batch-worktrees/NF053-REAL-JSON-HARDENING-PROMPT.md` at HEAD
`4227594f8349b175648cc47b8b8019133935af05` plus the preserved 39-path WIP
(stash `nf050b-acceptance-wip` untouched; no commit/push/merge/deploy).
Smallest additive seam: optional provider-neutral
`GenerateRequest.outputMode?: "json_object"` → `GatewayManager` (generate +
generateStream) → workspace `generate` → `OmniRouteGateway.chatBody` maps it
to `response_format {type:"json_object"}`. Only the arc summarizer sets it
(required on its port type); default caller wire behavior is byte-identical
(test-pinned). Strict `validate.ts` validation, terminal invalid-output
behavior, retry/claim/provenance/usage contracts and author model mappings
unchanged; no fence-stripping, JSON repair, blind retry or capability
framework. Regression tests: adapter serialization + default omission,
manager propagation + default omission. Checks: ai-core 86/86, ai-services,
api/worker/memory/database typechecks, scoped ESLINT clean on all touched
files. Independent exact implemented-diff review (`nf053json/TASK-DIFF.md`):
REVIEW_VERDICT APPROVE, 7/7 hunks verified.

Real acceptance (owned clone `novelforge_nf053json_clone` on nf-pg-5433 from
backup `0e37b3ba…74bd5` re-verified; Redis db5 verified empty, sole
`bull:memory-rebuild` consumer; API port 3100; memory-worker factory only):
novel `0888c5ba…80b1`, scope `arc:8356f690…fb29`, source revision `1a385bba`
(rev 6) pinned; ONLY the cloned derived projection row deleted; normal API
202 → queue → worker → real gateway → strict validation → persisted
projection → API read-back (`/memory/status` 200 OK/FRESH; `/memory/global`
200). Primary OK sample: generation `d67c5cd4-735a-4460-88fd-d803d3033959`
(MEMORY_ARC_SUMMARY, LONG_CONTEXT_REVIEWER, requested/reported
`bansosmontera/deepseek-v4.1-flash`, attempt 1/1 SUCCEEDED, 1288 in / 255
out, 3260 ms, error NONE), summaryStatus OK, 242 chars,
`summary_covered_fact_ids` = exactly the 3 structural fact ids, attempts 4.
Mode-serialized proof on the real path: claude-haiku-5-5 attempt row FAILED /
INVALID_REQUEST (gateway rejected `response_format` — the parameter reached
the gateway), plus clean-JSON samples from honoring models.

Compatibility (one sample per author-selected candidate, §17 order, isolated
cloned profile config, restored): MiniMax-M3 accepted but intermittently
```json-fences its output under JSON mode (raw captured through the same
summarizer path: `ace089f6…` fenced FAIL, `b3523bff…` clean OK; its 3
queue-path samples that session failed strict validation terminal);
deepseek-v4.1-flash / agnes-2.5-flash / laguna-s-2.1 / muse-spark-1.3 clean;
mimo-v2.6-flash appends trailing garbage; claude-haiku-5-5 rejects the
parameter (400 class, non-retryable). Remaining limits recorded in
ISSUES-AND-GAPS (MiniMax-M3 reliability not guaranteed; p70 claude leg fails
INVALID_REQUEST if routing ever reaches it with outputMode set; author
mappings deliberately unchanged). JSON validity still proves shape only,
never semantic truth or canon approval.

Full suite run once with `DATABASE_URL` override to the 5433 instance (the
repo-root `.env` credential does not authenticate against host 5432 —
pre-existing environment condition recorded in ISSUES-AND-GAPS): 211/213
files, 2573 passed / 29 skipped, 2 failed suites. Failure 1 root-caused and
fixed: `endgame.test.ts` and `endgame-projection.test.ts` shared the test
database name `novelforge_test_endgame` → concurrent CREATE race;
`endgame-projection.test.ts` now uses `novelforge_test_endgame_projection`;
focused parallel pair re-run 2 files / 27 tests PASS. Failure 2:
`e2e/long-novel.measure.test.ts` beforeAll hook hit the 600 s vitest ceiling
under full-suite load (7 tests skipped) — pre-existing Windows-load
sensitivity already tracked in this register; focused solo re-run PASS
(1 file / 7 tests, 453 s, same command/URL), confirming load as the cause;
no check weakened. Cleanup of all task-owned resources
follows in the handoff entry.

## Coordinator assessment / next observed defect — 2026-10-17

Retain real failure/replay/recovery evidence in
`.nf-batch-worktrees/NF053-REAL-FAILURE-RECOVERY-RECEIPT.md`: actual
authorization failures persisted summary FAILED without new AI rows, forced
I/J intents were consumed, old I replay was a full-row no-op, and a fresh
intent recovered a genuine validated summary through the normal gateway.
The reported final clone cleanup preserved the working source data; current
source /ready is still healthy. Source was not changed or tests repeated.

Receipt annotated to scope the losing contender's zero-write claim: no model
or summary-result write, not zero structural writes (upsert precedes CAS).
The real non-JSON sample is a product reliability gap even though fail-closed
validation worked correctly. Current generation transport does not expose a
structured-output request option; raw cause of that sample is not established.
Next bounded implementation: harden the arc-summary output request at the
existing gateway boundary and prove it through real traffic, preserving strict
validation, terminal invalid-output behavior and genuine model provenance.
No new mock framework, blind retry or JSON-repair workaround is authorized.

## NF053 real failure/replay/recovery VERIFIED — 2026-10-17

Executed `.nf-batch-worktrees/NF053-REAL-FAILURE-RECOVERY-PROMPT.md` from
clean context at HEAD `4227594f8349b175648cc47b8b8019133935af05` plus the
pre-existing 39-path WIP (all preserved; no commit/push/merge/deploy; no
source change by this task). Full evidence:
`.nf-batch-worktrees/NF053-REAL-FAILURE-RECOVERY-RECEIPT.md`.

OBSERVED, in an owned scratch restore (`novelforge_nf053fail_clone` on
nf-pg-5433, backup SHA256 re-verified; empty Redis db5; API port 3100;
memory-worker-factory-only consumer): (1) real execute-time authorization
failure — unforced rebuild with the cloned membership revoked at execution →
`buildStatus OK` + `summaryStatus FAILED`, `summary_error "summarizer
failed: workspace not found"`, ZERO Generation/attempt rows, zero model
calls; (2) forced intents I and J under revoked membership — both genuine
FAILED terminals consuming their intents atomically (set {I,J}), identity
re-derived and matched against `memoryForcedRebuildJobId`; (3) redelivery of
old completed job I via the installed BullMQ 5.81.5 supported
`Job.retry('completed')` (reprocessJob-8.lua inspected first) →
consumed-intent no-op BEFORE structural work: full-row md5 byte-identical,
attempts/counts unchanged, `deduped:true ok:false` (A-T6 I/J/I shape live);
(4) concurrent forced K/L — observed live-claim exclusion (processedOn 1 ms
apart, L claim 0, L wrote nothing, one SUMMARIZING, exactly one generation);
K's real MiniMax-M3 output failed deterministic validation ("unparseable
output: not JSON") and the terminal FAILED arm consumed K's intent; a fresh
authorized intent M recovered to `OK` via a real gateway call
(generation `b7beab9f-…`, LONG_CONTEXT_REVIEWER, requested/reported
MiniMax-M3, 1378/294 tokens) with the exact 3 covered fact ids, full
provenance, and normal API read-back (status 200 OK/FRESH; global 200 with
summary+provenance). Final consumed set {I,J,K,M}; attempts 5; generations
25→27; attempt rows 19→21.

Unobserved limits: provider-failure/429 fallback legs never executed (both
real calls hit priority-10 MiniMax-M3); one of two real samples returned
non-JSON and was correctly rejected (recorded in ISSUES-AND-GAPS as an
observed model-output fragility, not a code defect; recovery needed one
fresh intent). Full suite NOT re-run — source unchanged; prior receipts
apply. All owned resources removed (scratch DB dropped, db5 keys deleted,
clone services stopped, task-owned files deleted); source acceptance runtime
re-verified untouched (port 3000 ready 200; projection OK/OK 272 chars,
retry_ids {}, generations 25, memberships 1; db0 176 keys/17 clients).

## Next bounded real-system verification — 2026-10-17

At the author's request for the next harness prompt, prepared
`.nf-batch-worktrees/NF053-REAL-FAILURE-RECOVERY-PROMPT.md` for clean-context
execution. Scope: remaining genuine execute-time authorization failure,
consumed-intent replay after intervening intent, and real-gateway recovery
through the implemented memory flow. Fault setup is confined to an owned
restore of real data with isolated Redis and API/worker; working acceptance
data and consumers remain untouched. No new mock implementation or repeated
NF053/D2 build, backup drill or successful suite is requested. These cases
are not yet executed; previous green/readiness evidence is retained.

## D2 main integration authorized and verified — 2026-10-17

The author explicitly approved the concrete D2 proposal. Applied patch
`060b5a32759ce19829f32156d712e968ef0b2fa567231ab4d735358a092b2ee3`
to the main working tree: exactly one outer-border class replacement each
in ContinueReading.vue, NovelCard.vue and browse/index.vue. Existing
border-focus token is used and hover border override removed. No other
product source changed in this turn; prior NF053/source/doc WIP retained.
Focused discovery + axe suites: 2 files / 19 tests PASS, exit 0. Separate
exact three-file diff review APPROVE; normalized postimages match the
previously rendered en/id normal/hover candidate. No new browser run,
full-suite rerun or gateway call. Receipt:
`.nf-batch-worktrees/D2-MAIN-INTEGRATION-RECEIPT.md`.

D2 main-integration decision and scoped implementation gate are CLOSED.
Human screen-reader acceptance remains DEFERRED_BY_AUTHOR_DECISION, never
PASS; no unconditional release, commit, push or deployment is implied.
The current host-confirmed Engram binding recovered after the preceding
timeout: attributed decision #346 saved and read back successfully. The
previous unbound/file-handoff record remains historical evidence.

## NF023 coordinator verification / file handoff — 2026-10-17

Observed on this host: API /ready returns 200 with database up / redis up;
reported API PID 43884 and worker PID 35348 still exist. Current-state dump
SHA256 matches `0e37b3bafa2f014d149a76d60cfd2b67aa0fbb7e2ab0aa9ea1ed17b2c2774bd5`.
Source, restored and source-after capture files are byte-identical (SHA256
`6a755f4ad279ca803e688356ef45c92c6049fd22db31113cf897719594aa9c95`).
The reported 98-table / 5088-row restore and restored API checks are retained
execution evidence; no restore, full suite or gateway call was repeated.
The readiness receipt's runtime command contained a credential-bearing DB
URI; it was redacted with a dated note/pre-redaction hash, preserving results.
Do not print credentials or raw backups in later handoffs.

Corrected next-step interpretation: GAP051 remains author-deferred; do NOT
ask to schedule it as a prerequisite. ADR0017 is PROPOSED, non-gate. D2 main
integration is a separate concrete pending decision: reviewed patch
`060b5a32…2ee3`, exactly three border-class replacements, still applies
cleanly to current main. Proposal and bounded fallback handoff:
`.nf-batch-worktrees/NF023-HANDOFF-AND-D2-PROPOSAL.md`. D2 is not applied.
No claim of unconditional release or all-platform completion.

ENGRAM UNBOUND on this turn: host registration failed with
`spawnSync C:/Users/ch0c0/bin/engram.exe ETIMEDOUT`. No attributed memory
write, old identity reuse or claimed Engram save. This entry and the proposal
are the file fallback. Recheck only a future host-confirmed binding; do not
invent an ID or reopen an old session. HEAD 4227594 and all WIP/stash retained.

## NF023/NF039 real-system readiness batch — 2026-10-17

Executed on the real running system (HEAD `4227594` + preserved WIP), reusing
retained receipts; no suite, lint/typecheck or AI rerun. Receipt:
`.nf-batch-worktrees/nf023-real-readiness-receipt.json`.

- Runtime: acceptance API (node `src/server.ts`, port 3000, PID 43884) and
  worker (node `src/index.ts`, PID 35348) started against
  `novelforge_acceptance_050b` (nf-pg-5433) + `nf-redis-acceptance` (6399).
  Sole memory-rebuild consumer proven by port-ownership mapping (only worker,
  API and the Docker relay connect to 6399); no zombie present. Worker loaded
  the current WIP source; startup reconciliation `checked=1 stale=0
  skippedFresh=1`. `/health` and `/ready` 200 (`database:up, redis:up`);
  authenticated `/memory/status` + `/memory/global` 200 (summaryStatus OK,
  FRESH, revision 6, provenance served); anonymous published-reader route
  observed live (`/api/public/novels` 200 count=20; detail + chapter read 200,
  existing GAP-051 seed publications — nothing published by this task).
- Current-state data recovery (new 023A evidence for the summary-bearing
  acceptance DB): `pg_dump -Fc` →
  `nf023-current-state-backup-20261017.dump` (650,916 bytes, sha256
  `0e37b3bafa2f014d149a76d60cfd2b67aa0fbb7e2ab0aa9ea1ed17b2c2774bd5`);
  restored ONLY into new scratch `novelforge_nf023_restore_scratch`: state
  capture identical (98/98 tables, 5088/5088 rows; projection `f27f9af5` row
  sha256 `1c6d6b89…0d6c47` and generation `9f572692` row sha256
  `edbc93d2…0b3682` equal; attempts 1; 46 migrations with
  `20261016_nf_wf_053_arc_summary` last, 0 unfinished); second API on :3010
  served `/ready` 200 and the same 7/7 runtime checks from the restored data;
  `prisma migrate deploy` on the restore is a clean no-op. Scratch DB,
  container dump copy and minted sessions cleaned; acceptance DB re-captured
  identical after the drills. The retained pre-migration backup
  (`d3f41023…4eace`) remains the pre-NF053 restore point; this batch adds the
  current-state restore proof.
- Criteria mapping: full suite `213 files / 2597 passed / 1 skipped exit 0`
  (log `nf053-full-suite-final-20261017.log`), lint/typecheck receipts and
  NF053 separate review are reused unchanged (repair diff hash
  `1d72404d…e15459` re-verified in tree with the 600s/120s budgets present).
  Remaining gates unchanged: GAP-051 human screen-reader
  (DEFERRED_BY_AUTHOR_DECISION), ADR-0017 PROPOSED, D2 main integration,
  live provider-failure/forced-failure/concurrency stress UNOBSERVED, and the
  release decision itself (author-owned). No commit/push/merge/publish/deploy.

## Coordinator verification / next execution — 2026-10-17

Observed final log totals: 213 files passed, 2597 tests passed / 1 skipped.
Repair SHA256 `1d72404deb785fff355730fe9580c161f8eda22259cd9a360d5224b535e15459`
matches the reported separate review; reverse-apply dry-run exits 0 against
current source. The genuine forced-cache-hit receipt SHA256 is
`721763f25114a4d6306a7c0966a08e0629ab7d8f36106e60f9a251d13d2b487f`;
Redis retains matching processedOn/finishedOn timestamps for the distinct
job. Receipt includes actual handler deduped=true/ok=true, full-row hash
equality, and zero new linked Generation/Attempt rows. No test or AI rerun.

The two preceding final-evidence findings are closed for the observed local
artifact. NF053 is not a production deployment or blanket release sign-off.
DELIVERY-PLAN's stale NF052/contract queue is now explicitly superseded;
planning-ledger reconciliation has been done here, not sent as another
documentation-only task. Next: existing real-system release-readiness scope,
preserving the green suite and real gateway evidence, checking actual runtime
ownership/readiness and current-data recovery where evidence is still missing.
Human screen-reader deferral, ADR-0017 and D2 main-integration scope stand.

## NF053 final verification CLOSED — 2026-10-17

Both pending evidence limits from the 2026-10-17 coordinator read-back are
resolved on the implemented real system (HEAD `4227594` WIP, uncommitted).

Scope A — the two reported full-suite failures are root-caused test-budget
defects, not host flakes: (1) the populated migration-proof tests
(scale-evidence 050A-upgrade, scale-review 050B-upgrade) run two real
`prisma migrate deploy` children inside one test under the 30s default —
measured 39.6s plus two observed 30s timeouts; per-test 120s budgets added,
assertions untouched. (2) the three e2e files serialize on the GAP-076
shared-DB lock held for a file's whole runtime; author-preview burned its
whole 120s hook budget in the capture run and gates burned its whole 300s
budget in the pre-fix co-run (reproducing the 2026-10-16 unlogged
file-level failure); all three getE2E hooks now carry finite 600s budgets.
Repair diff `.nf-batch-worktrees/nf053-scope-a-repair.diff` sha256
`1d72404deb785fff355730fe9580c161f8eda22259cd9a360d5224b535e15459`
reviewed separately: APPROVE (3 INFO, no MINOR/MAJOR; INFO-1 comment
rewording applied + re-confirmed). Final full suite once after the repair:
213/213 files, 2597 passed / 1 skipped, exit 0 — first full-run green on
this WIP (log `nf053-full-suite-final-20261017.log`).

Scope B — worker-executed dedup proven without a new model call: a distinct
authorized forced job on the existing OK arc scope was accepted 202,
executed by the real worker (22ms, attemptsMade 1) with the handler log
"memory rebuild processed … deduped:true ok:true" (§10 Case 3 OK-cache hit
before any structural work or gateway call); the full projection row is
byte-identical and linked Generations/Attempts stayed 1/1. Receipt:
`.nf-batch-worktrees/nf053-forced-cache-hit-receipt.json`. A pre-NF053
zombie worker (PID 41284, since stopped and documented in ISSUES) consumed
an earlier forced job — retained as ambiguous, not proof; the receipt job
ran under verified sole-consumer ownership.

Environment finding: bare `pnpm test` is an invalid invocation on this host
(host→5432 password auth broken by volume-before-password compose
recreation). Suites were run with explicit `DATABASE_URL` → nf-pg-5433
using disposable `novelforge_test*` databases; the acceptance database was
verified untouched (projection OK/OK, attempts 1, 1 generation) before and
after all runs. Retained negative log `nf053-full-suite-run-20261017.log`.

Honest limits: live provider failure/rate-limit fallback, concurrency
stress and forced-failure paths remain unobserved (not PASS); generated
summaries are derived artifacts, NOT canon approval or publication; no
commit/push/merge/deploy performed. See ISSUES-AND-GAPS for the full
closure entry.

## NF053 coordinator read-back / final checks pending — 2026-10-17

Superseded the same day by "NF053 final verification CLOSED — 2026-10-17"
above; retained as the read-back evidence record.

Observed directly in the existing acceptance DB: projection
`f27f9af5-0141-4690-beab-0fd56bd4e907` is buildStatus OK / summaryStatus OK,
272 characters, three covered facts, source revision 6, linked to SUCCEEDED
MEMORY_ARC_SUMMARY generation `9f572692-7ecb-4fc1-94a4-0072f2a4547c`
(LONG_CONTEXT_REVIEWER / arc-sum-prompt-v1); one generation for that artifact.
The approved migration is recorded applied. Frozen implementation diff
SHA256 `bce9c4a7c0c14652ad8f5487f425b2f9af4ef48a9c9f84b97e2c3fb2e15052b6`
matches the reported review artifact and reverse-apply check succeeds on the
current postimages; backup SHA256 `d3f41023…4eace` matches. No AI call repeated.

Two final evidence limits remain: the reported full run has two failures;
isolation passes do not establish host-load flakiness or exclude regression.
Historical hosted green CI at HEAD 4227594 does not verify this uncommitted
implementation. Also, the repeat-rebuild receipt proves an accepted API
request and unchanged selected fields/no new generation, but its fixed wait
does not prove worker execution: retained ordinary job IDs can suppress a
repeat. Next: diagnose the two actual failures and prove worker-executed
dedup using the existing OK arc and a distinct authorized forced job (which
should cache-hit without another model call). Preserve real acceptance and
data; no new fixture or design cycle is needed. See ISSUES-AND-GAPS.

## NF-WF-053 IMPLEMENTED + REAL gateway acceptance — 2026-10-16

The author-approved NF053 contract (sha256 `b73fb690…0590`) is IMPLEMENTED on
main WIP at HEAD `4227594` (uncommitted, preserved WIP intact). One additive
forward-only migration `20261016_nf_wf_053_arc_summary` (complete 11 columns +
`MemorySummaryStatus`) was scratch-validated, then applied to
`novelforge_acceptance_050b` AFTER a verified recoverable backup
(`nf053-pre-migration-backup-acceptance-050b.sql`, sha256 `d3f41023…4eace`,
restore proven on a scratch DB). Summarizer runs through the normal
generate→manager→gateway path with `LONG_CONTEXT_REVIEWER` (D1), M-bound 7
(= manager cap; gateway maxRetries 6), claim/result CAS, consumed forced-retry
intent set, sweeper expiry hygiene, and fail-closed validation (shape +
referential closure + registered-entity closure). Forced retries use the
`memory-rebuild-forced-<sha256>` transport identity with explicit-scope
refusal (§8.1a).

REAL acceptance (§15.0) observed on this host: story data created through the
REAL authoring routes (novel + saga + entity + 3 author-written canon facts
birthing revisions 2–6) in the existing acceptance DB with the existing author
account (OWNER); `POST /memory/rebuild` accepted via the running API+worker;
the configured gateway produced a GENUINE English summary (requested
`bansosmontera/MiniMax-M3`, reported `MiniMax-M3`, SUCCEEDED, usage recorded),
row `summaryStatus OK` with 3/3 covered fact ids + provenance +
`summaryGenerationId`; served through `/memory/status` and `/memory/global`
(`summaryProvenance.actorUserId` = acting member). Unchanged repeat rebuild
deduped with ZERO new generation calls and a byte-identical row. Receipts:
`.nf-batch-worktrees/nf053-real-acceptance-receipt.json`,
`.nf-batch-worktrees/nf053-dedup-receipt.json`.

Checks: new deterministic suite `apps/api/src/memory-arc-summary.test.ts`
33/33 (dedup 1–5 incl. T-dedup-failed-dup, A-T1..A-T6 incl. A-T5
expiry-recovery, A-T8/A-T10, forced transport identity, T2 series + T2c
length ceiling, expiry hygiene, real-path Generation/attempt attribution,
T6a–e attempt bounds on a 7-model single-gateway plan, revoked-at-execute
ZERO rows); existing memory regressions api 39/39 + worker 24/24 + state
consumers 8/8 (two worker handler-shape assertions updated to the new
contract); workspace typecheck PASS; lint PASS exit 0 over repo source
(local untracked artifact dirs excluded — CI unaffected). Full `pnpm test`
once on the final tree: 2588 passed / 2 failed / 8 skipped; the 2 failures
(scale-evidence-migration 050A-upgrade, e2e gates/author-preview file-level)
ALL pass in isolation on the final tree (8/8, 14/14) — host parallel-load
flakes, not NF053-caused; hosted CI full-suite stays the authoritative gate
(retained green run38717181655 at HEAD `4227594`).
Separate exact-diff review: pass 1 APPROVE_WITH_FINDINGS (0 MAJOR, 3 MINOR,
3 INFO) on diff `ed89abb3…d290`; all MINOR repaired (§9.1 in-flight read
renders summary null; three missing deterministic tests added; GAP-030
idempotent-guard migration, revalidated scratch + no-op reapply) → scoped
delta re-verdict **APPROVE** on diff `bce9c4a7…52b6` (2747 lines), no open
findings. Honest limits: live provider failure/rate-limit fallback NOT
exercised; forced retry proven at suite level only; A-T7/T-conc-dup/
T-claim-interleave live timing not exercised. No commit/push/merge/deploy;
generated summaries are derived artifacts, NOT canon approval or publication.

## Seven-model gateway configuration applied — 2026-10-16

The author's seven exact model IDs are present in the live gateway catalog
and configured in listed order for six text profiles, including
LONG_CONTEXT_REVIEWER (42 enabled mappings); EMBEDDING untouched. Existing
acceptance DB `novelforge_acceptance_050b` and gateway reused. Configuration
preimage saved without credentials, changes audited and read back.
Gateway maxRetries=6 and manager default cap=7 make all seven eligible;
explicit lower request caps still truncate the list. NF053 must use a
sufficient attempt cap. Preserve invalid-request/validation stop behavior.

Real generation `86fdf9e5-1a3f-4ef7-baaa-28468574383b` SUCCEEDED through
MiniMax-M3; durable attempt read-back reports 931 input / 26 output tokens.
All seven catalog IDs verified; actual provider failure/rate-limit fallback
was NOT exercised. Gateway advertises Agnes and Claude Haiku as 200000,
lower than author-declared sizes; effective metadata conservatively uses
200000, with both claims retained. NF053 §17 has the full table/receipt paths.
Focused existing ai-core/OmniRoute tests: 82/82 PASS. No NF053 implementation
or summary acceptance claimed; no commit/push/deployment.

## Author approval / implement with real gateway — 2026-10-16

The author explicitly approved NF053's complete §7.1 additive specification
and selected LONG_CONTEXT_REVIEWER. The author directs, from now on, actual
implementation and testing with the real configured gateway, real story data
and persisted generated results. No further mock-only/design-only cycle or
new mock infrastructure is a prerequisite. Fix defects observed in the real
flow. Older pending approvals and fake-only GAP-028 restrictions below are
historical and superseded. MODEL-EVIDENCE-POLICY and NF053 §15.0 record this.

Next: implement NF053 through existing API/queue/worker/gateway/read surfaces;
validate the approved migration in scratch, then perform the required additive
local real-data rollout with a verified recoverable backup. Preserve Windows
Docker/data and canon. Verify real Generation/attempt/summary read-back,
dedup, relevant regressions and exact implementation review. Do not ask again
for the schema/profile or real gateway. No commit/push/merge/deploy approval.
No code, migration or real model call has been performed by this decision
record; implementation and real acceptance remain to be executed.

## NF053 coordinator verification / author decision pending — 2026-10-16

Observed final contract SHA256
`02ec0bd82606582f240283114d72c2e6eefcf4d550586920b5da89fb84210ff1`
and historical copy `9a3c18bf…ab8c` match the reported artifacts. Targeted
source/contract inspection confirms the requested forced-transport/scope,
barrier-separated concurrency, valid-reference build-failure fixture and
current-selection/historical-unknown wording corrections are present.
The reported independent full review plus final delta APPROVE is retained;
this is contract readiness for author decision, not implementation evidence.
Next: present the complete 11-column additive proposal (§7.1) and recommend
LONG_CONTEXT_REVIEWER for D1. Await explicit author decisions before source
implementation/migration authoring; no live migration/deployment implied.
HEAD `4227594`, WIP/stash and acceptance data preserved. No CI/UI reruns.

## NF053 corrections applied + reviewed APPROVE — 2026-10-16

The GAP-028/NF053 transport and acceptance corrections are APPLIED to the
single effective contract `tasks/NF-WF-053-arc-summary-contract.md` —
final sha256 `02ec0bd82606582f240283114d72c2e6eefcf4d550586920b5da89fb84210ff1`
(1160 lines); pre-correction `9a3c18bf…ab8c` byte-preserved at
`.nf-batch-worktrees/nf053-contract-consolidated-pre-correction-2026-10-16.md`.
Resolutions: forced transport identity + forced scope selection (§8.1a,
A-T9/A-T10; BullMQ 5.81.5 duplicate suppression evidence; no job removal,
no Redis reset); A-T7 barrier-separated with §9.2-consistent loser
assertions (§15.1); T-first-row-fail valid-reference fixture (cascade FK
respected; missing-source outcome stated); §12.3 CURRENT-selection vs
historical-UNKNOWN outcome semantics. Independent review: FULL APPROVE 0.9
on intermediate `5110bbcc…98bd4` (0 MAJOR, 3 MINOR, all applied) → delta
re-verdict **APPROVE 0.95** on `02ec0bd8…10ff1`, no open findings.
Review receipt, NOT author authorization. Still contract-only — no code,
migration, model calls, data mutation, D2, commit/push/merge/deploy; D2
evidence and green CI run38717181655 retained, not re-run. Open author
gates unchanged: §7.1 additive migration approval, D1 ModelProfile
(rec `LONG_CONTEXT_REVIEWER`). HEAD `4227594`; doc WIP and stash
preserved. Full entry in ISSUES-AND-GAPS (2026-10-16).

## NF053 consolidated coordinator assessment — 2026-10-16

Observed contract hash `9a3c18bf…ab8c` matches the harness report. The
consumed-intent set resolves the prior I/J/I predicate counterexample at
design level. Retain the reported full-review receipt, but final dispatch
readiness still needs the transport and acceptance corrections recorded in
ISSUES-AND-GAPS (GAP-028/NF053). Retained BullMQ job IDs can suppress a new
forced retry, and A-T7 contradicts the pre-claim structural write. No
implementation/schema approval inferred. Correct this single effective
contract without another amendment chain; preserve the submitted version
as review history. External dispatch prompts must work after `/clear`.
HEAD `4227594`, WIP/stash, D2 and green CI evidence retained; no reruns.

## NF-WF-053 consolidated contract REVIEWED APPROVE — 2026-10-16

Contract consolidation complete: `tasks/NF-WF-053-arc-summary-contract.md`
sha256 `9a3c18bf2fa5d0a57d2b9218b5a762ad00d11ff1102ca0862cd76a20e3bfab8c`
(996 lines) is the single effective contract superseding the frozen chain
(all four `.nf-batch-worktrees/nf053-*` artifacts hash-verified and
byte-preserved); implementers need not resolve the amendment chain.
Corrections consolidated: consumed-intent SET `summary_retry_ids TEXT[]`
consumed atomically by the terminal CAS (closes the I/J/I delayed-replay
counterexample; replaces successor-2's scalar last-intent column as an
explicit §7.1 item); execute-time authorization refusal = ZERO logical
calls, ZERO gateway attempts, ZERO durable rows; all `attempts`
exactness/monotonicity promises removed; provenance mapped to actual
durable fields (`Generation.task="MEMORY_ARC_SUMMARY"` + `artifactId` =
row id) with ONE new explicitly proposed column `summary_generation_id`;
M-bound wired via a `maxAttempts` pass-through; gateway AUTH/UNSUPPORTED
attempt counts corrected per `router.ts:196-208`. Review: pass 1 FULL by
one distinct reviewer actor (3 MAJOR + 1 MINOR, source-verified, all
applied); scoped delta re-verdict (all ADDRESSED, 1 new MINOR, applied);
final **APPROVE** on `9a3c18bf…ab8c`, confidence 0.93, no open findings.
Review receipt, NOT author authorization. Still contract-only: no code,
no migration, no model calls, no commit/push/merge/deploy; D2 main
unapplied; CI run38717181655 retained green, not re-run. Open author
gates: §7.1 additive migration approval (complete 11-column table incl.
`summary_claim_id`, `summary_retry_ids`, `summary_generation_id`), D1
summarizer ModelProfile (rec `LONG_CONTEXT_REVIEWER`). HEAD `4227594`;
doc WIP and stash preserved. Full entry in ISSUES-AND-GAPS (2026-10-16).

## NF053 successor-2 coordinator assessment — 2026-10-16

Observed artifact hash `af8ac1ef…1d441` matches the external report.
The retry identity handles immediate replay, but storing only the last intent
does not handle I-fails, J-fails, old-I-redelivered: the predicate admits I
again. A focused retry-precondition correction remains before final readiness;
see GAP-028/NF053 in ISSUES-AND-GAPS. No implementation approval inferred.
Consolidate the effective contract for clean-context execution rather than
requiring implementers to resolve the amendment chain. Every external prompt
must be self-contained after `/clear` (explicit author preference).
HEAD `4227594`, documentation WIP, stash, D2 and CI evidence retained.

## NF-WF-053 successor-2 REVIEWED APPROVE — 2026-10-16

Contract-only correction complete, resolving the successor assessment's
two remaining defect groups. (1) Forced-retry intent idempotency:
durable consumed-precondition — §4.1 proposal gains
`summary_retry_id TEXT NULL` (same single additive migration, same
gate); job `retryIntentId` required with `force`, one UUID per
accepted manual request; amended claim force arm
`{FAILED, summaryRetryId: {not: intent}}`; MANDATORY consumed-intent
dedup classification before structural work; terminal write stamps
the intent; cases A-T1..A-T5 cover same-intent replay (consumed no-op),
new intent (retries), NULL-retryId claim, force-without-intent
refusal, and post-expiry recovery via the ordinary SKIPPED arm.
(2) Guarantees/accounting: four-term vocabulary (claim holder /
logical generation call / gateway attempt / accepted result);
"zero-or-one model call per claim" retracted → at most one logical
call per won claim with 1..M gateway attempts (T6 retained); TTL
bounds claim age only; BullMQ job-level retries (`memory-jobs.ts:212`,
attempts=5) are at-least-once redelivery gated by the claim CAS;
discarded-result usage records retained, never fabricated; `attempts`
best-effort (may undercount or regress), nothing depends on it.
Artifact `.nf-batch-worktrees/nf053-contract-successor-2-2026-10-16.md`
sha256 `af8ac1efd4b0a117bc6a5e76cfa5b880f4287a8d57b0cbdb80b8c30947d1d441`
(343 lines). Frozen predecessors byte-preserved (`b1e5a68d…8bde`/399,
`4fc689a3…bf95`/607, `e2e33eb6…8159`/547). Review: pass 1 by one
distinct reviewer actor on pre-fix `5118e503…ff37` incorrect (2 MAJOR
+ 2 MINOR, all verified against source and applied); scoped delta
re-verdict on the final hash **APPROVE**, no new defect at MINOR or
above. Review receipt, not author authorization. Still PLANNED/
contract-only: no code, migration, model calls, commit/push/merge/
deploy; D2 main unapplied; CI run38717181655 retained green not
re-run; rendered evidence preserved. Open author gates: §4.1 additive
migration approval (now incl. `summary_claim_id` +
`summary_retry_id`), D1 summarizer ModelProfile (rec
LONG_CONTEXT_REVIEWER). HEAD `4227594`; doc WIP and stash preserved.
Full entry in ISSUES-AND-GAPS (2026-10-16).

## NF053 successor assessment — 2026-10-16 (coordinator)

Observed successor hash `b1e5a68d…8bde` matches the external report; both
predecessors remain byte-identical. First-row persistence and stale-result
identity fencing address the prior counterexamples at design level. The
reported APPROVE is retained, but remaining retry-idempotency and call-bound
contradictions prevent final readiness; see the dated GAP-028/NF053 assessment
in ISSUES-AND-GAPS. No implementation or migration approval inferred.
Next: one focused successor correction with explicit forced-job redelivery
and retry-bound cases, followed by exact-artifact review. Preserve D2 and CI
evidence without reruns. HEAD `4227594`, documentation WIP and stash retained.

## NF-WF-053 successor contract APPROVE — 2026-10-16

Bounded contract correction complete. Successor
`.nf-batch-worktrees/nf053-contract-successor-2026-10-16.md` sha256
`b1e5a68d5b356ae8d6eeb1e9f3097f6c77f6d658aa6f648fda65b00a98208bde`
(399 lines) resolves both remaining defect groups (claim lifecycle;
dedup/retry) from the coordinator follow-up, with 14 deterministic
fake-gateway acceptance cases. Both frozen drafts preserved byte-exact
(`e2e33eb6…8159`, `4fc689a3…bf95`); the corrected draft's external APPROVE
is retained as a receipt only. Independent review (one distinct reviewer
actor): pass 1 APPROVE_WITH_FINDINGS on `8d3e9a10…0ea1` (2 MINOR + 4 INFO,
all applied); scoped delta re-verdict on the final hash **APPROVE**, no
findings at MINOR or above. Review receipt, not author authorization.
Still PLANNED/contract-only: no code, no migration, no model calls, no
commit/push/merge/deploy; D2 main unapplied; retained green CI
run38717181655 not re-run; D2 rendered evidence preserved. Open author
gates: §4.1 additive migration approval (now incl. `summary_claim_id
TEXT NULL`), D1 summarizer ModelProfile (rec LONG_CONTEXT_REVIEWER).
HEAD `4227594`; doc WIP and stash preserved. Full resolution table in
ISSUES-AND-GAPS NF053 successor entry (2026-10-16).

## NF-WF-053 coordinator follow-up — 2026-10-16

The external APPROVE on corrected draft `4fc689a3…bf95` is retained as a
review receipt, not final readiness. Coordinator inspection finds remaining
claim-lifecycle and dedup defects; see ISSUES-AND-GAPS, NF053 follow-up below.
The contract needs one bounded correction and exact-artifact review before
schema/profile approval or implementation. No source or migration changed.
D2 corrected receipt hashes verified (`9fbb93ba…def7b`, `8aa4c80a…64c76`);
rendered evidence retained without reruns. Main integration remains unapplied.
HEAD remains `4227594`; existing documentation WIP and stash are preserved.

## Post-CI batch completion — 2026-10-16 (corrections + corrected contract reviewed)

Retain completed anonymous ContinueReading rendered en/id normal/hover evidence
(CLOSED-CONFIRMED; receipt hashes match, no repeats). D2 receipt CORRECTED and
empirically retested on current main `4227594`: the `060b5a32` artifact IS a
proper Git diff; plain `git apply --check` exits 0 under the repo default
(`core.autocrlf=true`, `core.eol` unset); the `-c core.autocrlf=false` failure
is the CRLF working-file interaction (LF-normalized hunks), not a malformed
patch. Preimage blobs match HEAD (`8584c2e`/`a6bc0b5`/`c0e4e5a`); postimages
verified via throwaway temp-index staging (`c8e1368`/`ebbfd0f`/`45d6b89`,
LF-equal to the reviewed candidate). Evidence receipts annotated (originals
retained). Integration package filed: apply with repo-default configuration;
main D2 remains UNAPPLIED — integration is a separate author decision; no
human screen-reader PASS implied.

NF-WF-053 corrected contract REVIEWED **APPROVE**: author-escalated findings
resolved in `.nf-batch-worktrees/nf053-contract-corrected-2026-10-15.md`
sha256 `4fc689a395ec3037769e5db17d322234b87a94f9e49f08a8b01501a7a7a7bf95`
(607 lines; original draft `e2e33eb6…8159` preserved untouched, cited in the
correction header). All five groups RESOLVED with inspected-source grounding
(execute-time `generation:create` gate; Generation.userId nullability
INSPECTED; honesty statement + reconciled four-field read shapes; real
pre-call CAS claim + TTL recovery + exact-bounds T6; real-generate/
fake-gateway seam + non-destructive rollback; NF052 integrated-and-pushed at
`4227594` recorded). Reviewer findings: 2 INFO citation-drift only. Still
contract-only PLANNED: no migration authored, no model calls, no
implementation; §4.1 schema/migration proposal remains gated on its own
author approval; only D1 (summarizer ModelProfile constant, rec
LONG_CONTEXT_REVIEWER) remains open. CI run38717181655 (2562 tests / 212
files) evidence retained.

## CI green / next batch handoff — 2026-10-15

Hosted run38717181655 on4227594f8349b175648cc47b8b8019133935af05 succeeds
lint, typecheck, all2562 tests across212 files, and Compose validation.
Earlier pending hosted-CI statements below are historical boundaries.
Five integrated batches and both CI fixes are pushed; local artifacts and
stash remain preserved. No deployment or human acceptance is implied.

Next bounded batch (2026-10-15, second half): reconcile active execution status without rewriting frozen
history — DONE (this entry + dated DELIVERY-PLAN override); finish missing residual-D2 rendered evidence on an isolated candidate —
CLOSED (separate reviewer verdict CLOSED-CONFIRMED; isolated candidate
`d2-cr-candidate` at `4227594`: real rendered ContinueReading on /browse after
anonymous device-local progress on the existing published chapter
`/read/gap-051-lentera-menara-kelabu/1`; en+id normal/real-hover computed
border `rgb(111,106,99)`=#6f6a63, hover bg bg-1→bg-2; contrast
3.6855/3.4278/3.1267 EXACT vs the D2 receipt; receipts
`.nf-batch-worktrees/logs-b8/continue-reading-cr-evidence.{json,md}` + 4
screenshots; candidate :3002 evidence server stopped after verification);
draft/review NF-WF-053 summary follow-up under NF009 Invariant6, no code yet —
DRAFTED and **APPROVE_WITH_FINDINGS** (draft
`.nf-batch-worktrees/nf053-contract-draft.md` sha256
`e2e33eb68fae4cc930dc304cd0b6790c8a0f39ff4650eba89fc96c908c3e8159`, 547
lines; arc-scope summaries via the existing processRebuild stored on the
existing MemoryProjection row and served by existing read surfaces; every
Invariant-6 condition mapped; schema-touching prerequisite §4.1 flagged —
additive columns + MemorySummaryStatus enum need their own author approval
before implementation; open author decisions D1–D5 with recommendations;
review findings are citation-drift only, applied at filing).
ContinueReading authentication is not a source-backed prerequisite: progress
is device-local and novel resolution uses public GETs — now PROVEN by
rendered observation (no login, no stored state). Acceptance DB read-only
throughout; no fixtures created. D2 main integration stays separate, and
summary/compiler/ADR policies are not silently broadened.

## CI full-suite fixture repair — 2026-10-15

Hosted c43f234 passes lint/typecheck but run38714183668 exposes five failures
among2557 passing tests. Fixed three test-only assumptions: HIGH inventory now
accounts for dedicated SCALE route coverage; historical050A fixture excludes
all later migration directories from private copies; routing source lookup
supports root-workspace and package cwd. No production migration, route or
workflow is changed. Local API revision/migration60/60 and routing3/3 in both
invocations pass; scoped lint/API typecheck exit0. Separate exact test-diff
APPROVE on SHA89e081a736f6194fcf4de4c8a994c15f0c4de645a24feb1e595708d7310561e9.
Publishing the bounded follow-up; CI closure waits for the actual full run.

## CI lint repair — 2026-10-15

GitHub run38712272150 on34d5d3c fails eight SCALE lint errors, also present
in previous run38139293497. Minimal three-path cleanup preserves audit
transactions, authorization and test assertions. Local full source lint and
workspace typecheck exit0; web slice3 tests12/12 and API SCALE tests36/36 pass
using suite-owned scratch data only. Independent source review APPROVE,
diffSHA2b780a4fdc4d54057033d4781f551d16b1330cdbdb7ab9e002cb72da8be1d40d.
Publishing this bounded fix for the requested CI repair; full hosted result
is pending at this record boundary. No CI gate is disabled, no deployment or
acceptance-data mutation performed. See ISSUES-AND-GAPS for root cause/proof.

## Authorized publication execution — 2026-10-15

The author approved the concrete five-commit package and push to origin/main,
including the three existing local commits. Fetch confirms ahead3/behind0
before new commits. C1=1ac9e8e (NF051), C2=7419390 (NF052), C3=ec54346
(reviewed web/parity). C4 staged whitespace check caught an extra EOF blank
line in both seed scripts; a newline-only correction is being verified.
C5 records this execution; no extra commit group. Index/path guards and
explicit literal staging are used; local artifacts/stash remain preserved.
Push has not yet occurred at this record boundary; verify actual Git/remote
and the subsequent Engram checkpoint for final publication result.

## Commit/push package assessment — 2026-10-15

Observed manifest1fb621d2 and both seed script postimages e8107b4d match.
Retain external post-fix API typecheck/lint and exact script APPROVE;
prior API TS2550 is resolved in WIP. Labels patch1c0c0e6b reverse-check on
main supplies retained exact batch5 provenance for the label continuations.
Final publication snapshot uses explicit literal file paths and hashes,
replacing broad directory staging in the original manifest (preserved).
See `.nf-batch-worktrees/commit-manifest-final-2026-10-15.json`.
Five proposed commits cover NF051, NF052, reviewed web/parity work, utility
scripts and records/PROPOSED ADR; publishing the ADR does not accept A/B.
Retain the harness's fetched ahead3/behind0 evidence; recheck remote before
publishing. No staging/commit/push performed; author publication decision
remains pending. D2 replacement stays excluded and unapplied.

## Scoped commit preparation — 2026-10-15

GAP-051 seed-script typecheck fix (separate reviewer **APPROVE**, zero
findings): both identical copies of `gap051-loadmore-seed.ts`
(`apps/api/scripts/` + `scripts/`) had their `Promise.withResolvers` block
replaced with the in-package executor idiom
(`await new Promise((resolve) => setTimeout(resolve, 1000));`,
revision.test.ts:1628 pattern) — API typecheck exit 1 → 0 (the single
TS2550 at :63 was the only error), scoped eslint clean, retry semantics
byte-preserved (`attempt < 60`, 1000 ms, continue, throw-on-!ok), script
not executed (its default target is the acceptance DB — execution against
acceptance data is forbidden by directive). Post-fix hashes `e8107b4d…0ea9`
both copies; fix recorded in ISSUES-AND-GAPS fifth-pass entry.

Upstream fetched (no merge/rebase): main is **ahead 3 / behind 0**; the
three unpushed commits 7589388, 23d4a1a, 50609c0 are confirmed still
unpushed. A five-commit publication manifest (NF051 sweeper; NF052 endpoint
+ contract chain; batch4 author-approved web/worker/parity integration;
GAP-051 seed scripts; docs/records incl. ADR-0017 PROPOSED) with per-commit
file lists, hunk accounting (constants.ts NF051 hunk → first commit, NF052
hunk → second), evidence and the preserved-exclusions list is filed at
`.nf-batch-worktrees/commit-manifest-2026-10-15.md` for final publication
authorization. D2 remains separate; ContinueReading UNKNOWN; human
screen-reader deferral stands. Nothing staged or committed yet.

## NF-WF-052 applied to main WIP by author authorization — 2026-10-15

Patch7d63a0c3 is now applied (not committed). Five source/test postimages match
the reviewed candidate byte-for-byte; all other tracked WIP hashes, HEAD,
empty index and stash remained unchanged at verification. Reverse apply-check
passes. Receipt: `NF-WF-052-main-integration-2026-10-15.md` in this directory.
Local memory/ai-services typechecks pass. API typecheck fails TS2550 in the
pre-existing untracked GAP051 seed script at Promise.withResolvers (ES2023
lib); script is outside the patch and absent from the candidate. Recorded in
ISSUES-AND-GAPS; no unrelated source fix or library-target change applied.
Retain candidate 39-pass suites and exact-patch APPROVE, not fresh main tests.
Source integration is complete; full main API typecheck is not green.
No restart/DB mutation/commit/push/merge/deploy or D2 integration performed.

## NF-WF-052 v4 assessment — ready for integration decision, 2026-10-15

Observed final patch and approved amendment hashes match the handoff.
`git -c core.autocrlf=false apply --check` succeeds on current main WIP;
numstat identifies exactly the five allowed source/test paths and proper
new-file test coverage. Source inspection confirms distinct grouped anomaly
count, shared-cap surfaced prefix, completeness comparison and removal of
diagnostic appends from selected excluded[]. Approved no-head behavior and
diagnostic types are present. Retain external 39-pass memory suites, relevant
checks and separate exact-v4 APPROVE; no suites rerun here and no new local
review verdict claimed. No blocking finding identified in this assessment.

Candidate is ready for the separate author integration decision on patch
`7d63a0c37451cc8210d0e578d8f6fe0a9e312f541b17ff629a428486229dfd88`.
It remains unapplied; HEAD50609c0d, empty index and existing stash preserved.
No commit/push/merge/deploy, D2 integration or runtime restart is included.
Keep ContinueReading UNKNOWN and human screen-reader acceptance deferred.

## NF-WF-052 anomalies amendment IMPLEMENTED; patch v4 APPROVE — 2026-10-15 (fourth pass)

The approved amendment is IMPLEMENTED in the same isolated candidate (still
zero commits; main tree untouched) — the "next" items in the approval entry
below are now done, separately reviewed. `excluded[]` is restored to
selected-canonical exclusions only (|excluded| ≤ |selected| ≤ cap — the
combined fixture asserts 20=20; the pre-fix in-suite red run captured
excluded reaching 40 = 2×cap); non-canonical diagnostics moved to the new
bounded additive `global.anomalies` `{ total (exact grouped-before-COUNT
1-row aggregate), surfaced ≤ shared cap constant in (MIN(created_at),
scope) order raw-text, complete === (total === surfaced.length) }` with the
constant reason omitted contractually and raw diagnostic sagaId. No-head
short circuit preserved and documented (no anomaly/DB-health inspection;
empty view ≠ health proof; no metadata policy). Canonical
selection/overflow/guard/freshness/provenance/authorization/as-of
byte-stable v3→v4 (reviewer-verified line-by-line).

Red-phase: 14 failed / 9 passed pre-fix. Verification (writer + coordinator
+ reviewer independently): memory.global 23/23 + memory.test 16/16 = 39/39
exit 0; ai-services 2/2; three typechecks exit 0; scoped eslint clean.
Final integration artifact: `.nf-batch-worktrees/nf052-main-wip-anomalies.patch`
sha256 `7d63a0c37451cc8210d0e578d8f6fe0a9e312f541b17ff629a428486229dfd88`
(1691 lines; source-only five paths; proper git new-file; NF051 hunk absent;
preimages = current main WIP). Apply-check vs live main WIP exit 0
(`git -c core.autocrlf=false apply --check`); byte-exact fidelity proven
(applied postimages == candidate hashes: constants `e46dcf1f`, types
`3264487a`, memory `cd49ef5e`, routes `c2daaf6a`, test `258b20fb`). Separate
reviewer (distinct actor): **APPROVE** for the exact hash; 1 INFO finding
recorded (tail fixture collation assumption; test-only, fails loudly if
violated). One test-only deviation (tail-fixture facts corrected per the
amendment's ordering rule) reviewer-verified. Preserved: v3 patch
`76e4d435…5fe60`, v2 diff `31bb473e…a222`, proposal `4ed6749f…0165a`.
Main integration remains a separate author decision (no staging/commit/
merge performed). D2 separate; ContinueReading UNKNOWN; human screen-reader
deferral stand.

## NF-WF-052 anomalies amendment approved — 2026-10-15

The author explicitly approved the proposed anomalies response change for
the isolated candidate. Filed authoritative amendment:
`tasks/NF-WF-052-anomalies-amendment-2026-10-15.md`. Older PROPOSED/pending
approval statements are historical. Keep selected-candidate excluded[] within
the existing cap; noncanonical diagnostics move to anomalies with exact
distinct-scope total, <= shared-cap raw surfaced prefix and completeness flag.
Both LOW wording findings are incorporated. Ordering/cap20/routes-only stay
approved. Implementation, focused verification and separate exact-diff review
are next; none has been performed by this approval-recording turn.
Candidate and main integration remain separate; no new authorization for
staging/commit/push/merge/deployment or D2 integration. Preserve retained passes,
ContinueReading UNKNOWN and human screen-reader deferral.

## NF-WF-052 A1.4 conflict resolved to PROPOSED amendment — 2026-10-15 (third pass)

Both next-actions from the packaged repair assessment above are done and
the source-derived concerns are now reproduced outcomes, separately
reviewed. Reproduction (suite-owned scratch DB, evidence-only probe since
deleted; suite restored 35/35 exit 0; production sources byte-identical
`dea0ccd2…` / `da149659…`): 20 selected canonical sagas without projections
+ 20 non-canonical scopes → `excluded.length === 40` (20 MISSING +
20 UNRESOLVABLE_SOURCE), twice amendment A1.4's explicit
selected-count bound; 25 non-canonical scopes → exactly 20 surfaced, tail
`zz-noncanonical-24` absent from the response body. Prior "no new contract
decision" conclusion CORRECTED (it verified O(cap) proportionality, not
A1.4's numeric letter; separate reviewer formally retracted it).

Dated amendment proposal PROPOSED — NOT implemented, NOT filed:
`.nf-batch-worktrees/nf052-a14-amendment-proposal.md` sha256
`4ed6749f44fa9c395266d6c7d13ee39dd5fab62f63ba0fd011311b7bfa10165a`.
Restores A1.4's letter verbatim (|excluded| ≤ |selected| ≤ cap); moves
non-canonical surfacing to a new bounded additive `anomalies` aggregate
`{ total (exact 1-row COUNT), surfaced ≤cap raw-verbatim entries,
complete: total === surfaced.length }` — exact truncation and completeness
semantics, no silent tail, no relabeling of anomaly truncation as canonical
overflow, canonical selection and exact canonical overflow unchanged.
Rejected 2×cap-excluded alternative recorded with rationale. Separate
contract review (distinct actor) for the exact proposal hash:
**APPROVE_WITH_FINDINGS** — conflict real and correctly diagnosed;
resolution preserves every frozen requirement checked (A1.1-A1.4, A2-A6,
addendum §1-§5, correction §1.6, original invariants, routes-only); two LOW
documentation-exactness findings to apply verbatim at filing time
(cap-independent surfaced bound; contractual constant-reason omission from
the surfaced entry shape). NO implementation before author approval.

Preserved: packaging patch `76e4d435…5fe60` (accepted evidence), v2 diff
`31bb473e…a222`, retained 35-test/review evidence, candidate isolation,
main WIP, stash, approved three policies, D2 separation, ContinueReading
UNKNOWN, human screen-reader deferral. No staging/commit/merge performed.

## NF-WF-052 packaged repair assessment — 2026-10-15

Observed patch 76e4d435ed504799aab8ce7c8cb19a74ceee40b1e1241e7b7a9e73133a35fe60
matches and current-main apply-check succeeds with core.autocrlf=false.
Guard and packaging findings are resolved; retain external 35-pass memory
suites, other checks and exact-artifact APPROVE. No suites rerun here.

Response-bound readiness remains unresolved: detection appends up to 20 extra
anomalies after up to 20 selected-candidate exclusions, permitting 40 versus
amendment A1.4's selected-count bound. Source comment acknowledges this numeric
exception. A truncated anomaly tail has no response-level completeness flag.
These are source-derived contract concerns, not a reproduced mixed endpoint
result. See ISSUES-AND-GAPS. Next: bounded combined fixture and a concrete
resolution proposal; no new shape/bound/policy silently authorized.
Candidate remains isolated; preserve main WIP, stash, approved three policies,
D2 separation, ContinueReading UNKNOWN and human screen-reader deferral.

## NF-WF-052 repair + integration packaging complete — 2026-10-15

Both next-actions from the candidate assessment above are done and
separately reviewed. §5 reproduction (suite-owned scratch DB only): the
uppercase saga-backed variant ranked as a phantom orphan (scopes length 2,
double representation) and malformed scopes (braced/bare/junk) ranked as
orphan entries (scopes length 4) — RED-phase receipts 3 failed / 16 passed;
the risks are now reproduced outcomes, not just source-derived. Implemented
handling (§5-permitted exclude-as-UNRESOLVABLE_SOURCE, documented in code):
canonical regex filter on ALL THREE P queries (DB LIMIT applies to the
canonical population — no filter-after-LIMIT; select/count/boundary
agreement and disjointness preserved) + bounded ≤cap detection query
surfacing non-canonical arc scopes in `excluded[]` (never ranked, never
silent, raw id text verbatim). Retained F3 regression added: same-createdAt
orphan ties at endpoint ordering (T3) and at the overflow boundary (T4,
overCapCount 1, tie spanning the cap). Verification: memory.global 19/19 +
memory.test 16/16 = 35/35 (coordinator and reviewer independently),
ai-services 2/2, three package typechecks exit 0, scoped eslint clean;
policies unchanged (oldest-created, cap 20, routes-only); no
compiler/UI/schema/worker/LLM scope.

Final packaging artifact:
`.nf-batch-worktrees/nf052-main-wip.patch` sha256
`76e4d435ed504799aab8ce7c8cb19a74ceee40b1e1241e7b7a9e73133a35fe60`
(1462 lines; source-only, five allowed paths, proper git new-file diff for
the test; NF051 interval hunk absent by construction — preimages are
CURRENT MAIN WIP: constants `6ec86ea0`, types `994e732e`, memory
`46c3996f`, routes `af59dadb`, test absent). Apply-check vs live main WIP
exit 0; byte-exact fidelity proven (patched copies reproduce the candidate
postimages hash-for-hash: constants `e46dcf1f`, types `3f1b3f74`, memory
`dea0ccd2`, routes `c2daaf6a`, test `da149659`). Apply byte-exactly with
`git -c core.autocrlf=false apply` (repo-default autocrlf mangles the LF
new-file — code-identical but hash-different). Separate reviewer (distinct
actor) for the exact hash: **APPROVE**; two LOW informational notes
recorded in ISSUES-AND-GAPS (≤cap detection surfacing bound; raw-text
sagaId on detection-path exclusions). Preserved v2 diff `31bb473e…a222`
untouched; candidate still zero-commit; main source unchanged for
assessment; no staging/commit/merge performed. D2 isolation,
ContinueReading UNKNOWN and human screen-reader deferral all stand.

## NF-WF-052 candidate assessment — 2026-10-15

Observed v2 hash 31bb473eba4caf9f86c9c01eae6e23c04dc4ac6a45c39fe3dba0486575eca222
matches. Retain external 31-pass memory suites, backend checks and separate
APPROVE for that exact artifact; no tests were rerun here. Candidate remains
isolated. Current-main apply-check fails at the already-present NF051 constants
hunk; the new test is plain text outside a Git new-file hunk. Require a complete
current-WIP-relative source patch before integration.

P queries have no canonical-form guard documented/implemented per addendum
section 5. Uppercase anti-join mismatch and malformed UUID-boundary failure
are source-derived risks, not reproduced outcomes or observed live data.
Next: targeted suite-owned reproduction/guard and equal-createdAt orphan
regression, then exact artifact review/application dry-run. Approved policies
remain fixed; no compiler/UI/schema scope. See ISSUES-AND-GAPS for closure.
Preserve all WIP/stashes, D2 isolation, ContinueReading UNKNOWN and human
screen-reader deferral. No main source integration or runtime restart here.

## NF-WF-052 implemented + separately reviewed — 2026-10-15

The authorized bounded backend/API slice is IMPLEMENTED in the isolated
candidate worktree `.nf-batch-worktrees/nf052-candidate` (HEAD `50609c0` +
preserved NF-WF-051 WIP overlay; zero commits, main tree untouched).
`GET /api/workspaces/:workspaceId/novels/:novelId/memory/global` composes the
L5 union read per the frozen chain and the three recorded author decisions:
disjoint candidate sources (every saga; orphan arc scopes via novel-scoped
`NOT EXISTS`), one normalized `(createdAt, id)` window, cap 20, exact
two-term `overCapCount`, ≤50-id overflow prefix with `firstExcludedOrderingKey`,
`excluded[]` only MISSING/UNRESOLVABLE_SOURCE, STALE/FAILED included and
flagged, as-of discipline, server-side `novel:read`, routes-only.

Exact reviewed diff v2 `.nf-batch-worktrees/nf052-candidate.diff` sha256
`31bb473eba4caf9f86c9c01eae6e23c04dc4ac6a45c39fe3dba0486575eca222`.
Review chain: v1 `eeb650a3…d2b8` APPROVE_WITH_FINDINGS (3 × P3;
four test-seed deviations ACCEPT) → F1/F2 applied (test-only) → v2
**APPROVE**. Coordinator-observed verification: memory.global 15/15 +
memory.test 16/16 (both rounds, exit 0), ai-services 2/2, memory package
exit 0 (no test files), three package typechecks clean, scoped eslint clean;
reviewer reruns identical. Suite-owned DB `novelforge_test_memory_global` on
nf-pg-5433 only; acceptance data untouched. F3 residual (P3, reviewer-
optional: P-vs-P equal-createdAt collation tie unexercised) recorded in
ISSUES-AND-GAPS. Stale amendment fixture mechanisms (B2/B4) and brief errors
recorded there as reviewer-accepted deviations. Retained scope unchanged:
D2 patch unapplied, ContinueReading rendered evidence UNKNOWN, human
screen-reader acceptance deferred, NF-WF-053/ADR-0017 not gates. Integration
of the candidate into main is a separate author decision (no commit/merge
performed). The earlier assessment entry below remains the dispatch record.

## NF-WF-052 author decisions / second-pass assessment — 2026-10-14

Direct author approval selects oldest-created `(createdAt ASC, id ASC)`,
20 candidate scopes per read, and routes-only. The requested wait until the
next harness output is now satisfied. See
`tasks/NF-WF-052-author-decisions-2026-10-14.md`; older PENDING/NOT READY
policy statements below are historical. Implementation and exact-diff review
remain unfinished; no endpoint code has been added by this assessment.

Observed: dispatch correction c85f344a matches; the four frozen contract hashes
and manifest match; candidate discovery.test.ts equals main's exact D5 test
hash 0f754fdfd2381e17b25ee3f6cf801a188e5b3701e0a537bb9a47fac52f9f5fb6.
Replacement D2 hash matches and current-main apply-check succeeds. Retain
external 19-test/independent-review and NovelCard/search normal/hover receipts;
these were not rerun here. ContinueReading rendered evidence remains UNKNOWN,
not closed by sibling styles. D2 stays unapplied pending separate integration
authorization. Retain worker/package results and human screen-reader deferral.
Next dispatch: implement the authorized bounded NF052 backend/API slice in an
isolated candidate, verify focused acceptance and review its exact diff.

## Batch 8 continuation assessment — 2026-10-14

Replacement patch SHA256 060b5a32759ce19829f32156d712e968ef0b2fa567231ab4d735358a092b2ee3
matches and git apply --check succeeds against current main WIP; it remains
unapplied. Frozen worker/package log hashes match and counts support retained
84 pass / 1 skip and 571 pass. No checks were rerun and no release inferred.
The patched worktree lacks main's two-state D5 regression; its 17-test receipt
does not cover that test, contrary to the closure paragraph's claim.
NF052 dispatch manifest revives unbounded per-arc OVER_CAP exclusions despite
amendment A1; require a dated correction, appropriate backend checks and
working-tree dependency terminology. Preserve the four frozen contracts.
Ordering/cap/compiler choices remain pending; no endpoint implementation.
Next: verify an exact current-WIP candidate including existing tests, complete
missing rendered site evidence without new acceptance data, correct dispatch,
and retain all existing passes/deferrals. See ISSUES-AND-GAPS for closure limits
and the reported four-child process violation (maximum three including review).

## Batch 8 assessment — 2026-10-14

Addendum, proposed D2 diff and release-scope hashes match the receipt. Retain
the final NF052 addendum APPROVE and its seven-case proof; prior overflow
counterexample is resolved by disjoint sources and one global boundary.
Ordering/cap/compiler choices remain unrecorded; no endpoint implementation.

The new D2 artifact is not integration-ready. git apply --check fails on
main.css, GenreChips, SearchBox and browse: it was built from older content
before the approved #6f6a63 token, D5 ternary and dim-placeholder fixes.
Its GenreChips base still carries text-dim/border-readable alongside active
text/accent classes, restoring the competing-class mechanism fixed in D5.
Do not overwrite main with this reviewed historical worktree. Rebuild only
genuinely missing control boundaries against current WIP using the existing
approved token; preserve label, placeholder, active and focus corrections.
Decorative genre badges need no blanket 3:1 classification. No global border
token swap or D4 behavior change has been authorized or demonstrated necessary.

Release scope is filed, not executed. Reuse existing results and prioritize
the specifically missing worker/package coverage; keep a later full battery
as explicit scope, not a prerequisite for every local task. No database
migration is required by NF-WF-052. See ISSUES-AND-GAPS for the artifact
finding and closure check; original frozen patch/review remain intact.

## Batch 8 execution — 2026-10-14 (checkpoint #287)

D2 residual patch delivered: `.nf-batch-worktrees/batch8-d2-border-repair-v2.diff`
sha256 `060b5a32759ce19829f32156d712e968ef0b2fa567231ab4d735358a092b2ee3`
(three boundary sites, existing #6f6a63 token, no token additions, hover
overrides deleted). OBSERVED: main-tree `git apply --check` exit 0;
independent review APPROVE (7/7, hash-scoped); recomputed ratios
3.69/3.43/3.13; focused discovery + axe suites 17/17 on the patched
worktree. Not applied to main; integration is a separate decision. See
ISSUES-AND-GAPS closure paragraph.

Release-battery stages 6–7 executed serially, stop-on-failure; stages 1–5
reused, not rerun. Stage 6 (`pnpm --filter @novelforge/worker test`): exit 0,
11 files, 84 passed / 1 skipped — the skip is worker.test.ts:257
`describe.skipIf(!itUrl)` real-Redis integration, out of b8 scope by design;
sweeper IT used only its scratch DB `novelforge_test_memory_sweeper` on
nf-pg-5433 (its `prisma migrate deploy` touched that scratch only). Stage 7
(package sweep, `--workspace-concurrency=1`): exit 0, 571 passed / 0 failed
across 17 suites with tests; 18 packages ran, `@novelforge/memory` has no
test files. Scope doc's "15 package unit suites" undercounts the current 18
test-script packages. Frozen logs:
`.nf-batch-worktrees/logs-b8/stage6-worker.log` sha256
`3324f3e2e02258b8a88a634b222b5a8deee0633cb34653378637160b1005104b`,
`.nf-batch-worktrees/logs-b8/stage7-packages.log` sha256
`964e81cd74d01cc584ae836dcf7c0df43f66cc40524e6e91f647c91544822ba0`. No
acceptance DB, Redis flush or Docker restart involved.

NF-WF-052 dispatch prepared without implementation:
`tasks/NF-WF-052-dispatch-manifest.md` sha256
`f10e231d1ff1504d1732beea8cdab13825d51e53d5c62329d03c8a3893b1d2b7` links the
four-artifact contract chain (hashes re-verified), allowed/forbidden paths,
dependencies, PROPOSED verification commands and the arc-21+ explanation.
Ordering, cap and compiler-adoption remain explicitly PENDING author
decisions; no endpoint work until recorded; NF-WF-053 and deferred
ADR-0017 are not gates.

## Batch 8 second pass — 2026-10-14 (checkpoint #289)

D2 candidate verification corrected and completed. The prior 17/17 focused
receipt is SUPERSEDED: it ran HEAD's discovery.test.ts without the WIP
it.each([null, "fantasy"]) D5 chip regression. Candidate rebuilt from
CURRENT main WIP (7 files re-copied incl. the WIP test file), reviewed patch
`060b5a32759ce19829f32156d712e968ef0b2fa567231ab4d735358a092b2ee3` applied
unstagged in `.nf-batch-worktrees/border-v2/wt`. OBSERVED: discovery + axe
suites 2 files, **19 passed / 0 failed** (coordinator run and independent
reviewer's own run agree); reviewer verdict APPROVE 0.98 — candidate delta
exactly the 3 substitutions, main tree untouched. Rendered computed colors
(candidate dev server :3002, live API data, no fixtures): NovelCard and
browse search-result chapter links — normal border rgb(111,106,99)
(#6f6a63) on bg rgb(22,20,18); under REAL hover border stays #6f6a63 and
background shifts rgb(32,29,27) (bg-2); worst-case hover ratio 3.13:1.
ContinueReading: element NOT rendered for an anonymous session — rendered
criterion UNKNOWN, covered indirectly by the shared class/token
construction and the two rendered sibling sites. Receipt:
`.nf-batch-worktrees/logs-b8/rendered-colors-d2-candidate.md`. Main-tree
integration remains unauthorized and unperformed.

Dispatch correction issued (documentation only):
`tasks/NF-WF-052-dispatch-manifest-correction-2026-10-14.md` sha256
`c85f344aecb102714428c980a84a4340195d026858a221d86b18a9aae7af6009`. It
supersedes the manifest's §6/§4/§3 statements: per amendment §A1,
`excluded[]` carries only MISSING | UNRESOLVABLE_SOURCE (never OVER_CAP
entries — over-cap arcs are reported solely as the bounded aggregate
`overflow` object: exact `overCapCount`, ≤50 `overCapArcIds` prefix,
`firstExcludedOrderingKey`); verification commands replaced with
backend/API filters (@novelforge/api, @novelforge/memory,
@novelforge/ai-services); NF-WF-051 described as integrated in current WIP,
not a Git merge. Disjoint-source/global-boundary algorithm, pending
decisions and NOT READY status unchanged; frozen contracts re-verified
byte-identical. Worker 84 PASS / 1 SKIP and package 571 PASS battery
evidence retained — not rerun, not release acceptance.

## Batch 7 assessment — 2026-10-14

Observed :3001 / and /browse both return HTTP 200. Screenshot, corrected
contract and revised documentation snapshot hashes match the receipt. Retain
external rendered en and read-only migration-preflight evidence; no repeated
restart, observation or migration is required. Preflight GO is readiness,
not authorization for any unnamed migration or platform release.

NF-WF-052 correction still needs an overflow-count repair before implementation.
P includes Saga-backed scopes with projection-time keys while S uses Saga-time
keys; deduplication cannot make per-source successor sets equivalent to the
global selected set. Counterexample: cap 2, S selects S1/S2, P has S1's later
projection plus one later orphan, and no P row contributes to selection. The
specified full P count reports 2 overflow candidates, but only the orphan is
outside the window (1). Simplest repair: S supplies every Saga; P supplies
only orphan scopes via tenant-scoped NOT EXISTS. These disjoint sources need
no intersection subtraction. Specify one normalized global boundary for
selection/count/overflow-prefix, and review adversarial examples.

Three new policy choices remain open (ordering, cap, compiler adoption).
NF-WF-053 is not a prerequisite; ADR and human screen-reader deferrals already
stand. Preserve original/correction artifacts; use a dated reviewed addendum.
See ISSUES-AND-GAPS for the exact concern and closure check.

## Batch 6 assessment boundary — 2026-10-14

Amendment/original/snapshot hashes match the receipt; reverse-check confirms
the reviewed label patch is applied. Retain 9/9 discovery and rendered id
evidence. GET :3001/browse independently returns 500 with nitro-dev.mjs/ENOENT;
the stale module-graph cause is an inference until the exact-process restart
and HTTP read-back succeed. Component passes do not establish SSR health or
complete rendered en coverage. No new restart or test execution here.

NF-WF-052 amendment improves output bounds and MISSING discovery, but A6
still specifies an unrestricted distinct-scope query and saga query before
cap selection. Bounded output is not bounded candidate retrieval; specify
database-side limit/order/count semantics before implementation. Its claimed
corrected ../../AGENTS.md and ../../docs links still resolve outside this
repository from tasks/; fix links relative to the actual document directory.

Only the original three new policy choices remain unrecorded: arc ordering,
cap and compiler adoption. Existing ADR-0017 deferral is already authoritative;
do not ask for acknowledgment again. NF-WF-053 scope is a separate non-goal,
not an additional gate for 052. Also clarify A2's actual every-Saga rule versus
the receipt's OutlineNode-only description. Preserve frozen artifacts and
record any changes as a reviewed dated correction. See ISSUES-AND-GAPS.

RESOLVED (batch 7, 2026-10-14): both contract items above are fixed by
`tasks/NF-WF-052-correction-2026-10-14.md` (sha256 `1febd2d2…62b2`, review
chain in the batch 7 record below): database-side bounded query semantics
(§1) and corrected `../` links (§3). The 500/ENOENT diagnosis is no longer an
inference: exact-process restart + HTTP 200 + rendered en evidence recorded
below (batch 7 Scope A).

## Batch 7 — coordinator record 2026-10-14 (web recovery / NF-WF-052 query-semantics correction / plan review + migration preflight)

One coordinator + 3 children (PlanDeltaReview scout; MigrationPreflight;
NF052CorrectionDraft) plus a follow-up read-only reviewer
(NF052CorrectionReview). Author WIP, stash, frozen artifacts preserved;
nothing staged/committed/merged; acceptance worker and Docker untouched.

- **Scope A — :3001 recovered, missing rendered en evidence CAPTURED.**
  Process identified before any action: old server = supervised service
  `nf050c-web` (sh 26348 → nuxt 35820 → cli 8732/33560 + esbuild 38128),
  launched 2026-10-13 04:32 as `nuxt dev --port 3001`, cwd `apps/web`.
  Root cause OBSERVED from its own log: after heavy HMR (label patch +
  discovery edits) Nitro began failing `renderer.mjs`/`nitro-dev.mjs`
  ENOENT against pnpm paths that exist on disk (3461-byte file verified) —
  stale in-process module graph of the long-running dev server, not a
  missing file and not app code (discovery suite 9/9, batch 6). Old tree
  stopped (26348, 35820; children died with it; wrapper exit 127 recorded);
  relaunched with the SAME config (`./node_modules/.bin/nuxt dev --port
  3001`, cwd apps/web; service `nf050c-web-r3`, pid 12376). Verified:
  `/` = 200, `/browse` = 200 (curl). Rendered en proof: locale cookie
  `nf-locale=en`, page reload, CDP extraction of `.nf-section-label`
  computed colors — all render `rgb(168,162,158)` = #a8a29e (7.29:1 on
  bg-1); screenshot `.git/batch7-en-labels-3001.png`
  (bbad34dbba9bbda80a97167ffcb6f64097dacb4c39c8fe9b299b6e8c72ede77f).
  Existing id/zoom/reduced-motion evidence retained unchanged.
- **Scope B — NF-WF-052 query-semantics correction FILED + reviewed**:
  `tasks/NF-WF-052-correction-2026-10-14.md`
  (final sha256 `1febd2d2…62b2`; prior reviewed bytes `25701f1c…ac69b`).
  Frozen original `ccffa3bb…793a3` + amendment `7075d793…7f04`
  byte-identical (re-verified). Normative content: DB-side deterministic
  selection — Query P (GROUP BY scope + HAVING aggregate-key successor
  predicate) + Query S, LIMIT CAP each; k-way merge; overCapCount via
  exact `|P_beyond ∪ S_beyond|` with one predicate-bounded intersection
  JOIN (`s.id::text`); ≤50 overflow prefix per side, merged+truncated;
  discovery normative every-Saga + orphan projection scopes (OutlineNode
  excluded as source, schema-grounded); required-reading links fixed
  `../../`→`../` (8 targets exist, verified); §6 section-by-section
  supersession map; ordering/cap/compiler stay OPEN author decisions; no
  NF-WF-053 gate, no ADR-0017 gate. Review chain: NF052CorrectionDraft
  (draft + grounding table) → NF052CorrectionReview
  **APPROVE_WITH_FINDINGS** (1 MAJOR P-side row-vs-scope semantics, 1
  MEDIUM unbounded Prisma snippet, 3 LOW) → all 5 findings applied →
  scoped re-review **all 5 ADDRESSED, ACCEPT** (reviewer retraction: the
  alleged amendment hash typo was reviewer transcription error; amendment
  correct). Post-accept tokens applied: `:2884+` cite, `s.id::text` note.
  Task remains NOT READY — author decisions (ordering, cap, compiler
  adoption, NF-WF-053) untouched.
- **Scope C — batch-6 planning delta reviewed + migration preflight.**
  PlanDeltaReview (read-only): **APPROVE_WITH_FINDINGS** — every batch-6
  dated correction traces to a named repo record (050B receipt, 050C steps
  1–9 PASS + live acceptance, sign-off, provenance lines); corrections
  appended not rewritten; AUDIT-014 human items still
  DEFERRED_BY_AUTHOR_DECISION; 2 minor findings FIXED by coordinator:
  (1) START-HERE:18 self-contradictory GAP-039 wording replaced with dated
  precision correction; (2) consolidated diff supplemented →
  `.git/batch6-docs-consolidated-r2.diff` (`6b996193…0e484`) now includes
  the batch-4 receipt delta. MigrationPreflight (read-only, docker exec
  psql, zero mutation): acceptance DB `novelforge_acceptance_050b`
  (nf-pg-5433, PG 16.15, pgvector+btree_gist): **45/45 migrations applied,
  0 pending, 0 orphaned, 0 failed rows, 0 advisory locks**; data present
  (novels 25, revisions 258, memory_projections 0), 17 MB. **GO** for a
  future additive migration run only (not now, no run performed).
  Evidence identity: HEAD `50609c0` + working-tree hashes throughout.

### Corrected dependency-ready list (after batch 7)

1. **Author decisions for NF-WF-052** (unblocks READY): arc ordering
   policy, MEMORY_ARC_SCOPES_MAX value, compiler adoption timing,
   NF-WF-053 scope. Contract chain is review-complete and frozen:
   original → amendment → correction (`1febd2d2…62b2`).
2. **NF-WF-052 implementation** after READY (contract query shapes §1,
   fixtures §B).
3. **Residual text-contrast completion** + AUDIT-014 open rows.
4. **Additive migration (if any new schema)**: preflight GO recorded;
   apply only with a named migration and disposable-target evidence.
5. **Fresh release battery** at HEAD `50609c0` + working-tree hashes
   (needs named scope per batch-5 assessment rules).
Author-decision items stay separate: ADR-0017, deferred human
screen-reader scheduling, credentials/deployment authorization.

## Batch 6 — coordinator record 2026-10-14 (label patch applied / NF-WF-052 amendment / records corrected)

One coordinator + 2 children (both read-only drafters; Scope A executed by the
coordinator — a main-tree apply of an already-reviewed diff). Author WIP,
stash, frozen artifacts preserved; nothing staged/committed/merged; acceptance
worker untouched.

- **Scope A — label patch APPLIED to the main working tree** (authorized by
  this dispatch): `.git/batch5-labels-repair.diff` (sha256 `1c0c0e6b…fda9d`
  re-verified) — `git apply --check` clean, applied; all 12
  `.nf-section-label` sites across 8 files now carry `!text-nf-text-dim`
  (grep-verified per file). Focused check: discovery suite 9/9 on the
  integrated tree. Compiled colors verified in the running dev server
  (Chrome CDP, :3001, **id**): renders rgb(168,162,158) = #a8a29e = 7.29:1
  on bg-1 (OBSERVED post-patch). **Coverage limits recorded**: the en pass
  could not complete — the :3001 Nuxt dev server began returning 500
  (`nitro-dev.mjs` ENOENT from the long-running process's stale module
  graph; the file exists on disk; unrelated to the class-only patch — the
  suite proves app code fine). en coverage remains by construction
  (locale-independent classes; AUDIT-014 row 11 en/id axe retained).
  Non-rendered label sites (library/notifications/authors/ReaderChapterNav/
  moderation) verified by class identity only. Environment note: the
  long-running :3001 dev server needs an owner restart to clear the stale
  nitropack module state (not restarted by this batch).
- **Scope B — NF-WF-052 dated amendment FILED**:
  `tasks/NF-WF-052-amendment-2026-10-14.md` (sha256 `7075d793…7f04`).
  Original frozen contract preserved byte-identical (`ccffa3bb…793a3`,
  re-verified). Resolves the three assessor conflicts: (1) bounded
  selection + single aggregate overflow object (`overCapCount` exact /
  `overCapArcIds` ≤50 prefix / `firstExcludedOrderingKey`) — OVER_CAP
  removed from the per-scope excluded enum (output bounded O(cap));
  (2) discovery = projection arcs ∪ OutlineNode-derived sagas — MISSING
  sagas now surface; (3) STALE/FAILED scopes INCLUDED and flagged via
  per-entry freshness (lastError stays in getMemoryStatus). Concrete
  negative-test fixtures (9 named, exact seeds/assertions), explicit
  bounds, as-of semantics (cross-branch 400; no-head 200 with
  `asOf.revisionId === ""`), provenance fields, corrected required-reading
  (19 paths verified). Reviewer-NF052Amendment: **APPROVE_WITH_FINDINGS**
  → 2 must-fix (F1 under-scoped supersedes list; F2 malformed fixture
  text) + 6 minor — **all 8 applied before filing**. Task remains
  NOT READY; 4 author decisions open (arc ordering policy, compiler
  adoption timing, MEMORY_ARC_SCOPES_MAX value, NF-WF-053 shape). Policy
  recommendations with quantified >20-arc effects included (arcs 21+
  appear only as overflow metadata until the author changes cap/policy).
- **Scope C — priorities/planning corrected** (drafts by read-only
  investigator; applied by coordinator): START-HERE header dated
  correction (050B/050C historical; commit not an authorized prerequisite;
  local evidence standard = HEAD `50609c0` + working-tree artifact
  hashes); DELIVERY-PLAN header dated correction (live-gateway gate CLOSED
  by 050C amendment 1 — no distinct unmet gateway/release criterion remains
  under NF-WF-050C; corrected task list); CURRENT 050B next-work list
  dated correction (items 1–3 CLOSED; item 4 author-deferred; 5–6
  re-anchored); batch-4 receipt provenance correction (HEAD + hashes, no
  commit implied). Corrected dependency-ready list: (1) planning-ledger
  reconciliation docs-only; (2) NF-WF-052 author decisions; (3) NF-WF-052
  implementation after READY; (4) residual text-contrast completion; (5)
  working-DB migration preflight; (6) fresh release battery at HEAD
  `50609c0`. Removed: worker reload (done — PID 41284 startup receipt),
  commit prerequisite (unauthorized+unnecessary), live-gateway repeat
  (witnessed 2026-10-12). Author-decision items separated: ADR-0017,
  contrast triage ownership, deferred screen-reader scheduling,
  credentials/deployment.

## Batch 5 assessment corrections — 2026-10-14

Label patch hash and applicability match the receipt; independently retained
43/43 tests and APPROVE, no main application in this assessment. The NF-WF-052
contract and consolidated documentation hashes also match. Worker PID 41284
remains active; its restart/load receipt already exists. Commit is not an
authorized or necessary prerequisite for local work, documentation correction
or read-only preflight; use HEAD plus exact working-tree artifact hashes.

NF-WF-052 is still PLANNED, not dispatch-ready: its own three ordering/cap/
compiler decisions are unrecorded. Two behavioral conflicts require a reviewed
contract amendment: enumerating every OVER_CAP scope contradicts bounded
selection, and discovering only scopes with projection rows prevents the
required MISSING-saga result. Define bounded query/response semantics and
candidate selection before implementation. STALE/FAILED entries are included
with flags per the actual contract; do not describe them as silently excluded.

Do not request live extraction/author observations already established in the
NF-WF-050C steps 1–9 PASS and accepted functional sign-off. Any separate missing
gateway/release criterion needs its exact contract and evidence gap first.
ADR-0017 and human screen-reader scope remain deferred. See the matching
ISSUES-AND-GAPS assessment; the frozen artifacts are preserved.

RESOLVED (batch 6, 2026-10-14): the two NF-WF-052 conflicts above are fixed by
the reviewed dated amendment `tasks/NF-WF-052-amendment-2026-10-14.md`
(sha256 `7075d793…7f04`; original preserved `ccffa3bb…793a3`); the label patch
is APPLIED to the main working tree (12 sites verified). NF-WF-052 remains
NOT READY on the three unrecorded author decisions only.

## Batch 5 — coordinator record 2026-10-14 (label contrast / NF-WF-052 contract / delivery priorities)

One coordinator + 3 children (repair worktree `scopeA5-labels`; two
read-only investigators). Author WIP, stash, frozen artifacts preserved;
nothing staged/committed/merged; acceptance worker untouched.

- **Scope A — label contrast repair** (worktree `scopeA5-labels`, frozen
  diff `.git/batch5-labels-repair.diff` sha256 `1c0c0e6b…fda9d`): exhaustive
  inventory found **12 `.nf-section-label` call sites across 8 files**
  (faint #79716b = 3.84–4.13:1, FAIL) — all repaired with the accepted
  house pattern `!text-nf-text-dim` (#a8a29e = 7.29:1 bg-1 / 7.83:1 bg-0
  / 6.65:1 bg-2 — ≥6.65 everywhere). `.nf-overline` needs nothing (now
  accent-hi 8.1+); decorative ::after lines and typography untouched;
  no main.css/i18n changes; meta faint spans recorded-and-skipped
  (design). OBSERVED: co-located suites 43/43. Reviewer-LabelRepair:
  **APPROVE** (hash, exhaustiveness — 13 grep matches reconciled to 12
  call sites + the class definition, hygiene, **main-tree applicability
  verified — `git apply --check` clean against the integrated dirty
  tree, no re-basing needed**, contrast arithmetic recomputed, tests
  reproduced). NOT applied to main — delivered as an on-top patch for
  the author's next integration step (or apply-on-authorize).
- **Scope B — NF-WF-052 contract** (contract-only, no implementation):
  `tasks/NF-WF-052-global-memory-union-read.md` (sha256
  `ccffa3bb…793a3`) — smallest F3 slice = **L5 global-novel union read**,
  retrieval-layer composition over existing `arc:` scopes (LLM-free, no
  storage — storing would reverse Invariant 9's frozen decision), served
  read-only `GET /memory/global`; per-entry provenance (scope,
  sourceRevisionId, builtAt); freshness-aware (stale arc scopes excluded
  with reasons MISSING/OVER_CAP/UNRESOLVABLE_SOURCE); bounded
  (MEMORY_ARC_SCOPES_MAX, deterministic ordering; Saga has no order
  column — author picks the ordering policy); failure = explicit
  degradation semantics (no silent canon mutation); summaries + L6
  enrichment = explicit non-goal **NF-WF-053** (Invariant-6-gated).
  Investigator feasibility verdict: all primitives reusable
  (recallNovel has no L5 — memory.ts:153-233; readBlock scope-generic
  :111; deriveFreshness :108/:36). Reviewer-F3Contract:
  **APPROVE_WITH_FINDINGS** (F-1 anchor, F-2 FAILED-entry semantics,
  F-3 UNRESOLVABLE_SOURCE operationalization — **all three applied by
  the coordinator before writing the file**; 3 minor informational).
  Unresolved decisions recorded in-contract for the author: arc ordering
  policy, compiler adoption timing, MEMORY_ARC_SCOPES_MAX value.
  ADR-0017 untouched (memory is not among its seven projections).
- **Scope C — delivery priorities** (read-only reconciliation;
  coordinator spot-checked key claims: NF-WF-005 migration exists,
  NF-WF-051 integrated in main memory-jobs.ts, D2 token in
  DESIGN-TOKENS.md + main.css, webfix stubs in UsageAnalytics.test.ts —
  all confirmed). Ordered next-task list (unblocks-most first):
  1. Commit the integrated batch-4 main-tree state (one recorded
     revision; receipts then cite its hash). S.
  2. Verify acceptance worker loaded the integrated code (restart
     receipt at the new hash). S. [Dep: 1]
  3. Working-DB additive migration preflight
     (novelforge_acceptance_050b). S. [Dep: 1]
  4. Live structured-capable gateway extraction receipt (GAP-039
     residual). S-M. [external creds]
  5. Fresh release battery at the new hash (NF-WF-023 shape incl. Box 7
     axe). M. [Dep: 1+3]
  6. Planning-docs reconciliation (DELIVERY-PLAN header + CAP rows,
     START-HERE header, stale CURRENT next-steps list, batch-4 receipt
     provenance). M, docs-only. [Dep: 1]
  7. NF-WF-052 implementation (contract now frozen+reviewed; dispatch
     ready). M contract → L implementation.
  8. Residual text-contrast audit completion (non-D2 faint sites;
     advanced by this batch's 12 repaired label sites — remaining:
     out-of-scope faint usages flagged by earlier reviewers). S-M.
  Author-decision items (separated, not dispatchable): ADR-0017 A-vs-B
  selection; contrast triage ownership beyond the audited sites;
  deferred screen-reader scheduling (do not redispatch); live
  gateway/production credentials + deployment authorization (standing
  rule: unapproved).
  Stale-ledger rows flagged for task 6: DELIVERY-PLAN header/queue rows,
  START-HERE header, batch-4 receipt provenance wording.

## Acceptance worker restarted — 2026-10-14

The author explicitly requested the local worker restart after source
integration. Old worker PID 30864 (launcher 19048) was identified against the
existing acceptance environment. Targeted console CTRL_C did not produce a
shutdown/exit receipt; after all five queues showed active=0 and waiting=0,
the exact old PID was terminated and one replacement launched hidden.
New worker PID 41284, launcher 41024, start 2026-10-14 04:54:14 host time.

Existing database novelforge_acceptance_050b at localhost:5433 and Redis at
localhost:6399 reused through the original acceptance environment script.
Startup observed: heartbeat proves Redis, all five worker-start flags true,
memory startup reconciliation completes and memory sweeper starts at 60000ms.
This establishes loaded startup/timer wiring, not a new real-outage or
full-period recovery acceptance test. No new fixture, migration, Docker reset,
commit, push, Git merge or deployment. Docker services and existing stash
remain. Local logs: .git/worker-restart.stdout.log and stderr.log; original
worker log retained. Windows signal diagnostic is in ISSUES-AND-GAPS.

Next dispatch: remaining label contrast, a bounded NF-WF-009 F3 memory
follow-up contract, and delivery-ledger prioritization. ADR-0017 remains
deferred; human screen-reader scope remains deferred. Do not redispatch
integration, restart or accepted functional/zoom/reduced-motion observations.

## Author-approved integration applied — 2026-10-14

The author approved the explained candidate integration, scoped D2 token and
mock/timer repairs. ADR-0017 remains deferred (neither option selected).
The main working tree now contains GAP-029 parity, NF-WF-051 with companions
and paired batch-2/A3 accessibility fixes; existing WIP was preserved.
No staging, commit, push, Git merge, deployment or worker restart occurred.

D2 uses the additive #6f6a63 token only for the four identified discovery
control types, retaining active accent/focus and removing weak hover borders.
Locale mocks distinguish keys and reset per test. Timer tests now await real
passes under controlled ticks; production shutdown semantics are unchanged.
Observed main web checks: 9 discovery + 41 axe/locale/repaired tests PASS.
Isolated timer repair: 16 sweeper/reconciliation tests, typecheck and touched
lint PASS; main test matches the repair except clarified header wording.
Final independent review: APPROVE; two initial P3 wording notes addressed
and rechecked in the header and dated NF-WF-051 contract annotation.

Rendered en/id normal/hover checks PASS for search, sort, load-more and active
all-genres. Corrected contrast ratios are 3.69/3.43/3.13 against bg-0/1/2.
Inactive chips had no live fixture; component tests cover both selected states
and inactive classes. Previous zoom/reduced-motion and functional acceptance
are retained. Human screen-reader testing stays deferred; unrelated residual
text contrast and ADR-0017 remain open. Source integration does not establish
that the running worker has loaded this code. Full bounded receipt:
docs/14-progress/batch4-approved-integration-2026-10-14.md.

## Batch 4 assessment — 2026-10-14

Retain the reviewed integration candidate and actual 200% browser-zoom
receipt; no repeat of those observations is requested. Inspected raw web
receipts show 5 + 5 + 3 failed tests with useCookie undefined and matching
post-repair passes. The older recovery count's cause is unknown without its
original receipt; run-order attribution is an inference, not established fact.
The reviewed web-test repair remains outside the integration candidate.

Accessibility is not wholly closed: D2 control-boundary contrast and residual
text contrast sites remain open/proposed; human screen-reader testing remains
deferred. The real-timer race is disclosed, not fixed by a green rerun.
Source inspection also shows the two shared-ref test stubs ignore useState's
key despite the receipt's keyed claim; see ISSUES-AND-GAPS. Main integration,
D2 design and ADR-0017 selection remain pending author decisions. No source
change or test rerun occurred in this assessment.

## Batch 4 — coordinator record 2026-10-14 (integration candidate / web-failure repair / zoom evidence)

One coordinator + 3 children (writer worktrees `candidate-integration`,
`scopeB4-webfix`; native desktop tooling for zoom). Author WIP, stash,
frozen artifacts preserved; nothing staged/committed/merged. This batch
resolves the open items named in "Batch 3 assessment boundary" above.

- **Scope A — integration CANDIDATE** (worktree `candidate-integration`,
  baseline HEAD 50609c0, NOT merged): WIP overlay (12 files: AUDIT-014,
  7 workspace components + ScaleReviewPanel.s3.test.ts +
  cancel-label-i18n.test.ts, CURRENT, ISSUES-AND-GAPS) + 4 frozen patches
  (GAP-029 `1e59fcc5…`, NF-WF-051 `8a5d448a…` + untracked companions,
  batch-2 a11y `68942bc6…`, scopeA3 `1569a5f8…`). Overlapping reader-page/
  GenreChips hunks hand-resolved preserving BOTH repairs; GenreChips
  final = scopeA3 ternary byte-identical to source; reverse-check
  `git apply -R --check` passes for all four diffs. OBSERVED in candidate:
  parity 11/11, memory-sweeper 8/8 (one disclosed real-timer race, green
  on rerun), publication 21/21, discovery 8/8 (incl. scopeA3 regression),
  workspace 197/197, ACC-1 27/27 (23+4). Reviewer-IntegrationCandidate:
  **APPROVE** (frozen hashes, overlay fidelity vs main working copy,
  patch completeness via reverse-check, companion hashes, spot-reruns,
  main-checkout integrity all verified; 1 informational
  overlay-accounting note). Exclusions recorded: output.txt,
  apps/api/scripts/, scripts/gap051-loadmore-seed.ts, untracked docs.
  Main checkout untouched (11 dirty files, HEAD 50609c0, nothing staged).
  → The "isolated final candidate pairing scopeA3 + batch-2 + reviewed
  WIP" gap from the batch-3 boundary assessment is now CLOSED.
- **Scope B — web-failure repair** (worktree `scopeB4-webfix`): the 13
  failures ATTRIBUTED — deterministic clean-HEAD reproduction (raw vitest
  evidence saved: `evidence/*.raw.txt` in the worktree), single root
  cause `useCookie is not defined` at useLocale.ts:64 (Nuxt auto-imports
  absent under plain vitest; count reconciliation: 5+5+3 failed tests,
  0 file-level; rehearsal's "7 incl 1 file-level" not reproducible —
  full-sweep run-order artifact; no prior raw receipts existed to
  compare). Repair: test-only (+28 lines across the 3 files, vi.stubGlobal
  useCookie/useState/onNuxtReady per the useLocale.test.ts convention;
  keyed shared ref where setLocale is exercised). OBSERVED post-repair:
  13/13 × 2 runs (deterministic), neighbors 44/44 + 8/8. Zero production
  changes, zero assertion changes. Reviewer-WebFailureFix:
  **APPROVE_WITH_FINDINGS** (3 informational only). → The manifest
  reconciliation requirement from the batch-3 boundary assessment is now
  CLOSED with matching-environment baseline evidence.
- **Scope C — actual browser zoom evidence (native desktop tooling,
  cua-driver + the user's real Chrome, locale id):**
  **Page zoom 200% ESTABLISHED** via chrome://settings/appearance
  "Page zoom" (real browser zoom; the CDP-driven instance cannot zoom
  and menu-popup clicks are refused by driver foreground verification —
  Settings dropdown + keyboard selection worked). OBSERVED at 200%:
  /browse top — single-column flow, no horizontal scrollbar; /browse
  bottom — card grid intact, "Muat lagi" fully visible, no
  two-dimensional scroll; reader chapter page — single column, controls
  intact; keyboard focus ring clearly visible (Tab moves through
  continue-reading cards). Zoom level verified visually in the settings
  UI ("200%"). **Restored to 100%** afterward (verified in settings UI).
  Previous reduced-motion and en/id observations RETAINED unchanged.

## Batch 3 assessment boundary — 2026-10-14

Manifest and ADR hashes match the external receipt. Retain its reduced-motion
and browse en/id observations; actual browser zoom is still unestablished.
The rehearsal covers the three batch-2 patches on clean HEAD 50609c0, not
scopeA3 plus the current main-checkout WIP. Its clean application therefore
does not yet establish the complete proposed integration. Pair scopeA3 with
batch-2 a11y in an isolated final candidate and preserve reviewed WIP.

The manifest's web-failure summary needs reconciliation: the listed counts
5 + 7 + 3 do not explain the reported 13, and untouched test paths alone do
not establish baseline causality. Reuse an existing exact baseline receipt
if available; otherwise compare only the affected failing suites under the
same environment. Until then, baseline attribution remains a retained claim,
not independently verified here. See ISSUES-AND-GAPS for ownership/closure.
ADR-0017 and D2 token changes remain proposals. No source change, test rerun,
integration, commit or new author acceptance occurred in this assessment.

## Batch 3 — coordinator record 2026-10-14 (a11y follow-up / integration package / ADR-0017 correction)

One coordinator + 3 children (writer worktrees `scopeA3-overline`,
`rehearsal-integration`; read-only investigator). Author WIP, stashes,
frozen artifacts preserved; nothing staged/committed/merged.

- **Scope A — a11y follow-up (worktree `scopeA3-overline`, 4 files):**
  overline fix via class-level `!text-nf-text-dim` override at the two
  contracted read-page call sites (7.83:1 on bg-0 — main.css untouched);
  NEW regression test pinning the D5 class-level intent both directions
  (RED→GREEN proven: fails against the pre-repair object-syntax form);
  GenreChips D5 ternary restored in this worktree (byte-identical to the
  reviewed batch-2 form) so the pinned intent is true. OBSERVED:
  discovery+a11y suites 70/70. Reviewer-OverlineDiff:
  **APPROVE_WITH_FINDINGS** (3 Minor informational: 9 other .nf-overline
  sites + .nf-section-label residual are main.css-owned, next batch;
  scopeA3 must integrate PAIRED with the batch-2 patch or D1 stays open
  on reader pages). **D2 design proposal (PROPOSED, author decision):**
  new token `--color-nf-border-focus: #6f6a63` — computed 4.02:1 (bg-0),
  3.72:1 (bg-1), 3.38:1 (bg-2 hover); optional
  `--color-nf-border-focus-strong: #8a857c` (5.55/5.18/4.74) for hover
  emphasis; call sites: SearchBox input, GenreChips inactive branch,
  sort select, load-more; focus ring already compliant (accent-hi
  8.12+); disabled exempt. Not applied.
- **Rendered evidence (coordinator, Chrome CDP on :3001, working tree):**
  - **en/id**: id locale activated via the `nf-locale` cookie (real UI
    text in Indonesian: "Semua genre", "Muat lagi", "3 bab · tanggal",
    placeholder "Judul, penulis, atau f…") — computed colors identical
    to en (tokens are locale-independent): text-faint 3.84–4.13:1,
    boundaries 1.40:1, dim 7.29:1 on the same elements. Locale coverage
    OBSERVED for the browse page.
  - **Reduced-motion OBSERVED (real browser, host OS setting)**:
    `prefers-reduced-motion: reduce` is ACTIVE on this host and the
    real browser reads it; the global guard rule
    (`animation-duration: 0.01ms !important` etc.) applies — computed
    animation/transition durations on live controls read 1e-05s; zero
    running CSS animations; no transform/size transitions on any
    element (color-only). Note: the host's own setting, not an
    emulated toggle.
  - **Actual browser zoom NOT ESTABLISHED (tooling blocker recorded)**:
    CDP here cannot set browser zoom (Ctrl+= / Ctrl+− produce no
    outer/inner-width or dpr change; dpr fixed at 1; CSS-px probe
    invariant). The criterion requires real zoom (1280→640 CSS);
    substitution by narrow viewport remains forbidden. Blocker: harness
    lacks zoom control; needs an author-side zoom pass or a harness
    with real zoom-level support.
- **Scope B — integration package (worktree `rehearsal-integration`):**
  frozen inputs `.git/batch2-gap029-parity-test.diff` (`1e59fcc5…f603d`),
  `.git/batch2-nfwf051-sweeper.diff` (`8a5d448a…2bca4`),
  `.git/batch2-a11y-repair-scopeA.diff` (`68942bc6…98fc2`). Rehearsal
  (fresh worktree @ 50609c0): apply order GAP-029 → NF-WF-051 → a11y,
  all clean, **zero conflicts**; combined 9 tracked files +51/−16 + 2
  untracked tests; file sets fully disjoint (api/worker/web).
  OBSERVED combined behavior: api parity 11/11, worker memory 20/20
  (one transient DB-timing flake, green on rerun — disclosed),
  publication regression 21/21, web discovery+a11y 170 green; 13
  pre-existing web failures (UsageAnalytics/recovery/workspace-navigation)
  are baseline-present and untouched by the patches. Manifest:
  `.nf-batch-worktrees/rehearsal-integration/INTEGRATION-MANIFEST-scopeB.md`.
  Integration cutover notes: NF-WF-051 untracked companions
  (memory-sweeper.test.ts, task doc) must be copied explicitly; worker
  tests need DATABASE_URL on 5433; scopeA3-overline must integrate
  PAIRED with the batch-2 a11y patch (hunk-level sequencing on the read
  pages). Reviewer-IntegrationManifest verdict recorded in
  ISSUES-AND-GAPS (batch-3 section). NO merge performed — integration
  remains author-gated.
- **Scope C — ADR-0017 corrected (PROPOSED, reviewed):**
  `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md` rewritten with
  the per-projection evidence map: **seven of seven** named projections
  lack intent-consuming pipelines (the earlier "six of seven" was
  wrong); memory excluded from the seven (Q2) and demoted from
  platform-wide proof to memory-only evidence; NF-WF-051 referenced at
  its actual isolated status; both options PROPOSED, recommendation
  non-selected, intent-lifecycle closure reserved for the author.
  Reviewer-ADR0017: **APPROVE_WITH_FINDINGS** (2 Minor path-qualification
  nits — applied by the coordinator in the same batch). OBSERVED
  spot-checks by the reviewer: writers, zero production readers,
  OPERATIONAL classification, memory scope vocabulary, PROJECTIONS list.

## Batch 2 assessment correction — 2026-10-14

The batch receipt below retains its implementation/review evidence, but its
pending-author list is stale: NF-WF-050C journey steps 1–9, including live
locale checks, are retained PASS; GAP-039 functional author sign-off was
explicitly accepted on 2026-10-13. Do not request those observations again.
Human NVDA/VoiceOver acceptance is DEFERRED_BY_AUTHOR_DECISION, not PASS;
actual browser zoom and reduced-motion evidence remain pending.

The a11y repair, NF-WF-051 and GAP-029 parity packages remain isolated,
not integrated into main. ADR-0017 is PROPOSED: clarify its seven named
intent projections versus memory (which is not one of them) before an
architecture decision. Memory recovery evidence does not establish recovery
for every intent projection. Replace the obsolete NF-WF-0XX follow-up with
the actual NF-WF-051 isolated implementation status in the next ADR revision.
See the matching assessment in ISSUES-AND-GAPS. No new test execution,
integration or commit occurred in this assessment; this annotation is a new
delta outside the frozen batch-2 documentation review.

## Two-scope batch 2 — coordinator record 2026-10-14 (rendered a11y / NF-WF-051 / intent ADR + ACC-1)

One coordinator + 3 children (writer worktrees `.nf-batch-worktrees/scopeA-a11y`
and `.nf-batch-worktrees/scopeB-memsweeper`; read-only investigators shared the
dirty checkout). Author WIP preserved untouched; nothing staged or committed.

- **Scope A — rendered evidence + bounded repair.** Coordinator ran real
  Chrome CDP sessions against the live app (:3001, working tree, en):
  measured computed fg/bg colors and states. Confirmed rendered: D1
  (text-faint rgb(121,113,107) 3.84–4.13:1), D2 (control boundaries
  1.40–2.05:1), D3 (`<mark>` MEASURED black-on-yellow rgb(0,0,0)/rgb(255,255,0)
  ≈19.6:1 — pass, off-design; no longer assumed), D4 (whole-card-grid
  `aria-live=polite` present in DOM). NEW reproduced defect **D5**: the active
  genre chip (`aria-current="true"`) declared `border-nf-accent-hi` +
  `text-nf-text` but computed border/color came from the always-present
  `border-nf-border`/`text-nf-text-dim` utilities (CSS order wins) → the
  active state was visually indistinguishable. Functional checks OBSERVED:
  Escape clears search, sort works, viewport 360/768/1440 layout clean
  (1-col/2-col, no horizontal scroll, 700px reader measure at 1440),
  reader progress write works (chapter 2 recorded, fresh timestamp).
  NOT ESTABLISHED (harness lacks control): actual browser zoom
  (Ctrl+= produced no dpr/zoom change) and `prefers-reduced-motion` —
  recorded as missing, not PASS.
  Bounded repair (worktree scopeA-a11y): D5 ternary conditional classes in
  GenreChips.vue (hover:border confined to inactive branch) + 12 D1 swaps
  text-nf-text-faint → text-nf-text-dim (existing house token, 7.29–7.83:1)
  across the 7 AUDIT-014-scope files; +16/−16; discovery/a11y/composables
  suites 123/123 OBSERVED. Reviewer-A11yDiff: **APPROVE_WITH_FINDINGS**
  (2 Minor informational: pre-existing `.nf-overline` faint-token site
  needs main.css edit — next batch; no test pins chip classes — future
  hardening). D2 remains a PROPOSAL (no compliant boundary token exists);
  D3/D4 recorded, unmodified. NOT integrated into main (author-gated).
- **Scope B — NF-WF-051 implemented.** Contract
  `tasks/NF-WF-051-memory-reconciliation-sweeper.md` (copied verbatim from
  the reviewed worktree artifact; original kept immutable in
  `.nf-batch-worktrees/scopeB-memsweeper/`). Contract review
  Reviewer-NF051Contract: NEEDS_FIXES (2 Important: timing-dependent
  overlap assertion → deterministic shape (b); vacuous MISSING test →
  head-less-novel fixture; 1 Minor: distinct-key wording) → fixed →
  **APPROVE**. Implementation in `.nf-batch-worktrees/scopeB-memsweeper`
  (constants.ts +7, memory-jobs.ts +28, memory-sweeper.test.ts NEW 8 tests):
  startup reconciliation untouched, `reconcileMemoryRebuilds` reused
  verbatim, 60s interval, DI seam, unref/clearInterval-first stop(),
  queue-undefined guard. OBSERVED: focused memory suites 20/20, publication
  regression 21/21, both typechecks clean, touched-file eslint clean (8
  repo-wide lint errors are pre-existing at 50609c0, outside the slice).
  Reviewer-NF051Diff: **APPROVE_WITH_FINDINGS** (2 Minor non-blocking:
  real-timer margins for CI; looser logger.error match). NOT integrated
  into main; does NOT close intent lifecycle or L5/L6 gaps.
- **Scope C — ADR-0017 (PROPOSED) + ACC-1 verdict.**
  `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md` written
  proposal-only: recommends option B (intents stay write-side durable
  invalidation audit; C6/C7 + schema-comment amendment) over option A
  (per-projection consumers); explicitly author-decided, no intent code
  changed. ACC-1 amendment review (Bat2-IntentADR, read-only, no test
  reruns): **APPROVE_WITH_FINDINGS** — scope fidelity VERIFIED against the
  frozen r5 artifact (`2f250878…`), receipts exist and match, no silent
  broadening, amendment procedure SATISFIED (separate reviews r1–r5);
  3 P3 non-blocking (transcript retrievability, missing round-3
  disposition line in the amendment doc, disclosed unapplied T6a note);
  owed: author-gated commit, author acceptance steps 5–7 + locale +
  GAP-051 deferral, steps 3–4 OPEN on model quality.
- **Records/boundaries:** GAP-029 remains RESOLVED-BY-TEST as reviewed
  delivery in its isolated worktree (`.nf-batch-worktrees/scopeB`) until
  main integration is authorized — original reviewed artifacts untouched.
  This batch record + the corrected-deferral annotation are the
  coordinator's doc delta, reviewed separately (see review receipt below).
  Human NVDA/VoiceOver stays DEFERRED_BY_AUTHOR_DECISION; visual/
  viewport/contrast/reduced-motion/zoom checks are ACTIVE (Scope A
  executed under that reading). No staging, commit, push, merge,
  deployment, cleanup, or fixture mutation performed.

## Three-scope batch assessment corrections — 2026-10-13

- Scope B's reviewed parity test is in `.nf-batch-worktrees/scopeB`, not yet
  integrated into main. Preserve its review/tests as scoped delivery evidence.
- Only human screen-reader testing was deferred by the author. Restore active
  pending status for rendered contrast, viewport, reduced-motion and zoom
  checks incorrectly deferred in the batch entry below. No NVDA request needed.
- D1/D2 token measurements are retained; rendered applicability needs actual
  colors/states and distinction between functional boundaries and decoration.
  D3 UA-default mark contrast is not measured browser proof; D4 whole-grid
  aria-live is a source-derived risk, not an observed human speech result.
- The memory interval-sweep proposal needs a real task ID, bounded contract
  and separate approval before implementation. It does not resolve intent
  lifecycle or L5/L6 summaries. Continue the ADR as proposal-only.
- Next batch: rendered accessibility verification/bounded repair planning;
  interval-sweep contract then approved implementation; intent ADR plus
  independent ACC-1 amendment review. Preserve previous source-review receipts.
  These assessment annotations postdate the approved batch-docs snapshot and
  require scoped review. No main source/data change, commit or push performed.

## Three-scope external batch — coordinator record 2026-10-13 (A11y evidence / GAP-029 / memory-intent)

One coordinator + three children; writers used a dedicated worktree
(`.nf-batch-worktrees/scopeB`); read-only investigators shared the dirty
checkout. Author WIP (ACC-1/F4 docs + components) preserved untouched;
nothing staged or committed by the batch.

- **Scope A — AUDIT-014 technical evidence (read-only):** token-level
  WCAG math (coordinator-verified independently) found real AA failures:
  `text-faint #79716b` never reaches 4.5:1 (max 4.13:1 on bg-0, 3.84:1 on
  bg-1, 3.50:1 on bg-2), and boundary tokens `nf-border #33302d` /
  `nf-border-strong #48443f` never reach 3:1 (1.51:1 / 2.05:1 on bg-0).
  Active-chip `accent-hi` border passes (8.1–8.7:1). `<mark>` has no CSS
  anywhere → UA-default ≈17–19.6:1 (PASS; off-design only). Whole
  browse card grid is one `aria-live="polite"` region (verbosity defect,
  not AA). Static viewport/reduced-motion analysis recorded; NOT browser-
  zoom or rendered-pixel proof. New product defects D1–D4 recorded in
  AUDIT-014; no repair applied in this batch. Automated half re-run
  OBSERVED 2026-10-13: 30/30 across useReadingProgress,
  useSyncedReadingProgress, discovery, discovery.axe (en+id).
  Human legs (#6 announcement leg, #7 rendered, #8 rendered, #9 rendered,
  #10 zoom, #13, #14) are **DEFERRED_BY_AUTHOR_DECISION** per the
  deferral amendment below — recorded as deferred, never PASS.
- **Scope B — GAP-029 (own worktree, disjoint paths):** API and executor
  resolvers verified EQUIVALENT against the actual contracts
  (workspace-shadows-platform, published-only, tenant isolation,
  absence handling); no behavioral defect found. Remedy option 2
  delivered: `apps/api/src/definition-resolution-parity.test.ts`
  (11 cases — 8, then +3 skill-side cases after review round 1;
  disposable DB `novelforge_test_resolver_parity`, no source changes,
  no new deps). Observed: parity 11/11 (implementer run + coordinator
  re-run), executor 22/22, worker
  workflow-jobs 10/10, definitions 49/49 (nf-pg-5433). Diff
  `.nf-batch-worktrees/scopeB-gap029-parity-test.diff`; separate review
  Reviewer-Gap029Diff: round 1 APPROVE_WITH_FINDINGS (1 Minor, skill
  mirror) → fixed → round 2 **APPROVE, zero findings**; verdict recorded
  in ISSUES-AND-GAPS GAP-029 entry. Not committed.
- **Scope C — memory/rebuild-intent (read-only):** NF-WF-009 F3 remains a
  correctly-recorded gated deferral (PROMISED, not drift).
  DerivedRebuildIntent is STILL a behavioral no-op after NF-WF-032/036/
  037/030 + advanceHeadLow: three writers (api revisions.ts, ai-services
  extraction, worker publication-jobs.ts), zero consumers; only PENDING
  ever assigned; RUNNING/FRESH/STALE unreachable. Follow-up contract
  **NF-WF-0XX memory reconciliation interval sweeper** is dependency-ready
  (mirror of the publication sweeper; no intent consumer, no schema
  change, no LLM, no outbox). ADR required for the intent end-state
  (per-projection consumers vs demotion to write-side invalidation
  audit). Evidence map + contract recorded in the ISSUES-AND-GAPS
  intent-lifecycle entry.
- **Baseline/preserved:** HEAD main 50609c0, ahead 3; r4 artifact hash
  re-verified `b0418d76…af72a`; NVDA-deferral docs amendment reviewed
  separately from Group C r4 (pre-batch snapshot
  `.git/nvda-deferral-docs-prebatch.diff` sha256 `1fa276b5…cf5b4`).
  Docker + acceptance services untouched; no uninstall, commit, push,
  merge or deployment performed by the batch.

## Author decision — defer NVDA human testing — 2026-10-13

- The author explicitly requests archiving NVDA testing for future work,
  like the earlier VoiceOver deferral, citing unavailable Indonesian speech
  on their Windows setup and no available Mac. These are author-reported
  constraints, not a finding about all Windows speech support.
- **GAP-051 human screen-reader verification: DEFERRED_BY_AUTHOR_DECISION.**
  Both NVDA + Firefox and VoiceOver + Safari are now future draft/backlog
  scope, not active acceptance prerequisites. Historical passes remain valid
  only for their recorded scope; unperformed tests are deferred, never PASS.
- This supersedes instructions to obtain further NVDA observations, including
  the human portions of announcement items #13/#14. No screen-reader software
  is uninstalled; application accessibility support and en/id localization
  remain. Keyboard, semantic labels, focus, contrast, responsive layout,
  reduced motion, zoom and automated accessibility work continue as applicable.
- Update the external three-scope batch accordingly: Scope A continues its
  technical/visual/functional checks without waiting for screen-reader input;
  Scopes B/C continue unchanged. No new author sign-off question is needed.
  Full screen-reader verification or complete WCAG conformance is not claimed.
- This documentation delta postdates Group C r4 APPROVE and needs its own
  scoped review before inclusion in a future commit. No source/data change,
  uninstall, staging, commit, push, merge or deployment is authorized here.

## GAP-051 reconciliation review — 2026-10-13 (documentation changes requested)

- The evidence table and A/B/C file grouping are retained as useful proposals.
  Group C is not review-ready: aria-live result count and 404 silence are
  original screen-reader announcement checks, not merely visual checks.
  Their unresolved evidence prevents the new unconditional closure conclusion
  from being established. Retain all supported human passes and historical
  closure receipts; do not repeat completed observations or narrow scope.
- GAP-039's author functional sign-off leg remains CLOSED per explicit author
  decision (#244). Older DELIVERY-PLAN/START-HERE references are stale for
  that leg, not renewed blockers. Other acceptance/release dependencies need
  their own current evidence. Calibration-data authorization remains resolved.
- Correct the table's marked-text contrast threshold to the original 4.5:1,
  distinct from 3:1 UI boundaries. Next: repair these documentation conclusions,
  map existing evidence for the unresolved screen-reader criteria, and obtain
  separate review of the exact Group C diff before any commit decision.
- No staging, commit, push, source/data mutation or repeated test run performed
  by this assessment. The untracked screenshot paths named in the proposal
  are absent from the current `git status`; their current location is UNKNOWN.
  Do not claim their archival/deletion or manufacture replacements.

## GAP-051 evidence reconciliation + commit-scope proposal — 2026-10-13 (documentation-only; nothing staged)

- **Baseline re-verified (OBSERVED):** HEAD `50609c0`; stash
  `nf050b-acceptance-wip` intact; working tree = 11 modified files +
  untracked `apps/web/app/components/workspace/cancel-label-i18n.test.ts`,
  `scripts/gap051-loadmore-seed.ts` + `apps/api/scripts/` copy, `output.txt`,
  `tasks/NF-050C-ACC-1-repair-amendment.md` (+ `capture-1..4.png` author
  evidence). Frozen-artifact byte-match re-confirmed: ACC-1 r5 worktree diff
  vs `50609c0` (ScaleReviewPanel.vue + ScaleReviewPanel.s3.test.ts) sha256
  `2f250878…ec6b6` == reviewed r5 artifact; F4 combined diff (6 components +
  cancel-label-i18n.test.ts) sha256 `162ebf99…b3528` == frozen
  `.git/gap-051-f4-cancel-key-repair-r1.diff`. No successful check re-run
  (no new source changes since those receipts).
- **Evidence reconciliation (documentation-only):** AUDIT-014 now carries a
  16-row evidence table separating OBSERVED / RETAINED / UNSUPPORTED /
  PENDING. Key correction, without rewriting historical receipts: the
  "GAP-051 CLOSED" entry is accurate **for the human screen-reader gate
  scope only** (keyboard, names, dialogs, announcements — the guided
  instruction scope). The broader WCAG-AA manual items remain PENDING:
  contrast, viewports 360/768/1024/1440, reduced motion, 200% zoom,
  reader-chapter progress-write, plus weakly-inferred/unknown items
  (snippet `<mark>`, aria-live result count, ContinueReading 404 silence).
  Each is annotated in the table with the specific missing observation it
  needs; they are distinct from full-platform release acceptance.
  **[CORRECTED by the same-day reconciliation review: #13/#14 are original
  screen-reader-scope items, so their missing evidence DOES qualify the
  gate closure — see the "reconciliation review" entry above; this
  bullet's "do NOT retroactively weaken" wording is superseded.]**
- **Release-gate cross-check:** GAP-097 verified CLOSED 2026-10-07
  (`ab7d71d`) — not a current blocker. The 023C battery boxes 2–7 were never
  re-run after the Box-1 stop; the 023C SHIP_WITH_KNOWN_GAPS decision is a
  recorded historical recommendation, not a current release decision.
  **Correction to this entry's first wording:** GAP-039's author FUNCTIONAL
  sign-off leg is CLOSED (explicit author decision, CURRENT + Engram #244) —
  older DELIVERY-PLAN/START-HERE paragraphs that read as "author acceptance
  pending" are stale pointers to that settled leg, not a reopened question;
  no sign-off request is made. What remains open at the release-blocker tier:
  SCALE GAP-039's parent capability gap, the GAP-051 residuals below, and
  the live release gates.
- **Proposed commit file selection (PROPOSAL ONLY — nothing staged; the
  author decides the actual split):**
  - **Group A — reviewed ACC-1 repair + regressions** (r5 artifact, review
    APPROVE): `apps/web/app/components/workspace/ScaleReviewPanel.vue`,
    `apps/web/app/components/workspace/ScaleReviewPanel.s3.test.ts`.
  - **Group B — reviewed F4 repair + guard** (r1 artifact, review APPROVE):
    `apps/web/app/components/workspace/{DnaEditor,PolicyList,Antagonists,
    HealthMemoryPanel,ReferenceIngest,ReferenceLibrary}.vue`,
    `apps/web/app/components/workspace/cancel-label-i18n.test.ts`.
  - **Group C — acceptance/task documentation:** `docs/14-progress/CURRENT.md`,
    `docs/implementation/ISSUES-AND-GAPS.md`, `apps/web/a11y/AUDIT-014.md`,
    `tasks/NF-050C-ACC-1-repair-amendment.md`.
  - **NOT proposed (unreviewed/temporary):** `scripts/gap051-loadmore-seed.ts`
    + `apps/api/scripts/` copy (test scaffolding — author decision: commit as
    reviewed tooling or keep untracked until purge); `output.txt` (harness
    spill — deletion candidate, not commit content); `capture-1..4.png`
    (author evidence — in-repo only if wanted, else archive outside git).
    No unreviewed application material exists: every source change belongs
    to Group A or B with its own review receipt.
  - Suggested sequence: A, then B, then C (each independently reviewable;
    A and B already carry separate review receipts).
- **Specific missing observations (each asked once; not re-asked here):**
  AUDIT-014 evidence-table items #6 (reader progress write), #7 (contrast),
  #8 (viewports), #9 (reduced motion), #10 (200% zoom), and the explicit
  looks for #12 (`<mark>` integrity), #13 (aria-live result count),
  #14 (ContinueReading 404 silence). Next action: the author runs these as
  one short visual/keyboard pass, or records a decision routing them to a
  separate visual-audit task.

## GAP-051 calibration-data authorization confirmed — 2026-10-13

- **AUTHOR DECISION:** the existing flagship novel with ten chapters plus
  twenty calibration novels are within the reasonable scope personally
  authorized by the author. The earlier authorization uncertainty is resolved;
  no further confirmation or authorization lookup is needed for these fixtures.
- Preserve the existing data. This clarification does not authorize cleanup,
  unrelated data creation, commit, push, merge or deployment.
- Next: continue only the separate full-checklist evidence reconciliation
  described below, retaining the recorded human passes.

## GAP-051 closure report assessment — 2026-10-13 (fallback handoff)

- Read the latest `output.txt`, actual AUDIT-014 closure, issue records and
  seed scripts. Retain the other harness's human F4/locale/load-more PASS
  receipts; no repeat of those observations is requested. The reported CLOSED
  verdict below is retained as provenance. The broader full-checklist claim
  needs evidence mapping for contrast, viewports, reduced motion, zoom and
  reader progress; see GAP-051's closure assessment qualification.
- The quoted one-novel/ten-chapter authorization does not establish the scope
  of twenty additional calibration novels. Locate retained authorization first;
  this assessment does not conclude it was absent. Data and both seed copies
  are preserved. No seed rerun, deletion, installation or database mutation.
- HEAD `50609c0`; `nf050b-acceptance-wip` stash present. WIP includes ACC-1,
  F4, audit records, untracked captures and two seed-script copies. Commit
  scope must account for these separately; no commit/push/merge/deploy allowed.
- **Engram unavailable at this boundary:** host hook reports spawnSync
  `engram.exe` ETIMEDOUT and UNBOUND. No attributed writes or reused identity;
  this entry is the fallback handoff, not an Engram checkpoint.
- Next: reconcile existing acceptance evidence and calibration authorization,
  correct only unsupported scope claims, and prepare a precise proposed file
  selection for review. Historical 023C statements alone do not establish
  today's release blockers or authorize release. Functional author sign-off
  remains accepted; VoiceOver testing remains deferred.

## GAP-051 human audit — 2026-10-13 (screen-reader gate closed on evidenced scope; QUALIFIED overall — see the evidence-reconciliation entry at top)

- **OBSERVED:** recovered Engram #244 (author functional sign-off decision) and
  #245 (handoff). AGENTS.md, CURRENT acceptance records, GAP-039/GAP-051 entries,
  `apps/web/a11y/AUDIT-014.md` and `docs/implementation/023C-battery-report.md`
  re-verified this session: automated axe half 0 violations (2026-10-06, RETAINED),
  human gate OPEN. SHIP_WITH_KNOWN_GAPS is a historical 023C disposition,
  not current release authorization.
- **Auditor NAMED:** the author (`ch0c01d.xyz@gmail.com`). Host detection
  (Windows 10.0.26200): NVDA NOT installed, Firefox NOT installed, VoiceOver +
  Safari N/A (macOS-only), Chrome `154.0.8037.98` + Edge present — **no
  runbook-named combination is currently performable on this host.** Narrator
  exists but is not runbook-named; substituting it requires an explicit recorded
  author deviation decision. Active enablement: install NVDA + Firefox here;
  VoiceOver + Safari is deferred by the author decision below.
- **Recorded in `apps/web/a11y/AUDIT-014.md`** ("GAP-051 human-audit coordination
  — 2026-10-13"): auditor, date, environment detection, FULL scope (existing
  browse/reader checklist + 050C SCALE/S3 additions: roving-tabindex keyboard
  reachability, focus order, accessible names on Enable/Disable/reason/confirm,
  dialog behavior, saving/forbidden/saveFailed announcements, disabled-state SCALE
  panel — en+id) and an explicit zero-results statement. GAP-051 entry in
  ISSUES-AND-GAPS carries the same coordination update.
- **Every manual check is UNPERFORMED and PENDING.** Scheduling, screenshots and
  automation cannot establish the human pass; GAP-051 stays the explicit release
  gate. Nothing committed, pushed, merged or deployed; worktree changes are doc
  edits only.
- **Author scope decision (2026-10-13):** "untuk fitur VoiceOver tidak perlu dan
  tidak saya gunakan, masukkan fitur tersebut ke dalam draft dulu untuk
  kedepannya" — VoiceOver + Safari moves to a future draft/backlog item; the
  active gate combination is NVDA + Firefox only. Historical runbook wording kept
  as history in AUDIT-014/023C records. Gate still OPEN until a real human
  NVDA + Firefox pass (en + id, full scope) is recorded.
- **Human audit progress (partial, later 2026-10-13):** with NVDA 2026.2 +
  Firefox 157.0.1 (installed with the author's explicit winget approval after
  absence was re-verified), the author performed the `/browse` walkthrough except
  load-more (PASS per author observation) and confirmed the "you stopped at"
  marker (PASS, below the novel-detail chapter list). Findings recorded in
  AUDIT-014.md: F1 — no dashboard menu/link to `/browse` (URL typed manually);
  F2 — load-more untestable with current data volume (PENDING, not a failure);
  F3 — author suggestion: tooltips advertising keyboard shortcuts (backlog).
  NOT yet performed: the Policies/S3 card portion (author found earlier
  instructions unclear — clarified instructions provided); locale coverage of
  performed items unstated. The author closed NVDA mid-session; the gate
  verifies assistive-technology-user experience, so remaining items need NVDA
  active. **GAP-051 stays OPEN.** No code changes; findings routed to backlog.
- **Policies/S3 portion PERFORMED; F4 found (later 2026-10-13):** author reports the
  S3/Policies keyboard, dialog and announcement checks normal — PASS apart from a
  new **F4**: the Cancel button renders the raw key `workspace.common.cancel` in
  the DNA editor and Policies dialogs (works when clicked). Source-verified root
  cause: 9 call sites in 7 components use the non-existent key path while the
  correct `common.cancel` ("Cancel"/"Batal") exists and is used correctly by
  siblings incl. `ScaleS3SettingToggle.vue`. Raw keys are also announced by screen
  readers — an accessible-name defect inside the audited surface. Repair is a
  per-site key-path change, awaiting author authorization; GAP-051 stays OPEN
  until F4 is fixed + re-verified and load-more/locale items resolve.
- **F4 REPAIRED (later 2026-10-13, author-authorized bounded scope):** all 9
  call sites across the six components switched to `t("common.cancel")`; no
  aliases/dependencies added. New guard `cancel-label-i18n.test.ts` (GAP-121
  real-dictionary pattern; pins "Cancel"/"Batal"; ≥9 sites, ≥1 per component;
  forbids the old path). Focused vitest 8/8 (incl. scale-review-i18n-parity),
  `vue-tsc --noEmit` 0, eslint 0. Frozen artifact
  `.git/gap-051-f4-cancel-key-repair-r1.diff` sha256 `162ebf99…b3528`;
  separate reviewer `Gap051F4RepairReviewR1` **APPROVE, zero findings**.
  Not committed. Open for the gate: human re-verification of the repaired
  Cancel buttons (label + NVDA announcement), locale coverage, load-more.
  **GAP-051 stays OPEN.**
- **F4 human re-verification PASS (later 2026-10-13):** author confirms the
  repaired Cancel labels read "Cancel"/"Batal" and are synchronized ("sudah
  normal ... sudah singkron"). Recorded in AUDIT-014. Remaining gate items:
  locale coverage confirmation of retained PASS items; load-more (blocked on
  authorized data). **GAP-051 stays OPEN** on those two residual items.
- **Locale coverage CONFIRMED (en + id, later 2026-10-13):** author evidence —
  en "you stopped at chapter 2" / id "Anda berhenti di bab 2". Dual-locale
  exercise of the audited surfaces recorded.
- **F2 load-more PASS; screen-reader gate closed on its evidenced scope
  (latest 2026-10-13 — SUPERSEDED-QUALIFIED, see the evidence-reconciliation
  entry at top):** with the author-authorized test data in place (flagship
  10-chapter Indonesian novel + 20 labelled slim published novels, all
  created through the RUNNING API's real routes incl. review+publish gates;
  `/api/public/novels?limit=20` → 20 items, `hasMore=true`), the author
  performed the load-more checks with NVDA active in both locales: PASS —
  "Load more" (en) / "Muat lagi" (id), focus retention and announcements
  normal. Automated axe half 0 violations (RETAINED). VoiceOver + Safari:
  deferred to future draft by explicit recorded author decision. This entry's
  "every manual item covered" claim was too broad: original announcement
  items #13/#14 remain PENDING, and items #6–#10 were never in the gate
  (#6 functional progress write; #7–#10 visual) — see the AUDIT-014
  evidence table. Backlog items F1 (dashboard→/browse link) and F3
  (shortcut tooltips) remain tracked as enhancements, not AA failures. F4
  repair remains uncommitted with the rest of the worktree (author-gated).
  023C's other release conditions (battery boxes 2–7, GAP-097 — CLOSED) are
  separate gates, unaffected.

## NF-WF-050C harness report assessed — 2026-10-13

- **OBSERVED:** this Codex coordinator read `output.txt`, the steps 6/8/9
  closure records below, Engram #238 revision 3, and `capture-1..4.png`.
  Captures support the visible disabled badge, retained history/checklist and
  English/Indonesian labels. Database preservation and the author's Dismiss
  confirmation are RETAINED from the other harness's attributed receipt;
  no duplicate queries or journey checks were performed.
- Earlier pending requests for Dismiss/disable/locale observations are
  superseded by the recorded closure. HEAD remains `50609c0`; stash is intact.
- **AUTHOR DECISION:** following a separate scoped sign-off question, the
  author explicitly accepted the integrated functional result and kept
  GAP-051 open. GAP-039's author functional sign-off leg is CLOSED; its
  remaining human accessibility dependency is still OPEN. The earlier
  instruction to continue was not used as approval. No commit, push, merge,
  deployment or full-platform release approval follows.
- Next: coordinate the human
  GAP-051 run using `apps/web/a11y/AUDIT-014.md` and the existing S3 additions
  in this file. Retain the full browse/reader scope plus SCALE/S3 controls;
  record auditor, date, browser/screen-reader versions, locale, results and
  findings. Do not claim a pass from scheduling, screenshots or automation.

## NF-WF-050C author journey steps 6, 8, 9 CLOSED — 2026-10-13 (author observation + read-only DB evidence)

- **Step 6 human leg CONFIRMED (AUTHOR OBSERVATION + DB):** the author states
  they personally clicked Dismiss on proposal `8ef91ca1` (~20:13 local,
  2026-10-12) to test the control, and it worked normally. The unchanged
  dismissal row (actor `5c0005c6` = `ch0c01d.xyz@gmail.com`, 13:13:39.571 UTC,
  default reason "Ditolak dari panel tinjauan SCALE.") now carries human
  confirmation; no re-generation was required.
- **Step 8 disable-via-UI PASS (AUTHOR OBSERVATION + DB + browser captures):**
  author disabled S3 through Policies → S3 card (reason "Test nonaktifkan").
  Read-only DB, 2026-10-13: novel C `61840872-d6bd-4280-9c5c-e8abd8e39876`
  `scaleS3.enabled=false`; exactly ONE new `novel.scale-s3-settings-changed`
  audit row (enabled=false, actor `5c0005c6`, 21:37:46.483 UTC = 04:37:46
  local — the per-committed-PUT audit invariant holds). Browser evidence
  (author captures, 04:38 local): `capture-1.png` — id locale, "Saran AI (S3)"
  card with badge Mati (Off); `capture-2.png` — id SCALE review: AI suggestions
  section INCLUDING proposal cards absent, "Riwayat (5)" and the deterministic
  checklist ("Receipt tinjauan basi") present. Hidden ≠ deleted: post-disable
  preservation verified — all 4 proposals, all 8 evidence sets with the 4
  provenance links (`94ed5bd6`→`2a0c3fce`, `4eb52eb2`→`2a0c3fce`,
  `9136bd7e`→`8ef91ca1`, `e1c2fea0`→`226e9c0c`) and the dismissal record
  unchanged.
- **Step 9 live locale PASS (AUTHOR OBSERVATION + browser captures):** author
  switched English ↔ Indonesian through the locale control; visible settings
  and deterministic panel labels followed the selected locale. id: Kebijakan /
  "Saran AI (S3)" / Nyala–Mati / Tinjauan SCALE / Riwayat / Tambah set bukti /
  Daftar periksa (`capture-1.png`, `capture-2.png`); en: Narrative / SCALE
  review / Standing / Deterministic review / SCALE evidence (050A) / History
  (5) / Append evidence set / Checklist (`capture-3.png`, `capture-4.png`;
  en-side S3 settings card per author statement). AI-section labels were NOT
  required to render while S3 is disabled (section hidden). Static-key parity
  leg remains PASS RETAINED.
- **Environment note:** prior-session dev processes were dead (ports
  3000/3001/20127 all closed); API :3000 and web :3001 were restarted against
  `novelforge_acceptance_050b` via inline env overrides (`DATABASE_URL` →
  nf-pg-5433, `REDIS_URL` → :6399); targeting verified by `/ready`
  (database up, redis up) plus a socket from the API PID to :5433. No code or
  config file changed. 9Router gateway :20127 remains DOWN — not needed for
  steps 8–9 (no extraction). `capture-1..4.png` are untracked author evidence
  at repo root; the earlier `output.txt` no longer holds the prior DB
  reconciliation record (it contains this session's spill) — direct read-only
  queries are the citation of record.
- **Status after this entry:** journey steps 1–9 all PASS (3 live-extraction
  and 7 stale-409 legs PASS RETAINED from the 2026-10-12 live session). NOT
  done: author integrated acceptance sign-off — GAP-039's acceptance leg stays
  OPEN; functional PASS on the journey does NOT imply sign-off. GAP-051 human
  screen-reader pass (NVDA+Firefox / VoiceOver+Safari per the existing
  runbook) remains PENDING HUMAN. Nothing pushed; worktree = reviewed r5
  repair + doc edits + untracked evidence files; stash intact.

## NF-WF-050C acceptance resume — 2026-10-13 (bound Codex session)

- **OBSERVED:** recovered Engram #239 and #240; both concern runtime binding
  only, not the previous implementation conversation. Live session read-back
  confirms this host's active binding; see the GAP-021 boundary update.
- **OBSERVED:** HEAD remains `50609c0d2704380ac2b48fa5eb01164fe8e858ca`.
  The current two-file source/test diff matches the frozen ACC-1 r5 artifact
  byte-for-byte by SHA-256
  `2f25087879e58ba5e6fc8aa31a5934f92cc1d4573b1490d6231aa7d97dcec6b6`.
  Existing source edits, documentation edits, untracked files and
  `nf050b-acceptance-wip` stash are preserved. Existing Docker containers are
  running; none was restarted or changed.
- **RETAINED:** r5 separate APPROVE, S3 25/25, adjacent 42/42, typecheck and
  targeted lint receipts, fresh-page acceptance, and the reconciliation below.
  These checks were not rerun. Historical reviewer identity/verdict comes from
  the retained records; this session did not independently re-review the repair.
- **PENDING HUMAN / next action:** confirm the previously unconfirmed Dismiss
  click, perform or report step 8 UI disable observations, then step 9 live
  locale switch. Do not repeat already recorded extraction, provenance,
  alternative, stale-extract or fresh-page checks. After the disable report,
  verify setting/audit and retained history read-only. Author integrated
  sign-off and the full GAP-051 screen-reader gate remain separate and open.
- No source or acceptance-data mutation, generation, commit, push, merge or
  deployment performed. The prior unbound-session notes remain historical;
  they do not describe this session's confirmed binding.

## NF-WF-050C author acceptance reconciliation — 2026-10-13 (steps 5–7 reconciled; steps 8–9 pending author)

- **Baseline verified (OBSERVED):** main HEAD `50609c0` (nothing pushed;
  `origin/main` = `b7969de`). Working tree source+test exactly match the
  reviewed ACC1 r5 repair — hash of
  `git diff 50609c0 -- apps/web/app/components/workspace/ScaleReviewPanel.vue
  apps/web/app/components/workspace/ScaleReviewPanel.s3.test.ts` equals
  frozen artifact `.git/nf-050c-acc1-repair-r5-20261012.diff` sha256
  `2f25087879e58ba5e6fc8aa31a5934f92cc1d4573b1490d6231aa7d97dcec6b6` — plus
  uncommitted docs handoff edits and untracked `output.txt`, `capture.png`,
  `tasks/NF-050C-ACC-1-repair-amendment.md`; stash `nf050b-acceptance-wip`
  intact. API :3000 `/health` 200, web :3001 200 (read-only probes). No code,
  fixture, commit, push or generation performed this session.
- **Steps 5–7 reconciled (DB evidence verified read-only on
  `novelforge_acceptance_050b`, UTC; details in ISSUES-AND-GAPS NF-050C-ACC-1
  2026-10-13 paragraph):** extract → `8ef91ca1` 13:03:24 → dismiss `8ef91ca1`
  13:13:39 → Set #4 `9136bd7e` provenance→`8ef91ca1` 13:23:38 → extract
  `226e9c0c` 13:28:42 → Set #5 `e1c2fea0` provenance→`226e9c0c` 13:29:52
  (edited claim). Corrected chronology confirmed: dismiss FIRST, accept after;
  Set #5 links to `226e9c0c`, not the first proposal. Server accepting a
  provenance-linked accept on a dismissed proposal is observed server
  behavior (dismissed = inert, not a blocker) — no product-policy claim.
  Human confirmation of the Dismiss click: OPEN (author asked;
  `actorUserId` is not human-interaction proof).
- **Criterion status (journey):** 1–2 toggle/enable PASS (RETAINED; setting
  `enabled=true` 02:44:47 + audit) · 3 live extraction PASS (RETAINED DB:
  13:03/13:28 proposals, `claude-fable-5-1`) · 4 accept+provenance PASS
  (`9136bd7e`) · 5 edited alternative+provenance PASS (`e1c2fea0`) · 6 dismiss
  PASS server-side, human click OPEN · 7 stale-extract 409 zero rows PASS
  (RETAINED, 2026-10-12 live) · 8 disable-via-UI OPEN · 9 locale static PASS
  RETAINED (`s3.*` translated in `en.ts`+`id.ts`), live switch OPEN ·
  GAP-051 screen-reader gate PENDING HUMAN · author integrated sign-off /
  GAP-039 OPEN.
- **Step-8 instruction CORRECTED (supersedes the prior handoff line "old
  proposal cards remain [visible]"):** when S3 is disabled, the AI suggestions
  section — INCLUDING its proposal cards — disappears from the SCALE panel;
  deterministic SCALE guidance remains; proposal/dismissal/evidence/
  provenance history remains persisted. Hidden cards after disable are
  expected, NOT data loss. After the author's UI disable, assistant verifies
  read-only: setting `enabled=false` + `novel.scale-s3-settings-changed` audit
  row; exact IDs intact — proposals `406e33f5`/`2a0c3fce`/`8ef91ca1`
  (dismissal 13:13:39)/`226e9c0c`; sets `94ed5bd6`/`4eb52eb2`/`9136bd7e`/
  `e1c2fea0` with `source_s3_proposal_id` links `2a0c3fce`×2/`8ef91ca1`/
  `226e9c0c`; AI section absent, deterministic guidance present (author
  observation).
- **Next action:** author (a) answers whether they personally clicked Dismiss
  on `8ef91ca1` (~20:13 local) and (b) performs step 8 in the UI — Policies →
  S3 card → Disable → reason → Confirm — reporting badge, AI-section/cards
  absence, checklist presence; then step 9 live en/id switch through the
  existing locale control. Assistant verifies read-only afterwards. Engram
  attributed writes unavailable this session (no runtime session binding;
  GAP-021 context) — this entry is the fallback handoff.

## NF-WF-050C amendment 1 committed 50609c0 — author acceptance handoff — 2026-10-12 (OBSERVED this session)

- **Git (OBSERVED):** main HEAD `50609c0d2704380ac2b48fa5eb01164fe8e858ca`
  (parent `23d4a1a`, 3 local commits after `b7969de`). `git fetch origin`
  run this session: `origin/main` = `b7969de` — 3 outgoing commits
  (`7589388`, `23d4a1a`, `50609c0`), 0 incoming. Nothing pushed or merged
  by this session. Worktree: modified `docs/14-progress/CURRENT.md` (this
  entry, uncommitted) + untracked `output.txt`; stash
  `nf050b-acceptance-wip` intact. This handoff entry is NOT committed.
- **Scope (RETAINED):** amendment 1 findings A–D repair + live-found defect
  fixes, frozen artifact
  `.git/nf-050c-amendment1-final-r2-20261012.patch` (sha256 `98b25150…453ad45a`,
  base `23d4a1a`), separate review `agent://FinalDiffReview-r2` **APPROVE**
  zero findings. Technical review COMPLETE; author acceptance NOT claimed.
- **Acceptance environment (OBSERVED this session):** API :3000
  (PID 18600, `/health` → `{"status":"ok"}`), web :3001 (Nuxt dev, PID 24536,
  HTTP 200), 9Router gateway :20127 (PID 26616), Docker `nf-pg-5433` and
  `nf-redis-acceptance` up 18h. DB `novelforge_acceptance_050b` intact:
  45/45 finished migrations, gateway row `9Router local (050c acceptance)`
  → `http://localhost:20127/v1` enabled, 2 proposals retained (1 dismissed
  + linked evidence, 1 pending). Novel C (`61840872…`) `scaleS3.enabled=false`
  — an OBSERVED saved setting from the previous session's disable step, NOT
  proof of the code default (default-off behavior is covered by tests,
  RETAINED).
- **Gateway readiness (OBSERVED this session, read-only):** profile
  `STRUCTURED_EXTRACTOR` maps (enabled) to model ref
  `f887da5b-ab4d-477e-9208-ad6a81d4f225` = `fable5` (enabled) on gateway
  `9Router local (050c acceptance)` (enabled). `GET http://localhost:20127/v1/models`
  → HTTP 200, 2500 models, `fable5` present. A listening port, enabled row
  or catalog hit does NOT prove extraction success; no billable generation
  was run this session, so live extraction capability for the author's run
  remains **UNKNOWN until the author extracts** (last live receipt: 2026-10-12
  session, `fable5`→`claude-fable-5-1`, RETAINED). Historical PIDs are NOT
  ownership evidence.
- **Author journey (start at `http://localhost:3001`, log in as an author
  fixture — see unknowns):** Workspace → Novel → Narrative → Policies tab →
  S3 card. (1) Setting shows Off with enable/disable controls for
  OWNER/ADMIN/AUTHOR (read-only note for other roles). (2) Enable → reason
  form (required, pre-filled default) → confirm → badge flips to On; PUT
  audited (`novel.scale-s3-settings-changed`, one row per committed PUT).
  (3) SCALE tab → chapter → Extract → checklist renders; AI proposal (if the
  gateway model returns valid canonical-scale claims) appears with
  `Model: <reportedModel>`. Error semantics are distinct: **422** = invalid
  model output (fail-closed; Generation rows record real token usage, NO
  proposal row); **502** = gateway/upstream failure; **409** = stale-context
  or setting refusal (also S3_DISABLED / S3_NOT_CONFIGURED), zero rows.
  Visible UI checks are verified in the browser; audit rows, Generation
  usage, and provenance column values are DB/API verification (psql or API
  response), not UI-visible. (4) Accept → "Add as evidence" opens the 050A
  form PREFILLED from the proposal; the set is only committed after the
  author explicitly submits that form AND the server accepts it (audited);
  the committed set carries `source_s3_proposal_id` (provenance). (5)
  Alternative: author a different
  claim through the same form (S1) — linked to the same proposal. (6)
  Reject/dismiss: dismiss control records actor/reason/identity; idempotent.
  (7) Disable via the same Policies toggle — AI section disappears, checklist
  and proposal history preserved. (8) Deterministic guidance renders beside
  checklist; stale extract (old expectedSetId) → 409 refusal, zero rows.
  (9) Locale switch en/id: all S3 strings translated; a key missing in the
  active locale falls back to English ONLY because the key exists in `en`
  (verified present in `apps/web/app/i18n/en.ts`, incl. the `s3.setting.*`
  family). FAILURE = any error banner on 403/404 GET, missing badge update,
  proposal rows on 422, missing provenance column value, sibling-key loss on
  concurrent PUT, or a missing key in BOTH locales (renders the raw key).
- **Remaining author checks:** integrated-acceptance sign-off (journey above)
  + the FULL human screen-reader pass already defined by GAP-051's existing
  audit/runbook scope (NVDA + Firefox / VoiceOver + Safari; see
  `docs/implementation/023C-battery-report.md` and the GAP-051 entries in
  ISSUES-AND-GAPS) — the gate is NOT narrowed to the toggle. The new S3
  controls join that existing scope: keyboard reachability in the Policies
  tab roving-tabindex shell, focus order, accessible names on
  Enable/Disable/reason field/confirm, dialog behavior + status/error
  announcements (saving/forbidden/saveFailed), plus the pre-existing SCALE
  panel surfaces. Status of all screen-reader checks: **PENDING HUMAN
  VERIFICATION** — axe/component/DOM evidence does not satisfy the gate.
- **Login dependency (UNKNOWN):** no password is stored in the repo; this
  session did NOT read, reset or create credentials. The author should use
  an existing local browser session for `localhost:3001` if one is still
  authenticated; otherwise the author signs in locally with their own
  fixture credentials — do NOT paste passwords into chat, and do NOT reset
  fixture credentials for this check. Passsing the checklist alone does not
  authorize production deployment.
- **Next action:** author performs the journey + the full GAP-051
  screen-reader scope above; author sign-off closes GAP-039's acceptance
  leg. Push and deployment are separately author-gated decisions
  (repository authorization policy) and are NOT made dependent on, nor
  automatic after, human acceptance.
- **NF-050C-ACC-1 update (2026-10-12, later session):** defect CONFIRMED
  (author-supplied HAR proves the proposals-list request is never issued on
  page load) and REPAIRED at working tree on top of `50609c0` — the S3
  proposals list now loads after BOTH the setting and context prerequisites
  resolve (either order), with selection/operation guards added to
  `loadS3Setting` (stale-response finding closed). Round 2 (same session):
  two further source findings (retry-recovery gap; failed context with
  non-null version prop could still fire the list) were reproduced as
  failing tests (T8–T10), then repaired — `loadContext` reports success;
  `retryLoad`/`reconcileSelection` load S3 proposals after a successful
  context; the initial chain gates the list on setting-ready AND
  context-success with a per-chain fired latch (one request per chain);
  evidence loading stays independent of the S3 gating (r2-review finding 2).
  Tests: S3 suite 21/21, adjacent panel suites 42/42, `vue-tsc --noEmit`
  exit 0, eslint clean on the changed test path (`.vue` outside eslint
  scope — disclosed, pre-existing). Review: r2 artifact got
  CHANGES_REQUESTED from `agent://Acc1RepairReviewR2` (duplicate-list
  window; evidence-gating regression) — both applied; final artifact r3
  (`.git/nf-050c-acc1-repair-r3-20261012.diff`, sha256
  `bf8153dc59e9ec84ec7e141a1223d3e8abbda786673cb4163ac5170de460b1a0`)
  re-reviewed by the same separate reviewer: **APPROVE**, zero findings.
  Two P3s deferred with consent (setting-in-flight-during-Retry
  conservative clean-absence; T6a assertion brittleness). Not committed
  (author-gated). Live journey state this session: steps 0–2 PASS (toggle +
  audit rows verified in DB); steps 3–4 OPEN on model output quality
  (2×422 fail-closed + 2×Atria timeout across
  `fable5`/`atria`/`dahono/deepseek-v4.1-flash`; mapping currently back on
  `fable5` per author instruction); steps 5–7 PENDING author observation on
  the repaired build; step 9 pending. Author sign-off NOT supplied. Session
  fixture changes (approved, additive): membership row
  `ch0c01d.xyz@gmail.com` → AUTHOR in workspace C.
- **NF-050C-ACC-1 round 3 (2026-10-12, later session):** the deferred
  "setting-in-flight-during-Retry" P3 was reproduced (independent probe:
  Retry leaves `s3Enabled` stuck false — zero list requests; the deferral
  is superseded) and REPAIRED: retryLoad/reconcileSelection own their
  setting prerequisite under the recovery identity; loadS3Setting's reset
  writes moved below the identity guard; the generic-failure catch now
  forces `s3Enabled=false` (no list on any failed replacement). Tests:
  S3 suite 25/25 (T11–T14 new; T11 failed pre-fix), adjacent 42/42,
  `vue-tsc --noEmit` exit 0, eslint test path exit 0. Review: r4 artifact
  CHANGES_REQUESTED (`agent://Acc1RepairReviewR4`; generic-failure gap +
  T12 mock fall-through bug), all applied; final r5 artifact
  (`.git/nf-050c-acc1-repair-r5-20261012.diff`, sha256
  `2f25087879e58ba5e6fc8aa31a5934f92cc1d4573b1490d6231aa7d97dcec6b6`)
  re-reviewed: **APPROVE**, zero findings. Not committed (author-gated).
  Fresh-page technical check by the author still pending (login is the
  author's own browser session; no credentials held by the assistant).
  Author acceptance steps 5–7, locale checks and GAP-051 remain PENDING
  until actually observed.
- **Fresh-page verification PASSED (2026-10-12, r5 build, OBSERVED):**
  author hard-refresh + SCALE review → `GET …/scale-s3?chapterVersionId=74a5ab9d…`
  auto-issued on load, HTTP 200, both stored proposals rendered as cards
  (both `Stale —`, `Model: claude-fable-5-1`), zero extraction/model calls.
  Stale cards correctly render read-only (no Add-as-evidence/Dismiss) — a
  FRESH actionable proposal requires a successful live extraction (steps
  3–4 remain OPEN on model output quality). Steps 5–7, locale checks and
  GAP-051 stay PENDING until actually observed; card rendering does not
  close GAP-039 or the screen-reader gate.

## NF-WF-050C findings A–D repaired; LIVE integrated S3 acceptance witnessed — 2026-10-12

Findings A–D (recorded in ISSUES-AND-GAPS under the GAP-039 umbrella) were
repaired under frozen amendment `tasks/NF-WF-050C-amendment-1-findings-abcd.md`
(two read-only review rounds: round 1 CHANGES_REQUESTED on C+D — fixed;
round 2 APPROVE both). Repairs at working tree on top of `23d4a1a`:

- **A**: new `ScaleS3SettingToggle.vue` in the NarrativePanel Policies tab
  (discoverable per-novel enablement, reason recorded, saving/error states,
  capability mirror OWNER/ADMIN/AUTHOR, server still enforces canon:manage);
  en/id keys + toggle suite 6/6.
- **B**: `scale_evidence_sets.source_s3_proposal_id` (new additive migration
  `20261012_nf_wf_050c_evidence_s3_provenance`, bare UUID, no FK — generationId
  precedent); optional `appendSet` `sourceProposalId` validated in-transaction
  (tenant/chapter/version binding + branch/head/policy freshness; the
  proposal's `evidenceSetId` pin deliberately NOT compared to the tip —
  correction recorded after the live 409 witness); provenance select +
  add-as-evidence prefill link in the panel; scale-evidence suite 51/51.
- **C**: advice `code`+`field` PAIR validation against the server-derived
  checklist (combined-key Set.has); negative regressions in service+route
  suites (valid code + wrong field → 422).
- **D**: `list()` stale-marking transaction runs at RepeatableRead
  (read-only, verified lock-free); lock-taking transactions stay at READ
  COMMITTED (P2034 abort analysis — contract wording corrected to "same lock
  order + revalidation protocol as 050A/050B"); stale docstring fixed;
  `putSetting` takes the novel row lock (FOR NO KEY UPDATE) and writes its
  audit entry INSIDE the transaction (exactly one audit row per committed
  PUT; concurrent sibling-key preservation regression test).

Live defects found and fixed during acceptance (all deterministic tests had
missed them): (1) scale-s3 re-declared a WRONG scale vocabulary
(OBJECT/PERSON/GROUP/SETTLEMENT/REGION) instead of the canonical
@novelforge/narrative-rhythm enum (PERSONAL/FAMILY/VILLAGE/TOWN/CITY/
PROVINCE/KINGDOM/EMPIRE) — fixed by importing the canonical constant, prompt
enumeration corrected; the wrong-enum proposal row remains stored as inert
history; (2) extraction prompt did not enumerate the scale values (models
emit lowercase) — fixed; (3) the evidenceSetId pin comparison above — fixed.

Checks executed this session: scale-s3 API 25/25; scale-evidence 51/51;
scale-review/decisions/checklist/proof 85/85; platform.integration 12/12;
restore-scope 8/8; web workspace suites 178/178; toggle 6/6; parity 4/4;
api+ai-services+web typechecks exit 0; eslint exit 0; `git diff --check`
clean; new migration deployed to an owned scratch copy of the acceptance DB
(column verified, scratch dropped), then to `novelforge_acceptance_050b`
(fixture preserved).

**Post-fix independent review verdict (2026-10-12, later session):** the
re-frozen artifact `.git/nf-050c-amendment1-final-r2-20261012.patch`
(sha256 `98b2515001863913459ac9c669cff2bdbe8e4ba36aa7958beb8c98fa453ad45a`,
base `23d4a1a`) received a separate read-only review
(`agent://FinalDiffReview-r2`; not the implementer session): **APPROVE**,
zero findings — both round-1 P2s (parity guard extension; contract
isolation wording) and the round-2 P3 (duplicate-submit test) verified
fixed in actual source; toggle 7/7 + parity 4/4 rerun OBSERVED 11/11.
Technical review is therefore COMPLETE; this is distinct from author
acceptance (see Not done below). Amendment working tree still uncommitted.
Engram attributed writes remain unavailable this session (no
hook-confirmed runtime binding; GAP-021) — this paragraph is part of the
fallback handoff.

**LIVE integrated acceptance witnessed on the owned stack** (API :3000
restarted under this session's supervision to load fixes; web :3001 Nuxt dev;
real 9Router gateway :20127 serving `fable5`→`claude-fable-5-1`; labeled
API-assisted fixture prep: platform-admin registration + gateway/model/
STRUCTURED_EXTRACTOR mapping seed, authorc fixture password argon2 reset;
none printed): browser journey (id + en locales) — Policies tab toggle
renders Off → enable through UI (reason recorded, audit row) → live extract:
2× fail-closed 422 (quote mismatch; then wrong-enum proposals pre-fix) with
Generation rows SUCCEEDED (972/2708 tokens real usage, reportedModel from
attempt ledger, NO proposal row) → 201 happy path, 6 canonical claims
rendered with `Model: claude-fable-5-1` → advice 422→200, validated item
rendered alongside the deterministic checklist → accept through the 050A form
(Set #2 `source_s3_proposal_id` set) → manual alternative linked to the same
proposal (Set #3) → dismiss records actor/reason/identity → disable through
UI → AI section gone, checklist intact, proposal history preserved → stale
extract (old expectedSetId) refused 409 with zero rows. The host's previous
180 s gateway timeout model (Atria-Dawn-Preview) is gone from the gateway's
catalog; the live happy-path receipt now exists.

Not done: commit/push (author-gated); GAP-039 stays OPEN until the author
accepts integrated acceptance + human screen-reader pass; platform-admin user
and seeded gateway/model/mapping rows left in place for the author's own
re-run (removal would delete the only live-acceptance reproduction setup;
author may purge). Engram attributed writes unavailable (GAP-021): no
hook-confirmed runtime session identity this session; this entry is the
fallback handoff.

## NF-WF-050C implemented, separately reviewed, committed 7589388 — 2026-10-12

050C (optional S3 SCALE proposal assistance) is implemented on top of
b7969de and committed as `7589388` on main (author-authorized; parent
b7969de; not pushed; no deployment). Contract
`tasks/NF-WF-050C-scale-s3-assistance.md` frozen after three review rounds;
slices separately reviewed (backend 7 findings fixed, web 1 finding fixed);
final exact-diff review of freeze `.git/nf-050c-final-freeze-20261011.patch`
sha256 `c02349c5a9e561bddd88726713b7ac4c9f54cda8b7976fa12c0290196f9918cf`
verified all findings resolved (2 non-blocking P3 notes applied: advice-item
cap; payload comment corrected to write-time validation + consumption-time
050A re-validation).

Scope delivered: per-novel off-by-default S3 setting in `NovelSettings`
(`PUT/GET /scale-s3-setting`, canon:manage setter, audit
`novel.scale-s3-settings-changed`); inert untrusted extraction proposals
(`scale_s3_proposals`, single additive migration `20261011_nf_wf_050c_…`,
OPERATIONAL restore class 96→97); two-phase pin validation under the 050A
lock order with zero model calls on every pre-model refusal; fail-closed
claim validation (span/quote byte-exact vs pinned content); reportedModel
from the attempt ledger only (never request-model fallback); transient
never-persisted advice gated on INCOMPLETE; recorded dismissal
(CAS-guarded, idempotent); panel section with zero affordances when
disabled, prefills-only "Add as evidence" through the existing 050A form;
en/id keys + parity guard.

Checks executed this session (Windows, 5433): scale-s3 API suite 24/24;
platform.integration 12/12 (new S3 cascade/refusal deleteNovel test);
scale-evidence/review/decisions + restore-scope 123/123; S3 panel 11/11 +
parity 4/4; adjacent web 48/48; ai-services/api/web typechecks exit 0;
eslint on all changed files exit 0; prisma validate/generate pass; live
additive migration applied to `novelforge_acceptance_050b` (fixture
preserved; seeded gateway/model/mapping rows and diagnostic artifacts
removed after evidence; audit trail kept).

Live browser journey (owned acceptance stack, chrome-devtools, author
session; API-assisted fixture steps labeled): disabled default → section
absent, GET setting `{enabled:false}`; API-assisted enable → section
renders (id locale "Saran AI", en locale "AI suggestions"); extract click
→ real 9Router gateway → **502 BAD_GATEWAY**, deterministic checklist
intact, no proposal row, `Generation` row FAILED/TRANSIENT latency 180057
ms with NULL token counts (unknown usage recorded verbatim — NF049);
disabled again → section gone, zero affordances. **REMAINING LIVE GATE**:
the host's real gateway model (Atria-Dawn-Preview) cannot complete the
extraction prompt within 180 s (upstream TRANSIENT), so the live happy-path
extraction receipt awaits a structured-extraction-capable model profile;
deterministic coverage of the happy path is complete (fake-gateway suite).
GAP-039 remains OPEN (retains integrated acceptance + author-owned human
screen-reader pass); 050B/GAP-119/GAP-120–123 closed earlier today (see the
entry below). Engram attributed writes unavailable (GAP-021): no runtime
session identity; this entry is the fallback handoff.

## NF-WF-050B acceptance CLOSED; 050B/050C continuation — 2026-10-11, b7969de

The reviewed 050B acceptance-repair set (GAP-120/121/122/123 fixes, evidence
excerpt, scope amendments 23–25, GAP-122/123 contracts) was committed as
`b7969de` on main (parent `dcb2f49`). Verification at the committed revision:
9 affected web suites 85/85 passed (the routing regression test requires
`apps/web` as cwd — repo-root invocation misreads its path anchors, a runner
artifact, not a code defect); `vue-tsc --noEmit` exit 0; freeze patch
`.git/nf-050b-final-freeze-20261011.patch` sha256 re-verified
`66f1a3b0…f54`; GAP-123 follow-up patch `03f3f964…87d6` re-verified and its
committed blobs (`279ada86` useLocale.ts, `4ada15b0` useLocale.test.ts) match
the reviewed working-tree blobs. Backend PRODUCTION source (excluding tests)
is byte-identical from `858dafb` through `b7969de`, so the retained
backend/worker/migration receipts apply unchanged for their recorded scopes;
correction 2026-10-12: the 858dafb→dcb2f49 leg is not fully identical —
`apps/api/src/scale-evidence-migration.test.ts` changed there (+142/−21), and
that test file's own receipt is recorded at dcb2f49 (GAP-119 thirteenth
repair, 8/8). The blanket "backend byte-identical" wording originally written
here was too broad; see the scope correction in
050B-acceptance-reconciliation-2026-10-11.md.

Acceptance reconciliation complete: criterion-to-evidence matrix for the
frozen 050B contract in
[050B-acceptance-reconciliation-2026-10-11.md](050B-acceptance-reconciliation-2026-10-11.md)
— all criteria satisfied, none missing/contradictory. Disposition: **050B
child CLOSED** (implementation + live acceptance + separate reviews complete).
**GAP-120/121/122/123 CLOSED** (closure checks observed; UI surfaces close
with reviewed commit b7969de). **GAP-119 CLOSED** (its closure criteria —
real API/worker race/negative proofs, S2 recovery/migration checks, localized
author-flow acceptance, separate exact-diff review — are satisfied; umbrella
seams implemented through 050B). **GAP-039 remains OPEN** (retains 050C,
integrated author-workflow acceptance with S3, and the author-owned human
screen-reader pass). Commit is done; push/deployment remain author-gated and
were not performed.

Supersedes the "Still open: commit" note in the acceptance entry below.

## NF-WF-050B live author-workflow acceptance — 2026-10-11, dcb2f49 + uncommitted acceptance WIP

Live browser acceptance of the 050B author workflow executed on Windows 11
against the owned disposable stack (API :3000, web :3001 Nuxt dev, worker with
workflow-runs/memory-rebuild/publication/notifications queues on Redis
`nf-redis-acceptance` :6399, PostgreSQL `nf-pg-5433`/`novelforge_acceptance_050b`,
9Router gateway :20127). Baseline revision dcb2f49 (GAP-119 thirteenth repair,
committed with recorded 8/8 verification and separate APPROVE review). The
working tree additionally carries the applied stash `nf050b-acceptance-wip`:
GAP-120 (novel workspace page 500 — 12 unresolved template components) and
GAP-121 (SCALE review i18n key-path mismatch, ~100 call sites) fixes with
updated suites (web vitest green), plus a GAP-122 record and its reviewed
reader-routing repair. These changes are uncommitted. Separate exact-diff
reviews (2026-10-11): GAP-121 portion APPROVE (real-dictionary parity guard
added); GAP-120 portion CHANGES_REQUESTED on process only — the two
import-export guard files are outside the frozen allowlist and are covered
by scope-amendment proposal 23–25 (bounded re-review APPROVE; retrospective
record in GAP-119 — the amendment process requires no separate author
approval). Commit awaits the author's existing authorization
policy.

Scenario disposition (correction 2026-10-11, separate outcomes per contract;
evidence kind in parentheses — browser UI, API, worker log, runtime dictionary;
API-assisted fixture/policy setup is identified as such and is not UI
evidence; raw worker-log excerpts keep their source timestamps and are
persisted excerpts, not independently re-run checks):
1. Registration + session (fresh disposable author) — VERIFIED (browser UI).
2. Version-bound SCALE evidence entry through the SCALE review panel
   (server-validated UTF-16 span + exact saved-HTML quote) — VERIFIED
   (browser UI).
3. HARD policy init — VERIFIED (API setup: pinned API PUT with
   `authorDecision: APPROVE`, recorded as an approved standing-change
   proposal).
4. Incomplete HARD assessment renders INCOMPLETE with STALE_EVIDENCE_SET
   guidance (explanation, hypothetical example, next action) and blocks
   publication (HTTP 409 `SCALE_ASSESSMENT_INCOMPLETE`, chapter stays DRAFT)
   — VERIFIED (browser UI + API).
5. SOFT flip via full-pin CAS makes the same input advisory and publication
   succeeds — VERIFIED (browser UI + API).
6. Author decisions: approved a standing change (TOWN/55 applied), rejected
   one (no state change), recorded ALTERNATIVE (successor proposal created,
   original preserved) — VERIFIED (browser UI).
7. Exception proposal on a stale set refused 409 with no writes — VERIFIED
   (API).
8. Published chapters refuse text edits (immutable); chapter-version-scoped
   evidence/receipt recovery verified on a draft's v2 (clean slate, no stale
   inheritance, fresh NO_OPERATIVE_CONFLICT) — VERIFIED (browser UI + API).
9. Reader visibility — VERIFIED (API + browser UI; corrected 2026-10-11).
   Public API: anonymous
   `GET /api/public/novels/<slug>/chapters/N` → 200 with pinned published
   content for chapters 1–3 and 404 for unpublished/draft (API,
   independently re-runnable). Reader UI was BLOCKED at evidence time by
   GAP-122 (`NUXT_E4016`; `/read/:slug` rendered only the novel overview).
   After the contract-reviewed GAP-122 repair, scenario 9 was re-run in
   the real browser against the live acceptance stack: overview renders,
   pinned chapter bodies render (v1/v2), direct load and refresh work,
   previous/next and back navigation work, unpublished chapters show the
   localized not-found surface with no content leak, id locale renders
   localized reader chrome, console free of `NUXT_E4016` and
   component-resolution warnings. The re-run surfaced a pre-existing,
   separately-owned hydration defect, recorded as GAP-123 (out of the
   GAP-122 contract scope).
10. en/id locale switch renders localized workspace and SCALE strings with
    canonical machine values untranslated — VERIFIED (browser UI). English
    per-key fallback verified at the runtime dictionary and `t()` mechanism
    level only (`review.showFullHash` missing in `id`, resolved from `en`) —
    this is NOT a complete browser fallback journey and must not be cited as
    one. (2026-10-11 follow-up: one real browser fallback case — the id
    workspace SCALE panel rendering `Show full hash` from `en` — was later
    witnessed during the GAP-123 verification; this acceptance-time caveat
    otherwise stands.)
11. Scheduled publication through the real BullMQ worker — VERIFIED (worker
    log; the verbatim excerpt in `050B-live-acceptance-evidence-2026-10-11.md`
    is a persisted excerpt with source timestamps, not an independently
    re-run check): scheduling conservatively stales 050A data (two
    deterministic refusals `outcome:refused code:REVIEW_STALE`, no public
    flip, audit retained), then a post-schedule fresh review let the same
    publicationId publish at due time (`outcome:published` 113 ms after
    `scheduledFor`; public API serves the pinned content anonymously; draft
    chapters 404 — API checks).

Defects found during the journey: GAP-122 (recorded at evidence time as
not-repaired: `/read/:slug` did not render `<NuxtPage />`, so the nested
chapter reader route never displayed chapter bodies, `NUXT_E4016`) has
since been fixed by the separately contracted and reviewed reader-routing
repair described under scenario 9; its entry carries the browser closure
evidence. Still recorded but since REPAIRED (2026-10-11, separately contracted under
`tasks/GAP-123-ssr-safe-locale-repair.md`; final exact-diff review
**APPROVE** — frozen diff sha256 `926b5f5fb59e8b4edc9effeba77974ac7fe5198d2c011bfa5ae3e862f48e84e4`,
4 info findings, no blockers): GAP-123 — locale hydration mismatch (en server HTML vs
localStorage-selected id; `useLocale` kept the locale in localStorage,
invisible to SSR). Fix: Nuxt `useState` request-scoped locale + `nf-locale`
cookie + post-hydration localStorage migration; browser re-verified in en
and id on the reader and workspace with no hydration warnings, storage
failure hardening and the real `Show full hash` en-fallback witnessed in
the id UI. **Follow-up (2026-10-11, post-APPROVE):** an external re-review
found four defects in the applied repair (unused `ref` import failing
ESLint; legacy-`en` migration never completing because the callback
returned on `legacy === state.value`; per-consumer `onNuxtReady`
registration defeating once-per-load; a synchronous test stub masking the
hydration deferral) — recorded under GAP-123 before the workaround. The
bounded amended-contract repair is applied: once-flag
`useState("locale-migrated")` registers exactly one migration callback per
load; migration completes for both legacy values (cookie written even when
the value equals the locale); the test harness queues and explicitly
flushes `onNuxtReady` with pre-flush hydration assertions and call-count
proof. useLocale suite 18/18; ESLint exit 0 on both changed files; web
typecheck exit 0; affected reader/routing/GAP-121 suites 53/53; browser
legacy-migration path re-verified in en and id on the live stack (console
clean, cookie written for both legacy values, SSR HTML follows the
cookie). The earlier **APPROVE** covers only the earlier diff; the
follow-up got its own two-round separate review — round 1
CHANGES_REQUESTED (HIGH mechanism claim empirically disproven, fragility
accepted and fixed with an explicit `mockClear()`; LOW fixed with a
zero-legacy-reads assertion on the cookie-present path), round 2
**APPROVE** on the re-frozen diff `.git/gap123-followup-diff-20261011.patch`
(sha256 `03f3f964…387d6`, working-tree blobs `279ada86`/`4ada15b0` —
see the GAP-123 entry and contract trail); commit remains author-gated.
Raw scenario-11 worker-log excerpt and
reader-visibility
negatives persisted in
`docs/14-progress/050B-live-acceptance-evidence-2026-10-11.md` (disposition
review APPROVE; two minor findings, both addressed).

Still open: commit per
the repository authorization policy (scope
amendments 23–25 are recorded, retrospective and separately reviewed —
no amendment-level author approval applies; the GAP-123 repair carries
its own APPROVE exact-diff review). Final exact-diff review of
the frozen tree
(22 files, sha256 `66f1a3b091a80f382284b30978933cbaf3011b44d8b2f0776cd3c115a4eefb54`,
`.git/nf-050b-final-freeze-20261011.patch`): **APPROVE** (2026-10-11,
freeze_verified true; 3 info findings, no blockers); edits made after that
freeze are limited to status lines recording this verdict. GAP-119 and
GAP-039 remain OPEN with their retained closure criteria (050C, integrated
author-workflow acceptance, human screen-reader pass). Not pushed; no
production deployment.

## GAP-119 twelfth repair + fresh Windows acceptance — 2026-10-11, 858dafb

At exact e40adc9, the Windows-host acceptance rerun surfaced a deterministic
EPERM in `apps/api/src/scale-evidence-migration.test.ts` — the unrepaired
sibling of the awaited-cleanup fix committed in e40adc9. Standalone probes
measured the Prisma CLI child's ~400–500 ms cwd-handle release latency and
reproduced the failure mode exactly; the fix ports the proven sibling
pattern (awaited, symlink-guarded, transient-code retry; per-home error
collection). A separate read-only reviewer verified the frozen diff
byte-identical to the working tree and returned APPROVE_WITH_FINDINGS with
two non-blocking low findings (recorded in GAP-119). Committed as 858dafb
on main (parent e40adc9). Not pushed.

Fresh acceptance evidence at 858dafb content (= e40adc9 + this test-file
fix), Windows 11 / Node v24.14.1 / pnpm 12.5.1 / PostgreSQL 16.15 at
127.0.0.1:5433 (host/port overridden from repo .env via shell env; .env
untouched): restore-scope 8/8; SCALE core 76/76 ×2 (32+36+8); API
regression 170/170 (scale-evidence 47, manuscript 21, narrative 53,
publication 17, state-consumers 32 — the eleventh-repair fixture failures
no longer reproduce); worker trio 28/28; remaining 12 scale API files
58/58 (filename correction: `scale-context-gate-agreement.test.ts`, not
"ctx-gate-agreement"); UI ×5 39/39 (--maxWorkers 1, jsdom evidence only);
prisma generate+validate pass; all four typechecks exit 0; changed-source
ESLint exit 0 (`final-text-review-gate.ts` lives under
`packages/ai-services/src/`, correcting the earlier apps/api path);
`git diff --check` clean. Pre-fix failed runs left one temp home each; all
owned leftovers were removed only after post-fix cleanup was verified
across 5 runs with zero new leftovers.

Not yet evidenced (separate gates, unchanged): live author/browser workflow
in en/id with fallback; real isolated BullMQ queue delivery. GAP-039 and
GAP-119 remain OPEN; GAP-039 additionally retains 050C and integrated
author-workflow acceptance.

## Author-authorized 050B integration — 2026-10-09

The author authorized merging work/nf-wf-050b-scale-review through exact
800cf3707d488f88cbc2447d1d992f3aeb6d89bf into main parentd928653.
Both separate actors approve the resolved integration tree. Production/schema/
worker files match the reviewed branch; two documentation conflicts retain the
raw external acceptance receipt and accurate corrections. GAP-108 recurrence12
and13 now have distinct headings with their own historical evidence.

Fresh merged-tree proof:state-consumers32/32 and nine UI suites71/71 pass;
ai-services/API/worker/web typechecks and Prisma generation pass. The API fixture
was copied with only a unique scratch database name because its original fixed
target already exists. The owned database/copy were removed and final absence
verified; the existing database was not reset. No working migration or live
application deployment was performed. Prisma validation and corrected scoped
lint pass. Lint's first invocation failed on a nonexistent old API gate path;
GAP-119 records that command error and the successful shared-package retry.

Historical next-work list from the integration entry (superseded for item 1 by
the fresh evidence above; items 2–6 remain in dependency order):

1. Complete 050B's frozen merged-revision API/domain/worker/migration regressions
   on owned disposable targets. Record exact commands, counts and revision;
   historical external totals are not a replacement for this acceptance.
2. Verify the live SCALE author journey in en/id and fallback: evidence,
   incomplete HARD checklist, SOFT advice, approve/reject/alternative, stale
   recovery, immediate publication and isolated scheduled queue delivery.
   Close child acceptance only with the required evidence and separate review.
3. Draft and separately review 050C's optional S3 contract, then implement:
   off-by-default per-novel enablement, bounded pinned extraction/missing-data
   suggestions, structured evidence validation, author decisions and NF049
   usage/model attribution. No automatic canon/standing approval. 050C is not
   yet a dispatch-ready contract; GAP-039 stays open through integrated acceptance.

4. Perform the author-owned GAP-051 human screen-reader audit. Automated axe
   results cannot complete that gate.
5. Complete live gateway/storage/service credentials and working additive
   migration preflight, then fresh release regression/load/recovery evidence.
   Historical NF039/NF048 checks do not prove the new merged release. Record
   approved performance/resource/recovery targets; no local LLM quota enforcement.
6. Obtain the author's explicit production deployment approval after release
   gates pass. Integration is not deployment authorization.

Correction (2026-10-14): items 1–3 of this list are CLOSED (fresh merged-tree
acceptance; 050C implemented/live-accepted 2026-10-12/13); item 4 (GAP-051) is
author-deferred, not scheduled; items 5–6 are re-anchored to HEAD 50609c0 +
working-tree hashes with no commit prerequisite.

Separate maintenance remains:GAP-029 resolver duplication/synchronization,
GAP-014 chronology attribution, GAP-013 serving-model evidence where required,
and per-host GAP-027/GAP-108 readiness/recovery. GAP-023/NF002E stays blocked on
a real consumer design; do not build a speculative event outbox. GAP-021 is
per-boundary, correcting the earlier blanket claim here: 2026-10-09
boundaries had no runtime binding (file fallbacks); 2026-10-11 boundaries
restored it and wrote attributed Engram checkpoints (GAP-122/GAP-123
APPROVE); the current GAP-123 follow-up boundary again reports no identity,
so no attributed save is claimed for it and CURRENT is its fallback
handoff. Do not redispatch integrated NF048/049 or050A/050B code.
GAP-018/GAP-117/GAP-063 retain their bounded CLOSED receipts; GAP-039/GAP-119
remain OPEN pending the retained acceptance scope. Older dispatch notes below
are historical and superseded by this integration update.

## External 050B eleventh repair re-review — 2026-10-09, 800cf37

Separate technical and recovery actors APPROVE the fixture source at exact
800cf3707d488f88cbc2447d1d992f3aeb6d89bf against 9f51c4a. Production code,
schema and worker behavior are unchanged. Valid empty access and strict fresh
review after status/head changes are preserved; negative refusal checks remain.

Fresh Windows verification: state-consumers 32/32, API typecheck, scoped ESLint,
submitted diff whitespace and Prisma generation pass. To preserve the existing
novelforge_test_stateconsumers database, a temporary copy differed only in its
database name (novelforge_test_050b_review_800cf37, verified absent before use).
The owned database and copy were removed afterward; the existing database remains.
This is namespace-adjusted fixture execution, not execution of the unchanged
fixed-name harness against the author's database.

GAP-119 below corrects two documentary defects in the submitted annotations:
putScalePolicy changed materially, and GAP-108 recurrence13 must not absorb
recurrence12's narrative. The external aggregate report remains documentary
evidence without literal execution commands. Earlier backend146/146, migration2/2
and UI71/71 receipts are historical checks, not fresh reruns for this revision.

The two previously failing fixture paths are now locally verified; no production
source blocker was found. The bounded repair can be integrated with these
documentary corrections. Full050B completion, live author/browser acceptance,
BullMQ delivery and release gates remain separate; GAP-039/GAP-119 remain OPEN.
Main/client restored at bc9a140. No implementation merge, commit or push performed.
Engram attribution unavailable (GAP-021); this record is the fallback handoff.

## External 050B tenth repair re-review — 2026-10-09, 9f51c4a

UI fixture/comment changes APPROVE on exact
9f51c4a221362aa36e037ddc103c89b6a63cc711. Both separate reviewers confirm no
backend/recovery/schema changes from approvedf0cd711. Fresh local nine-suite UI
run71/71 passes with --maxWorkers1; web typecheck, Prisma generation and submitted
diff whitespace pass. Source no longer has the two NarrativePanel fixture
failures. Main remains276c48c; no merge or full050B completion.

Overall acceptance still requests changes: the external Ubuntu report records
two failing state-consumers tests. Reviewers trace both to fixtures inconsistent
with frozen050B: empty access is valid; status head changes require fresh review.
Repair the malformed payload/required-author-context fixtures and review flow,
preserving negative error assertions. Do not enforce nonempty access, exempt
status changes from freshness or request another author product decision.
GAP-119 records exact corrections and closure checks.

The external report also needs corrected counts (exception-strict has8 active
tests, not7), reconciled totals/raw commands, clarified pre-existing scratch
ownership/recreation and correction of the false claim that narrative.ts never
changed during repairs2–10. Ubuntu results are external claims, not fresh local
DB evidence. No databases were reset in this turn; existing data preserved.
Backend tests were not rerun because backend is byte-unchanged fromf0cd711;
the previous146/146 and migration2/2 remain historical receipts.

Main checkout/client restored; no additional implementation edits. UI remains
mock/jsdom with canvas warnings, not a live browser acceptance. Queue delivery,
full frozen regression closure and release gates remain separate. GAP-039/
GAP-119 stay OPEN. Engram attribution unavailable (GAP-021); this is the fallback
handoff. No commit/push or implementation merge performed in this review.

## External 050B ninth repair re-review — 2026-10-09, f0cd711

Both independent reviewers APPROVE exact source
f0cd71123dca62883fc4981b82fe9401cf0e2a69; no remaining source blocker found in
the assigned paths. Malformed non-null proof now fails closed in gate/context;
genuine historical-null handling stays separate. Amendments21/22 and worker20
actual-byte receipts match submitted hashes. Main remainsb622607; no merge.

Overall acceptance still requests changes: expanded required UI checks expose
two stale NarrativePanel fixtures. The suite expects four tabs and selects
Readouts at index3; SCALE adds a fifth tab and moves Readouts. Select Readouts
by label, assert SCALE reachability and preserve drama payload/result checks.
Update the stale four-tab/no-SCALE header comment too. These are already allowed
paths. Reviewer verified unchanged drama handler/template against main; no
production drama regression is claimed. GAP-119 records exact failure evidence.

Fresh resumed verification:17 backend/domain/worker suites146/146 pass; isolated
migration2/2 pass with120s timeout. Expanded UI9 suites: initial run selects no
tests due nine fork-worker startup timeouts; --maxWorkers1 retry runs71 tests,
69 pass and2 stale fixtures fail. All four package typechecks, Prisma
generate/validate, explicit two-path production ESLint and submitted whitespace
pass. UI remains mock/jsdom with canvas warnings. No all-green UI or full050B
completion is claimed. Other broad DB regression targets already exist with
unverified ownership; they were not reset. Browser/queue acceptance stays separate.

Fourteen current owned scratch names were absent before resumed tests (the
interrupted owned migration scratch was first dropped), and final absence
verified after cleanup. Existing unrelated databases preserved; tracked migrations
unchanged; main/client restored. Earlier EPERM did not recur; no harness repair
claimed. GAP-039/GAP-119 stay OPEN pending fixture repair and frozen acceptance.
Login interruption lost process handles; fresh runs supply this evidence.
Engram attribution unavailable (GAP-021); this is the fallback handoff. No
commit/push or implementation merge performed in this review.

## External 050B eighth repair re-review — 2026-10-09, 97da59c

CHANGES REQUESTED by both separate reviewers on exact
97da59c1e4c5497f0329d4f9c22de837e54289d0. Main remainsaf9450c; no merge.
New no-SCALE reviews now emit pinned NOT_CONFIGURED; context errors propagate.
Both proposal/outcome workspace fields are validated. Historical null receipt
head checks and recovery/CAS remain intact. Remaining source issue: malformed
non-null proof parses to null and can enter legacy approval when no SCALE rows
exist. Reserve legacy compatibility for actually null stored proof; reject
non-null parse failure as REVIEW_STALE. GAP-119 records regression and scope
requirements, including two new test paths and a changed worker review hash.

Fresh local:17 selected backend/domain/worker suites144/144 pass; isolated
migration2/2 pass with --testTimeout120000; UI38/38 pass. All four package
typechecks, Prisma generate/validate, explicit three-path production ESLint and
submitted diff whitespace pass. Prior Windows EPERM did not recur; the migration
harness is unchanged, so this is a passing run, not proof of a portability fix.
UI remains mock/jsdom with canvas warnings; workers use direct fire calls,
without BullMQ delivery. No live browser workflow or deployment performed.

Fourteen scratch database names were absent before tests and finally absent
after cleanup (two suites self-clean). Tracked migrations unchanged; main/client
restored. External Ubuntu service-loss evidence is GAP-108, not this host's
readiness. GAP-039/GAP-119 remain OPEN. Next: malformed/non-null boundary fix,
exact scope/hash regularization and separate review. Engram attributed writes
remain unavailable (GAP-021); CURRENT is the fallback handoff. No commit/push
or implementation merge performed in this review.

## External 050B seventh repair re-review — 2026-10-09, 88883c4

CHANGES REQUESTED by both separate reviewers on exact
88883c4f589768cd45bd51bc33a70d600b833d7f. Main remains260e9a8; no merge.
Strict exception payload/coverage validation is shared by producer/gate/context.
Immediate-publication route and configured-SCALE worker positives/refusals now
have real caller tests. Recovery guarantees and earlier protocol/UI fixes remain
intact; the old worker hash is annotated and exact-artifact re-review matches.

Remaining: new no-SCALE reviews still write null (legacy) instead of pinned
NOT_CONFIGURED, allowing subsequent head changes to evade the new-proof gate.
Strict exception provenance omits proposal/outcome workspaceId. Three added test
paths lack scope amendments. GAP-119 records the source evidence and closure
tests; these source traces are not observed normal API exploits.

Fresh local selected run:137/139 backend/domain/worker tests pass; both migration
tests time out at30s. Isolated migration rerun with120s timeout:1/2 pass; populated
upgrade test fails in Windows temp cleanup with EPERM. No wholly green migration
receipt is claimed. UI38/38, ai-services/API/worker/web typechecks, Prisma
generate/validate, four changed-production-path ESLint checks and submitted diff
whitespace pass. UI remains mock/jsdom with canvas warnings. Worker tests call
the real fire function without Redis/BullMQ. Raw policy-update race evidence is
not a production S2 mutation serialization proof.

Twelve owned scratch database names were absent before testing, disconnected
and dropped; final absence and unchanged tracked migrations verified. Main/client
restored. Locked temporary directory050b-mig-89U7iM remains under this host's temp
folder; no unsafe recursive cleanup or working-data reset attempted. GAP-039/
GAP-119 stay OPEN. Next: pinned new no-SCALE receipts, workspace provenance,
scope amendments and clean migration verification, followed by exact-diff review.
Engram attribution unavailable (GAP-021); this is the fallback handoff, not a save.
No commit/push or implementation merge performed in this review.

## External 050B sixth repair re-review — 2026-10-09, 64168cd

CHANGES REQUESTED on64168cdba61cbe5c72f57739c0bf458d6c492028.
review_mutations_034 verifies the three previous repairs but finds malformed
retained exception coverage is still trusted. review_recovery_034 approves
assigned recovery source pending fresh checks. Main remains829613d; no merge.
Complete protocol recomputation is shared by gate/context, normal successful
review now refreshes coherent context, and actual status routes/save race and
scheduled worker function have new acceptance tests. Recovery/CAS remains intact.

GAP-119 records one remaining source blocker: an approved historical exception
with duplicate claimIndices:[0,0] can supply coverage because both writer and
gate resolver only check integer arrays. Use one strictly validated resolver
for producer/gate/context and reject malformed provenance/coverage. This is
source tracing of corrupted retained data, not an observed normal API exploit.
The worker-test amendment hash differs from the submitted blob; annotate and
re-review actual bytes. Immediate publication and configured-SCALE worker
positive acceptance remain unevidenced in these new suites.

Fresh local checks:123/123 backend/domain/migration tests and38/38 component/axe
tests pass without skips. ai-services/API/worker/web typechecks, Prisma
generate/validate and submitted diff whitespace pass. Explicit six-path ESLint
run has no errors, but ignores ScaleReviewPanel.vue with a configuration warning;
this is not Vue lint proof. UI remains mock/jsdom with canvas warnings. Worker
tests execute fireScheduledPublication directly, without Redis/BullMQ delivery.
No live browser workflow or immediate publication proof is claimed.

All nine scratch database names were absent before tests, disconnected and
dropped (one suite self-cleans); final absence verified. Tracked migrations
unchanged; main/client restored. GAP-039/GAP-119 remain OPEN. Next: validated
retained exception resolver, caller positives/remaining frozen acceptance and
correct exact scope receipt, followed by separate review. Engram attribution
remains unavailable (GAP-021); this is the fallback handoff, not an Engram save.
No commit/push or implementation merge performed in this review.

## External 050B fifth repair re-review — 2026-10-09, 33db685

CHANGES REQUESTED on exact33db68512d786273c5ce6c368346162fe25d48b4.
review_mutations_034 found incomplete retained-proof/live assessment validation
and two context/UI wiring defects. review_recovery_034 approves assigned recovery
source subject to fresh checks and scope acceptance. Main remains d549887; no
implementation merge. Empty access, HARD reasons, superseded mutation refresh,
context-derived checklist and two shared-gate negative cases are repaired.
Actual old-JSON restore, pre-change checkpoint contents and transactional CAS
repairs remain intact.

Remaining: a matching-pin WITHIN_REACH receipt with empty claims can pass HARD
gate checks despite absent evidence (also stale evidence/malformed standing).
This is a traced source path, not an executed exploit. Reuse one complete
deterministic producer/live protocol comparison in both gate and context
applicability instead of adding individual state exceptions. The context endpoint
currently omits even the new live-state validator. A normal successful review
also fails to refresh its receipt/checklist, retaining old ABSENT/STALE guidance.
GAP-119 records fixes and negative/deferred acceptance requirements.

Fresh local selected checks:108/108 backend/domain/migration tests and34/34
component/axe tests pass, without skips. ai-services/API/worker typechecks,
Prisma generate/validate and submitted diff whitespace pass. The DB-backed gate
suite calls the shared helper; it does not execute direct status transition,
immediate publication or scheduled worker. UI remains mock/jsdom with canvas
warnings. No web typecheck/lint or live browser acceptance is claimed.

All five owned scratch database names were absent before tests, then dropped
after connections closed; absence and unchanged tracked migrations verified.
Main/client restored. Proposed scope records now describe additions through12,
but generic actors and uncommitted input revisions do not identify exact reviewed
content; retain external attribution as a claim pending traceable review.
GAP-039/GAP-119 remain OPEN. Engram attribution is unavailable because the runtime
hook supplied no authoritative session identity (GAP-021); this is the fallback
handoff, not an Engram save. No commit/push or merge performed in this review.

## External 050B fourth repair re-review — 2026-10-09, 8ccb504

Overall CHANGES REQUESTED on exact external
8ccb504b2440febb0751e2a41555d8c6d96ebd4e. review_mutations_034 requests changes;
review_recovery_034 approves recovery/source conditionally on local checks and
scope regularization. Main remains9c1d323; no implementation merge. Actual
old-JSON STORY restore and captured pre-change checkpoint contents are now
exercised. Direct policy current-version locks, coherent RepeatableRead context,
head-scoped exceptions, stricter parsing and read-response sequencing improved.

GAP-119 records remaining empty-access UI rejection, missing HARD reason
validation, late successful mutation reconciliation, false-complete checklist,
retained state versus live evidence mismatch, and incomplete amendment coverage.
These are source findings; no executed exploit or observed HTTP500 is claimed.

Fresh local selected checks:90/90 backend/domain/migration tests and25/25 UI
component/axe tests pass without skips. ai-services/API/worker typechecks,
Prisma validation, generated client and submitted diff whitespace pass. UI
proof remains mock/jsdom; canvas warnings occurred. No web typecheck/lint,
live browser author flow or publication API/worker race proof is claimed.

All four dedicated scratch databases were absent before tests and dropped
after connections closed; absence and unchanged tracked migrations verified.
Main checkout and its generated Prisma client restored. GAP-039/GAP-119 remain
OPEN. Next: repair every remaining boundary with negative/deferred regressions,
regularize exact extra paths through separate review, and submit a new exact
revision. Engram attribution remains unavailable: the runtime hook supplied no
authoritative session identity (GAP-021). This is the fallback handoff, not a
saved Engram checkpoint.

## External 050B third repair re-review — 2026-10-09, e6b6305

CHANGES REQUESTED by separate actors review_mutations_034 and
review_recovery_034 on exact external e6b630565c59131c3035b95646fd5f0373dde480.
Main remains c45043d; no implementation merge. Transaction-bound audits,
proposal locks/current-version refusal, decision chapter scope, returned head,
receipt serialization and evidence rendering are verified repairs. GAP-119
records remaining direct-policy obsolete-version acceptance, incoherent context,
same-selection response races, incomplete retained-proof validation, raw JSON
decision authoring, and missing actual restore/pre-change snapshot evidence.

Fresh local checks: selected backend/domain/migration tests 59/59 and UI
component/axe tests 18/18 pass, without skips. ai-services/API/worker typechecks
and Prisma validation pass. Submitted whitespace check fails on four trailing
whitespace lines in the scope-amendment record. UI checks use mocks/jsdom;
canvas warnings occurred. Passing simulated restore tests do not establish
application checkpoint restoration. No web typecheck/lint, live browser flow
or API/worker publication race proof is claimed.

Both disposable database names were confirmed absent before testing, then
dropped after connections closed; absence and unchanged tracked migrations were
verified. Main checkout and its generated Prisma client are restored. Scope
amendments remain proposals requiring genuine separate review; the submitted
implementer-authored record does not independently approve them. GAP-039 and
GAP-119 remain OPEN. Engram attributed writes remain unavailable because the
runtime hook supplied no authoritative session identity (GAP-021); this record
is the fallback handoff, not a saved Engram checkpoint.

## 050B third repair dispatch — 2026-10-09

The author authorized publishing the separately reviewed761ce1d rejection
receipt and requested the next external prompt. Both technical actors request
changes; review_mutations_034 APPROVE the scoped CURRENT/GAP-119 evidence
record. Fetch this main update into work/nf-wf-050b-scale-review. Complete
serial reviewed slices: transactional/backend correctness; real recovery/race
proofs plus valid fixture repair; then coherent typed UI/API and async behavior.
Address ALL latest GAP-119 findings, not merely the two failing tests. Preserve
accepted repairs and frozen contracts, regularize scope amendments with actual
separate review, and retain historical records with explicit corrections.
No implementation merge/050C/release approval is granted. GAP-039/GAP-119 stay
OPEN. Earlier no-commit/main70c3005 notes describe the review boundary. Engram
attribution is unavailable (GAP-021); these published docs are the handoff.

## External 050B second repair re-review — 2026-10-09, 761ce1d

CHANGES REQUESTED by both separate reviewers; main remains70c3005, no merge.
HIGH standing UUID and composed data transaction, stale quiet checks, decision
current-version/exception validation, malformed route errors, branch history
and claim/vocabulary repairs improved. GAP-119 now records remaining audit
rollback escape, incomplete direct policy pins, proposal/route source scope,
real evidence UI type mismatch, busy-state races, false-fresh context, shallow
retained protocol validation, omitted receipt serialization and old response head.

Fresh local selected checks:54/56 backend/domain/migration tests pass;2 fail
before intended boundaries because fixtures have invalid source quote/span and
sequence2 predecessor. Fix fixtures without weakening production validators.
Successful HIGH standing/direct approval tests now pass. UI component/axe6/6,
Prisma generate/validate and ai-services/API/worker typechecks pass; submitted
diff whitespace passes. No skips; canvas warnings occurred in jsdom. No web
typecheck/lint, real API/worker-race, saved UI flow or old STORY restore proof
is claimed. Migration preservation is NOT application checkpoint restoration;
the external old-snapshot claim must be corrected and the real test added.

Own scratch databases cleaned and absence verified; working data and migration
source preserved. Main/client restored. No source fix, merge, commit or push.
GAP-039/GAP-119 remain OPEN; scope amendments and required acceptance proofs
remain pending. Engram attribution unavailable (GAP-021); this is the fallback.

## 050B second repair dispatch — 2026-10-09

The author authorized publishing the separately reviewed709ba66 rejection
receipt and requested the next external repair prompt. Both source reviewers
request changes; review_mutations_034 APPROVE the scoped CURRENT/GAP-119
evidence record. Fetch this main update into work/nf-wf-050b-scale-review and
repair ALL remaining findings, preserving the frozen contract and historical
receipts. Required boundary proofs include a successful HIGH standing approval,
stale quiet-evidence refusal, obsolete-version/invalid-exception refusal, atomic
direct approval and the real saved-chapter UI/API flow. Passing current selected
tests is not acceptance of those untested boundaries. No implementation merge
or050C dispatch is authorized by this publication. GAP-039/GAP-119 stay OPEN.
Prior main/no-commit statements describe the review boundary. Engram attribution
is unavailable (GAP-021); these published records are the fallback handoff.

## External 050B first repair re-review — 2026-10-09, 709ba66

CHANGES REQUESTED by both separate reviewers; do not merge. Tenant ownership,
HIGH mutation plumbing, branch-aware policy writes and review verdict/re-review
repairs improved, but GAP-119 still records invalid UUID standing change-set ID,
stale quiet-evidence bypass, obsolete-version approvals, invalid exception
approvals and non-atomic direct approval. UI evidence/decision schemas and scale
vocabulary remain wrong; selection races, context applicability, branch history
and malformed-input handling still need correction. Required restore/approval/
concurrency proofs and independent amendment attribution remain incomplete.

Fresh local selected checks at exact709ba66:44/44 decision DB/private-migration/
assessor/domain/classification tests and6/6 component/axe tests pass, no skips.
Prisma generate/validate and ai-services/API/worker typechecks pass; submitted
diff whitespace passes. Canvas warnings occurred in jsdom. These passes do not
prove real saved-chapter UI, successful HIGH standing approval, old-snapshot
restore or real route/worker races; those checks were not run. Web typecheck
and changed-source lint were also not run.

Only owned scratch databases were used; both dropped and absence verified.
Working data/migration source preserved; main/client restored to b068227. No
merge/commit/push or source repair. GAP-039/GAP-119 stay OPEN; no 050C dispatch.
Engram attribution unavailable (GAP-021); this is the repair handoff fallback.

## 050B repair dispatch authorization — 2026-10-09

The author authorized publishing the reviewed rejection receipt and requested
an external repair prompt. Both technical reviewers reject external1ad5c47;
review_mutations_034 separately APPROVE the CURRENT/GAP-119 review documentation.
The receiving coordinator must fetch the published main documentation, merge it
into work/nf-wf-050b-scale-review without losing historical evidence, then repair
ALL GAP-119 findings against the frozen 050B contract. Obtain separate review
of bounded scope amendments before out-of-contract edits; preserve required
negative tests and acceptance criteria. Do not merge the implementation or
dispatch 050C. Verify the final repaired revision locally on that host.
Engram attribution is unavailable (GAP-021); these records are the handoff
fallback. Prior no-commit/main-fed3cea statements describe the review boundary.

## External 050B review — 2026-10-09, 1ad5c47

CHANGES REQUESTED by both separate reviewers; no merge. Main remains fed3cea.
GAP-119 records tenant history exposure, missing standing checkpoint/revision,
repinnable stale proposals, direct policy bypass, inconsistent review verdict/
fresh re-review refusal, incomplete exception pins and unusable/mismatched UI.
Repair the submitted code against the unchanged frozen contract, not the gate
requirements. Missing migration/restore proof and unreviewed scope additions
also require correction. GAP-039 and GAP-119 stay OPEN; no 050C dispatch.

Local checks at exact1ad5c47: Prisma generate/validate and25/25 selected pure
assessor/domain/classification tests pass;5/5 panel/component axe tests pass
with jsdom canvas warnings. ai-services/worker typechecks pass; API typecheck
fails TS2339 in scale-decisions.test.ts554/555/558 (untyped alternative proposal).
Submitted diff whitespace passes. No DB-backed gate/decision/migration tests,
old-snapshot restore, web typecheck or full release verification was run. These
limited passes do not prove the required author/API/worker workflow.

No working database or source changes, no scratch resources created. Main
checkout restored; no merge/commit/push. Engram attribution is unavailable
(GAP-021); these local review records preserve the next repair handoff.

## 050B external dispatch preparation — 2026-10-09

The author authorized commit/push of the separately reviewed 050B contract and
requested an external implementation prompt. The accepted task/ADR manifest
below remains unchanged. Publish this documentation as the dispatch baseline;
the receiving coordinator must verify the actual fetched commit and record its
implementer/separate reviewer assignments before any code edits. Use a dedicated
050B branch, native Ubuntu preflight and the task's serial reviewed slices.
No 050B implementation, feature test or release acceptance is claimed. GAP-039
and GAP-119 remain OPEN; 050A is not redispatched and 050C remains separate.
Engram attribution is unavailable (GAP-021); this is the publication handoff
fallback. The prior no-commit note describes the earlier contract-review turn.

## 050B technical contract accepted — 2026-10-09

[NF-WF-050B](../../tasks/NF-WF-050B-scale-review-and-author-decisions.md) is READY
for runtime implementer assignment, not implemented. Both separate actors
review_mutations_034 and review_recovery_034 APPROVE the contract and reviewed
ADR-0016 amendment against baseline `a0010c2`. Their initial findings were
resolved in the design: scoped parent cleanup/required rollback proof, checked-out
branch policy revisions, explicit headless no-write refusal and independently
paginated pending proposals. No feature tests, schema changes or migration runs
occurred in this contract-review task.

Frozen review manifest (working file bytes, SHA-256; this record is outside the
artifacts it hashes):

- `tasks/NF-WF-050B-scale-review-and-author-decisions.md`: `B6A44390D2485D90A62C23B971E0B1039DB177A4F412D970D2C4A78AA78ABE45`.
- `docs/adr/ADR-0016-scale-evidence-and-author-decisions.md`: `1909A48A9B958C787F76FCBF678528E106165F079192B30D764922ECDC917C52`.

The next slice is reviewed additive storage/context interfaces, followed by S2
decisions + deterministic review/shared API-worker gates and then localized UI.
Hard incomplete data holds separately from proved violations; exceptions cannot
fill missing data or bypass canon. Preserve 050A strict head staleness, requiring
explicit fresh assessment/review after head-changing actions. 050C still owns
optional AI calls; GAP-039 and GAP-119 stay OPEN until implementation acceptance.

Documentation verification: task/ADR local links resolve, Markdown fences and
whitespace checks pass; code remains `a0010c2`. No commit/push in this turn.
Engram attribution remains unavailable (GAP-021); this is the fallback checkpoint.

## 050A integration accepted — 2026-10-09

The author authorized integration of reviewed external `d78afc3`. Merge
`843a263` includes that submission and the separately approved historical
receipt correction. Product source, schema, migrations and package configuration
are byte-identical to the reviewed submission; only evidence documentation differs.
The prior local 64/64 receipt remains scoped pre-merge evidence, not a new run.
Post-merge Prisma generation/validation, ai-services/API typechecks and 15/15
pure SCALE/restore tests pass.
No working database migration or production deployment occurred.

050A is IMPLEMENTED / REVIEWED for the S1 API/storage foundation only. GAP-118
is CLOSED for the reviewed submission defects and migration-test isolation;
GAP-039 remains OPEN. Next: draft and separately review the bounded 050B
technical contract before implementation; 050C remains subsequent optional S3.
Older no-merge/READY instructions below are historical. Engram attribution is
still unavailable (GAP-021); this is the durable fallback checkpoint.


## External 050A fourth repair verification — 2026-10-09, `d78afc3`

Separate technical reviewers APPROVE the isolation fix and unchanged service
repairs. Local parallel migration/API verification passes64/64, no skips
(API47, migration2, classification8, pure SCALE7). Prisma validate/generate,
ai-services/API typechecks, changed-source lint and diff whitespace pass.
Empty/populated upgrades use private copies;41 baseline Prisma ledger checksums
and seeded data remain unchanged when050A becomes migration42, with no backfill.

A separate private-copy fault injection reached PostgreSQL42883 in050A.
Live repository migrations remained unchanged after successful suites and
the injected failure; all owned scratch databases were removed and absence
verified. The initial standalone fault probe failed before reaching its injected
SQL and is not counted as proof; a corrected retry reached the expected failure.
Windows symlink setup was exercised successfully. Manuscript suite was not
rerun locally; its external21/21 remains reported evidence only. No working DB
migration, full-release verification or production deployment is claimed.

One documentation correction was prepared locally: restore the historical
third-repair receipt and5/5 RED to GREEN report deleted in the submitted diff.
It is archived under GAP-118 with superseded/not-local-evidence attribution.
Preserve that archive during integration. The technical submission is ready
for integration with this correction; main remains7c73a1e and no merge has
occurred. GAP-039/050B/050C remain separate. Main Prisma generation restored;
Engram attribution unavailable (GAP-021), so these records are the fallback.

## External 050A third repair review — 2026-10-09, `aab13e5`

No merge accepted; main remains `c957e99`. Both separate reviewers confirm
the predecessor checks, active held-lock regression, genuine Prisma-ledger
assertions and migration-test scope amendment address the earlier findings.
They request one remaining correction: migration-test source isolation.

Fresh local checks at the exact submitted revision:62/62 selected tests pass,
none skipped (SCALE API47, restore classification8, pure SCALE7). Prisma
validate/generate, ai-services/API typechecks, changed-source lint and submitted
diff whitespace checks pass. Manuscript suite was not rerun. The migration
suite was deliberately not executed locally: its populated proof temporarily
moves the tracked050A directory out of the shared repository migration tree.
Other suites could deploy incomplete history; interruption can leave source
files displaced. Its reported remote2/2 passes are not local migration evidence.

Next: use private temporary schema/config/migration copies for baseline and
upgrade deploys, keep repository migrations untouched, and prove concurrent
execution with the API suite plus ledger/data preservation. GAP-118 stays
OPEN / P2; GAP-039 and dependent050B/050C acceptance remain open.
The owned API scratch database was removed and absence checked; main checkout
and Prisma client generation restored. Working data preserved. Engram binding
remains unavailable (GAP-021); this record is the fallback checkpoint.

## External 050A second repair review — 2026-10-09, `e49254f`

Both separate reviewers request changes; no merge accepted. Main remains
`23261fb`. Authoritative locking reads, retained quote/span validation,
ownership404 ordering and strengthened restore/delete/parent tests are repaired.

Fresh local checks at the exact submission:58 passed/1 skipped across59 selected
tests (SCALE API41/42, migration2/2, classification8/8, pure SCALE7/7).
Prisma validate/generate, ai-services/API typechecks, changed-source lint and
diff whitespace checks pass. The required held-head-lock regression is the
skipped test; its harness creates a revision through a second connection while
holding the branch lock required by that revision's FK. This is not accepted
as proof that the repaired CAS is safe. Manuscript suite was not rerun.

Owned-scratch probe: an otherwise valid sequence2 assessment referencing
another novel's sequence1 predecessor was returned CURRENT, and append extended
that corrupt chain to sequence3. Retained predecessor validation checks only
null/non-null, not exact scope/version/sequence; GAP-118 remains OPEN.

The populated migration test compares data hashes after applying historical SQL
directly; it does not preserve/verify Prisma migration ledger checksums or prove
populated Prisma deploy. The new migration test path also needs a reviewed task
scope amendment. Neither missing proof is waived by reported remote approval.
Both owned scratch databases were dropped and absence verified; main checkout
and Prisma client generation restored. Working data preserved. Engram binding
remains unavailable (GAP-021); this record is the fallback checkpoint.

## External 050A re-review — 2026-10-09, submission `5a465a1`

Fetched the repaired branch after its merge of `209a911`. Both separate
reviewers still request changes; no merge accepted. Main remains `209a911`.
Service capabilities, original fixture errors, strict write fields, pagination,
RepeatableRead current reads and timestamp native-type parity are repaired.

Local verification at the exact submitted revision: Prisma validate/generate,
ai-services/API typechecks, changed-source lint and diff whitespace checks
passed. Scoped tests47/47 passed (SCALE API32, restore classification8,
pure SCALE7). Manuscript suite was not rerun: its fixed scratch database name
already existed on this host and was preserved. No full-release green claimed.

Additional owned-scratch probes established a waiting branch lock before
committing a new head: append accepted the stale null expectation and persisted
the old null source head. Another probe placed a schema-shaped claim with a
forged quote and out-of-bounds span into a retained row pinned to the real
head; readCurrent still returned CURRENT. Initial lock probe failed to establish
its barrier because PostgreSQL statistics were cached within the observer
transaction; clearing that statistics snapshot made the rerun deterministic.
These probes are separate from the submitted47 passing tests.

GAP-118 records remaining source and acceptance blockers. Required populated
migration proof is still missing; misleading repair-complete and after-lock
reread claims must be corrected. The owned scratch database was dropped and
absence verified; main checkout and Prisma generation restored. Working data
and the existing manuscript scratch database were preserved. Engram binding
remains unavailable (GAP-021); this/task history are the fallback checkpoint.

## External 050A submission review — 2026-10-09

Fetched `origin/work/nf-wf-050a-scale-evidence` at `80a772e`; not merged.
Separate reviewers `review_recovery_034` and `review_mutations_034` request
changes. GAP-118 records production defects and invalid acceptance fixtures;
the external assertion that only fixtures need repair is not accepted.
Main remains `0a60d4a`: READY denotes the reviewed contract, not accepted code.

Local Windows verification reused Docker PostgreSQL16.15/pgvector0.8.6 on
port5433. Prisma generation/validation, ai-services/API typechecks, changed
source lint and submitted diff whitespace checks passed. The scoped Vitest
run had37 tests:24 passed/13 failed (API9/22; domain/classification15/15).
Several expected400 tests fail to exercise the intended validator because
the fixture omits chapterVersionId. No full-platform green is claimed.

Direct probes in the owned scratch database reproduced VIEWER service writes
to an obsolete text version, history pagination returning sequences3 then1
instead of3 then2, and malformed stored evidence (`scale: ALIEN`) returned as
CURRENT. Headless multi-predecessor novel cascade cleanup passed this bounded
probe; broader populated/restore acceptance remains missing. The initial probe
setup omitted required creator fields and was corrected before these results.
One lint attempt was invalidated by checkout timing; rerun at the submitted
revision passed before returning to main. The owned scratch database was
dropped and absence verified; main Prisma client generation was restored.

Next: repair the submitted branch against the frozen contract, add missing
negative/recovery/migration proofs, obtain separate final-diff review, then
reconsider integration. 050B/050C remain dependent; GAP-039 remains OPEN.
Engram runtime attribution is unavailable (GAP-021); this is the file fallback.

## S1 technical contract — 2026-10-08

[NF-WF-050A](../../tasks/NF-WF-050A-scale-evidence-foundation.md) specifies
append-only author assessments tied to saved chapter prose, checked-out branch
and source head. Schema/API validation, independent assessment CAS, tenant/role
gates, retained recovery history and chapter-deletion conflicts are explicit.
Separate technical reviewers approved the contract, including a corrected
`/api` route prefix. 050A is READY; implementation, migration execution and
runtime tests have not started. Next: bounded 050A
implementation. GAP-039 remains OPEN; 050B owns HARD gates/UI/receipts and 050C
optional AI proposals. Engram attribution remains unavailable (GAP-021);
this record and the task are the fallback, not a claimed MCP checkpoint.

Frozen review manifest: `tasks/NF-WF-050A-scale-evidence-foundation.md`, SHA256
`0FC5FD9C9A8415BA413247119278DD07FD51A42D95F53C4CEC696C31D24E6E04`.
Separate reviewers: `review_recovery_034`, `review_mutations_034`. Scope is
technical contract acceptance only; local Markdown links and Git whitespace
checks passed. Migration and implementation need their own exact-diff review.

Architecture baseline: V2 with workflow delivery repair accepted in ADR-0013.
Implementation status: **backend/infrastructure slices across phases 0–9
exist; integrated product delivery remains PARTIAL**. Historical phase/test
results below describe their original scope, not completion of all retained
requirements. The AI Orchestrator is a milestone within Phase 3/4.

## Current dispatch — 2026-10-07 (novel-scoped workflow history repaired)

### SCALE direction recorded — 2026-10-08

Author selected S1 structured evidence as foundation, S2 author changes/
exceptions as follow-up and optional settings-enabled S3. S3 may propose;
author may approve, reject or submit an alternative. ADR-0016 and NF-WF-050
record this direction and staged implementation plan. GAP-039 stays OPEN:
no new SCALE source/schema/UI or runtime tests are claimed at this boundary.
Author clarified incomplete HARD assessment holds approval and AI should advise
on missing data with reasons, explanations and examples. Planned UI always has
an actionable checklist; AI enhancement follows S3 enablement. Pending advice
never satisfies the gate. Existing SOFT/HARD configuration remains. Initial
parent and final HARD/guidance amendment review APPROVE. At that earlier
decision boundary no child was READY; the later 050A contract receipt above
now owns S1 dispatch readiness. S1 foundation implementation remains next.
Engram runtime binding is unavailable (GAP-021); task/CURRENT are fallback.

### Usage analytics accepted locally — 2026-10-08

Author decision ADR-0015: quotas are owned by the external LLM Gateway.
NF-WF-049 implements token/model analytics without quota limits and closes
GAP-063's revised local implementation gate. [Task receipt](../../tasks/NF-WF-049-generation-usage-analytics.md)
owns exact commands, review hashes, migration and failed-attempt corrections.
Separate backend/UI reviews APPROVE; migration evidence independently verified.
245 scoped tests passed (core82, validation62, API37+15, executor22, web27),
API/worker/web/executor types and changed-TS lint passed. Aggregates cover all
matching requests rather than a recent UI window; observed attempts are counted
once, requested/reported model identities remain distinct and missing/legacy
coverage is explicit. Chapter workflow and selection callers are attributed;
novel-associated retrieval embeddings are included. AI Studio Receipts → Usage
analytics supports novel/component filters, en/id and per-attempt detail.

The additive migration passed empty/populated41-upgrade checks with old data
and40 checksums retained. No working DB migration, live gateway call, image
transport, new dependency, full release test or human accessibility approval
is claimed. Deploy the reviewed migration via environment/release preflight.
Next: separate SCALE GAP-039 author decision, human GAP-051 and live release
gates. Historical undecided GAP-063 paragraphs below are superseded.
Engram runtime attribution remains unavailable; this/task receipt is the fallback.
Cleanup verified all four owned NF049 scratch databases absent; test processes
had disconnected. No Redis worker/queue was started for this task.

### Accepted local gap verification — 2026-10-08

NF-WF-048 closes GAP-018's bounded recovered-upgrade/partial-FK-loss gate
and GAP-117's isolated worker-smoke evidence gate. Separate source/evidence
reviews APPROVE. See [local receipt](../implementation/048-local-gap-verification.md)
and [task](../../tasks/NF-WF-048-local-gap-verification.md). Product code and
historical migration files are unchanged from `c0830c7`.

Windows reused existing Docker services. Raw backup failure was reproduced;
reviewed transactional recovery restored the two evidence RESTRICT FKs before
reviewed ledger resolution. Recovered/empty/replayed schemas match, all40
migrations applied, original32 tables and ten full ledger rows preserved,
and cited-version DELETE/orphan/index negative checks passed. Three original
checksum differences are explicitly preserved; live repair is not approved.
All five workers started on owned Redis DB14: twelve attributable connections,
PID socket/disconnect evidence and a uniquely completed heartbeat. Cleanup
removed only owned resources; DB14 is empty and four scratch DBs are gone.

Scoped driver lint and diff checks passed. No new full API/web suite, live
provider test, human screen-reader result or production deployment is claimed.
Next: author-owned GAP-039/063 product decisions, human GAP-051 audit and live
release gates. Do not redispatch D/E or NF048's completed drills. Earlier
BLOCKED/OPEN paragraphs below describe their prior boundary and are superseded.
Engram runtime attribution is unavailable; this is the durable file fallback.

### Accepted isolated-smoke documentation — 2026-10-08

The author accepted `work/nf-wf047-isolated-smoke` through `9fe1443`.
Fast-forward integration changed documentation only; product/test source
still matches `87fea3c`. Separate `review_recovery_034` review APPROVE
confirmed the four revised-procedure corrections. Diff checks and D's five
required-reading links passed. No new service, worker or test run is claimed.

D's missing-input receipt and E's amended procedure/reported Ubuntu rerun
are now integrated. Do not recreate those documents or replay earlier
dispatch instructions below. GAP-018 remains BLOCKED on an authorized
sanitized source dump with its actual migration ledger preserved. GAP-117
remains OPEN pending acceptance of attributable isolation evidence; approval
of documentation corrections is not an independently repeated runtime drill.
Next: resolve those specific evidence gates and the author-owned product,
human and live release decisions. Production deployment is not approved.
Engram runtime attribution is unavailable; this is the fallback checkpoint,
not a claimed MCP save.

### Accepted external follow-up — 2026-10-08

The author accepted integration of `work/nf-wf047-external-follow-up`
through `89d57f5`. A/B audit and fixture amendments are integrated; C's
bounded three-caller parser repair received separate local source review
APPROVE. Local checks on that exact source passed: three API files32/32,
API typecheck0 and lint on the five affected source/test files0. See the
047C local acceptance receipt; this is not a fresh full release battery.
Separate integration-handoff review: `review_mutations_034` APPROVE;
documentation diff check passed and source/test blobs still match `89d57f5`.
F is an integrated proposal, not an author-selected SCALE/quota policy.
E's Ubuntu preparation receipt remains reported host evidence, not a
locally repeated drill or final release acceptance.

Next external work: create D's explicit missing-input receipt for GAP-018
if no authorized sanitized dump is available; then prepare a reviewed E
scope amendment to replace the non-isolated worker-smoke evidence
(GAP-117) with an owned isolated rerun. Do not restart completed A/B/C/F
work or migrate the remaining loader sites without a bounded new contract.
GAP-039/063 decisions, human GAP-051, live credentials/deployment and local
Engram registration remain author-owned. Runtime Engram attribution is
unavailable; this is the compact fallback checkpoint, not an MCP save.
This dispatch supersedes the initial 047 launch instructions below.

### External follow-up dispatch — NF-WF-047

The author requested a delegated workflow and prompt for remaining work.
[NF-WF-047](../implementation/EXTERNAL-FOLLOW-UP-WORKFLOW.md) defines six
bounded children: audit (A), GAP-042 amendment (B), GAP-081/082 diagnosis
and proven fixes (C), conditional GAP-018 populated-upgrade investigation
(D), native release preparation (E), and SCALE/quota proposals (F).
Start with A; prepare/freeze/review child contracts before dispatch.
This is a planning artifact, not evidence that any child has executed.
Separate plan review: `review_mutations_034` APPROVE; referenced links and
package commands checked, documentation diff check passed. No product code
changed and no new runtime test execution is claimed for this planning task.
The external coordinator commits/pushes a work branch for local acceptance;
it does not merge main, make product decisions or approve deployment.
Engram runtime attribution is unavailable at this boundary (GAP-021);
this record is the compact fallback checkpoint, with no MCP save claimed.

### Author-approved local/external responsibility split

External Ubuntu coding actors handle bounded implementation, regression tests,
documentation and separate review for GAP-040/043/041, followed by final automated
verification on the integrated revision. Follow native environment preflight,
reviewed task contracts, branches/file ownership and scratch-database isolation.
Their host receipts do not prove readiness of the author's Windows environment.

The author retains local ownership of SCALE/quota product decisions (GAP-039/063),
live credential provisioning, human screen-reader audit (GAP-051) and production
deployment approval. External actors may provide evidence and concrete proposals
for039/063, but must not choose unresolved product semantics or implement those
decisions before the local decision is recorded and their task contract reviewed.
After decisions are recorded here, bounded implementation may be delegated.
No external task authorizes production deployment or credential disclosure.
Screen-reader acceptance requires the author's actual human audit; an automated
axe result or an LLM report cannot close that gate. Integrate and review submitted
diffs here before treating task closures as accepted project evidence.

This author instruction is recorded locally because Engram runtime attribution
is unavailable; no attributed memory save is claimed. No credentials are stored.

NF041 is IMPLEMENTED/REVIEWED: GAP-034 novel+chapter filters before limit,
defensive UI provenance and stale history/start protection; GAP-116 downstream
detail/cancel response guards. Scoped API67 tests in two disjoint runs; web7
files44/44; API/web typechecks, lint and final Nuxt build0. Separate contract,
amendment and exact-diff review APPROVE. See tasks/NF-WF-041-novel-scoped-workflow-history.md.
Full battery below is historical evidence at712cca6, not a rerun of NF041.
Next: GAP-040/043/041 proof work is IMPLEMENTED + REVIEWED + PUSHED on
`work/gap040-gap043` (NF-WF-042/044/045; battery GREEN at `c03a171`);
post-review hardening NF-WF-046 (author's five directives + GAP-040
clarification) is VERIFIED — implemented, diff-reviewed (APPROVE),
battery GREEN on the final revision `9265822`, committed and pushed;
The author accepted integration through `ad54faa` on 2026-10-07 after
local review of the source fixes and documentation amendments. This
acceptance supersedes the earlier pending-acceptance instruction; it
does not approve production deployment. GAP-039/063 source decisions
remain with the author. The local merge verification receipt below
distinguishes current host evidence from reported Ubuntu results.

### Local integration receipt — 2026-10-07

OBSERVED: `main` fast-forwarded from `1a3452b` to the author-accepted
branch tip `ad54faa`, without conflicts. Production and test code matches
`9265822`; integration handoff edits affect documentation only.
Fresh Windows verification used the existing PostgreSQL16 Docker5433 and
Redis6379 environment, with dedicated test databases and no author-data reset.

| Command | Observed result |
| --- | --- |
| `pnpm --filter @novelforge/api exec vitest run --no-file-parallelism` | Exit0; 58 files, 1047 tests passed, including all three E2E files |
| `pnpm --filter @novelforge/web test` | Exit0; 81 files, 488 tests passed; includes axe suites |
| `pnpm lint` | Exit0 |
| `pnpm --filter @novelforge/api exec tsc --noEmit` | Exit0 |
| `pnpm --filter @novelforge/web exec vue-tsc --noEmit` | Exit0 |

Logs are retained on this host under `TEMP/novelforge-merge-ad54faa`.
The API run emitted pg query deprecation warnings; these were not test
failures. No fresh Nuxt build, live gateway/deployment or human screen-reader
acceptance is claimed. The separate `review_mutations_034` actor reviewed
the acceptance documentation; this is distinct from the previously approved
source diff. Engram runtime attribution remains unavailable; this receipt
is the fallback handoff, not a claimed Engram save.

NF-WF-035–038 are IMPLEMENTED/REVIEWED and pushed through5120f68. GAP-110
scene revisions, GAP-083 Recovery Center and GAP-111–113 integration defects
are resolved with scoped evidence. The initial36519e2 battery failed; preserve
its receipt. The68facd7 follow-up also stopped (GAP-114). Reviewed NF040 fixes
fixture EOL and GAP-044 race proof (30/30; API tsc/lint0). Previous NF039 at712cca6
is AUTOMATED GREEN: lint/API/web typechecks0; API54 non-E2E files1014/1014;
web79 files477/477; E2E3 files20/20; axe20 files91/91; additional Nuxt build0.
API inventory57 files1034 tests is covered in two runs; axe overlaps web.
See docs/implementation/039-release-verification-2026-10-07.md for exact commands.
GAP-034 is now resolved by scoped NF041 evidence above;
follow-up branch/projection evidence040/043 and UI/E2E alignment041 are
accepted through NF-WF-042/044/045/046 above.
SCALE039/quota063 require validated-source decisions. No platform completion claim.
Human GAP-051, live deployment/configuration and Engram host registration remain
open. Current host has PostgreSQL/Redis but no API/web/storage/gateway listener.
Boundary receipts at the end preserve history; this dispatch supersedes old
next-task instructions, not their historical evidence.

## Historical dispatch — 2026-10-07 (e538180 audit)

Pulled nine commits from eb065cf to e538180; task027–034 implementations are present. The prior dispatch and Ubuntu battery below are historical. GAP-109 records defects discovered despite reported closures; NF-WF-035 is the bounded repair. GAP-110 records missing scene create/update revision bookkeeping and requires a separate bounded contract.

Current next step: NF-WF-035 is included in this commit; proceed to GAP-110 and final-revision NF-WF-023. Full platform/release, live provider configuration and human GAP-051 are not accepted by these focused tests.

Windows preflight: existing nf-pg-5433 and Redis reused; frozen-lockfile dependencies restored and Prisma generated. Existing reviewed migrations deployed only to dedicated scratch databases. Real Redis checks use DB15 and unique owned queue/test metadata; no production queue consumer or flush. Engram runtime attribution unavailable (GAP-021); no checkpoint save claimed.

NF-WF-035 receipts: final restore/branch/selective/semantic/scene/planning/coherence API run113/113; worker recovery46/46; real BullMQ test1/1; additional focused receipts in the task include what-if/memory31/31, expanded API108/108, story-versioning58/58 and semantic36/36. Do not add overlapping runs into a completion percentage. Lint, workspace typecheck and final affected API/shared typechecks exit0; separate reviews APPROVE. Full release battery not run. Initial evidence: BullMQ ID regression failed before repair and passed after; Windows npx setup fixed; Prisma destructive db push refused and replaced by migrate deploy without bypass.

## Historical dispatch — 2026-10-07 (cc8d515 audit)

Pulled four commits by fast-forward from dfd87a3 to cc8d515. NF-WF-026 production worker factories are present; GAP-028 code wiring is no longer a new implementation task. Its fake-gateway AGENT evidence is not live provider/BullMQ deployment acceptance. GAP-098 removal is documented as author-directed in facac9f; this audit does not independently infer that approval from code alone.

Next: run NF-WF-023 against the final revision containing the reviewed GAP-106 repair; prepare dependency-ready GAP-100/101 contracts. GAP-094–096 and human GAP-051 remain open. The Ubuntu battery below is historical evidence for dfd87a3, not the current Windows host or extracted services.

Current host: reuse nf-pg-5433 (5433) and existing Redis; only dedicated test databases used. Worker AGENT suite 4/4 and executor 20/20 passed with an explicit host DATABASE_URL; shared architecture tests 2/2 pass in-memory. Workspace typecheck exit 0; shared package typecheck rerun after test rewrite exit 0. Initial executor connection failure and architecture-test timeout/source-file race are recorded in GAP-106. Final lint exit 0. API compiler/canon 95/95; worker lifecycle unit checks 9/9 (one real BullMQ integration deliberately filtered out; no production Redis queue used). Total focused checks: 130 passed. Separate reviewer approved the code with one stale GAP-098 documentation finding, corrected. Full API/worker/web release battery and live provider deployment were not run. Engram runtime attribution remains unavailable (GAP-021); no checkpoint save is claimed.

## Historical Ubuntu dispatch — 2026-10-07 (battery rerun)

**Historical NF-WF-023 release battery: reported GREEN on the Ubuntu host** (Ubuntu 24.04.5, revision `dfd87a3`, 2026-10-07 04:45–05:30 WIB). All 8 boxes ticked with OBSERVED evidence, strictly sequential per Invariant 4:
1. `pnpm lint` → exit 0 ✅
2. `tsc --noEmit` (api) → exit 0 ✅
3. `vue-tsc --noEmit` (web) → exit 0 ✅
4. API vitest → 53/53 files, 970/970 tests ✅
5. Web vitest → 77/77 files, 466/466 tests ✅
6. e2e (per-file sequential) → 20/20 ✅
7. Axe → 20/20 files, 91/91 tests, zero violations ✅
8. No new product-defect GAPs ✅

Environment: PostgreSQL 16.15 + pgvector 0.6.0, Redis 7.0.15 (both started manually); GAP-065 re-applied; GAP-105 (role password + DATABASE_URL export) resolved. One transient API flake observed (1/970, non-reproducing across 2 reruns).

**Historical executor recommendation: SHIP_WITH_KNOWN_GAPS; not author approval or a current release decision.** Full report: `docs/implementation/023-battery-rerun-2026-10-07.md`.

**Recommended fix order:** GAP-028 (P1, actionable) → GAP-100 (P1, BLOCKED on contract) → GAP-101 (P2, BLOCKED on contract) → GAP-094/095/096 (P3) → GAP-098 (P3, author decision). GAP-051 human gate remains OPEN.

## Previous dispatch — 2026-10-07

Synced baseline: `72b3948`, clean before this audit. Implementation commits now extend through NF-WF-024. The older entries below preserve historical evidence; their "uncommitted", "PLANNED" and "commit next" instructions are superseded by this dispatch snapshot, not current worktree state. They do not prove present-host acceptance.

Next: current-host NF-WF-023 release verification. The reviewed NF-WF-025 repair is included in this commit. GAP-099–104 record findings. Live what-if and semantic apply remain blocked on GAP-100/101; release acceptance and GAP-098 remain open. Engram hook supplies no authoritative identity; attributed saves are unavailable and this record is the fallback.

### NF-WF-025 verification receipts — current Windows host

- Existing Docker PostgreSQL `nf-pg-5433` and Redis reused; database integration used only disposable `novelforge_test_simulation_debugger`. No production database reset or Docker reinstall.
- Red before repair: semantic regression incorrectly returned S2; final-tick debugger returned PAUSED; real proposal debug-step returned 409.
- Green after repair: semantic merge 23/23; debugger HTTP/database suite 12/12; story-versioning 26/26; what-if accessibility 3/3 (mock key strings, not proof of translated en/id rendering). Lint exit 0.
- Separate reviewer: review_workflow_docs APPROVE, no blocking findings. Proposal observation is API-only; no UI completeness claim. Full release battery/e2e not run in this repair.
- `pnpm typecheck`: exit 0 across the workspace, including API/worker/web.

## Historical dispatch snapshot — 2026-10-05

| Task | Current scope/status | Next action |
|---|---|---|
| NF-WF-001 | Reviewed design | Preserve contract and historical receipts |
| NF-WF-002A/B/C | Recorded fixture/clarification/ordering reviews | Reopen only changed or refuted evidence |
| NF-WF-002D | **IMPLEMENTED / REVIEWED** (GAP-022 closed for implementation and review) | Done; accepted by 002F |
| NF-WF-002F | **VERIFIED 2026-10-04 — evidenced M1 foundation scope only** (self-verification, not independent review) | Done; full cross-domain recovery stays OPEN under GAP-004 |
| NF-WF-002E | PLANNED; actual consumer absent (GAP-023) | Revisit under NF-WF-004 consumer design |
| NF-WF-003 | **IMPLEMENTED 2026-10-05 — pending separate review** (uncommitted working tree; 197 tests green, lint + typecheck clean; 5 review findings fixed) | Separate reviewer judges the exact diff |
| NF-WF-004 | **IMPLEMENTED 2026-10-05 — review findings fixed, ready to commit** (contract APPROVE round 3; independent diff review APPROVE_WITH_FINDINGS: one P2 fixed (`@types/pg` added, all typechecks now verified clean), two P3 observations for the author; 49 API + 15 orchestrator + 14 package + 10 worker tests green, lint clean) | Commit + push |
| NF-WF-005 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE round 3; independent diff review APPROVE, no findings; 15 API + 4 executor + 2 auth tests new/green, full API 423/423, lint + all typechecks clean; migration verified from-empty/re-apply/drift-clean; GAP-003 closed with acceptance evidence; GAP-030 recorded) | Done |
| NF-WF-006 | **IMPLEMENTED + PUSHED 2026-10-05** (contract APPROVE_WITH_FINDINGS round 2, round-2 P3s applied; independent diff review CHANGES_REQUESTED on F1 (input charset+binding) → fixed (GAP-033) + focused re-review APPROVE; full API 436/436, validation 61/61, executor 20/20, template 9/9, lint + typechecks clean; GAP-031/032/033 recorded) | Done |
| NF-WF-007 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract APPROVE_WITH_FINDINGS; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: dead `pollRun` pruned, outline start restricted to APPROVED only per author decision, newline restored; web 41/41, API 447/447, lint + vue-tsc + nuxt build clean; GAP-034 open for the server-side runs filter follow-up; no backend changes) | Done |
| NF-WF-008 | **IMPLEMENTED + REVIEWED 2026-10-05** (contract `8d28995` reviewed CHANGES_REQUESTED, F1–F6 applied; independent diff review APPROVE_WITH_FINDINGS, F1–F3 applied: STALE documented as detected-not-persisted, verdict union fixed, error table completed; API 462/462, web 48/48, story-versioning 17/17, lint clean, nuxt build succeeds; GAP-035/GAP-036 recorded) | Done |
| NF-WF-009 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `f18600f` reviewed CHANGES_REQUESTED, F1–F9 applied, Q1–Q6 adjudicated; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; new `@novelforge/memory` package, Prisma `MemoryProjection` + migration `20261006_nf_wf_009_memory_projections`, 3 routes, BullMQ `memory-rebuild` queue + worker, 003 compiler tiers 7/8 PRESENT-with-freshness/UNAVAILABLE-with-reason; API 477/477, worker 21 passed/1 skipped, lint + typechecks clean; GAP-037 recorded; F3 full-lineage follow-up OPEN) | Review |
| NF-WF-011 | **IMPLEMENTED 2026-10-05, awaiting independent diff re-review** (contract APPROVE_WITH_FINDINGS; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; author-preview E2E loop (8-step UI sequence) + bounded long-novel fixture (300ch/60char/3000facts/300 outline nodes, ~4.5k revisions) + G1-G10 gates + measurements + `pnpm e2e`; diff review round 1 CHANGES_REQUESTED (P1-1 measurements acceptance, P2-1 G1 as specified, P2-2 restore capability negative, P2-3 G10 reviewFinalText half, P2-4 progress.md accuracy, P3-1..3) — all fixed and re-verified: e2e **20/20** (loop 3/3, gates 10/10, measurements 7/7, incl. no-regression vs committed baseline), lint+typecheck clean, full API suite 530/530 on fresh VM (GAP-044 flake did not manifest; passes 11/11 alone); GAP-041/042/043/044 recorded; GAP-010 partially closes) | Review |
| NF-WF-013 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-013-public-reader-routes-ui.md` reviewed APPROVE round 2 (round 1 APPROVE_WITH_FINDINGS: wordCount empty-guard, 007 line refs, P2-1 novel-first chapter resolution, P3-1 GAP-049 additive extensions); implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 3 anonymous public routes (`GET /api/public/novels/:slug`, `/chapters/:number`, `/authors/:authorId`) with the 012 shapes verbatim + GAP-049 extensions (author byline, prev/next, author route); novel-first chapter resolution via additive `resolvePublicChapterNovelFirst` (frozen 012 `resolvePublicChapter` untouched); novel page = PUBLISHED-only list, chapter page = pinned content + PUBLISHED-only nav, author page = displayName + published novels; identical `404 {error:"NOT_FOUND"}` for all 9 invisible cases; no auth object on `/api/public/*`; no `/api/public/search`; GAP-046 migrated (007 `publish()` → `POST .../publication/publish` + 409 REVIEW_STALE/HARD_POLICY_VIOLATION en/id messages, 403 preserved); 3 Nuxt reader pages + `ReaderChapterNav` (noindex, semantic HTML, focus-visible, responsive) + en/id `reader` keys; public-routes API tests **14/14**, web reader tests **10/10** (9 files **58/58**), full API suite **561/561** (27 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-046 CLOSED; GAP-049 recorded) | Review |
| NF-WF-015 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-015-rich-editor-scenes.md` REVIEW_PENDING, round 1 APPROVE_WITH_FINDINGS applied inline, Q1–Q7 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; Tiptap **v3** (`@tiptap/core/vue-3/starter-kit@3.31.4`, `@floating-ui/dom`, `sanitize-html` Q2 pick, Invariant 2 allowlist `p,h2,blockquote,strong,em,ul,ol,li,hr,br` no attrs, `disallowedTagsMode:discard`) — 6 new components in `app/components/editor/` (RichEditor restricted StarterKit H2-only, EditorToolbar, SelectionAiMenu via `@tiptap/vue-3/menus` BubbleMenu, AiSuggestionCard, ConflictBanner `role=alert`, SceneNav); six pinned selection-AI ops (`selection.*` tasks, CREATIVE_WRITER, 2000/1000/2000 bounds, streaming card, stale-selection pin, never direct writes) via `services/selection-ai.ts` + client verbatim mirror; server-side `sanitizeChapterHtml` on saveChapter + tag-stripped wordCount + F4 publication wordCount; F2 reader dual-format; F3 409 disambiguation (PUBLISHED → `chapters.blockedPublished`, GAP-054: key did not exist, added en+id); scene CRUD routes (`chapter:update`, Zod, 404 gate, reorder-by-number, delete → 409 when outline beats reference, GAP-055); legacy plain-text chapters convert to manuscript HTML on editor load; i18n en+id; vitest-axe 0 violations en+id; API scenes **12/12**, web new **35/35**, full web **117/117**, full API **588/588** (29 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-052 stays open until verification, GAP-053 open) | Review |
| NF-WF-014 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-014-browse-search-progress.md` reviewed APPROVE_WITH_FINDINGS; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; `Novel.genres String[]` + additive migration with functional GIN indexes (tsvector title/content); 3 anonymous discovery routes (keyset-paginated listing + genre/sort filters, genre facets, published-pin-only search with bounded `<mark>` snippets, SQL-enforced visibility, no-oracle `200 { results: [] }`) + 1 member genre route (`novel:update`, Zod: known keys, dedupe, **max 5 per Klein's 2026-10-06 amendment**); frozen 18-genre taxonomy constant + en/id i18n labels; `/browse` page (search-as-section, continue-reading, facets, sort, load-more; noindex) + §15 discovery components; device-local `useReadingProgress` (`nf:reading-progress:v1`, chapter-granular, zero network); chapter page writes on 200 only, novel page "you stopped at" marker, 404 entries dropped silently; vitest-axe **0 violations** (wcag2aa+wcag22aa, en+id) + `AUDIT-014.md` manual checklist (screen-reader pass honestly pending human verification); discovery API **15/15**, web new **24/24**, full web **82/82**, full API **576/576** (013's 14/14 incl. updated search-route assertion), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-050 recorded) | Review |
| NF-WF-012 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract APPROVE round 3, Q1–Q6 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; `Publication` model + migration `20261006_nf_wf_012_publications` (idempotent enum DO-block, pre-existing PUBLISHED backfill), 7 publication routes + novel archive/unarchive (real capabilities `chapter:publish`/`chapter:update`/`novel:archive`, typed 409s ALREADY_PUBLISHED/NOT_SCHEDULED/NOVEL_ARCHIVED), BullMQ `publication` queue + worker fire (fire-time Invariant-3 recheck; deterministic refusal → UNPUBLISHED) + startup reconciliation (missing/failed → remove-first + re-enqueue; live jobs left alone), 013 handoff shapes `isPubliclyVisible`/`resolvePublicChapter` (no public routes), COVERED_TABLES `{publications, restoreTarget: false}` (Invariant 8); API **17/17**, worker **11/11**, backfill **8/8**, lint + all typechecks clean; full API suite **547/547** green; `pnpm e2e` **20/20** no-regression green (BASELINE-OK); GAP-045/046/047/048 recorded) | Review |
| NF-WF-016 | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-016-authoring-workspace.md` REVIEW_PENDING, round 1 APPROVE_WITH_FINDINGS, 5 findings fixed, Q1–Q8 decided; implementer actor separate from author/contract-reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; the only permitted backend addition `POST .../canon/facts/:factId/sources` (Q2: `canon:manage` gate, pinned span validation, `advanceForMutation` tables `["canon_fact_sources"]`, audit `canon.fact-source-added`, 409 retracted, 404 cross-tenant; additive, no schema change); nine drawer panels on the writer page (story entities, canon facts with ≥1-citation UI rule Q8, references CRUD+publish+ingest, outline nodes/versions with `canon:approve` approval visually separated, characters create/delete NO update GAP-058 + `storyEntityId` read-only GAP-060, relationships/bonds, story state threads/promises event↔thread linking deferred GAP-056, narrative DNA/policies/antagonists, health & memory); per-claim proposal approve/reject bulk list, workspace-scoped paths (F4), `mode=AUTHOR` on canon calls (F5); i18n en+id 572 `workspace.*` keys; vitest-axe 0 violations across 4 panel groups; web **244/244** (37 files), API **592/592** (29 files, incl. 4 new add-source tests), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-057 CLOSED; GAP-059/GAP-060 recorded; GAP-039/040/055/056/058 remain open) | Review |
| NF-WF-017A | **IMPLEMENTED + COMMITTED 2026-10-06** (diff review APPROVE, no findings; GAP-061 CLOSED; commit `576cb86`) (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017A child scope = import normalization only — 017B export and 017C GAP-053 closure are separate actors, NOT touched; implementer actor separate from contract author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; unified pipeline `src/services/import-normalize.ts`: TXT/Markdown/PDF/DOCX → sanitized HTML exactly per 015 Invariant 2 (frozen md/txt split rules byte-identical; md allowlist h2/strong/em/blockquote/ul/ol/li/hr; magic-byte format detection; zip-bomb guard before decompression; PDF via unpdf per-page, scanned → IMPORT_NO_TEXT; DOCX via mammoth with Heading1/2→h1/h2, images/tables/footnotes/comments dropped with skip notices); GAP-061 CLOSED — `importChapters` writes through the exact saveChapter sanitize→strip→count sequence; multipart `POST .../chapters/import/file` (15 MB, server-side validation authoritative); `ImportDialog.vue` on the writer page (file + paste tabs, typed 400 → localized errors, success report with skip notices, axe 0 violations en+id); i18n `importExport.import` en+id; real per-format fixtures in-repo; imports land as DRAFT, never canon; API new **45/45** (import-normalize 34, import-chapters 11), full API **638/638** (31 files), web new **8/8** (component 6 + axe 2 files), full web **252/252**, `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean) | Review |
| NF-WF-017B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017B child scope = export formats only — 017A import pipeline and 017C GAP-053 closure are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the 017A/017C implementers; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; new `src/services/export-render.ts`: TXT (F1 setext `{n}. {title}` + `===`, no `---`), Markdown (F1 `# N. Title`, prose h2 → `**bold**` never `## `, chapters blank-line separated), DOCX (docx 9.5.1, Heading styles), PDF (pdf-lib 1.17.1, chapter-per-section), EPUB (hand-built jszip: mimetype first + stored, OPF + NCX, one XHTML/chapter); pinned Q8 sync byte cap 15M (pre-render estimate + post-render guard → typed `ExportError` 413 EXPORT_TOO_LARGE via the platform typed-error branch); `docx`/`pdf-lib` moved to runtime deps; `GET .../export?format=` (Zod enum, unknown → 400, `md` default backward compatible); `chapter:read` scope incl. drafts, tenant isolation unchanged, no new capabilities, no schema changes; plain-text rows follow the 013 dual-format rule; `ExportPicker.vue` on the writer page (5 formats, sync download, Esc + focus return, axe 0 violations en+id) + i18n `importExport.export` en+id; real per-format fixtures in-repo (`test-fixtures/export/`); API new **22/22** (export-render 14, export-chapters 8), full API **660/660** (33 files), web new **8/8** (component 6 + axe 2), full web **260/260** (41 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; round-trip export→frozen `splitImportBlocks` verified (order, titles, prose); no new GAPs) | Review |
| NF-WF-017C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-017-import-export-formats.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS; 017C child scope = GAP-053 closure only — 017A import pipeline and 017B export renderer are separate actors, NOT touched; implementer actor separate from contract author/reviewer, the 017A/017B implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; offset-mapping rule for the frozen strip rule in `services/manuscript.ts` (`stripHtmlWithOffsetMap`: byte-identical stripped output, tag interiors map to the replacement space, monotone; `verifyEvidenceQuote` exact-first then whitespace-normalized fallback; `strippedContentIncludes`); `resolveSourceEvidence` verifies quotes on stripped text (spans stay raw offsets, frozen `verifySpan` bounds first, both 409 messages verbatim); 008 fact-source pin strip-aware; chapter search builds `to_tsvector`/`ts_headline` on SQL-side `regexp_replace(cv.content, '<[^>]*>', ' ', 'g')` once per published version (Q7 decision of record; stored column = 023/024 follow-up, ADR); no schema changes, no new capabilities, `story-intelligence` untouched; API new **33/33** (html-strip-map 25, canon +4, canon-application +1, public-discovery +3), full API **693/693** (34 files), full web **260/260** (41 files, no-regression), `pnpm e2e` **20/20** exit 0, lint + tsc + vue-tsc clean; GAP-053 CLOSED on this evidence; no new GAPs) | Review |
| NF-WF-018A | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS (F1 `?status=` filter, F2 line refs), Q1–Q6 decided; 018A child scope = AI Studio only — 018B platform admin and 018C receipts are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; the F1-owned `?status=` filter on the run list (`z.nativeEnum(WorkflowRunStatus).optional()`, `workflow:read` gate unchanged) + three additive read-only `GET /api/{agents,skills,workflows}/:id/versions` routes (GAP-064 workaround, same read gates as the detail routes, ascending — the diff reviewer rules whether the fifth additive item is APPROVE_WITH_FINDINGS or CHANGES_REQUESTED); `/workspaces/:workspaceId/ai-studio` page with Definitions/Runs/Approvals tabs (data-driven, 018C's receipts tab has a marked extension point), DefinitionList/Detail/VersionHistory, RunList + RunGraph (steps with status/outcome/error, pinned version numbers, list = screen-reader text equivalent), ApprovalsInbox (parked via `?status=AWAITING_APPROVAL`, frozen 005 approve/reject with verbatim snapshotHash, 409 codes → actionable messages, reject requires reason); capability matrix VIEWER-nothing / AUTHOR view+decide-no-manage / ADMIN+OWNER-manage enforced server-side and pinned client-side; writer page gains one additive AI Studio link (hidden for VIEWER), 007 components untouched; i18n `aiStudio.*` en+id 91/91; API new **6/6**, web new **30/30** (incl. axe **10/10** zero violations en+id), full API **699/699** (35 files), full web **290/290** (46 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-064/GAP-065 recorded, GAP-013 unchanged) | Review |
| NF-WF-018B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS, Q1–Q6 decided; 018B child scope = platform admin only — 018A studio and 018C receipts are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend only, no schema change, no new capabilities, `packages/auth/authorization.ts` + `packages/ai-core/crypto.ts` + `apps/api/src/ai-registry.ts` untouched: `GET /api/auth/session` gains additive `platformRole: "SUPER_ADMIN" | null` (Invariant 1(c)), `GET /api/admin/audit-log` (SUPER_ADMIN, `gateway:read` gate, pinned 8-action Zod filter, non-allowlisted → 400 INVALID_INPUT, limit 1–200), `GET /api/admin/routing-strategy` (GAP-066 additive read — no frozen route served the deployment strategy; the diff reviewer rules conformance); `/admin` page (SUPER_ADMIN-gated shell, `admin-forbidden` panel for others): GatewayList (masked `hasCredential` badges only), GatewayForm (create/edit/rotate dialog, `apiKey` write-only never prefilled, wiped after submit, Esc + focus return), ModelCatalog, ProfileMappings, RoutingOverview (strategy read-only honestly labeled "deployment config", GAP-063 no-quota note); delete=revoke confirm dialog; writer page gains one additive admin NuxtLink (`v-if` SUPER_ADMIN, next to the 018A studio link); i18n `platformAdmin.*` en+id 72/72; API new **9/9**, web new **22/22** (incl. axe **10/10** zero violations en+id), full API **708/708** (36 files), full web **312/312** (50 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-066 recorded before the workaround, GAP-063 stays open, GAP-013 unchanged; procedural note recorded: never run the API suite and `pnpm e2e` concurrently) | Review |
| NF-WF-018C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-018-ai-studio-admin.md` REVIEW_PENDING, APPROVE_WITH_FINDINGS, Q1–Q6 decided; 018C child scope = receipts only — 018A studio and 018B platform admin are separate actors, NOT touched; implementer actor separate from contract author/reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend only, no schema change, no new capabilities, `packages/auth/authorization.ts` untouched: `GET /api/workspaces/:workspaceId/audit-log` (membership + `workflow:manage`, `?action=` pinned to the 10-action AI-infrastructure allowlist, non-allowlisted → 400 INVALID_INPUT, platform-scoped `model-profile.mapped` excluded, identity-only rows) + `GET /api/workspaces/:workspaceId/novels/:novelId/final-text-reviews` (GAP-067 additive read for the pinned "FinalTextReview rows per chapter version" acceptance — no frozen route served it; novel-scoped, membership + `canon:read`, the identical gate as the frozen POST route; the diff reviewer rules conformance); AI Studio receipts tab on the 018A shell (the marked 018C extension point) with capability-gated sub-tabs: GenerationLedger (honest "tokens and latency only — no cost accounting" label, no cost column anywhere, per-attempt detail) `generation:read`, FailureLog (FAILED filter + documented no-model 409 category, GAP-028 surfaced not fixed) `generation:read`, EvaluationReceipts (durable FinalTextReview rows: verdict/violations/revision pin + health as labeled live computation, never persisted) `canon:read`, AuditTrail `workflow:manage` (server enforces; UI gating is progressive enhancement); i18n `receipts.*` en+id 68/68; API new **7/7**, web new **23/23** (incl. axe **8/8** zero violations en+id), full API **715/715** (37 files), full web **335/335** (55 files), `pnpm e2e` **20/20** BASELINE-OK, lint + tsc + vue-tsc clean; GAP-067 recorded before the workaround, GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019A | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019A child scope = reader engagement only — 019B/C/D are separate actors, NOT touched (their files are separate uncommitted work by parallel actors in the same tree); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `Bookmark`/`NovelFollow`/`AuthorFollow`/`ChapterLike` (dedup unique constraints; chapter likes anchor to chapter identity `(novelId, chapterNumber)`) + `Novel.followerCount` + `Chapter.likeCount` (+ `Chapter.commentCount` shared with 019B per GAP-071, both `ADD COLUMN IF NOT EXISTS`); idempotent migration `20261006_nf_wf_019a_engagement`; 13 routes `/api/reader/*` (bookmarks/follows/author-follows/likes CRUD + engagement + engagement/author state), all authenticated by construction (`requireActor` → 401 `UNAUTHENTICATED`); visibility IN THE QUERY (014 predicate; invisible → 404 no-oracle); `INSERT ... ON CONFLICT DO NOTHING` + conditional counter `UPDATE` in one transaction (concurrent writers cannot double-count; decrements `GREATEST(n-1, 0)`); author identity = 013 public-author predicate; self-follow → 400; lists return the caller's rows only with keyset cursor pagination; the `novel` sub-object is additively enriched with the published-visible 014 card fields (GAP-074 — the diff reviewer rules); Q8/GAP-068 additive counts on the frozen 013 shapes (`followerCount` novel, `likeCount`/`commentCount` chapter) + GAP-070 (`followerCount` author — the diff reviewer rules), served only on visible reads, no auth object in `/api/public/*`; web `useSession` probe + `useEngagement` client, `LikeButton`/`BookmarkButton`/`FollowButton`/`FollowAuthorButton` (optimistic UI + rollback, `aria-pressed`, session-gated; anonymous sees Q8 counts as static text) on the novel/chapter/author pages + private `/read/library` (anonymous → sign-in redirect; reuses the 014 `NovelCard`; fallback card for novels with no currently-published chapters); i18n `social.*` en+id 19/19; API new **31/31**, `public-routes.test.ts` **14/14** (one exact-shape assertion updated for the additive GAP-070 field), web new **15/15** (social 10 + library 3 + axe 2, zero violations en+id); `npx tsc --noEmit` clean for 019A files, `vue-tsc` clean, `pnpm lint` clean for 019A files; full API/web suites + `pnpm e2e` pending (parallel actors' files have type errors); GAP-069 (services not running — CLOSED), GAP-070/GAP-074 OPEN for the diff reviewer, GAP-071 shared-column coordination noted) | Review |
| NF-WF-019B | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019B child scope = comments + moderation only — 019A/C/D are separate actors, NOT touched; implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities): schema `Comment`/`CommentReport` + `CommentStatus`/`ReportReason` enums + `Chapter.commentCount` (GAP-071: the column is ALSO pinned in the 019A migration block — both migrations `ADD COLUMN IF NOT EXISTS`, converging); idempotent migration `20261006_nf_wf_019b_comments`; 8 routes `/api/reader/comments*` (post/list/reply/edit/delete/reports/hide/unhide + staff report queue) with visibility IN THE QUERY (ACTIVE novel + PUBLISHED publication, 014 precedent; invisible → 404 no-oracle); per-route burst limiter 1/10s/user keyed on the session cookie (auth register/login precedent); daily limits 100 comments / 20 reports per 24h per user as typed `RateLimitError` → 429 (additive `platform-routes.ts` branch); staff = membership + EXISTING `novel:update` (Klein Q2 — no platform team), actions audit-logged; `?status=` on the report queue filters the COMMENT status (GAP-072 interpretation for the reviewer); web `CommentThread.vue` on the public chapter page (anonymous list, session-gated composer/reply/edit/delete/report, depth ≤ 1, escaped-text rendering) + staff `moderation.vue` queue page (counts only, hide/unhide/delete) with role-gated header link; i18n `comments.*` en+id 56/56; API new **16/16**, web new **13/13** (incl. axe **4/4** zero violations en+id); full API suite 38/38 non-e2e files green (771 passed | 17 skipped; the 3 e2e files fail only when run inside the API glob — via the proper `pnpm e2e`: 20/20 BASELINE-OK), full web suite 356/364 (8 failures all outside 019B scope: 3x reader.test.ts from 019A/019D's uncommitted `onUnmounted` in the chapter page, 4x 019D's reader-progress-sync axe missing a `useRoute` stub, 1x platform-admin axe timeout under load), API tsc EXIT 0, web vue-tsc EXIT 0, eslint clean on 019B files, i18n `comments.*` 56/56 en+id leaf parity; GAP-071/GAP-072 recorded, GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019C | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019C child scope = notifications + privacy only — 019A/B/D are separate actors, NOT touched except two additive shared-file hooks (noted); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `Notification`/`NotificationPreference` + `NotificationType` enum (`NEW_CHAPTER`, `COMMENT_REPLY`, `MODERATION_NOTICE` — Klein Q5, all default ON, absent row = ON); idempotent migration `20261006_nf_wf_019c_notifications`; 5 routes `/api/reader/notifications*` (inbox with cursor pagination + unreadCount, mark-read/read-all, preferences GET/PUT accepting only pinned types → 400 otherwise; master switch is UI-only — OFF writes all three false, ON writes all three true), all authenticated by construction (requireActor → 401), own-rows-only (404 on others' ids — no oracle), rows carry IDs + type only (no email/credential material); pinned event-emission API for the 019B call sites (`emitCommentReplied`/`emitCommentModerated` — preference-honoring, self-reply suppressed); `novel.chapter_published` fan-out via the one shared `notifications` BullMQ queue — emitted from BOTH the 012 worker fire and the API immediate-publish path (GAP-073 interpretation for the reviewer: the contract names only the worker, but immediate publish is the primary author flow); the worker resolves novel followers ∪ author followers (019A pinned tables) deduped, skips NEW_CHAPTER opt-outs at insert time, inserts in bounded batches ≤ 500, no-ops unless the chapter is PUBLISHED (Invariant 7 — never fabricated); publish latency never grows with follower count (only the enqueue is awaited); web `NotificationBell.vue` (session-gated, unread badge, polling only) + `/read/notifications` inbox page (list/mark-read/read-all/empty state/pagination, preferences toggles with `role="switch"`, privacy "what's private" panel — informational, no toggles) + bell on both read pages; i18n `notifications.*` en+id 35/35 (top-level, following 019B's `comments:` precedent); API new **16/16**, worker new **8/8**, web new **17/17** (incl. axe **6/6** zero violations en+id); full-suite/e2e/lint/tsc/vue-tsc evidence pending in the handoff; GAP-073 recorded, GAP-065 note (binaries absent at session start — reinstalled, CLOSED), GAP-028/GAP-013/GAP-051 unchanged) | Review |
| NF-WF-019D | **IMPLEMENTED 2026-10-06, diff reviews complete + battery green 2026-10-06** (contract `tasks/NF-WF-019-reader-social-moderation.md` REVIEW_PENDING (round 1, 5 findings fixed), APPROVE_WITH_FINDINGS; 019D child scope = synced reading progress only — 019A/B/C are separate actors, NOT touched (their files are separate uncommitted work by parallel actors in the same tree); implementer actor separate from contract author/amendment author/contract reviewer and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; additive backend, `packages/auth/authorization.ts` untouched (no new capabilities), no new auth endpoints: schema `ReadingProgress` (`@@unique([userId, novelId])`, `updatedAt` = winning client timestamp, not `@updatedAt`) + `User.readingProgress`/`Novel.readingProgress` relations; idempotent migration `20261006_nf_wf_019d_reading_progress`; 3 routes `/api/reader/progress*` (PUT LWW by client clock — newer overwrites, older/equal → 200 stored row, deterministic tie; engageable check IN the SQL, invisible → 404 no-oracle; GET own-row-only; DELETE 204 idempotent), all authenticated by construction (`requireActor` → 401 `UNAUTHENTICATED`); web `useSyncedReadingProgress` (session probe, max(updatedAt) merge, idempotent write-back, debounced PUT, offline queue + reconnect flush, honest syncState) + reader-page integration (014 `markRead` unchanged, novelId via `/public/novels/:slug`, scroll seeding, "synced" indicator); i18n `progressSync.*` en+id 2/2; API new **11/11**, web new **10/10** (composable 6 + axe 4, zero violations en+id), `vue-tsc` clean, API `tsc` zero errors in 019D files (2 errors in 019A's `reader-engagement.ts` — parallel actor's scope); no new GAPs; GAP-013/GAP-028/GAP-051 unchanged) | Review |
| NF-WF-020A | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-020-advanced-recovery-branches.md` §020A; implementer actor separate from contract author/amendment author/contract reviewer, the 020B/020C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; lifts the `selective restore is not implemented` refusal: DOMAIN/ENTITY/SELECTIVE preview + apply with dependency analysis; 42-edge FK table + 9 pinned semantic edges in `packages/story-versioning/dependency-edges.ts`; surgical apply (UPDATE-in-place for retained rows, DELETE only for rows absent from payload, INSERT for new rows — Restrict-safe); ORPHAN_REFERENCE/STALE_DEPENDENT conflicts; ENTITY closure informational (no gate); DOMAIN/SELECTIVE 409 UNACKNOWLEDGED_CONFLICTS without `acknowledged: true`; selection stored in operation `preview` JSON (no migration); 33-table domain vocabulary pinned, 3 unmapped tables never rewound; `SelectiveRestoreError` typed 400/409; revision `origin=RESTORE` with scope + acknowledgment in change set; `revision:manage` enforced; UI `SelectiveRestorePanel.vue` (scope picker, conflict list, acknowledgment checkbox gating apply) + en/id `recovery.*` (95/95 parity) + vitest-axe zero violations; API **12/12** selective-restore, **52/52** revision (011 no-regression), story-versioning **26/26** (9 new edge pins + 17 existing); GAP-080/081 recorded for concurrent-work interference) | Review |
| NF-WF-020B | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-020-advanced-recovery-branches.md` §020B; implementer actor separate from contract author/amendment author/contract reviewer, the 020A/020C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; branch create/list/switch, branch-scoped history, temporal model (Invariant 5), `Novel.currentBranchId`, Invariant 9 publish guard (409 NOT_ON_MAIN_BRANCH), DIRTY_SWITCH (409), branch-aware as-of closing GAP-040; migration `20261006_nf_wf_020b_branches/`; RecoveryCenter.vue UI + en/id + axe; API branches **9/9**, revision **52/52**, publication **17/17**, memory **16/16**, web RecoveryCenter **5/5**; GAP-078/079 recorded) | Review |
| NF-WF-021C | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021C; implementer actor separate from contract author/contract reviewer, the 021A/021B implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 'The Irrigation Decision' as deterministic pure functions in `packages/story-simulation/` (NO LLM calls): 20 ticks, drought at tick 5 (food_security -0.3), irrigation proposal at tick 10 (021B OUTCOME_FORK → PAUSED_PROPOSAL → decision → resume); pinned 021A/021B shapes consumed (SimulationEntity kinds SETTLEMENT/POPULATION/RESOURCE/KNOWLEDGE/INFRASTRUCTURE, CausalLink DIRECT/ENABLING/PREVENTING, SimulationProposal); no new API surface; no new tables; pop 398 without irrigation (target 380 ±10%), pop 491 + foodSecurity 0.7 with irrigation (targets 480/0.7 ±10%); drought causal chain queryable; byte-identical determinism; canon isolation by purity; story-simulation **16/16**, tsc + eslint clean; GAP-085 recorded (walkthrough UI deferred pending 021A Simulation Center)) | Review |
| NF-WF-021A | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021A; implementer actor separate from contract author/contract reviewer, the 021B/021C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; 5 primitives: SimulationRun (status enum incl. PAUSED_PROPOSAL per F2), SimulationScenario, SimulationTick, SimulationEntity (kind enum SETTLEMENT/POPULATION/RESOURCE/KNOWLEDGE/INFRASTRUCTURE per F5), SimulationEvent, NovelModule; additive idempotent migration `20261006_nf_wf_021a_simulation`; 4 prerequisites ALL REQUIRED (branch → 400 NO_BRANCH per F3, checkpoint snapshot → 400 NO_SNAPSHOT, canon pin, module activation → 400 MODULE_NOT_ENABLED per F4); run lifecycle API (create/start/step/pause/resume/abort/complete via maxTicks, 409 INVALID_STATUS_TRANSITION); `simulation:read`/`simulation:manage` capabilities verified (F1/Q7: OWNER/ADMIN/AUTHOR both, EDITOR read-only, VIEWER neither — added by 021B per GAP-084, no duplicate); 10 routes; i18n `simulation.*` en+id; concept→computational mapping documented; simulation.test.ts **18/18** (primitives, 4 prerequisite 400s, lifecycle, determinism re-run, canon isolation after 100 ticks, capabilities); tsc + eslint clean for 021A files; GAP-065 note (VM replaced, services reinstalled)) | Review |
| NF-WF-021B | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021B; implementer actor separate from contract author/contract reviewer, the 021A/021C implementers, and the future diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; CausalLink DIRECT/ENABLING/PREVENTING with causeStateRef for scenario links; F6 divergence triggers (THRESHOLD_SPAN, NO_DOMINANT_OUTCOME ≥0.7, COUNTERFACTUAL_UNCERTAINTY <0.8) — reports only, never auto-resolves; ANY divergence → SimulationProposal (distinct from CanonProposal, never enters canon pipeline); run → PAUSED_PROPOSAL on proposal, → RUNNING on decide; `simulation:read`/`simulation:manage` capabilities (Q7 role mapping); additive idempotent migration `20261006_nf_wf_021b_causality`; 6 routes; i18n en+id; simulation-causality **19/19**, authorization **18/18** (3 new capability tests), tsc + eslint clean; GAP-084 (capabilities), GAP-086 (DB password, resolved)) | Review |
| NF-WF-021D | **IMPLEMENTED 2026-10-06, awaiting independent diff review** (contract `tasks/NF-WF-021-simulation.md` §021D (amended per Klein's option-1 decision); implementer actor separate from contract author/contract reviewer, the 021A/021B/021C implementers, all prior reviewers, and the future 021D diff reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; unified Simulation Center UI: `simulation.vue` page (Runs/Walkthrough tabs) + 7 components (RunList with status filter, RunCreate dialog, RunDetail with tick history + lifecycle controls, CausalChainView recursive with kind badges + counterfactuals, ProposalReview side-by-side with explicit-choice-required decide, CivilizationWalkthrough 5-step guided demo driving 021C domain functions directly in-browser via `@novelforge/story-simulation` workspace dep); no new API routes (consumes 021A/021B); ~40 new i18n keys en+id parity; §15 design tokens; web **15/15** (9 component + 6 axe zero violations), full web **421/421** no-regressions, vue-tsc + eslint clean; GAP-085/GAP-087 UI scope now addressed) | Review |
| NF-WF-010 | **IMPLEMENTED 2026-10-05, awaiting independent diff review** (contract `d309c52` reviewed CHANGES_REQUESTED, P1/P2/P3 applied, Q1+Q3 decided; implementer actor separate from author/reviewer; backend MODEL_UNVERIFIED per GAP-013; NOT committed — working tree left for the diff reviewer; state assembly (memory-vs-live corroboration), `reviewFinalText` + receipts + `setStatus` gate (author-decided behavior change), `evaluateHealth` all 7 categories, 3 routes, SCALE schema on write (GAP-012), typed `PolicyError` → 409, 003 compiler tiers 4/6 integration; 32/32 new tests, full API 510/510, story-versioning 17/17, lint + typechecks clean; GAP-038 fixed, GAP-039 open) | Review |

Current sequence: [DELIVERY-PLAN](../implementation/DELIVERY-PLAN.md).
Current assignment policy (author, 2026-10-05): model-neutral. Use the model
chosen by the author at runtime with a separate reviewer actor; prior model
names below attribute historical receipts only. No new reviewer was dispatched.
NF-WF-003 remains PLANNED after GAP-026 contract repairs; the refreshed review
manifest replaces the old round-3 artifact. Review before coding.
Current Engram hook has no authoritative registered session identity (GAP-021).
Reads are available; attributed saves are blocked. Progress holds the fallback.
Fresh bounded checks are recorded in the 2026-10-05 progress/test-matrix entry;
counts below are historical, not new full-platform verification.
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) is now
**IMPLEMENTED / REVIEWED**: the four HIGH mutation routes
(`proposal.approve`, `outlineVersion.approve`, `outline.supersede`,
`chapters.import`) accept the optional `expectedHeadRevisionId` with the §C12.1
tri-state, a mismatch is a 409 carrying `currentHeadRevisionId`, and both the
unlocked pre-check and the locked CAS are in place. Checks rerun at this
boundary against the scratch DB: targeted 145/145, story-versioning 17/17, full
API 365/365, root `pnpm test` 823 passed | 1 skipped, lint and typecheck clean.
The four per-route locked-CAS probes were falsified against a pre-check-only
build (200/200/204/201 with the locked comparison disabled) and pass restored.
The independent `glm-5.3-flash` review returned **APPROVE** on the production
diff — authorization precedes every head disclosure, generic 409s stay bare, the
tri-state is not collapsed — and one **MAJOR** test-fidelity defect: the probe's
`waitForBlocked` matched any lock waiter in the test database, so a foreign
waiter could release the probe before the request had parked. Fixed by pinning
the match to the parking backend's pid via `pg_blocking_pids`, re-falsified on
all four routes, and re-reviewed **APPROVE**. Reviewer backend is
MODEL_UNVERIFIED, so GAP-013 stays open.
[002F](../../tasks/NF-WF-002F-foundation-acceptance.md)
ran the parent gate and returned **VERIFIED 2026-10-04 for the evidenced M1
foundation scope only**. It reran every gate against the NF-WF-002 tree green
(story-versioning 17/17, constraints 8/8, targeted API 137/137, full API
365/365, root 823 passed | 1 skipped, lint, typecheck, build), exercised the
empty upgrade (all 20 migrations from empty) and the populated upgrade, and
corrected GAP-018: a failed `migrate deploy` is **partially applied** — its two
leading `DROP CONSTRAINT`s commit before `CREATE INDEX` fails, so the
documented `migrate resolve --applied` workaround is what strips the two
`canon_fact_sources` RESTRICT FKs, and a `DELETE FROM chapter_versions` for a
cited version then succeeds and orphans the citation. Accepted: revision,
snapshot, checkpoint, non-destructive restore, rebuild intent, tenant
isolation, the C3 `PRE_MUTATION` payload at all four HIGH sites, the 002D
tri-state with authorization before head disclosure, and atomicity. **Not**
accepted: full cross-domain recovery (GAP-004 stays OPEN at P1). GAP-017 and
GAP-025 closed; GAP-013 stays OPEN because **this verdict is
self-verification by the implementing model, not an independent review** — the
only independent verdict remains 002D's `glm-5.3-flash` APPROVE on a
MODEL_UNVERIFIED backend. NF-WF-003 (shared chapter context compiler) is the
next queue row and has **no contract file yet**; authoring and reviewing that
bounded contract is the next action.
This boundary's SessionStart hook confirmed an authoritative Engram identity
(`fae4b412-db3a-4ddc-a052-cfda214cfa9d`), distinct from the `0238856e…` binding
recorded at the 002D boundary; GAP-021 remains a per-boundary observation, not a
standing state.

**Reviewer transport note (2026-10-04).** `POST /v1/messages` with
`"model":"bansosmontera/glm-5.3-flash"` succeeded, but several attempts returned
`upstream_error` after emitting reasoning and before any content. A silent empty
answer from this gateway means "retry", not "no findings". The
`glm-cn/glm-5.3-flash` and `cl/z-ai/glm-5.3-flash` routes both returned HTTP 503
`429 ... balance/credit exhausted`, so only the `bansosmontera` route is usable.

## Attributed foundation implementation narrative

[NF-WF-002 revision foundation](../../tasks/NF-WF-002-revision-foundation.md)
is **IMPLEMENTED_WITH_GAPS** (2026-10-02, baseline `5b5f139`): the M1
migration, `@novelforge/story-versioning`, the revision service/routes and
the head CAS across all C3 mutations are delivered; own suites are green
(package 17, HTTP 25, constraints 8) and lint/typecheck/build pass. Its one
red gate — 123 pre-existing API tests failing because the new C8 head CAS
refused seeds that created a novel with no `novel_branches` row
(**GAP-017**) — is now repaired by
[NF-WF-002A](../../tasks/NF-WF-002A-fixture-compatibility.md), which converted
all 12 valid-fixture creation sites across the ten affected suites to the
production `createNovel` path. Actual reruns on the preserved diff: targeted
ten suites `288 passed (288)`, `revision.test.ts` `25 passed (25)`, full API
`338 passed (338)`, root `pnpm test` `796 passed | 1 skipped (797)`, lint and
typecheck clean (receipts in `test-matrix.md` G-01). The independent
exact-diff review returned **APPROVE** from two separate reviewer workers; its
two non-blocking findings were fixed in `narrative.test.ts` (final diff
`sha256 d775ad1f…`, 439 lines). GAP-017 therefore stays VERIFY_PENDING only on
NF-WF-002 / G-01 parent acceptance; no
production service was changed. Lazy baseline initialization remains
forbidden. Contract questions **GAP-019** are now disposed by
[NF-WF-002B](../../tasks/NF-WF-002B-contract-clarification.md) in
`STORY-VERSIONING.md` §C12, and that clarification is now **reviewed and
APPROVED** — receipt is the three reviewed artifacts
(`docs/03-domain/STORY-VERSIONING.md` `sha256 73e3c9f5…`,
`tasks/NF-WF-002C-premutation-ordering.md` `sha256 8fd083eb…`,
`tasks/NF-WF-002D-mutation-head-expectation.md` `sha256 640f9698…`), not a
combined-diff hash (those are milestones, and a register row cannot cite one
that includes itself); the reviewer's backend is MODEL_UNVERIFIED, so GAP-013
stays open. That review found a real recovery
defect rather than only clarifying prose: four HIGH call sites capture their
`PRE_MUTATION` snapshot *after* the mutation's writes, so the checkpoint an
author restores from holds the post-mutation image and the "step back from this
decision" operation is a no-op (**GAP-024**, measured by probe, P1). The same
review named two previously unowned requirements: no mutation route accepts a
client head expectation, so C4's optimistic-concurrency guarantee is unreachable
for callers (**GAP-022**), and `domainEventSchema.revisionId` has no producer or
consumer at all (**GAP-023**). The three have bounded owners —
[002C](../../tasks/NF-WF-002C-premutation-ordering.md) (**complete** 2026-10-02 —
round-1 review CHANGES_REQUESTED, dispositions recorded; round-2 re-review APPROVE, no findings),
[002D](../../tasks/NF-WF-002D-mutation-head-expectation.md) and
[002E](../../tasks/NF-WF-002E-domain-event-producer.md) (both PLANNED, blocked on
a decision rather than on capacity — **002D's decision landed 2026-10-03** and
it is now READY, with the four-route scope, tri-state body field and
409-body recovery recorded in `decisions.md`; 002E remains blocked on a consumer
design). **002C's production fix is in place**: all
four HIGH sites now call `advanceForMutation` before their first covered-table
write, each gained the payload-content assertion C12.6 asked for, and each was
proven to fail against the old ordering and pass against the new (four receipts
in `progress.md`). **GAP-024 is CLOSED.** Next execution is **002D** — not a
restart of 001, and not 003: G-01 acceptance must first close or explicitly
accept GAP-022 (GAP-024 is now closed).
**GAP-018/020** require
verified isolated test prerequisites; **GAP-021** records the missing Engram
runtime attribution handling — re-observed at the 002A, 002B, 002C-preparation
and 002C-execution boundaries, so each boundary's checkpoint is the fallback
handoff in `progress.md`, not an MCP write.
Its predecessor [NF-WF-001](../../tasks/NF-WF-001-revision-contract.md) is
DESIGN_COMPLETE / **VERIFIED**: three independent reviews ran
(`ctx_c4dcc5969164`, `ctx_db14a16c6968`, `ctx_a28a8bb47dc7`); rounds 1–2
returned CHANGES_REQUESTED, round 3 returned VERIFIED with all five round-2
corrections confirmed and every regression check passing. The contract is
frozen and NF-WF-002 is unblocked. The reviewer role never resolved to a
proven `glm-5.3-flash`: rounds 1–2 self-reported harness tier aliases, and
round 3 correctly returned `MODEL_UNVERIFIED` despite being dispatched with
the explicit id (GAP-013). M1–M9 runtime
gates are OPEN. This documentation repair implements
no runtime features. Record all live technical issues, uncertainty and gaps in
[ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md). The sections below
are the detailed baseline snapshot, not a competing issue queue.

Historical entries include October-dated claims relative to the 2026-09-30
review. Preserve dates pending receipt/commit attribution (GAP-014); they do
not prove that checks were newly executed.

- **Phase 0** — monorepo, Docker Compose (Postgres+pgvector, Redis),
  shared config, module boundaries, CI skeleton, Nuxt web shell, Fastify
  API health, worker + BullMQ bootstrap.
- **Phase 1** — auth, workspaces, memberships, novels, capability-based
  permissions (ADR-0004), audit log.
- **Phase 2** — chapters, immutable versions, autosave, editor shell,
  import/export.
- **Phase 3** — AIGateway/OmniRoute adapter, gateway + model registry,
  model profiles, logical requests/attempts, bounded retry/fallback,
  error classification, generation history, platform-admin authorization.
- **Phase 4** — versioned agents, skills, workflows; fail-closed
  structured-output contracts; validated acyclic graphs; deterministic
  multi-agent execution; run history.
- **Phase 5** — references with append-only versions, citable chunk spans,
  pgvector embeddings, hybrid lexical+vector retrieval (RRF), tenant and
  spoiler predicates in SQL, per-search provenance, `RETRIEVAL` workflow
  steps.
- **Phase 6** — canon facts with a DB-enforced one-live-value constraint,
  non-destructive supersede chain, candidate canon that cannot be silently
  committed, citable evidence spans; Story Brain answering FACT, STATE,
  EVENT, CAUSAL, UNRESOLVED, PROMISES with evidence; reader spoiler
  boundary on every read path. Independent adversarial audits found and
  fixed ten defects behind a green gate (details in `progress.md`).
  Slice 3 (2026-09-30) added the **write surface** the Brain had been
  reading without: events, timeline, threads, promises and causal edges are
  now authorable through the API, and the three pure rules that had no
  production caller (`canPromiseTransition`, `findCausalCycle`,
  `isChronological`) are enforced — two on the request, the third by the
  `(novel, order)` unique index.
- **Phase 7** — planning: synopses, sagas, outline nodes, outline versions,
  planning horizon; delete routes (planning entities, novels, canon
  entities, workflows) with FK hardening so refusals are legible 409s and
  canon/run history is never silently destroyed.
- **Phase 8** — character state, knowledge boundary, arcs, relationship
  stances, bonds (groups/agreements), transitions, meaningful
  interactions. Overlap is refused by three `btree_gist` EXCLUDE
  constraints, not only by the domain validators — each confirmed
  load-bearing by dropping it and retrying the refused statement. The
  roadmap exit criterion (monogamy/harem/polygamy and enemy-to-ally)
  is tested at the HTTP boundary in `apps/api/src/character.test.ts`.
- **Phase 9** — narrative DNA, drama windows, cooldown, antagonist
  lifecycle, pattern detection, scale appropriateness. The five rules are
  pure (`packages/narrative-rhythm`); persistence is three tables
  (migrations `20261004_phase9_narrative_dna` + `20261005_phase9_blank_reason_fix`);
  the surface is 12 routes in
  `apps/api/src/narrative-routes.ts`. Only the cooldown is HARD; the rest
  advise. Both roadmap exit halves are asserted at the HTTP boundary, and
  "non-mechanical" is asserted at the **word** level — a guidance string
  containing an imperative fails, because a state-only assertion would
  stay green while the soft preference became a schedule. The three
  hand-written CHECKs were each confirmed load-bearing by a drop-and-retry
  probe. A deep adversarial audit of this surface (2026-09-30, four rounds)
  found thirteen defects behind a green gate — six logic defects, three in the
  cooldown path — plus a missing `bodyLimit` on two routes, a JSONB `null`
  band and an unguarded `access` list that each threw a 500 where a 409
  was owed, and a check-then-act race in the stage advance — with seven
  coverage holes, all fixed with a regression
  test each; three further findings were confirmed as already-recorded
  accepted deviations rather than defects. Round four re-verified round
  three's refutations and found two of them wrong, which is recorded in
  `progress.md` rather than quietly dropped. Details in `progress.md`.
- **AI Orchestrator (milestone, 2026-10-03)** — one `ai.generate`
  lifecycle entry point that resolves the agent/skill definitions the
  workflow executor also resolves (shared `definition-resolution.ts`),
  compiles context under a char budget with persisted provenance ids,
  assembles the prompt, and runs the generation through the SAME Phase 3
  path a direct request uses — plus fail-closed structured-output
  contracts and an SSE route whose refusals are real status codes, not
  error events.

Historical reported gate (not rerun by this documentation repair): lint 0;
typecheck clean in every workspace (including
`apps/web`); `pnpm test` 35 files, 746 passed / 1 skipped on vitest
5.0.2; 18 migrations applying from empty (both test databases, 0 failed or
rolled back);
`pnpm -r build` green. Phase 8's eight new constraints and Phase 9's three
CHECKs were each confirmed load-bearing by a drop-and-retry probe, and
Phase 6 slice 3's six CHECKs were confirmed the same way. Two of Phase 9's
CHECKs had been probed only with spaces while being *named*
"whitespace-only"; `20261005_phase9_blank_reason_fix` replaced the
space-only `btrim(x) <> ''` test with a POSIX class over the full blank set
and both suites now probe all 19 shapes.

First run against a **real 9Router deployment** (2026-09-30) is recorded in
`progress.md` Round 9: gateway stored through the CRUD API (credential
encrypted at rest), 1 957 models synced, and the three-model chain
(`cbai/deepseek-v4.1-flash` → `…/DeepSeek-V4-Flash-0731` →
`…/MiniMax-M2.7`) verified end to end by disabling each tier in turn. It
found four defects the fixture-based suite could not: a start script that
could not run the app, a capability map hitting a `String[]` column, a
model sync outliving Prisma's transaction default, and an upstream SSE
sentinel on a non-streaming body stopping the fallback chain.

See `docs/implementation/progress.md` (round-by-round record),
`docs/implementation/test-matrix.md`, `docs/implementation/decisions.md`,
and `docs/adr/`.

## Next milestone

**M1 — Revision and context foundation**, followed by M2 (complete author
chapter loop) and M3 (state/memory for the next chapter). Pull forward the
minimum Phase 11 slice before expanding optional Phase 10 simulation.
The simulation validation scenario remains required for that later capability.

An earlier version of this file named "Phase 9 — Reader Platform". That
matched no phase in this repo's roadmap — it came from a different
numbering scheme — and has been corrected. Reader-facing access is tracked
under Phase 13/M4–M5 below; its runtime gap remains open.

Contracted extraction application is implemented (NF-WF-008, pending
separate diff review): the 006 template's extraction feeds a
contract-then-validate-then-approve canon application flow with
deterministic evidence validation, head pinning, and atomic apply.

## Known gaps carried forward

### Character & relationship (Phase 8)

- **The blueprint's other tables are deferred by name**, in the schema
  docstring: `character_state_events`, `character_beliefs`,
  `relationship_events`, `relationship_groups`,
  `relationship_group_members`, `relationship_agreements`,
  `relationship_arcs`, and structured reputation / possessions /
  development-milestone columns. Each earns a table when a consumer asks
  for one (ADR-0008 §5's posture).
- **`characters` is standalone**, not a `StoryEntity` of kind CHARACTER.
  A link can be added when a consumer needs canon claims *about a
  character*; nothing in Phase 8 reads one.
- **No character UI.** The Phase 8 surface is API-only; the writer
  workspace still does not show character or relationship state.
- **The overlap EXCLUDEs are per-table, not global.** A `character_states`
  row and a `relationship_stances` row may name the same chapters — the
  constraints govern each table's own windows.
- **Stances are directional and unpaired.** `A→B ENEMY` with `B→A
  FRIENDLY` is representable and correct; nothing derives a "mutual"
  reading, because the one-sided feud is the case the direction exists
  for.
- **No retention or pruning** on any Phase 8 table; `meaningful_interactions`
  grows per recorded scene.

### Narrative DNA & rhythm (Phase 9)

- **`NarrativeDnaProfile.dna` has no field inventory.** The schema comment
  says the shape is validated in `packages/narrative-rhythm`; that is true
  of the POLICY payloads and aspirational for DNA. No rule consumes a DNA
  field yet, so `putDna` accepts any JSON object. Pinning a list now would
  make the service a second, drift-prone schema (ADR-0009).
- **A `SCALE` policy is stored unvalidated.** `assessScaleAppropriateness`
  takes the protagonist's standing, not the novel's preference, so no rule
  can probe a scale payload. `DRAMA_GAP` and `COOLDOWN` are probed on write.
- **No narrative UI.** The Phase 9 surface is API-only; the writer
  workspace shows no DNA, policy, or antagonist state.
- **`density` is validated but has no behaviour.** A value outside
  `DRAMA_DENSITIES` is refused, but no rule varies its bands by density —
  the author's `typicalGap` / `extendedGap` numbers are the whole policy.
  Deliberate: a density→band mapping would be the universal default ladder
  the spec's Principle forbids.
- **`hardness` gates writes but no rule branches on it.** HARD without a
  reason is refused (ADR-009), so the column is load-bearing, but nothing
  yet reads it to decide whether a finding refuses or advises. The one rule
  that hard-refuses (`checkCooldown`) does so unconditionally.
- **`Antagonist` has no delete or correction path.** Append-and-advance
  only, as Phase 6 slice 3's five tables are. (Policies do have one:
  `DELETE .../policies/:kind`.)
- **`Antagonist.workspaceId` is denormalised** as the tenant boundary,
  alongside `novelId`. Nothing enforces the two agree; the service derives
  both from the stored novel, so a mismatch would take a direct DB write.
- **`advanceAntagonistStage` reconstructs the progression as
  `[current, next]`.** The row keeps only the current stage, so there is no
  stored history of how an antagonist got there — the pair is the honest
  reconstruction, and a full lifecycle log would need its own table.
- **The drama-window assessment is stateless.** `chaptersSinceDrama` is
  supplied by the caller; nothing derives it from chapters or beats, so a
  caller can pass any number.
- **The stage advance refuses a lost race rather than retrying it.** Two
  concurrent advances are resolved by a `stage` predicate on the write; the
  loser gets a 409 and must re-read. A retry-on-conflict loop was not added —
  nothing drives this route concurrently yet, and a silent retry would hide
  the fact that the caller's plan was built on a stale stage.
- **`access` and the drama bands are guarded, not validated.** A `null` or
  non-array `access` and a `null` band now produce a verdict instead of a
  `TypeError`, but nothing pins the *shape* of a `SCALE` payload the way
  `DRAMA_GAP` and `COOLDOWN` are pinned on write — see the `SCALE` entry
  above. The guards keep the failure a 409/verdict instead of a 500; they do
  not make an unvalidated payload valid.

### Canon / knowledge

- **Canon has no `revision_id` column, but its C3 mutations now participate in
  the revision/checkpoint model**: `proposal.approve` advances a revision and
  captures a `PRE_MUTATION` snapshot covering `canon_facts` and
  `canon_proposals` (NF-WF-002, accepted 002F 2026-10-04 for that scope).
  Non-destructive correction still relies on the supersede chain alone, and
  full cross-domain recovery is not accepted (GAP-004). ADR-0013 supersedes
  ADR-0008 §4's scheduling deferral.
- A canon fact's chapter citation is a historical pin — resolvable forever,
  but not "the current version" once the chapter is saved again.
- **LLM fact extraction is not implemented.** Canon is author-authored only;
  extraction would be candidate canon needing approval (§2.13).
- Chapter prose is not searchable (no chapter tsvector, no chapter chunks),
  so prose recall reaches reference material only.
- `available_from_chapter` is a chapter number, so a chapter reorder must
  recompute authored boundaries or the spoiler filter drifts.
- **No ANN index on embeddings.** Exact scan over a workspace's vectors;
  revisit with a raw-SQL migration when measurably slow (ADR-0007 §2).
- Retrieval quality is bounded by the chunker's paragraph/line/sentence
  heuristics.
- Ingestion is synchronous within the request; embeddings should move to
  the worker queue when documents are large enough to time out (CLAUDE.md
  §24).
- Only text ingestion exists; PDF/DOCX/TXT/Markdown extraction is not
  implemented (§32). `ReferenceKind.IMPORTED` is reserved for it.

### Reader-facing access (Phase 13, M4/M5; runtime gap remains)

- **Phase 13 now owns reader-facing delivery.** `READER_MODE` and the
  spoiler boundary exist (Phases 5/6) and are enforced on every read path,
  but reader-facing publishing, chapter access control for non-members and
  a reader UI still require implementation. An earlier
  `CURRENT.md` called this "Phase 9 — Reader Platform"; the roadmap's
  Phase 9 is Narrative DNA & Rhythm. The capability is real and partial —
  completion is assigned to NF-WF-012–014 and NF-WF-019.
- `Chapter` has a publication state, but there is no route that serves a
  published chapter to an unauthenticated reader, and no reader-facing UI.

### Story intelligence (Phase 6 slice 3)

- **Hierarchical memory (L0–L6) is not materialised**, among the remaining
  Phase 6 integration deliverables. ADR-0008 originally rejected it for this
  phase by name: summaries are rebuildable projections (§2.2), and
  materialising them without a `built_from_revision` FK was the original
  reason for deferral — a projection with no recorded source revision cannot be
  invalidated when its canon changes (§2.14). The rule lives in
  `docs/03-domain/STORY-INTELLIGENCE.md`. ADR-0013 moves the revision
  foundation to M1 and consolidation to M3; do not pre-create seven tables.
- **No delete routes on any of the five tables.** `causal_edges` cascade
  from `story_events`, so deleting an event would silently take its causal
  claims with it (CLAUDE.md §9). A correction path needs a supersede chain
  before a delete is safe; the surface is append-and-transition only.
- **`story_thread_events` has no API.** The thread↔event join is
  schema-present and unused; it earns a route when something needs to
  render a thread's event history.
- **No timeline reorder.** `appendTimelineEvent` assigns the next slot and
  there is no way to move an entry — renumbering a timeline the reader has
  already seen is a deliberate non-goal, but insert-in-the-middle will need
  a design (likely explicit gaps, not renumbering).
- **The concurrent-append 409 has no covering test.** Prisma serialises
  injects on one connection, so the race cannot be forced deterministically;
  the branch is documented race defence.
- **No story-intelligence UI.** Events, threads, promises and causal edges
  are API-only; the writer workspace still shows none of them.
- **Timeline and story events are separate tables with no link.** A
  `timeline_events` row carries no `chapter_id` and no relation to a
  `story_event`; in-story time and reading order are not yet reconciled.
- **The Brain's EVENT/CAUSAL legs are unbounded lists** (the audit row caps
  provenance at 100). Pagination arrives when a novel's event count makes
  it matter.

### Delete semantics (settled 2026-10-02, migrations 20261002 / 20261002b)

- `canon_facts.entity_id`, `canon_facts.object_entity_id` and
  `canon_facts.novel_id` are `ON DELETE RESTRICT`: a canon fact is the
  record and survives every parent delete; the refusing route (entity or
  novel delete) answers 409. The block is PERMANENT — retraction withdraws
  a claim but keeps the row, so only unreferenced entities (and fact-free
  novels) delete.
- `workflow_runs.workflow_id` / `.workflow_version_id` are RESTRICT: run
  history is the execution audit trail; a workflow with runs (or a novel
  that has any) refuses with 409.
- `canon_proposals` FKs stay CASCADE — proposals are uncommitted candidate
  canon and die with their subject.
- Delete routes live for planning entities, novels, canon entities, and
  workflows; a novel-delete route test pins both refusal paths.

### Workflows

- A `RETRIEVAL` workflow step always searches in AUTHOR mode; the step
  contract has no `mode`/`readerChapter` field.
- Workflow runs execute synchronously within the request. Durable execution
  is now NF-WF-004/M2 work, not a late Phase 13 deferral.
- An `AWAITING_APPROVAL` run stops but cannot yet be resumed. Its
  `completedAt` is deliberately null so a resume path can distinguish it
  from a finished run.
- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); no
  per-workspace override and no operator UI.

### Ops / editor

- **No retention or pruning on the audit tables.** `retrieval_audits`
  (now wider — one row per Brain ask too) and `Generation` rows grow
  unbounded. Needs a TTL, partition, or archive job before the tables are
  large — Phase 13 concern.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and Ubuntu.
# Boundary update — NF-WF-036, 2026-10-07

NF-WF-035 pushed at 3086e7c. NF-WF-036 IMPLEMENTED/REVIEWED: GAP-110
scene create/edit/reorder now records checkout revision/change set and rebuild
intent atomically. No-op timestamps stay unchanged. Sibling manuscript and
publication locks follow novel/branch/chapter order. Scene20/20; expanded
API58/58; worker publication21/21; API typecheck/lint exit0. Separate reviewer
APPROVE; no full release proof. NF-WF-037 Recovery Center wiring under review,
GAP-111/112 recorded. Engram attribution remains unavailable; this is fallback
working context, not an attributed MCP save.
# Boundary update — NF-WF-037, 2026-10-07

NF-WF-036 pushed at2479696. NF-WF-037 IMPLEMENTED/REVIEWED: recovery header
link/page, server checkpoint/branch choices, manual checkpoint, all4 real
components, mutation refresh and preview/request pinning. Autosave newer edits,
failed/in-flight chapter switching and route leave now preserve the buffer.
GAP-083/111/112 resolved within the bounded scope. Focused web27/27; en/id page
axe zero in jsdom; web typecheck/lint and Nuxt production build exit0. Separate
review_mutations_034 APPROVE. Next: sequential NF-WF-023 on the final revision;
no live browser/manual screen-reader proof. Engram attribution unavailable per
runtime hook; this file/task is the fallback checkpoint, no MCP save claimed.
# Boundary update — NF-WF-038, 2026-10-07

NF-WF-037 pushed at36519e2. Initial final battery stopped/invalid: temporary
PowerShell driver argument splat failed; actual E2E failed before collection
because agent-template parser rejected WindowsCRLF. GAP-113 repaired in separately
reviewed NF-WF-038: template10/10, package typecheck/targeted lint exit0, reviewer
APPROVE. Failed attempt retained in039 release report. Next: fresh NF-WF-039
sequential battery on post038 commit. Live API/web/storage/gateway listeners absent;
no live deployment or manual accessibility proof. Engram attribution unavailable;
this record is fallback only.

## 050A repair in progress — 2026-10-09 02:38 WIB

Branch `work/nf-wf-050a-scale-evidence` merged origin/main `209a911`
(commit `3054cc3`); GAP-118 conflict resolved (coordinator's P1 kept,
fixture-only diagnosis marked SUPERSEDED with provenance note).

Two separate implementers dispatched (MODEL_UNVERIFIED per GAP-013):
- Service repair: capability enforcement, re-read after lock, RepeatableRead,
  pagination cursor, stored-data validation, strict schemas
- Test repair: versionId source, expectedVersion, actor 400, validator targeting

Schema: `@db.Timestamptz(6)` added to ScaleEvidenceSet.createdAt to match
applied migration (no migration rewrite). Prisma validate passes.

GAP-118 repair plan recorded in ISSUES-AND-GAPS.md.

## 050A repair complete — 2026-10-09 03:13 WIB

All GAP-118 defects fixed. 32/32 scale-evidence tests pass (22 original + 10
evidence). Manuscript 21/21, restore-scope 8/8. Typechecks, lint, diff-check clean.

Evidence: simultaneous appends, lock/read races, historical-version refusal,
direct-service role denial, pagination integrity, checkout/headless, FULL/selective
restore, malformed stored evidence, deletion/create race, parent cleanup.

GAP-108 8th recurrence during repair (VM reset); environment restored.
Final diff review dispatched; awaiting verdict before commit/push.
GAP-039 remains OPEN.

## 050B implementation started — 2026-10-09

Branch `work/nf-wf-050b-scale-review` created from `fed3cea` (frozen 050B contract).
Frozen hashes verified:
- Task: B6A44390D2485D90A62C23B971E0B1039DB177A4F412D970D2C4A78AA78ABE45
- ADR-0016: 1909A48A9B958C787F76FCBF678528E106165F079192B30D764922ECDC917C52

**Assignments (2026-10-09):**
- Implementer: coordinator (this session; backends MODEL_UNVERIFIED per GAP-013)
- Separate slice reviewers: to be dispatched per slice (MODEL_UNVERIFIED per GAP-013)
- Contract reviewers (prior): review_mutations_034, review_recovery_034 (APPROVE)

**Execution order (serial reviewed slices):**
1. Additive storage, migration proofs, frozen context interfaces
2. Author decisions, deterministic SCALE review, shared API/worker gate
3. English/Indonesian UI and real author-flow acceptance

GAP-039 remains OPEN; 050C separate. Engram unavailable (GAP-021); this file is fallback.

## 050B repair scope amendments — 2026-10-09

Bounded amendments to the frozen contract's allowed paths:

1. **`packages/ai-services/src/scale-review-types.ts`** (NEW): Contains the frozen protocol 1 types (`ScaleReviewPins`, `ScaleReviewClaim`, `ScaleReviewProtocol`) required by the contract's "freeze exported context/pin/gate shapes". Within the allowed `packages/ai-services/src/` package. No contract violation.

2. **`apps/api/src/scale-evidence-migration.test.ts`** (MODIFIED): Baseline now excludes post-050A migrations (e.g., 050B) to prevent FK failures. The 050A test is 050A-focused; 050B has its own migration test. Bounded test-only change.

3. **`packages/ai-services/src/policy-errors.ts`** (MODIFIED): Added `SCALE_ASSESSMENT_INCOMPLETE` to `PolicyErrorCode` union. Required for the contract's distinct frozen error code (not mapping incomplete to HARD_POLICY_VIOLATION).

4. **`packages/database/prisma/migrations/20261008_nf_wf_050b_scale_decisions/migration.sql`** (DOCUMENTED): Uses TIMESTAMPTZ(3) not TIMESTAMP(3). The schema explicitly declares `@db.Timestamptz(3)`, which selects TIMESTAMPTZ(3) — this is NOT Prisma's default mapping (plain DateTime maps to TIMESTAMP). Precision (3) matches the contract; timezone-awareness is additive and does not change contract semantics. Same pattern as 050A's explicit `@db.Timestamptz(6)`.

**Review status (honest record):** These 4 amendments have NOT received a standalone independent scope-amendment review with a separate recorded receipt. They were included in the repaired diff reviewed by the independent repair reviewer (verdict: APPROVE_WITH_FINDINGS, 2026-10-09), whose report noted them as "bounded, documented, do not weaken the contract" — but that was part of the overall diff review, not a dedicated scope-amendment approval. A separate recorded scope review is still owed per the contract's amendment procedure.

All amendments are bounded, documented, and do not weaken the contract.

## Migration preservation proof (relabeled 2026-10-09) — was "Old-snapshot restore proof"

**Historical note:** This section was originally titled "Old-snapshot restore
proof" (2026-10-09). That title was misleading: the evidence below proves
pre-upgrade receipt preservation through the additive 050B migration, NOT a
STORY checkpoint restore via NovelForge's restore path. The title is corrected
here; the original evidence and provenance are preserved unchanged below.

`apps/api/src/scale-review-migration.test.ts` proves migration preservation (OBSERVED 2/2 pass):

- **What was tested:** A genuine `FinalTextReview` row (verdict, hardViolations, advisory, evaluatedPolicies — no `scale_review` column existing) is inserted into the BASELINE database BEFORE the 050B migration runs. This baseline represents a pre-upgrade database.
- **After upgrade:** The receipt is re-read and verified field-by-field identical (verdict, hardViolations, advisory, evaluatedPolicies all preserved). The new `scale_review` column reads NULL for the legacy row — NULL denotes legacy receipt, never fabricated proof of SCALE completeness.
- **What this proves:** Pre-upgrade data is preserved through the additive migration; legacy receipts are not rewritten or fabricated; the nullable column correctly defaults to NULL.
- **What this does NOT prove:** An actual `pg_restore` of a production snapshot binary, or restore of a snapshot taken from a different Prisma version. The restore-scope classification (both tables OPERATIONAL, never rewound) is unit-tested in `restore-scope.test.ts` (8/8 pass), not via a live restore operation.

## STORY checkpoint restore proof — 2026-10-09 (Slice 2, superseded 2026-10-09 Slice 2 fourth repair)

**Historical annotation (2026-10-09):** The evidence below was simulation and
classification, NOT an actual application STORY restore. The test inserted a
NULL receipt, asserted coverage constants, and manually advanced the head — it
never constructed old snapshot JSON or invoked NovelForge's restore path
(`previewRestore`/`applyRestore`). The claim "exercises the STORY restore
semantics" is retained here for provenance but annotated as UNSUPPORTED as a
restore proof. See the replacement below.

`apps/api/src/scale-decisions.test.ts` → "STORY restore with old snapshot JSON
lacking scale_review" (OBSERVED pass) exercises the STORY restore semantics:

- **Legacy receipt handling:** A `FinalTextReview` with `scaleReview: null`
  (simulating a pre-050B snapshot JSON lacking `scale_review`) is returned by
  `listFinalTextReviews` without crashing, with `scaleReview: null` — null
  denotes legacy, never fabricated proof.
- **Retained OPERATIONAL S2 history:** `scale_decision_proposals` and
  `scale_decision_outcomes` are NOT in `COVERED_TABLE_NAMES` (verified in-test);
  STORY restore never rewinds them. S2 proposal+outcome created before the
  simulated restore remain intact.
- **Stale applicability:** After the head advances (as a restore would), the
  receipt's `revisionId` pin no longer matches the current head → the receipt
  is stale (does not reflect current state).

## ACTUAL STORY restore proof — 2026-10-09 (Slice 2, fourth repair)

`apps/api/src/scale-decisions.test.ts` →
"ACTUAL STORY restore with old snapshot JSON lacking scale_review: invokes
previewRestore/applyRestore" (OBSERVED 2026-10-09, 32/32 file pass) invokes
NovelForge's REAL restore path:

- **Old snapshot JSON constructed:** the PRE_MUTATION checkpoint's snapshot
  payload (captured by the HIGH VILLAGE→TOWN standing change) is read;
  `scale_review` is stripped from every `final_text_reviews` row — the
  pre-050B format. Sanity assertions prove the stripped payload lacks the key
  and still pins the VILLAGE standing.
- **Real restore invoked:** `previewRestore` + `applyRestore` (FULL scope) via
  `createRevisionServices` — the actual application code path (delete covered
  rows, re-insert from the old payload, rewind the branch head, record the
  RESTORE revision). Not a simulation: `applyRestore` returns APPLIED with a
  new revision ID.
- **Standing rewind proven:** policy standing reverts TOWN → VILLAGE (the old
  snapshot's value), verified by reading the live policy after restore.
- **Legacy receipt handling proven:** restored `final_text_reviews` rows have
  `scaleReview: NULL` (old JSON had no key); readable without crashing; the
  pre-restore legacy receipt's verdict survives.
- **Retained S2 history proven:** the proposal + outcome (OPERATIONAL tables,
  outside restore scope) survive the FULL restore intact.
- **Stale applicability proven:** the restore advances the head to a new
  revision; all restored receipts pin older revisions → stale.

`apps/api/src/scale-decisions.test.ts` →
"PRE_MUTATION checkpoint snapshot captures the pre-change standing" (OBSERVED
2026-10-09) inspects the successful HIGH mutation's checkpoint:

- **Source revision:** `checkpoint.revisionId` equals the pre-decision head
  revision ID — the snapshot is pinned to the pre-change revision.
- **Snapshot content:** the `narrative_policies` SCALE row in the snapshot
  payload carries `standing.scale: "VILLAGE"` (the pre-change value) while the
  live policy reads `"TOWN"` — proving the snapshot captured the pre-change
  standing, not a copy of post-decision state.
