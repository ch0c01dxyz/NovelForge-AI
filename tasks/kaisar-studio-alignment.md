# Kaisar AI Studio alignment and default activation

Author approved the assessed recommendations and explicitly requested activation
as the active novel's defaults after successful tests. Novel:
`e36d568b-aecf-476a-8e3f-f47ca709672b`, workspace
`b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9`. Preserve manuscripts, canon, credentials,
model preferences, custom definitions and existing uncommitted work. No commit,
push or production deployment. Project prompts remain English; requested story
language remains Indonesian.

## Plan and scope

1. Add a validated optional per-novel `dna.chapterAuthoring` policy containing
   `minimumWordCount` and `storyProfile`. Resolve/pin it server-side on chapter-run
   enqueue, enforce minimum words after every draft write/rewrite, and supply the
   profile independently of droppable context tiers. Existing target count remains
   a desired target; no minimum is invented for unconfigured novels.
2. Reuse current context-distillation and continuity skills as agent grants within
   existing model calls. Host-agent output contracts take precedence over standalone
   skill envelopes. Strengthen planner/reviewer causal, character and cash/inventory
   checks without hardcoding Kaisar facts into shared definitions.
3. Fix DNA editor envelope handling and use the scoped minimum in both chapter AI
   forms. Preserve existing DNA and model preferences.
4. Test pure policy/word counting and executor failure behavior, typecheck affected
   packages, then separately review the exact diff. Rehearse immutable definition
   versions and scoped DNA on an isolated database clone; perform one real-gateway
   chapter workflow acceptance run stopping before human approval. Verify model and
   definition pins, actual skill grants, word count and manuscript preservation.
5. Only after passing, checkpoint and apply reviewed versions plus merged Kaisar
   DNA using application services. Read back exact versions/defaults, retain old
   immutable versions and recovery evidence. Reload owned local processes if needed
   for changed runtime code; preserve Docker and acceptance data.

## Evidence and acceptance

Required reading: AGENTS, START-HERE, CURRENT, assessment 679, active definition
snapshot, executor/run/definition/narrative services and both chapter forms.
One writer: current Codex executor. Independent read-only technical and acceptance
reviewers. Private evidence under `.nf-artifacts/studio-alignment/`.

Reject malformed/undersized minimums, enforce exact boundary and HTML paragraph
counting on writes and rewrites, leave unrelated workflows unchanged, and preserve
approval/schema/source gates. Economic negative examples: debt reserve two silver
must not be deducted again from seven capital; one trial allocation leaves six,
and 0.8 wages do not prove 0.2 covers all costs. These are historical examples,
not eternally fixed balances. No instant martial mastery or completed product;
Wira remains recurring; Rangga is not the old-world murderer. No claim that a
model alone proves science or arithmetic. No silent application before acceptance.

Status at initial transport investigation: implementation and negative checks
pass; real acceptance blocked by the gateway's long-response path. Defaults
were not activated. Later evidence below supersedes this historical status.

Authorization update: the author subsequently requested continuation followed
by commit and push once verified. This supersedes the original no-commit/push
scope for the completed related work; it does not authorize unverified activation
or production deployment. The brief runtime Engram timeout was followed by a
fresh host-confirmed binding/read-back; do not reuse identity without that proof.

Transport amendment: a real saved-chapter diagnostic proved non-streaming
HTTP503 after60s while explicit SSE completed64s/2817words. Add optional internal
buffered streaming through the existing gateway adapter/manager for the two
chapter workflow task prefixes only. Preserve one generation/request, bounded
routing, schema validation, model settings and other callers. Require terminal
completion; interrupted text is INCOMPLETE and never retried into a second
artifact. Scope includes ai-core types/manager/adapter, ai-services generation
selection/persistence, their focused regressions and real latest-candidate proof.

Validation now also rejects contradictory chapter reviews and unresolved final
reviews before approval, including already-successful artifacts adopted during
retry/recovery. Historical rows remain intact. First real acceptance was held
after separate prose/review inspection; it is archived under private `attempt-1`
and owned database `novelforge_studio_alignment_20261026_review1`. Current revised
clone checkpoint is `4a1f7c57-b5a6-43b3-8bf1-81b887b95b41`; real run
`0a7647b1-e9f1-4064-bf28-012c40700eb7` failed at write on six TRANSIENT routes.
A short DeepSeek readiness probe then passed in 2,955ms. One application-service
retry `72dda8d6-438a-452b-88f0-a588670fe20d` reuses the successful prefix and
exact pins; no direct run/step repair or new planning call. All 43 executor
regressions pass. MiniMax/MiMo probes were refused before dispatch due to their
existing JSON-incompatible metadata, which remains unchanged. The bounded retry
also failed at write: five TRANSIENT routes near 60s, final fallback near 134s.
No successful draft, extraction or approval. No further blind retry was started.

Latest candidate instructions separately APPROVE: temporal wording permits
plausible new actions; the new final-reviewer version replaces the obsolete
claim that unresolved findings can proceed. Policy SHA256
`c75e1737d4366b7f5ccd5c2258b25f7c93d43a23eb8f78965c047717e249614a`;
helper SHA256 `2d286a5418297327b9e4cf7c4a7002ebaa2d41366605a371fec3e882013377eb`.
Replacement assertions and helper syntax check pass. The retry pins the prior
candidate: it does not validate these latest instructions. Rehearse the revised
candidate only after the long-response gateway path is repaired. Keep plan and
pin evidence for reuse where exact compatibility permits; do not claim a short
readiness response proves chapter generation. Active defaults and manuscripts
remain unchanged; required active checkpoint/application/read-back are pending.

## Latest acceptance status — 2026-10-26

Source `8db056333733a4aa5df2f483bc42587f2f71b1b7` is committed and pushed;
CI `40292092498` is green. Buffered transport and focused regressions pass.
Independent technical review approves the exact source and application helper.
Early review now receives the installed continuity skill within existing calls.

Real run `b79f00a5-6fc2-4929-9d6f-a6c8ba862efe` completed generation only:
3,296 words, five successful real model calls, AWAITING_APPROVAL, unchanged
manuscript. Independent semantic HOLD: Anton/Husein claim to have witnessed
the original debt agreement without supplied evidence. Runtime PASS and model
minor-only findings do not establish full quality acceptance. All earlier held
samples and clone databases remain preserved; no blind reuse as PASS.

The scoped policy now explicitly limits their historical testimony to supplied
witnessed events, while Don Juan/Sofian may describe their own agreement.
Changed-candidate run `8ca06496-d345-422b-93e4-40de78043956`, checkpoint
`a7a73b9f-2f49-438f-9cf3-401d40adc833`, completed two bounded rewrites.
Independent exact-prose quality PASS: 3,482 words; SHA256
`be731ed0ce2e3e758b6e6e0d25a3ea0a1cba1804efbf9ed298918ead64609d19`.
Minor copyediting advisories remain; there is no author text acceptance.

Final provider review failed after 16,839ms. Read-only generation inspection
confirms FAILED / INTERNAL / generic provider-stream failure, without structured
upstream status. Existing application retry only permits TRANSIENT/RATE_LIMIT;
the prepared private retry helper was not executed. Failed evidence is retained
under `attempt-8-provider-failure`. Never reclassify historical data or broadly
retry INTERNAL failures to manufacture acceptance. Local router diagnostics did
not establish this exact request's underlying status.

Source API and workflow worker were safely reloaded after DB/queue idle checks;
both API /ready and Nuxt return 200. Active default application remains blocked
on exact-candidate final runtime review. Preserve successful prefix and accepted
prose while obtaining gateway status evidence for a justified recovery. No new
full generation loop, author acceptance, canon approval or publication occurred.
