# Security, Reliability and Observability

## Security
- Server-side authorization.
- Input validation with schemas.
- Secure authentication/session handling.
- CSRF protections where applicable.
- XSS-safe rendering.
- Encrypted gateway credentials.
- No API keys in browser bundles.
- Rate limits for authentication and expensive AI endpoints.
- Audit logging for privileged actions.
- Secret redaction in logs.

## Observability
Use structured logs with:
- request id
- user id when safe
- novel id
- task
- agent/version
- model
- gateway
- duration
- status
- error category

Do not log secrets.

## AI evaluation
Store evaluations such as:
- continuity score
- lore consistency
- style adherence
- instruction adherence
- human rating
- automated validator results

Do not treat an automated score as truth; keep raw evidence and evaluator identity/version.

## Background jobs
Use a queue for:
- embeddings
- indexing
- summarization
- consistency scans
- style analysis
- bulk AI processing
- model synchronization
- gateway health checks
- memory extraction

## Streaming
Support token/event streaming for long-running AI operations where the transport stack allows it.

Persist final generation state even if a stream is interrupted.
