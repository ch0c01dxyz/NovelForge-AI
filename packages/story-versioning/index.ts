/**
 * @novelforge/story-versioning — pure revision/checkpoint/restore rules.
 *
 * Domain package (ADR-0001): no Prisma, no HTTP, no provider imports.
 * Prisma access lives in apps/api; the rules live here so they can be
 * tested without a database. Implements STORY-VERSIONING.md §Contract
 * (C1, C2, C3, C7) — the frozen NF-WF-001 contract.
 */
export * from "./snapshot.ts";
export * from "./impact.ts";
export * from "./dependency-edges.ts";
export * from "./restore-scope.ts";
export * from "./coherence.ts";
