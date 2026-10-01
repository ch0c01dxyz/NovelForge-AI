# API & Service Boundaries

## External API style

REST first. SSE for AI token/event streaming. WebSocket only when a real
bidirectional realtime use case justifies it.

Suggested groups: `/api/auth` `/api/novels` `/api/chapters`
`/api/scenes` `/api/outlines` `/api/characters` `/api/relationships`
`/api/world` `/api/timeline` `/api/threads` `/api/canon`
`/api/story-health` `/api/endgame` `/api/revisions` `/api/checkpoints`
`/api/branches` `/api/generations` `/api/agents` `/api/skills`
`/api/workflows` `/api/models` `/api/gateways` `/api/admin`

## Service rules

Controllers parse/authenticate/authorize/validate and delegate.
Application services own use cases and transaction boundaries. Domain
services own domain rules. Repositories own persistence. Provider
adapters own external protocols.

No UI component, controller, or LLM prompt may directly mutate canonical
tables.

## Workflow integration contracts

Before implementation, specify typed commands/results for chapter generation,
review, approve/reject/resume/cancel, manuscript apply, canon proposal decisions,
checkpoint preview/restore and version-pinned publication. Do not assume the
suggested groups above are existing routes. Reuse current service boundaries.

Commands carry expected source/manuscript versions and repeat-safe operation
identity where needed. Derive actor/tenant/capabilities server-side and
reauthorize delayed writes. Return distinct invalid input, denied/not found,
stale/conflict, incomplete-context, pending and failure outcomes; exact HTTP
mapping must follow existing error conventions and reviewed task contracts.

Reader routes have an explicit published-version access contract for
non-members. Do not remove workspace gates from author routes to enable reading.
Never accept arbitrary AUTHOR mode or spoiler bounds from a public caller.
