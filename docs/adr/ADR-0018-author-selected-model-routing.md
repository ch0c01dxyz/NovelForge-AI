# ADR-0018: Author-selected model routing

Date: 2026-10-20
Status: Accepted design; implementation tracked by the workspace authoring plan

## Context

The author approved concrete model selection for generation, optional AI analysis
and workspace Agent, Skill and Workflow definitions. A provider model name is
ambiguous across gateways. Existing capability profiles, authorization and bounded
retry/fallback remain authoritative. Selection does not grant access to disabled
models or change deterministic validation.

## Decision

Use the internal AIModel UUID (`modelRef`) for an optional concrete preference.
GatewayRegistry returns this identity alongside provider model ID and gateway ID.
The shared GatewayManager rejects an explicit preference absent from enabled,
request-compatible profile candidates before dispatch. It attempts an eligible
preference first, preserving the existing overall/per-gateway retry bounds and
non-retryable failures. Automatic routing remains the default for older callers.
Before subsequent transport attempts, re-read mapping/model/gateway eligibility
so an administrator's disable/removal cannot be bypassed by a frozen attempt plan.
An already dispatched transport cannot be retrospectively revoked.

Attribution retains the original preference in the generation context snapshot
and each actual gateway/requested/reported model in append-only attempts. Unknown
provider usage remains unknown. No local quota calculation or enforcement is added.

Definition preference precedence is explicit permitted request/step preference,
then immutable Agent/Skill version preference, Workflow version default, relevant
novel operation default, then Automatic. Resolve and pin preferences and definition
versions before a run starts. A stale explicit choice refuses instead of silently
inheriting. Historical versions are never rewritten. Deterministic steps have no
model selector; a Workflow default applies only to AI-backed steps.

Versioned definition fields use an additive migration with nullable UUID scalars:
AgentVersion/SkillVersion.preferredModelRef and WorkflowVersion.defaultModelRef.
No backfill changes historical versions. Scalars retain stale identity if a
catalog model is deleted; a foreign key with SET NULL would silently erase an
author's choice. Writes validate enabled mappings after authorization; dispatch
validates again against the actual step profile. A workflow default need not fit
every profile at save time, but incompatible steps must refuse before model use.
Rollback keeps the additive columns and historical values; old application code
continues ignoring them. Do not drop columns or rewrite versions during rollback.
The migration requires separate review and scratch proof before local activation.
Operation defaults/run-start pins/UI remain separately tracked implementation.

## Consequences and rollback

### Workflow request preferences

Run POST accepts optional preferredModelRef and stepModelRefs (AI step key to
internal model UUID). Step choice overrides request-wide choice, then existing
definition, Workflow, novel and Automatic precedence. Unknown/non-AI step keys
refuse before queue creation. Request-wide selection requires at least one AI
step. Preflight each remaining AI step's effective choice before first transport;
a per-step override supersedes the request-wide choice for that step's profile.
No model is assigned to deterministic code. Shared pure validation bounds the
map by the existing graph ceiling and fails malformed stored requests closed.

Persist normalized choices in nullable server-owned requestedModelPreferences
JSONB on WorkflowRun, separate from arbitrary input. NULL legacy means no request
overrides, not invented history; new empty object has no overrides. Never read
routing overrides from input. Approval/resume/recovery/idempotent replies retain
the same stored choices. Generation attempts keep actual routing attribution.

An authorized read-only model-preference preview resolves current published
workflow/definition versions and novel defaults in one snapshot, returning AI step
profiles/inherited identity/source plus a fingerprint of those dependency IDs,
workspace and effective novel binding (including an absent default).
Run POST may supply expectedModelPreferenceFingerprint; mismatch refuses before
run creation. The author UI uses this guard so stale previews cannot silently
bind choices to changed steps/definitions. Idempotent retry returns its original
authorized run even after the preview changes. Preview is not model availability
or successful dispatch evidence; live manager eligibility remains authoritative.

Additive nullable column, no backfill, separate schema review and scratch history
proof. Matching worker precedes new API activation; rollback retains data and a
compatible worker for new preference-bearing runs. Old workers ignore the new
column and therefore must not consume those new runs.

### Novel operation defaults

Use append-only NovelModelDefaultsVersion rows, ordered by positive per-novel
number, with nullable generationModelRef/analysisModelRef, author, timestamp and
reason. This is configuration history, not story canon or a canonical revision.
GET returns version0/Automatic when absent. PUT requires novel:update, expected
version CAS under workspace SHARE/novel NO KEY UPDATE locks, and atomic audit;
preserve all prior versions and unrelated NovelSettings. Explicit null appends a
return to Automatic. Save validates enabled mapped identities after tenant gates;
dispatch checks the actual profile/capabilities again. Stale identity never clears.

Initial consumers are explicit CHAPTER component generation (buffered/streamed,
direct/orchestrator/workflow) and S3 extract/advice (ANALYSIS). Other calls do not
silently acquire defaults. Definition/request choices retain higher precedence.
Store the resolved default version/operation and effective preference in generation
routing provenance; compiler stamping must retain that routing record.

New runs capture nullable novelModelDefaultsVersionId plus modelDefaultsPinnedAt
in the same enqueue snapshot as definitions. FK RESTRICT retains the selected
configuration. Marker + null means no defaults at enqueue and must remain
Automatic even if later configured. Legacy null marker preserves former routing;
never manufacture historical settings. Worker checks pinned novel/workspace and
preflights remaining chapter AI steps before any transport. Resume/idempotency
reuse the pin; JSON run input cannot override server-owned metadata.

Additive migration has no backfill. Scratch preservation and independent contract
review precede activation; matching workflow worker must start before API. Rollback
retains versions/pins and a compatible worker for new runs; never drop retained
configuration or rewrite generations. Model defaults do not mutate story state.

### Enqueue-time definition pins

Capture every referenced published Agent/Skill version and every granted Skill
version before enqueue. Store server-owned WorkflowRunDefinitionPin rows and
definitionsPinnedAt atomically with the run and pending steps. Pins reference
immutable version IDs with RESTRICT so queued/recoverable history cannot lose
dependencies, including granted skills without their own step. No user input
field can override pins. Worker resolution checks the pinned key, version and
tenant, not the current-version pointer or later publication/archive status.
Live enabled-model eligibility still applies to the pinned preference.

Legacy runs retain a NULL marker and their existing resolution behavior; never
backfill purported historical pins. New runs with missing/inconsistent pins fail
closed instead of falling back to current definitions. Resume/recovery reuse the
same run dependencies and preserve completed-step outcomes. Idempotent enqueue
returns the existing run without repinning after definition edits.

Migration is additive and transactional with a bounded lock timeout. Roll out
matching workers before activating the new enqueue path; old workers do not know
how to honor the marker. Rollback must drain/cancel new pinned runs or keep a
matching worker for them, and retain pin rows/versions. Do not drop columns/tables
or weaken RESTRICT to roll back application code. Older runs remain identifiable.

Existing omitted preferences retain routing behavior. The manager remains ORM-
independent; the registry owns live configuration reads. Additional eligibility
reads occur only between retries. Rollback must preserve historical pins,
generations and attempt attribution; it must not delete models or story data.

## Evidence

Design: `docs/superpowers/specs/2026-10-20-workspace-chapter-lifecycle-design.md`.
Execution and actual verification: `tasks/workspace-authoring-execution-ledger.md`.
