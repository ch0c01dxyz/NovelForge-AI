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
