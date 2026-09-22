# OmniRoute Integration

## Position

OmniRoute is NovelForge V2's primary LLM gateway. NovelForge still owns
a provider-independent `AIGateway` abstraction so future gateway changes
do not leak into story domains.

## Adapter

``` text
AI Orchestrator
  -> Model Manager
  -> Gateway Manager
  -> AIGateway
  -> OmniRouteGateway
  -> OmniRoute
```

## Required supported surfaces

The adapter should be designed around OmniRoute's OpenAI-compatible
interfaces: - model discovery; - chat completions; - responses where
useful; - embeddings; - streaming.

Do not hardcode a static model list. Sync/discover capabilities and
persist a normalized local catalog.

## Configuration

Per gateway instance: - display name; - base URL; - encrypted credential
reference; - enabled; - priority/weight; - timeout; - retry policy; -
health; - supported capabilities; - observed latency/error metadata.

Support multiple OmniRoute instances if the operator configures them.

## Request identity

NovelForge creates: - logical_request_id; - generation_id; - attempt_id
per transport attempt; - optional idempotency/request/session
identifiers mapped to OmniRoute where appropriate.

## Retry and fallback

NovelForge must distinguish: - transient timeout/network/gateway
availability; - rate/quota conditions; - deterministic invalid
request/schema; - auth/permission; - unsupported model/capability.

Retries are bounded with backoff + jitter. Record every attempt.
OmniRoute may perform its own upstream routing/fallback, but NovelForge
must still preserve its own audit and outcome semantics.

## Streaming

Persist generation as IN_PROGRESS. A disconnected/failed stream is
INCOMPLETE, not SUCCESS. Never append the same partial generation twice
to manuscript content.

## Security

Prefer Authorization Bearer headers. Never put secrets into URL query
strings in NovelForge. Never log request authorization headers or
decrypted credentials.

## Model profiles

Application code requests capabilities: CREATIVE_WRITER, DEEP_PLANNER,
CONTINUITY_REVIEWER, FAST_CLASSIFIER, STRUCTURED_EXTRACTOR,
LONG_CONTEXT_REVIEWER, EMBEDDING.

Admin configuration maps profiles to OmniRoute model IDs. Model names
are configuration/data.
