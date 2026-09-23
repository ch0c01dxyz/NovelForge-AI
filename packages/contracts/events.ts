/**
 * Domain events — immutable audit facts about NovelForge operations
 * (SYSTEM-ARCHITECTURE.md "Event model").
 *
 * The envelope schema below is a placeholder shared by all events; per-event
 * payload contracts are narrowed as each domain package lands. Contracts are
 * data/types only — no business logic, no provider SDK imports.
 */
import { z } from "zod";

/** Canonical domain event names. Keep in sync with SYSTEM-ARCHITECTURE.md. */
export const DOMAIN_EVENT_NAMES = [
  "CanonFactAdded",
  "WorldRuleModified",
  "CharacterStateChanged",
  "RelationshipChanged",
  "TimelineEventAdded",
  "OutlineNodeChanged",
  "CheckpointCreated",
  "BranchCreated",
  "GenerationCompleted",
  "CandidateCanonProposed",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

/** Placeholder envelope for every domain event until per-event payloads exist. */
export const domainEventSchema = z.object({
  type: z.enum(DOMAIN_EVENT_NAMES),
  occurredAt: z.iso.datetime(),
  novelId: z.string().min(1),
  /** Null for system-initiated events (workers, schedulers). */
  actorId: z.string().min(1).nullable(),
  /** Revision the event applies to, when the mutation is versioned. */
  revisionId: z.string().min(1).nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export type DomainEvent = z.infer<typeof domainEventSchema>;
