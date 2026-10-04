# Testing Strategy

## Layers

-   Unit: domain rules, validators, planners/policies.
-   Integration: PostgreSQL repositories, transactions, queue jobs,
    OmniRoute adapter with mocks.
-   Contract: API schemas, agent structured outputs, gateway
    normalization.
-   E2E: critical author workflows.
-   Migration: forward migration + representative rollback/recovery
    strategy.
-   Property/invariant tests where useful for versioning and timeline
    logic.

## Mandatory scenarios

-   timeout -\> bounded retry -\> success/failure audit;
-   streaming interruption does not create duplicate chapter content;
-   candidate canon conflict is not silently committed;
-   knowledge-boundary violation detected;
-   checkpoint restore creates a new revision and preserves later
    history;
-   derived embeddings invalidated after canonical rollback;
-   branch simulation cannot mutate main;
-   selective restore reports dependency conflicts;
-   synopsis cannot override contradictory canon;
-   repeated drama pattern produces evidence-backed warning;
-   endgame closure does not auto-create new major conflict;
-   tenant cannot access another tenant's novel.

## Coverage tracking

Per-phase coverage status (which layers exist, which are pending) is
tracked in [docs/implementation/test-matrix.md](../implementation/test-matrix.md).
Update the matrix whenever a phase adds or runs tests.

## Workflow delivery gates

These are required acceptance tests, not newly passing results. Map them to
task contracts in [DELIVERY-PLAN](../implementation/DELIVERY-PLAN.md) and
record actual receipts in the test matrix. Use a deterministic model stub
for orchestration tests and a separate real-model evaluation for prose quality.
No stub may replace a production path merely to claim the feature works.

| Gate | Task owner | Required checks |
|---|---|---|
| G-01 Revision/recovery | NF-WF-002 | Empty/populated migration; consistent cross-domain checkpoint; concurrent-head conflict; checkpoint failure abort; restore creates a new revision and preserves later history |
| G-02 Context | NF-WF-003 | Approved outline outranks synopsis; temporal character knowledge; relevant fact after many older facts; bounded query and total budget; mandatory-context overflow refuses/splits visibly |
| G-03 Durable run | NF-WF-004/005 | Restart, queue outage, duplicate job/approval, rejection, cancel, stale source, revoked capability; resume preserves completed steps and source pins |
| G-04 Final artifact | NF-WF-006/007 | Style edit invalidates review; incomplete stream cannot apply; malformed/unsupported contract fails; UI diff/apply cannot overwrite a concurrent save |
| G-05 Canon and memory | NF-WF-008/009 | Invalid/irrelevant source span rejected; rejected proposal excluded; atomic approved changes plus rebuild intent; failed/duplicate rebuild; chapter N informs N+1 |
| G-06 Narrative integration | NF-WF-010 | Knowledge/relationship violation in actual generated text produces evidence; soft drama policy remains advisory; hard rule needs explicit authority |
| G-07 Author journey | NF-WF-011 | Browser setup/outline → generate → review → decisions → apply → next chapter; recovery with later history intact; no direct DB seed shortcut for the entire journey |
| G-08 Reader/release | NF-WF-012–014 | Draft V2 cannot replace published V1; stale scheduled release refused; unpublish invalidates public paths; anonymous/non-member access, spoilers, navigation and progress |
| G-09 Retained tools | NF-WF-015–019 | Rich editor/scenes; authorable state/research; every claimed format fixture; actual admin configuration; social permission/moderation/deduplication |
| G-10 Advanced domains | NF-WF-020–022 | Selective dependency conflicts, isolated branch, safe bulk recovery, bounded causal simulation, evidence-backed ending conditions and no forced new debt |
| G-11 Release | NF-WF-023 | Supported-host clean clone/start; live schema upgrade; backup/restore drill; secrets/tenant review; job failure recovery; accessibility; measured 2,500-chapter query/context/cost budgets |
| G-12 Evidence policy | All AI tasks | Nonexistent sources/IDs, irrelevant citation, hostile reference, stale approval, zero-selected-tests receipt, two models agreeing against canon; never promote unsupported claims |

## Host prerequisites

Follow [environment preflight](../11-deployment/ENVIRONMENT-PREFLIGHT.md).
Ubuntu must provision missing native task dependencies without Docker; Windows
must reuse the existing running Docker stack and preserve working data. Confirm
scratch database ownership/CREATE DATABASE and extension prerequisites before
any test that recreates databases. The legacy clean-clone scripts include a
Compose check; use the documented native commands on Ubuntu, not Docker setup.

## Test execution rules

- Inspect package scripts and environment prerequisites; run targeted tests
  first, then applicable lint/typecheck/build and integration checks.
- Root `pnpm test` allows no-test projects. Check selected test counts; an
  exit code of zero with zero selected tests does not pass an acceptance gate.
- Database tests use dedicated test databases. Never reset production/user
  data. Test both existing-data upgrades and empty installation when migrating.
- Add a real E2E runner with the first connected writer UI; until then record
  manual receipts and the automation gap. Do not invent an E2E command.
- Test a production start, not only build/typecheck, before release. Test queue
  execution and restart, not only Redis connectivity or heartbeat.
- Keep actual command, revision/diff, environment, result, skipped cases and
  reviewer attribution. Historical receipts do not verify a new change.
- Log failures and uncertainty in the single
  [ISSUES-AND-GAPS](../implementation/ISSUES-AND-GAPS.md) file. Close a gate
  only with its own evidence; schemas, documentation and green sibling tests
  cannot substitute for the user journey.
