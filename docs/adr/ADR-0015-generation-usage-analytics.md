# ADR-0015: Generation usage analytics without quota management

Status: accepted author product decision, 2026-10-08. Implementation tracked
separately by NF-WF-049 / GAP-063; this ADR is not implementation evidence.

The author operates an external LLM Gateway that owns quota management.
NovelForge must not calculate available quota, impose token/spend caps,
configure provider limits, or block generation based on analytics totals.
This supersedes the quota-observation requirement in constitution section6
and the unselected quota proposals in NF-WF-047F. GAP-098 remains removed.
Existing context-window, per-request output and bounded retry safeguards remain.

NovelForge records gateway-reported usage and model attribution for each
logical generation and transport attempt. Expose input/output tokens, known
total tokens, task/component, target artifact when supplied, novel, status,
requested model and response-reported model. Aggregate recorded consumption
for the whole novel and by component/task/model, including recorded retries.
Do not add final-generation totals to their attempt totals a second time.

Missing usage/model information is unknown, not zero or an inferred response
model. Gateway-internal attempts invisible to NovelForge are not invented.
Historical final-generation usage may be counted once with explicit legacy
provenance; missing historical metadata must not be fabricated or backfilled
from mutable model mappings. Totals describe recorded usage, not a provider
invoice or complete usage when reporting is partial.
Historical attempt.modelId has mixed requested/reported semantics; retain it
as legacy information only. New attempts separately snapshot requested model
and nullable reported model. A request-model fallback is not reported identity.

Components include CHAPTER, COVER, LORE, OUTLINE, EMBEDDING and OTHER.
The component label is explicit attribution metadata, not canon. Existing
chapter callers supply CHAPTER; generic calls can declare the other labels.
Unclassified historical/custom calls remain OTHER and retain their exact task.
This does not implement a missing cover/image generation transport; an image
response without reported token usage remains unknown, not estimated.

Analytics is read-only, workspace/novel authorized server-side and uses
existing generation receipts, gateway adapters and the AI Studio design.
English/id UI resources are supported. No manuscript scan, model inference,
billing engine, quota synchronization or new external dependency is required.
