# Gateway Engine --- Multi-9Router

## Goal

Support multiple independent 9Router API instances as first-class
infrastructure.

## Gateway fields

Each gateway should support: - id - display name - base URL - encrypted
API key/credential - enabled - priority - weight - timeout - retry
policy - health status - last health check - latency metrics - error
metrics - rate-limit metadata - supported models - capability metadata

## Model discovery

Where compatible, synchronize models through the gateway's model
endpoint such as `/v1/models`.

Do not assume every gateway exposes identical metadata. Normalize
provider-specific data into an internal model registry.

## Routing strategies

Support: - PRIORITY - WEIGHTED - ROUND_ROBIN - LEAST_LATENCY - FAILOVER

A routing policy can choose a strategy by task/model profile.

## Failure handling

Use: - bounded retries - exponential backoff - timeout - circuit
breaker - non-retryable error classification - fallback gateway
selection

Do not blindly retry invalid requests, authentication errors, or
deterministic client errors.

## Health checks

Track: - status - latency - consecutive failures - last success - last
failure - error category

Health data should influence routing when the selected policy permits
it.

## Security

-   Encrypt credentials at rest.
-   Never send credentials to the client.
-   Never expose secrets in logs.
-   Mask credentials in admin UI.
-   Rotate credentials without redeploying the whole application where
    possible.

## Usage

Record: - gateway - model - task - request - latency - input/output
usage when available - success/failure - error category

This supports cost and reliability analysis.

------------------------------------------------------------------------

## Timeout, Retry, and Fallback Rules

Every AI model request MUST have an explicit timeout and bounded retry
policy. Treat a timeout as a transient failure unless the provider
explicitly classifies it otherwise.

On timeout: record the failed attempt; classify it as `TIMEOUT`;
preserve the original logical request and context snapshot; retry using
the configured policy; use exponential backoff with jitter; stop at the
configured maximum attempts; then invoke eligible gateway/model fallback
if configured. Record every attempt and the final outcome.

Configuration MUST support request timeout, max attempts, initial/max
backoff, jitter, retryable error categories, fallback gateway policy,
fallback model policy, and capability constraints for fallback.

Do NOT blindly retry deterministic failures such as invalid parameters,
authentication/authorization failure, unsupported model/capability,
malformed configuration, or validation errors that will reproduce
unchanged.

One logical generation ID MUST be separate from individual
transport-attempt IDs. Persist attempt number, gateway, model,
timestamps, timeout, latency, error category, retry delay, fallback
target, final status, and total elapsed time.

For streaming, an interrupted stream is NOT successful. Partial output
must be marked incomplete and must never create duplicate persisted
chapter content during retry/recovery. Never log secrets or credentials.
