# Current Project State

Architecture baseline: V2 handoff pack created.\
Implementation status: **Phase 3 COMPLETE (2026-09-25)**. Phase 0
(NF-0001..NF-0010), Phase 1 (auth, workspaces, memberships, novels,
permissions, audit), Phase 2 (chapters, immutable versions, autosave,
editor shell, import/export), and Phase 3 (AIGateway/OmniRoute adapter,
gateway + model registry, model profiles, logical requests/attempts,
bounded retry/fallback, error classification, generation history,
platform-admin authorization) are implemented, tested, and verified
end-to-end. See `docs/implementation/progress.md` and
`docs/implementation/test-matrix.md`.

## Next milestone

Phase 4 --- Agent/Skill/Workflow Platform (versioned agents, skills,
workflows, structured output contracts, task execution). Exit: chapter
test workflow can run multiple agents deterministically.

## Known gaps carried into Phase 4

- Routing strategy is deployment-wide (`AI_ROUTING_STRATEGY`); there is no
  per-workspace override and no operator UI to change it at runtime.
- Scene CRUD is schema-only; no API until the editor needs scene editing.
- Chapter creation uses `prompt()`; replace with inline UI in a later
  editor chrome pass.
- No automated E2E runner; browser flows are verified manually and
  recorded in `test-matrix.md`.

## Phase 0 task sequence (completed)

1.  NF-0001 Initialize monorepo/workspaces.
2.  NF-0002 Add Docker Compose baseline for PostgreSQL+pgvector and
    Redis.
3.  NF-0003 Establish shared config/env validation.
4.  NF-0004 Create module-boundary conventions and contract package.
5.  NF-0005 Add CI lint/typecheck/test skeleton.
6.  NF-0006 Implement first ADR/test documentation workflow.
7.  NF-0007 Bootstrap Nuxt/Tailwind web shell.
8.  NF-0008 Bootstrap Fastify API health/readiness.
9.  NF-0009 Bootstrap worker health and BullMQ connection.
10. NF-0010 Cross-platform clean-clone verification on Windows and
    Ubuntu.

Do not implement advanced story engines before Phase 0 conventions are
stable.
