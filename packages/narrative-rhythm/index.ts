/**
 * Narrative rhythm — pure drama/rhythm rules (Phase 9, Task A).
 *
 * Domain package (ADR-0001): no Prisma, no HTTP, no provider imports.
 * Prisma access lives in apps/api; the rules live here so they can be
 * tested without a database.
 */
export * from "./vocabulary.ts";
export * from "./rhythm.ts";
export * from "./scale.ts";
