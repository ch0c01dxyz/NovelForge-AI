# ADR-0016: SCALE evidence with optional AI proposals

Status: accepted author direction, 2026-10-08. Implementation is PLANNED
under NF-WF-050 / GAP-039, not implemented by this decision record.
Baseline inspected: 7d2a4dc.

## Author decision

Use S1 (structured scale labels) as the foundation. Follow with S2
(author-proposed standing changes and chapter exceptions). S3 (AI-extracted
claims) is optional and can be enabled in settings. Its output is a proposal:
the author may approve, reject, or supply an alternative proposal.

The author subsequently specified: incomplete HARD SCALE assessment holds
approval until assessment is complete. AI should explain which scale data is
missing, why it matters, and provide examples. Existing SOFT/HARD configuration
remains authoritative; this is not blanket acceptance of the earlier sample.

Approval can proceed only after a complete assessment satisfying the policy,
or a valid explicitly authorized resolution through S2; complete-but-violating
HARD evidence still blocks. Rejecting an AI proposal does not itself complete
the assessment. AI advice and pending proposals cannot satisfy the gate.

## Architecture and authority

The deterministic assessor compares a chapter's operative conflict scale with
the approved protagonist standing/access. It must not manufacture a claim
from standing.scale, which is the current GAP-039 defect. Use structured,
version-bound labels with explicit scope and source evidence. An entity's
presence or a mention of an empire does not establish an empire-scale conflict.
Reputation remains descriptive until a separate policy defines its thresholds.

Reuse the eight existing NarrativeScale values and assessScaleAppropriateness.
New tag storage and authoring surfaces are real S1 prerequisites; they do not
exist simply because this ADR exists. Historical chapters are unassessed until
their relevant evidence is supplied; do not fabricate tags or backfill prose
interpretations from current mutable state.

S2 decisions distinguish an approved standing change from a chapter-specific
exception. A chapter exception does not alter the novel's global standing.
Changes to story truth follow existing authorization, revisions, recovery and
invalidation requirements; author approval is not a permission bypass.

S3 is off by default and configured per novel. A coding model or workflow
cannot silently enable it. Enablement authorizes proposal generation, not
automatic approval or canon/policy mutation. Store the immutable source version,
validated proposal, requested/reported model provenance and generation receipt.
Use existing Model Profiles/Gateway routing and NF-WF-049 token analytics.
No provider hardcode, new quota system or local quota enforcement is introduced.

An authorized author decision records approve/reject/alternative, actor, reason
and source version. Rejection leaves approved state unchanged. An alternative
is separately recorded and assessed; never silently rewrite the AI proposal.
Concurrent or duplicate decisions must have one auditable outcome. A changed
chapter or relevant policy invalidates old applicability and review evidence.
Approved extraction labels do not independently rewrite protagonist standing.

Malformed output, unverifiable evidence, transport failure, missing tags and
pending proposals are explicit unknown/incomplete evidence, never invented
truth or a false SCALE PASS. For a configured HARD SCALE policy, unresolved
required evidence blocks approval. An unrelated unused AI proposal must not
invalidate an otherwise complete, approved S1 assessment.

The UI always provides a structured missing-data checklist: field/source,
reason, explanation, illustrative example and next author action. Examples
are suggestions, not facts from the novel. To preserve optional S3, AI-generated
guidance runs only when S3 is enabled; otherwise deterministic guidance remains
available without a gateway call. When enabled, AI adds explanatory suggestions
with the same evidence/proposal boundaries, never inventing approved tags,
standing/access, sources or author decisions. Advice failure leaves the
actionable checklist available and does not release the HARD gate.
Valid empty access is not missing access. An explicit version-bound declaration
of no operative conflict is distinct from unassessed prose; a quiet chapter
must not be forced to invent conflict to satisfy SCALE evidence completeness.

## Alternatives and consequences

### S1 technical boundary — 2026-10-08

[NF-WF-050A](../../tasks/NF-WF-050A-scale-evidence-foundation.md) freezes a
single append-only assessment-set model, using actual immutable ChapterVersion
text spans/verified quotes. Mutable scenes/events have no live assessment FK;
their future adapters require a separately reviewed provenance contract.
Sets are OPERATIONAL audit history outside story snapshot coverage. They do
not advance the story head, rewrite canon or protagonist standing. A separate
assessment-set CAS prevents lost author replacements; the checked-out branch,
current text version and actual story head bound applicability. Head changes
conservatively make evidence stale. Version citations preserve assessment
history and require explicit chapter-deletion conflict handling.

050A delivers the validated authoring API only. 050B separately connects it to
final-review receipts, author decisions and localized UI; 050C adds optional
AI proposals. Contract acceptance is not evidence those features are implemented.

S3-only authority and autonomous approval are rejected by the author decision.
S4 (keeping SCALE outside review verdicts) is not the chosen direction.
S1 requires modeling/tagging work; S2 adds author decisions; S3 adds optional
gateway calls and untrusted output handling. Implement these in that order.
GAP-039 stays OPEN until the real author workflow, negatives and separate
reviews pass. GAP-063 remains closed for local analytics implementation.
