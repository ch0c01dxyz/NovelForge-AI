# Definition of Done Checklists

## Feature checklist

-   [ ] Requirement understood
-   [ ] Existing implementation inspected
-   [ ] Relevant architecture docs read
-   [ ] Database changes migrated
-   [ ] Authorization implemented
-   [ ] Input validation implemented
-   [ ] Error states handled
-   [ ] Tests added
-   [ ] Existing tests preserved
-   [ ] Typecheck passes
-   [ ] Lint passes
-   [ ] Build passes where applicable
-   [ ] UI reviewed if applicable
-   [ ] Documentation updated
-   [ ] Audit/observability considered
-   [ ] No secrets exposed
-   [ ] No unrelated refactor introduced

## AI feature checklist

-   [ ] Agent/version identified
-   [ ] Skill/version identified
-   [ ] Knowledge sources identified
-   [ ] References identified
-   [ ] Prompt version recorded
-   [ ] Model profile selected
-   [ ] Gateway selected by policy
-   [ ] Generation persisted
-   [ ] Errors classified
-   [ ] Output validated
-   [ ] Canon changes require appropriate approval

## Gateway checklist

-   [ ] Credentials encrypted
-   [ ] Client never receives raw secret
-   [ ] Health check implemented
-   [ ] Timeout configured
-   [ ] Retry policy bounded
-   [ ] Non-retryable errors classified
-   [ ] Failover tested
-   [ ] Usage recorded
-   [ ] Model sync tested
-   [ ] Admin UI masks secrets

------------------------------------------------------------------------

## Revision Acceptance Checklist

-   [ ] Timeout and bounded retry are configurable.
-   [ ] Timeout attempts are recorded as `TIMEOUT`.
-   [ ] Exponential backoff with jitter is implemented.
-   [ ] Deterministic failures are not blindly retried.
-   [ ] Exhausted retries can invoke configured gateway/model fallback.
-   [ ] Interrupted streams cannot be persisted as successful output.
-   [ ] Logical generation IDs are distinct from attempt IDs.
-   [ ] Retrieval never injects/scans all 2,000 chapters for routine
    generation.
-   [ ] Chapter, arc, character, timeline, and thread memories are
    versioned.
-   [ ] Continuity validation can retrieve relevant historical facts.
-   [ ] Chapter agents prioritize approved outline + accumulated state
    over synopsis.
-   [ ] Synopsis repetition/convergence guardrail exists in generation
    prompts.
-   [ ] Outline changes are traceable and approval-aware.
