# Real-novel staging acceptance — October 24–25, 2026

Status: VERIFIED for the recorded automated staging scope; author review and
full production release gates remain separate. This record separates observed
product execution from author acceptance.

## Authorized scope and source protection

The author requested one real local novel on staging, working gateway models,
and a temporary copy of the private gpt-image-2 provider for actual cover tests.
The temporary provider and its upstream credential must be removed afterwards.
No commit or push is authorized by this task.

Source: the existing Windows acceptance database, novel
`e36d568b-aecf-476a-8e3f-f47ca709672b`, *Kaisar dari Masa Depan*, workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9`. Source reads used a read-only transaction.
Its Indonesian manuscript is retained verbatim under the author's language
override. Exact comparison after staging operations confirmed all43 selected
source tables/1,035 rows unchanged. Existing WIP and acceptance stash remain.

## Import and recovery evidence

- Collision-free INSERT ONLY transfer to the same UUIDs, preserving the existing
  owner identity, lineage and structured story data. No other users or sessions
  imported. Staging novel and all chapters are DRAFT, not public.
- 10 chapters,18 immutable text versions,33 scenes,10 characters,20 entities,
  14 canon facts and citations,6 references/versions,263 revisions/change sets,
  293 change items and associated planning/relationship/state data retained.
- Old publications, reader data, review acceptance, workflow history, credentials,
  covers, derived projections and restorable snapshot payloads were excluded.
- Disposable native clone rehearsal passed exact every-row JSON read-back after
  documented DRAFT/settings transformations. Duplicate import refused with
  COLLISION and unchanged audit count. Scratch database removed.
- PostgreSQL preimage969,942 bytes; TOC validated. Separate read-only reviewer
  approved exact source/import/transfer hashes before live import. No constraints
  were disabled; only four nullable pointer cycles were staged in two passes.
- Fresh native checkpoint `48ff3ced-ff30-453c-a7bd-9004d18561b2` saved and read back.
  Original Bab10 remains1,484 words/version1, unchanged by AI testing.

## Real chapter execution and evidence limits

The maintenance harness initially chose the historical generation workflow,
which did not forward the extra author notes or pin chapter10 like the current
author UI does. Those failures are retained; they are not completion evidence.
The corrected `chapter-creation-review` path pins chapter/version/head/outline
on the server and forwards the author's detailed outline.

IFM plan/writing attempts produced incomplete structured output at the observed
output capacity. Qwen3.8Max planning succeeded. Native retry
`5ded1c03-296d-43e2-857e-8eef472e3a0a` reused the three successful prefix steps
exactly, then generated, reviewed, corrected and extracted from an actual
Indonesian chapter. Requested `bansosinfoapi/gw/qwen3.8-max`, reported
`qwen3.8-max`, across the successful model calls. Current staging planner,
writer and continuity profiles use Qwen; former rows remain disabled historical
configuration. Final review/extraction already used Qwen. Configuration changes
had a private PostgreSQL preimage and separate review.

The first complete alternative was1,309 words, contained Don Juan/Husein/Anton/
Darma, and reached AWAITING_APPROVAL. Schema/validator success does not mean
its final review was positive: needsCorrection=true. Independent automated
narrative review found the claimed sleep/intimacy contradiction unsupported,
but confirmed a missing explicit request for Sofian to cook, a transition typo,
and wording that could obscure the established temporary gill mechanism of the
fictional Rumput Tuba. The extraction included noncontiguous/altered citations;
the initial automated report is historical review evidence, not proof of exact
citation parity.
Candidates remained unapproved and the original14 canon facts unchanged.

A distinct corrected request `66d0f5c1-7f7a-4c52-86de-b6928714f5ee` incorporates
those grounded notes and exact-contiguous-citation instructions, while retaining
the author's original outline. It reached AWAITING_APPROVAL with1,261 words;
all model steps and validators completed using Qwen3.8Max, including two bounded
corrections. It does not reuse the earlier prefix because its input changed.
Final review still has needsCorrection=true with one minor grooming/transition
finding and no major/blocking findings. Independent automated review judged
that specific contradiction unproved, but retained small editorial issues
(repeated leaf separation and waking just before the knock). Do not relabel
the stored result as a clean review or as human acceptance.

Sofian's waking/request-to-cook beat and the fictional temporary-gill mechanism
are now explicit. Recomputed with whitespace/HTML-entity normalization,16/19
whole extraction citations are contiguous spans. Two contain explicit omissions;
one silently joins newline excerpts across omitted prose. All23/23 fragments
match after splitting explicit omissions and newlines. This corrects the first
automated review's overcount; it proves fragment parity, not universal contiguous
citation parity. All19 candidates
remain proposals. Original chapter10/title/version and14 canon facts are
unchanged; publications remain0. Authenticated browser preview matched this
exact latest artifact, with no page errors; operator session revoked/401 verified.
No author sign-off, canon application or publication is inferred from actor IDs.

## Real cover generation and credential cleanup

The first count1 cover request failed UNSUPPORTED because the staging source and
production build omitted the existing image generation POST route. Image catalog
discovery alone had not proved generation support. A credential-free negative
probe confirmed HTML404. Existing adapter sources matched the local repository.

The existing17-line route was copied with normalized newlines. Build used an
isolated `.next-real-cover-20261024`; the previous `.next` remains rollback.
Activation uses `30-novelforge-image-route.conf`; startup/negative-probe failures
are rollback protected. Actual negative POST now returns401 JSON.

An initial pnpm12 invocation automatically installed an incidental dependency
tree then refused an unrelated lifecycle build. That refusal was not bypassed.
The incidental tree was preserved; isolated native npm ci restored the existing
package-lock's Next16.3.6. Swap/restart/probe had rollback protection. The final
build invoked installed Next directly; build and activation passed.

After this repair, one new real gpt-image-2 request succeeded:

- Batch `57546b6f-ba4b-43f9-b47d-75f633823427`, count1, manhwa style.
- Normalized image327,440 bytes; SHA256
  `18a0cb8242b2d9c77fbb73686488a323eb247590b071a376e3de886561d2a5d0`.
- Candidate read-back, normal cover apply and saved-cover read-back matched.
- Temporary NovelForge gateway/models/mappings, router provider node/connection/
  custom model removed; no outstanding cover work. Existing resident router
  client key was reused and preserved; no new raw client key was generated.
- Upstream secret transferred only through encrypted SSH stdin/process memory,
  never receipts, argv or project files. Verified absent from live SQLite/WAL,
  router journal and preimage after secure-delete/checkpoint/vacuum cleanup.
  Original provider/connection/client-key identity sets and router backup set
  matched their pre-test values. Router restarted active.
- Cover remained readable after temporary gateway deletion. Actual authenticated
  browser image decode and cover-studio display passed. Visual inspection saw
  a complete portrait illustration without lettering, as requested by the brief.

The source key was removed after both the failed and successful tests. A locked,
root-owned, secret-free watchdog provides post-failure cleanup; it is not a hard
15-minute credential-lifetime guarantee. Historical failure and successful
receipts are separate. The image remains usable; future generation needs an
owner-configured permanent image provider.

## Browser, authorization and release assessment

Observed before the cover addition: desktop/mobile editor showed10 chapters;
all6 reference entries opened without page errors; other-workspace access404,
unauthenticated access401; no horizontal mobile overflow. Cover-specific browser
verification then passed separately. All operator-issued sessions were revoked,
with actual401 read-back. These are automated checks, not real owner-password
typing or human visual/screen-reader acceptance.

Reuse the earlier [staging audit](STAGING-AUDIT-2026-10-24.md) for actual
registration/admin/public-reader interactions, origin/proxy boundaries, object
storage PUT/GET/DELETE, backup and disposable restore proof. Do not relabel those
synthetic public-reader tests as publication of this private real manuscript.

| Gate | Evidence/state |
|---|---|
| Actual local story transfer and source preservation | Observed PASS |
| Native checkpoint and private original text preservation | Observed PASS |
| Real AI generation/review/correction/extraction | Executed; semantic quality/approval tracked separately |
| Real cover, application, read-back and temporary secret cleanup | Observed PASS |
| Desktop/mobile data access and tenant boundary | Observed PASS for this scope |
| Real-book public publication and author sign-off | Not performed; manuscript remains private |
| Embedding-backed search of this imported copy | Not proved; derived vectors were not imported and no working staging embedding route has been evidenced |
| Full 2,000–2,500-chapter/load acceptance | Not proved by this10-chapter journey |
| Off-host/PITR/router+image backup and external alert acceptance | Earlier remaining operational gates; no new proof here |
| Human screen-reader acceptance | Separate author-deferred scope; never inferred from automated actors |

This is evidence for controlled staging use with real data. It is not a blanket
claim that every M8 production gate has passed.

Final read-back: all five services active; novel DRAFT,10/10 chapters DRAFT,
14 canon facts,0 publications,0 active workflow/cover work,0 temporary gateways
and0 temporary image catalog entries. Original router topology retained:
2 provider nodes,2 connections,1 existing client key. No commit/push performed.

Private receipts and screenshots are ignored under `.nf-artifacts/staging-real-*`.
They contain story/test data and are not public README artifacts. See the
[task contract](../../tasks/staging-real-novel-and-temporary-cover-acceptance.md)
and the single [issue register](../implementation/ISSUES-AND-GAPS.md).
