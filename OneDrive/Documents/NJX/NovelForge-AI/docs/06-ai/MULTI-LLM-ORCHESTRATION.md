# Multi-LLM Orchestration Playbook

## Goal

Make tasks understandable to Claude, GLM, DeepSeek, Kimi, and future
coding models without relying on hidden shared context.

## Task graph

Architecture/spec tasks precede implementation tasks that depend on
them. Database contract precedes API implementation. API/contract
precedes UI integration. Implementation precedes independent review.
Review findings become explicit follow-up tasks.

## Agent roles

Orchestrator: decomposes and schedules; does not silently redesign.
Architecture Agent: module boundaries/ADRs. Database Agent:
schema/migrations/repositories. Backend Agent: application/domain/API.
Frontend Agent: Nuxt/Tailwind UX. AI Agent:
OmniRoute/orchestration/context/agents. Test Agent: tests and fixtures.
Review Agent: independent invariant/security/architecture review.

One model may perform multiple roles at different times, but the task
contract must identify the role.

## Every task must contain

ID Goal Why Required reading Dependencies Allowed paths Forbidden paths
Inputs/contracts Implementation requirements Acceptance criteria Tests
to run Documentation to update Versioning/migration implications
Out-of-scope items

## Context discipline

Do not paste the whole project into every prompt. Provide constitution +
relevant domain spec + exact contracts + task. When a task discovers
missing architecture, create a design/ADR task instead of improvising.

## Handoff

Every completed task reports: files changed; migrations; tests run and
actual result; unverified items; decisions made; new risks; recommended
next task.

Never write "all tests pass" unless they were executed.
