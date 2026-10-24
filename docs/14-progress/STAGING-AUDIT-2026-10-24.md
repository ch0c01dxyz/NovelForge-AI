# Direct staging audit — 2026-10-24

Latest model retest completed normal source-checked retry through SUCCEEDED.
The final section records current IFM/MiniMax/Qwen3.8Max routing and isolated
agent output-capacity settings. Earlier OPEN combined-policy/provider statements
below retain their historical scope; this is not public release acceptance.

Latest follow-up: owner registration and temporary publication/reader tests below
supersede earlier missing-owner and untested-publication prerequisites. Current
combined-policy generation remains blocked at review by gateway availability;
earlier complete Qwen workflow evidence is retained with its original scope.

Latest provider status: the author replaced RadoxAI after the initial audit.
The historical quota failure below is superseded for current connectivity by
the successful replacement-provider checks recorded at the end of this report.
The subsequent automatic-configuration section also supersedes the earlier empty
application-configuration prerequisite and records real chapter workflow proof.

## Scope and source

The author authorized direct inspection and repairs on the dedicated staging
host at `https://novamind.my.id`, using existing SSH key authentication. This is
staging authorization, not public release or commit/push authorization.
Local baseline: `9d82964cd653119f03fb21e7b7e6c355fe321beb` on `main`.
Initially all 797 tracked application/package files matched the copied deployment;
the remote application directory has no Git metadata. Existing local changes,
the `nf050b-acceptance-wip` stash and Windows Docker data were preserved.

Observed host: native Ubuntu 26.04.1, Node 24.22.1, pnpm 12.5.1, PostgreSQL 18.6,
pgvector 0.8.1, Redis 8 and Garage 2.1.0. There were 56 finished migrations and
none failed. The previous deployment report is retained evidence, not a substitute
for these observations. PostgreSQL/Garage substitutions remain documented in
ADR-0020; this audit does not turn staging into a production release.

## Findings repaired and verified

1. **Browser origin boundary.** A sibling-site `text/plain` logout invalidated a
   dedicated audit session before repair. SameSite=Lax did not prevent it.
   Shared request protection now validates the configured canonical Origin;
   cookie-authenticated writes require Origin or a same-origin Referer.
   Production configuration requires `PUBLIC_ORIGIN`. Actual foreign logout now
   returns 403 and the original session remains valid (200). Normal HTTPS login
   works with Secure, HttpOnly, SameSite=Lax cookies.
2. **Network/proxy boundary.** API, web and gateway initially listened on wildcard
   interfaces despite the deployment report. External probes timed out; public
   reachability was not established. They now listen on `127.0.0.1` only.
   Fastify trusts only loopback proxies; nginx overwrites forwarded host/protocol
   metadata and appends its actual peer. Two real client peers retained distinct
   IP identities and spoofed earlier forwarded metadata was ignored. nginx also
   supplies nosniff, SAMEORIGIN, strict-origin-when-cross-origin and one-day HSTS;
   the `www` hostname redirects to the canonical origin. nginx configuration
   validation passed; certificate renewal timer is enabled.
3. **Recovery schedule.** Installed the reviewed daily PostgreSQL runner with a
   root-owned executable, root-private DATABASE_URL-only environment, fixed
   executable PATH and restricted systemd service. Review rejected running
   application-owned code/environment as root. An installation ownership guard
   found `/usr/local/bin` and its Node binary owned by an unassigned UID; only
   these two verified paths were corrected to root ownership.
4. **Storage credentials.** Both Python and independent curl SigV4 PUT initially
   failed with 403 Invalid signature. Regions matched, but the application's
   secret did not match the selected Garage key. After a root-private environment
   backup, the application secret was aligned with that existing key. No key was
   rotated. Actual PUT 200, GET 200 with exact payload parity and DELETE 204 passed
   for one isolated object. Existing objects were not changed; anonymous bucket
   access returned 403.

## Proof retained

- API boundary/app tests: 13 passed. Configuration tests: 9 passed. API and config
  TypeScript checks, scoped ESLint and diff whitespace check passed.
- Backup self-checks: Linux 7 passed; Windows 6 passed and one Linux-only skip.
  Unit validation and scoped ESLint passed.
- Separate read-only reviews approved the exact security and backup artifacts.
  Sorted path/NUL/raw-SHA256/LF aggregate manifests were respectively
  `d6f9ff12f95ece6ee0d03ee8ae49df92f330965bb3a013b1263a2a50eb7ff7b2`
  and `de78aba5e97857b16097ec6d8104998dcc719177fc63f3cc53390def8e6d2563`.
- Actual archive: 397,865 bytes, SHA256
  `c0c7fbc8756488aeb895863abb85ed45bef73d76956017cb6a4fa17f80c05ab3`.
  Restored into a fresh disposable database: all 106 table row counts matched
  and 56 migrations were readable. The scratch database was then dropped.
  The timer is enabled/persistent at 02:30 UTC daily, retaining seven owned daily
  archives. The source live database was never replaced.
- Two isolated audit accounts exercised real HTTPS workspace/novel/chapter
  creation, save/read-back, stale-save 409 and single-workspace limit 409.
  Cross-tenant reads and workspace mutations returned 404; normal-user privileged
  routes returned 403. Private drafts were absent from the public catalog.
- Actual Chromium login and author/editor screens passed on desktop and 390px
  mobile, with saved text visible, no horizontal overflow, no JavaScript errors
  and no failed requests in the checked journey. The isolated API-created
  workspace has no installed chapter template; this is not AI workflow proof.
- Private helper receipts/screenshots are under ignored `.nf-artifacts/`.
  Remote pre-repair source/environment copies and database archives remain
  root-private. Credentials, account passwords and verbose logs are not included
  in this report. The baseline hosted CI was green; patched CI has not run.

## AI configuration and remaining gates

The author subsequently confirmed RadoxAI was configured. Read-only router
inspection observed one active custom provider and one active gateway API key.
NovelForge's actual adapter discovered 273 text models. A real JSON generation
request for `radoxai/deepseek-v4-flash-0731` failed; router evidence identifies
upstream HTTP 402 `insufficient_quota` / `insufficient_funds`. A streaming probe
was also rejected. Do not retry a known quota failure or claim generation passed.

The application's persisted gateway, model and profile-mapping tables still
contained zero rows. Router credentials/catalog do not install NovelForge's
gateway/model/profile configuration. The two application users observed are the
isolated audit users, not an established owner account. Next prerequisites are
provider balance, the author's main account/admin setup and application gateway/
profile setup. Then verify a real chapter workflow and a freshly published public
reader journey. Do not elevate an audit account or copy Windows credentials to
simulate those prerequisites. Generation, text acceptance, canon approval and
publication remain separate outcomes.

No offsite copy, weekly/PITR recovery, router SQLite backup, Garage object backup
or external backup-failure alert has been implemented or proved by this task.
Human screen-reader acceptance remains author-deferred; browser checks are not
human acceptance. This is a bounded staging audit, not a full penetration test or
production release certification. `/ready` checks alone do not prove AI/storage.

Application repairs are active on staging but uncommitted and unpushed locally.
Redeploying the original revision would discard them. Preserve the reviewed patch
and private host backups until integration is separately authorized. Follow
[ADR-0021](../adr/ADR-0021-browser-origin-and-local-proxy-boundary.md) and the
[backup runbook](../../scripts/ops/README.md) for operational prerequisites.

## Subsequent provider refresh — 2026-10-24

The author reported removing RadoxAI and requested another live check.
Read-only server inspection observed two active custom connections with configured
credentials: `bansosinfoapi` and `bansosifm`. The authenticated catalog returned
251 models and no `radoxai/` models. No configuration or account permissions were
changed during this follow-up.

Real calls through the existing deployed `OmniRouteGateway` adapter:

- `bansosinfoapi/gw/qwen3.7-plus`: JSON output parsed and matched a fresh nonce
  and requested greeting; reported model `qwen3.7-plus`, 886 input/54 output tokens,
  finish reason `stop`. Streaming returned 31 characters across seven chunks and
  the iterator completed without an exception. This does not test interrupted
  streams or establish every model's capability.
- `bansosifm/IFM/K2-Horizon-375B-A23B`: initial 256-token probe contained the nonce
  but ended with `length`, so it was incomplete. The private helper's initial
  PASS label only reflected nonce detection and was corrected to require normal
  completion. One bounded follow-up allowed 1,024 tokens and returned the nonce
  with 39 input/79 output tokens, finish reason `stop`. Reported model:
  `IFM/K2-Horizon-375B-A23B`.

These current successful calls remove the old provider-balance blocker for the
tested routes. They do not configure NovelForge: its persisted gateway/model/
profile-mapping counts still read 0/0/0. Main-account/admin setup and application
gateway/profile setup remain prerequisites for a real integrated chapter and
publication journey. No embedding/image-generation or exhaustive catalog test
was performed. Private follow-up receipts are retained under `.nf-artifacts/`.

## Automatic configuration and integrated text proof — 2026-10-24

The author authorized automatic application configuration, branding Novamind,
and testing while excluding image/cover generation. The first account-based
approach stopped because the actual owner account is not registered. Existing
SSH maintenance authorization permits a first-install operator bootstrap without
creating accounts, changing roles or impersonating a human administrator. Its
single atomic audit is `maintenance.platform.bootstrap` with null actor and an
explicit maintenance authorization description. UI administration still requires
the author's real account; audit accounts were not promoted.

The reviewed bootstrap takes a root-private pre-change PostgreSQL archive, runs
application imports as the `novelforge` OS account, uses the native gateway adapter
and credential encryption, and atomically refuses any pre-existing gateway/profile
configuration. The initial attempt rolled back on Prisma P2010 because a lock
query returned PostgreSQL `void`; a text cast preserved the lock and passed a
focused live check and separate re-review. The archive was 799,146 bytes and its
TOC was validated; this new pre-change archive was not separately restored. The
earlier daily archive's actual restore proof remains distinct.

Observed committed settings, independently read back through SQL/public APIs:

- One enabled gateway with encrypted credentials from the server environment,
  180-second request timeout and one configured transient retry.
- 251 text-catalog models, six Qwen primary text-profile mappings and an IFM
  CREATIVE_WRITER fallback (seven mappings). JSON-mode compatibility is recorded
  only for the primary model already proven by a real JSON response. This does
  not establish every catalog model or maximum context-window capacity.
- Branding `Novamind`, mark `N`, unchanged mark color `#1c1207`, version 1 in the
  same settings table used by the administration UI.
- No account/role changes and exactly one truthful null-actor bootstrap receipt.
  No image catalog sync, image generation or cover test.
- Embedding catalog returned zero models. EMBEDDING remains unmapped; semantic
  vector generation/search is not accepted without a real embedding route.

Exact final helper SHA256:
`0fdc8db58279e272ad6560d36c20ce3786584ae7b8c1d65991d38c93d6fe8234`;
wrapper `bf64a5dd9fc18d3ada6f3003c46468b56b5685960aa11e4e18d6739088e86f51`.
Separate read-only review approved both; root performed activation/read-back.

Real HTTPS test fixture reused the existing isolated audit novel and saved
predecessor. Workspace starter agents/skills and the chapter-creation workflow
were installed through existing APIs. Its initial context gate correctly refused
missing Planning Horizon/chapter-linked outline nodes. Those prerequisites were
then configured through planning APIs and a fresh source-pinned run was started;
the failed historical run was retained rather than replayed against stale sources.

The new workflow reached AWAITING_APPROVAL after actual planning, writing,
machine validation, one rewrite, final review and extraction. Stale snapshot
approval returned 409. An explicitly labeled automated test-actor decision on this
synthetic fixture resumed the worker to SUCCEEDED; it is not human author sign-off,
canon approval or publication. Seven model attempts persisted as SUCCEEDED across
five text profiles, requested model `bansosinfoapi/gw/qwen3.7-plus`, reported model
`qwen3.7-plus`, with provider usage retained. Machine review is not factual or
literary truth merely because its structured contract passed.

The final draft, **The Rain Beneath the Bridge**, contains 682 words. It was saved
through the chapter API using the approved creation run, title/version guards,
then read back with exact prose/title parity at version 1, status DRAFT. A private
helper initially misread the numeric `currentVersion` field as an object; its
correction verified the already-saved text without reapplying or overwriting it.
The API and saved data were intact.

Actual Chromium checks passed: public Novamind branding; all six explicit profile
option lists (seven entries total); ordinary-user admin access still 403; saved
generated title/prose visible in desktop and 390px mobile editors; no horizontal
overflow or page errors. The initial default-options count assertion was corrected
because that endpoint defaults to CREATIVE_WRITER's two entries. Private screenshots
and receipts remain ignored. No new application source change or commit/push.

Engram briefly failed with an explicit host-hook timeout; the fallback was recorded
in CURRENT/ISSUES. A later checkpoint update/read-back recovered. Remaining owner,
embedding, publication/release and offsite recovery gates are separate from these
successful configuration and text-generation results.

### Interim routing adjustment after observed provider timeouts

The additional FAST_CLASSIFIER probe exceeded the helper's initial 45-second
client wait. Persisted generation read-back and router logs subsequently showed
a terminal TRANSIENT failure at 60,043ms, upstream HTTP 502 fetch-connect-timeout.
One bounded recheck with an adequate client wait also failed at 60,043ms. These
failures are retained; they are not erased by the earlier successful Qwen chapter.
No further requests were repeated against that route to force a green result.

A real IFM JSON-object request then matched both a fresh nonce and classification
label, reported 138 input/125 output tokens and finished with `stop`. With this
capability evidence, a separately reviewed operator transaction changed **all six
text profiles to IFM priority 10 and Qwen fallback priority 20**, totaling twelve
mappings. A new root-private pre-change archive was 856,142 bytes with TOC
validation; no new restore drill is claimed. The helper fences writes/inserts to
gateway/model/mapping tables before guard reads, uses a five-second lock wait,
preserves unrelated capability markers and replaces previous JSON-mode markers.
It does not create accounts or change privileges. Exact helper SHA256:
`ff20cbb7fdeea3e5759f07f1dc26f4542a3373ef27a8f0677312ffcc860b3330`;
wrapper `b8304e5dc3c57f0f9d3d2f8efe3929a4ba025f0b8a824099063ae85d8e027509`.

Under that interim routing, the actual authenticated classification API returned
201, label `QUIET`, reported model `IFM/K2-Horizon-375B-A23B`. Browser checks
verified two selectable models per profile (twelve entries), Novamind branding,
ordinary-user admin refusal and desktop/mobile layout without page errors.
An independent, freshly pinned full IFM workflow was then tested against the
same synthetic chapter and failed its review contract as recorded below. The
previously saved 682-word draft remained intact;
alternative generation does not authorize overwriting it automatically.

### Final role policy and remaining operational limits

The IFM-primary full workflow passed compile_context, plan, validate_plan, write
and validate_draft, then FAILED at review_vs: six findings omitted the mandatory
`evidence.version` field. Both the supplied step schema and agent instructions
already require it. Generic JSON success did not establish full nested review
contract adherence. The failed run is retained; validation was not relaxed and
its alternative draft was neither approved nor applied.

The final separately reviewed operator transaction preserves the successful
682-word saved draft and restricts routes to role evidence:

| Profile | Primary | Fallback |
| --- | --- | --- |
| CREATIVE_WRITER | IFM | Qwen |
| DEEP_PLANNER | IFM | Qwen |
| FAST_CLASSIFIER | IFM | Qwen |
| CONTINUITY_REVIEWER | Qwen | None enabled |
| LONG_CONTEXT_REVIEWER | Qwen | None enabled |
| STRUCTURED_EXTRACTOR | Qwen | None enabled |

Here IFM means `bansosifm/IFM/K2-Horizon-375B-A23B`; Qwen means
`bansosinfoapi/gw/qwen3.7-plus`. The three IFM review/extractor mappings are disabled,
not deleted (twelve retained/nine enabled). Qwen extraction and both review roles
passed in the earlier full workflow; IFM extraction was not reached and is not
promoted on assumption. No capability markers, validators, manuscript or account
privileges were changed by this restriction. The root-private role-policy archive
is 869,593 bytes, TOC-validated; no new restore claim.

Exact reviewed helper SHA256:
`18ba75e526ecc904ce3eb287ac9d47c89e406631d3c350816bd6cf011697a441`;
wrapper `1e613946892022a8513306cbfe0696e1d7af65cf244c1d5b7cf1a1dad31a82fa`.
Actual final browser checks passed for nine selectable options across six profiles,
Novamind branding, ordinary-user admin refusal and mobile layout without errors.

**Current limitation:** a complete fresh workflow on this newly combined policy
has not passed. Qwen's two observed upstream network failures were not repaired;
that external route must be stable for review/extraction. Neither a generic JSON
test nor an earlier successful run proves current continuous provider availability.
The live tests did establish persisted configuration, a complete earlier Qwen
workflow, successful IFM planner/writer contracts and classification, exact saved
text read-back, safe refusal of invalid review output and usable desktop/mobile
editor presentation. No further model retries are used to manufacture acceptance.
Embedding remains blocked by an empty embedding catalog; images/covers remain
explicitly excluded. The author's real account still needs registration for later
SUPER_ADMIN setup; no audit identity was elevated. Publication/release approval,
human acceptance and offsite recovery remain separate.

## Authorized owner registration and temporary reader journey

The author's subsequent explicit instruction authorized importing their local
account/password data and automatic staging tests. Only the exact owner record
from the active Windows acceptance database was transferred. Argon2id hash
read-back matched; the existing password is preserved without recovering or
logging its plaintext. There is exactly one SUPER_ADMIN, the requested owner.
No local mutation, manuscript/workspace import, provider-secret copy or reuse of
local sessions occurred. Root-private pre-import database archives were retained.

Fresh operator-issued owner sessions tested the five admin APIs (200), wrong
password refusal (401), branding same-value CAS save (200) and stale write (409).
Novamind / N / #1c1207 remains unchanged; two same-value writes advanced version
to 3. Chromium passed all six tabs, searchable profile-model selection and mobile
layout with no page errors. The initial helper read the asynchronously loaded
identity field too early; explicit ready/value waits resolved it. Both new
privileged test sessions were revoked; subsequent HTTP session reads returned
401. These are not observations of a successful plaintext-password login.

The existing synthetic 682-word chapter received a deterministic final-text
review and temporary publication through normal authorized APIs. Public pinned
title/content matched exactly; unpublished chapter 1 stayed 404. Bookmark/follow
create/read/remove and reading-progress nonregression passed. Actual Chromium
reader settings, chapter search and comment modals passed; mobile settings had
no horizontal overflow. The helper corrected request-version, response-wrapper
and HTTP-status assumptions against source before completing remaining checks.
No application repair was needed for these helper errors.

Cleanup: the exact synthetic comment was soft-deleted (204); chapter unpublished
(200), anonymous chapter read 404, saved content and version 1 unchanged. The
chapter is now IN_REVIEW, not falsely reported DRAFT. The ordinary test session
logged out (200). This temporary fixture publication is not author manuscript
publication, canon approval, human acceptance or a production release.

A fresh workflow under the final role policy, run
`64ee85a0-8e46-494b-971c-d15e597162e7`, passed compile/plan/write validators then
failed review_vs: gateway temporarily unavailable. Persisted attempts report IFM
for successful planner/writer calls (5,215ms / 35,158ms); Qwen review failed
TRANSIENT after 73,410ms, reported model unknown. Recent router logs contain
HTTP 502 failures while API/web/worker/router/nginx remain active. This does not
establish the latest deeper provider cause. Its alternative
text was not applied; no blind retries or relaxed contracts were used. Provider
availability remains the current full-workflow blocker. Embedding catalog is zero;
images/covers remain author-excluded. No commit/push was performed.

## Author-authorized Qwen replacement and timeout alignment

The author requested a replacement for Qwen and another real workflow test.
`bansosinfoapi/gw/gonka-deepseek-v4-flash` is in the live catalog. Its real
adapter probe passed exact nonce/nested evidence version/quote checks, normal
stop; reported model `deepseek-ai/DeepSeek-V4-Flash-0731`, 202 input/113 output
tokens. This was candidate compatibility evidence, not full role acceptance.

Separately reviewed, backed-up operator transaction disabled all six Qwen
mappings and added six DeepSeek mappings at the same priorities. IFM's tested
roles remain unchanged. Eighteen rows retained/nine enabled; the author-facing
six-profile option read-back has six DeepSeek entries and zero Qwen entries.
Only the replacement's JSON marker changed; other capability markers survived.
No manuscript, account, validator or retry-policy mutation. Pre-change archive
885,515 bytes, TOC validated; no new restore drill claimed.

Fresh test start first refused the IN_REVIEW fixture after the temporary reader
test. Native status API, guarded by its exact synthetic novel/title/version,
returned it to DRAFT with saved prose/version unchanged. The resulting run
`bd571841-9d38-46dd-87c1-cb4f553375ca` passed planning, then IFM and DeepSeek
fallback write attempts failed TRANSIENT at 60,018ms / 60,015ms.

Router source showed the fetch timer includes waiting for response headers,
defaulting to 60,000ms, not just opening a TCP connection. A reviewed systemd
drop-in sets FETCH_CONNECT_TIMEOUT_MS=150000, below the then-180,000ms client
limit. Root-private unit backup, gateway-only restart, readiness and actual
process-environment read-back passed. The installer cleanup creation race was
corrected before activation, then independently approved. No router code changed.

New run `f76bade4-2209-406f-985e-6ad015d47ec2` passed IFM planning (20,056ms)
and writing (50,107ms), then both DeepSeek reviews (118,059ms / 97,878ms) and
their strict validators. Actual successful reviews exceeded the old router
deadline. Final review needsCorrection=false, findings zero; test draft
"The Sealed Notebook" is 602 whitespace-delimited words, not applied. Extraction
then failed TRANSIENT at the NovelForge request deadline, 180,002ms; serving
model unknown for that failed request.

A further reviewed/guarded transaction raised only the gateway's supported
request timeout to 300,000ms, with root-private preimage (904,391 bytes, TOC
validated). Router header wait remains 150,000ms. Native retry child
`b77920df-65f1-4b04-bd9f-bb397c166b66` reuses the successful 17-step prefix:
statuses, outputs, definition-version IDs and four generation IDs matched the
parent. Only extraction sent a new model request. Transport returned after
276,833ms, reporting 256 output tokens, but the JSON ended mid-string. Parsed
JSON was null and schema validation refused it. The proposals key existed in
the raw text: its apparent absence was an incomplete-JSON symptom, not proof of
a missing prompt field. The effective upstream output default/stop cause is
unknown; agent maxTokens=null. No missing JSON was fabricated or approved.

The GLM candidate `bansosinfoapi/gw/gonka-glm-5.3-flash` passed a normal-stop
nested JSON probe, reported `zai-org/GLM-5.3-Flash` (133 input/510 output tokens).
A further separately reviewed, backed-up transaction changed only the extractor
mapping to GLM; the prior DeepSeek extractor mapping remains disabled. Archive
913,320 bytes, TOC validated. Reviewer mappings stayed DeepSeek. Final total:
nineteen mappings/nine enabled; author options five DeepSeek/one GLM/three IFM,
zero Qwen. Native child `69a4f5f4-efa4-4b96-a3cf-c55e5a42a57a` reused the same
successful prefix, then FAILED extraction TRANSIENT at 300,001ms, serving model
unknown. No further unchanged requests were submitted.

**Result:** replacement configuration is implemented and actual planning/writing/
review contracts passed; full current workflow acceptance is OPEN for extraction.
Next isolate upstream output defaults/stop behavior and verify explicit output
capacity with the exact extraction schema before another full run. A single
256-token observation does not prove a universal cap. Source/status guards and
validators remain enforced. No previous run, failure or manuscript was erased.
No approval, canon application, publication or human acceptance was fabricated.
Final read-back: saved original title/content/version1 unchanged, DRAFT, public
fixture publications zero, only one SUPER_ADMIN and all five services active.
No application/router source-code changes or commit/push during this follow-up.
Runtime header override is
`/etc/systemd/system/akanesia-router.service.d/20-novelforge-text-timeout.conf`;
rollback removes only that new drop-in, daemon-reloads and restarts the gateway.
Database timeout/routing preimages and audit records are retained separately.

## Further model retest and successful source-checked recovery

The author requested a working test model while reporting DeepSeek/GLM peak-time.
That explanation is author context, not independently proven provider causality.
MiniMax M2.7's real nested-JSON probe passed (151 input/491 output, normal stop).
Six prior DeepSeek/GLM mappings were disabled and six MiniMax mappings enabled
at the same priorities through a separately reviewed transaction. IFM primary
roles/timeouts were preserved. Root-private preimage 921,864 bytes, TOC validated.

MiniMax extraction retry returned quickly (5,278ms) but stopped inside `<think>`:
256 output tokens, no final JSON, pinned maxTokens=null. A reviewed native-API
helper then created version2/maxTokens4096 for only the synthetic workspace's
voice-style-reviewer, final-reviewer and chapter-extractor. All other fields
matched the previous version; immutable history remained. Preimage 930,980 bytes,
TOC validated; test session logged out. This sets output capacity, not quotas.

Fresh run `8d49c5fd-fd30-4c79-aa15-861d6b5fdc9b` used those exact new pins and
passed IFM planning/writing plus MiniMax continuity review and validators. Final
MiniMax review returned complete schema JSON with data under `$_instance`,
contrary to already-explicit root-instance instructions. The strict validator
refused it. No postprocessing repaired/unwrapped its answer or bypassed the gate.

Qwen3.8Max's real nested JSON probe passed (784 input/105 output, normal stop).
It replaced only LONG_CONTEXT_REVIEWER and STRUCTURED_EXTRACTOR through another
exactly reviewed transaction; prior mappings remain disabled. Preimage 947,434
bytes, TOC validated. Current routing: IFM primary planner/writer/classifier,
MiniMax continuity reviewer plus IFM-role fallback, Qwen3.8Max final reviewer
and extractor. Twenty-seven mappings retained/nine enabled; DeepSeek/GLM/old
Qwen3.7Plus are not selectable. The older provider failures remain historical.

Native retry `73681068-c85e-4352-8e94-e2a1b7517856` SUCCEEDED. Its fifteen reused
prefix steps have exact status/output/generation/definition-pin parity with the
failed parent. Successful reported serving-model evidence:

| Step | Serving model | Latency |
| --- | --- | --- |
| plan | IFM/K2-Horizon-375B-A23B | 2,812ms |
| write | IFM/K2-Horizon-375B-A23B | 5,184ms |
| review_vs | MiniMaxAI/MiniMax-M2.7 | 93,456ms |
| review_final | qwen3.8-max | 23,618ms |
| extract | qwen3.8-max | 17,851ms |

Final review needsCorrection=false, five findings. Six candidate proposals carry
citations; all fifteen ellipsis-separated fragments match the draft artifact
after whitespace normalization, including one title-metadata citation. None is
automatically canon. The 595-word new test draft remains unapplied. Original
682-word title/prose/version1/DRAFT read-back passed. Source-checked automated
test approval completed normally, explicitly not human sign-off, canon approval
or publication. This proves recovered workflow completion using preserved
successful steps, not an uninterrupted fresh run or every model's fallback quality.
Other custom agent output defaults were not changed or accepted by this test.

One Engram write hit a host-hook timeout; CURRENT/ISSUES retained a fallback.
A later attributed checkpoint update succeeded. Exact separate reviews were
retained by the root because the read-only child had no confirmed memory binding;
no identity was invented. Final checkpoint/summary read-back remains required.
No commit/push or application/router source-code change in this follow-up.
