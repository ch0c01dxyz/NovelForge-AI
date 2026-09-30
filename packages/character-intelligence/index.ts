/**
 * Character intelligence — pure character rules (Phase 8, slice 1).
 *
 * Domain package (ADR-0001): no Prisma, no HTTP, no provider imports.
 * Prisma access lives in apps/api; the rules live here so they can be
 * tested without a database.
 */
export * from "./character.ts";
