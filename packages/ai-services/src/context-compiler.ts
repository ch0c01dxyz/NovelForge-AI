/**
 * NF-WF-003 — shared chapter context compiler.
 *
 * One context compiler for every path that builds a generation prompt
 * (direct `generate`/`generateStream` and the workflow `RETRIEVAL` step),
 * selecting by the constitution's §7 priority order and never dropping
 * mandatory context silently to satisfy a budget.
 *
 * The module is PURE: it performs no database read and imports no service,
 * HTTP, or provider (CLAUDE.md §10). Callers fetch bounded rows through the
 * existing gated services (canon, planning, characters, relationships,
 * narrative, retrieval) and pass them in; the compiler selects, orders,
 * budgets, and tags them. That split is what makes invariant 7 checkable:
 * both callers run the same `fetchAndCompileContext`, so their selection
 * logic cannot drift apart again.
 *
 * Bound constants are explicit values, never defaults (invariant 1):
 *
 * - OUTLINE_LIMIT (40): outline nodes inside the planning-horizon window.
 *   An outline is a planning document; 40 nodes cover a saga's near-term
 *   beats without becoming a manuscript dump.
 * - FACT_LIMIT (60): canon facts. At ~100 chars per rendered fact line this
 *   is ~6k chars, which ties the row bound to the historical
 *   FACT_BUDGET_CHARS the old `break` loop enforced.
 * - CAST_LIMIT (12): characters whose state window covers the story
 *   position. A chapter's active cast is small; the bound is on the
 *   deduplicated character list (invariant 3), not on state rows.
 * - PAIR_LIMIT (24): directed relationship pairs among the cast, named
 *   separately from CAST_LIMIT (review F2) — pairs grow quadratically
 *   while the cast grows linearly.
 * - THREAD_LIMIT (20): narrative-debt candidates per table (threads and
 *   promises are read separately, so at most 2×THREAD_LIMIT rows cross
 *   the wire before the exact debt ranking selects the top THREAD_LIMIT).
 * - EVENT_LIMIT (30): timeline events / causal edges, most-recent-first
 *   at or before the story position.
 * - REFERENCE_LIMIT (8): one unified retrieval bound for both callers.
 *   The orchestrator used 8 and the workflow step used 10; 8 is chosen
 *   because the retrieval path was never the defect, and unifying on the
 *   smaller bound keeps prompt size predictable. Justified, not inherited.
 * - FACT_BUDGET_CHARS (6_000) / REF_BUDGET_CHARS (6_000): the historical
 *   char budgets, kept. Tiers 2–9 share the context budget;
 *   tier 10 (references) keeps its own.
 */

/** Discriminated block status (invariant 10). Never an empty list that reads as "no memory". */
export type TierStatus =
  | "PRESENT"
  | "EMPTY"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE"
  | "OVERFLOWED";

export const OUTLINE_LIMIT = 40;
export const FACT_LIMIT = 60;
export const CAST_LIMIT = 12;
export const PAIR_LIMIT = 24;
export const THREAD_LIMIT = 20;
export const EVENT_LIMIT = 30;
export const REFERENCE_LIMIT = 8;
export const FACT_BUDGET_CHARS = 6_000;
export const REF_BUDGET_CHARS = 6_000;
/** Shared char budget for tiers 2–9 (outline, canon, states, debt, events, DNA). */
export const CONTEXT_BUDGET_CHARS = 18_000;

/** §7 tier numbers, for readability at call sites. */
export const TIERS = {
  INSTRUCTION: 1,
  OUTLINE: 2,
  CANON: 3,
  STATES: 4,
  DEBT: 5,
  TIMELINE: 6,
  RECENT_MEMORY: 7,
  HISTORICAL_MEMORY: 8,
  DNA: 9,
  REFERENCES: 10,
} as const;

// ---------------------------------------------------------------------------
// Row shapes (already-fetched, already bounded by the caller)
// ---------------------------------------------------------------------------

export interface OutlineNodeRow {
  id: string;
  title: string;
  kind: string;
  summary: string | null;
  order: number;
  sagaId: string;
  chapterNumber: number | null;
  sceneNumber: number | null;
  /** Planning-horizon detail level at the story position, for provenance. */
  horizonDetail: string | null;
}

export interface FactRow {
  id: string;
  entityId: string;
  objectEntityId: string | null;
  predicate: string;
  statement: string;
  createdAt: Date;
}

/** Per-row source declaration (NF-WF-010, Invariant 1). */
export interface StateRowProvenance {
  source: "LIVE" | "MEMORY_FRESH";
  sourceRevisionId: string | null;
}

export interface CharacterStateRow {
  id: string;
  characterId: string;
  characterName: string;
  fromChapter: number;
  toChapter: number | null;
  summary: string;
  /** NF-WF-010: per-row source (memory corroboration vs live). */
  provenance?: StateRowProvenance;
}

export interface StanceRow {
  id: string;
  fromCharacterId: string;
  fromCharacterName: string;
  toCharacterId: string;
  toCharacterName: string;
  stance: string;
  fromChapter: number;
  toChapter: number | null;
  /** NF-WF-010: per-row source (stances are always LIVE). */
  provenance?: StateRowProvenance;
}

export interface BondStageRow {
  id: string;
  bondId: string;
  stage: string | null;
  chapter: number;
  /** NF-WF-010: per-row source (bonds are always LIVE). */
  provenance?: StateRowProvenance;
}

export interface DebtRow {
  id: string;
  kind: "THREAD" | "PROMISE";
  title: string;
  debt: number;
}

export interface TimelineEventRow {
  id: string;
  description: string;
  chapterNumber: number | null;
  /**
   * NF-WF-010: when the row is a timeline entry (assembleTimeline),
   * the in-story slot and the raw story_event_id (null flagged, never
   * inferred). Story-event rows (legacy path) leave these undefined.
   */
  order?: number;
  linkedEventId?: string | null;
  availableFromChapter?: number | null;
  /** NF-WF-010: per-row source (timeline entries are always LIVE). */
  provenance?: StateRowProvenance;
}

export interface CausalEdgeRow {
  id: string;
  causeDescription: string;
  effectDescription: string;
  confidence: string;
  /** NF-WF-010: per-row source (causal edges are always LIVE). */
  provenance?: StateRowProvenance;
}

export interface ReferenceHitRow {
  chunkId: string;
  referenceId: string;
  referenceVersionId: string;
  referenceTitle: string;
  start: number;
  end: number;
  text: string;
}

export interface CompilerRows {
  outline: OutlineNodeRow[];
  /**
   * Loud horizon-policy problem from the tier-2 read (EMPTY_POLICY /
   * MALFORMED_POLICY / UNCOVERED_DISTANCE), carried into the tier-2 block's
   * provenance `reason` so a broken policy is never an unexplained EMPTY
   * (contract §Known unknowns; F1).
   */
  outlineHorizonProblem?: string | null;
  /**
   * The approved outline version id pinned in the pin phase (invariant 6),
   * null when nothing is approved. Carried into tier-2 provenance (F3).
   */
  outlineVersionId?: string | null;
  facts: FactRow[];
  states: CharacterStateRow[];
  stances: StanceRow[];
  bondStages: BondStageRow[];
  debt: DebtRow[];
  events: TimelineEventRow[];
  causal: CausalEdgeRow[];
  dna: { dna: unknown } | null;
  references: ReferenceHitRow[];
  /**
   * Search-level metadata from the tier-10 retrieval call (retrievers that
   * ran, withheld count). Carried for the workflow RETRIEVAL step's JSON
   * output; not part of the prompt text.
   */
  referenceMeta?: { retrievers: string[]; withheldCount: number };
  /**
   * NF-WF-009: the recalled chapter/recent/arc memory for tiers 7/8.
   * Null when the memory port is absent or the chapter has no settled
   * memory; tiers 7/8 then compile UNAVAILABLE, never an empty PRESENT.
   */
  memory: import("@novelforge/memory").RecallNovelResult | null;
  /**
   * NF-WF-010: the 009-memory status behind the tier-4/6 assembly
   * (FRESH/STALE/FAILED/MISSING/UNCONFIGURED), carried into the tier
   * blocks' provenance. Set when the state-assembly port served the
   * tier; absent on the legacy path.
   */
  stateMemory?: { status: string; sourceRevisionId: string | null };
  /**
   * NF-WF-010: MEMORY_LIVE_DIVERGENCE findings from the tier-4 assembly
   * (the live row stands; the memory row is suspect). Surfaced on the
   * rows for observability; the assembly service is the primary
   * surface.
   */
  stateDivergences?: import("./evidence-findings.ts").EvidenceFinding[];
}

export function emptyCompilerRows(): CompilerRows {
  return {
    outline: [],
    facts: [],
    states: [],
    stances: [],
    bondStages: [],
    debt: [],
    events: [],
    causal: [],
    dna: null,
    references: [],
    memory: null,
  };
}

// ---------------------------------------------------------------------------
// Compiler input / output
// ---------------------------------------------------------------------------

export interface CompilerInput {
  actorUserId: string;
  workspaceId: string;
  novelId?: string;
  /** The author's instruction — tier 1, always mandatory. */
  instruction: string;
  contextQuery?: string;
  mode?: unknown;
  readerChapter?: number;
  /**
   * Derived server-side by the caller; never accepted from the request.
   * Resolved by `fetchAndCompileContext` before the pure compile runs.
   */
  storyPosition?: number;
  headRevisionId?: string | null;
  /** Tri-state head expectation (§C12.1): undefined asserts nothing. */
  expectedHeadRevisionId?: string | null;
  /** Tiers that must fit fully or fail the compile. Default [1]. */
  mandatoryTiers?: number[];
  contextBudgetChars?: number;
  refBudgetChars?: number;
  /**
   * NF-WF-003: when true, the novel-less path still runs the reference
   * search (tier 10). The workflow RETRIEVAL step sets this — a search
   * step searches even without a novel. The orchestrator leaves it false:
   * a novel-less generic generation never searched before, and searching
   * would embed a query for no novel scope.
   */
  searchReferencesWithoutNovel?: boolean;
}

/** The pure compile's input: story position and head pin already resolved. */
export type ResolvedCompilerInput = CompilerInput & {
  storyPosition: number;
  headRevisionId: string | null;
};

export interface TierProvenance {
  tier: number;
  name: string;
  status: TierStatus;
  /** Why UNAVAILABLE / OVERFLOWED. Never an invented default. */
  reason?: string;
  /** The read bound applied (invariant 11). */
  bound?: number;
  /** The ordering applied. */
  order?: string;
  selectedIds?: string[];
  storyPosition?: number;
  headRevisionId?: string | null;
  /**
   * The approved outline version pinned for tier 2 (invariant 6), null when
   * no outline version is approved. Informational: `OutlineNode` carries no
   * version FK, so the pin names the version the window was read under (F3).
   */
  outlineVersionId?: string | null;
  /** A droppable block lost rows to the char budget — recorded, not silent. */
  truncated?: boolean;
  droppedCount?: number;
  /**
   * NF-WF-009: freshness metadata for tiers 7/8 (Invariant 2). Present
   * whenever a memory block is PRESENT, so the caller sees whether the
   * projection reflects the head or is stale/failed.
   */
  freshness?: import("@novelforge/memory").MemoryFreshness;
  sourceRevisionId?: string | null;
  chapterCoverage?: number[];
  /**
   * NF-WF-010: the 009-memory status behind a tier-4/6 assembly
   * (FRESH/STALE/FAILED/MISSING/UNCONFIGURED). Present whenever the
   * state-assembly port served the tier, so a live-only assembly names
   * why (Invariant 1).
   */
  memory?: { status: string; sourceRevisionId: string | null };
}

export interface CompiledBlock {
  tier: number;
  name: string;
  status: TierStatus;
  rows: unknown[];
  provenance: TierProvenance;
  /** Rendered prompt text. Empty unless PRESENT. */
  text: string;
  mandatory: boolean;
}

export interface CompiledContext {
  storyPosition: number;
  headRevisionId: string | null;
  blocks: CompiledBlock[];
  /** False when a mandatory block overflowed — the caller must not dispatch. */
  canDispatch: boolean;
  overflow?: { tier: number; name: string; reason: string };
  /** Persisted provenance floor: fact ids + reference ids (the old shape). */
  contextSnapshot: Record<string, unknown>;
  /** The retrieval audit row id, when the retrieval port supplied one. */
  retrievalAuditId?: string;
  /** Tier-10 search metadata (retrievers, withheld count) for step outputs. */
  referenceMeta?: { retrievers: string[]; withheldCount: number };
}

/** Typed conflict when the branch head moved during compilation (invariant 6). */
export class HeadConflictError extends Error {
  readonly code = "HEAD_CONFLICT";
  constructor(
    readonly expectedHead: string | null,
    readonly actualHead: string | null,
  ) {
    super(
      "the story revision moved while context was being compiled; " +
        "refusing to generate from mixed rows",
    );
    this.name = "HeadConflictError";
  }
}

// ---------------------------------------------------------------------------
// Narrow reader ports (the CanonReader / ReferenceSearcher precedent)
// ---------------------------------------------------------------------------

export interface CompilerCanonPort {
  listFactsForCompiler(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    mode?: unknown;
    readerChapter?: number;
    relevantEntityIds: string[];
    limit: number;
  }): Promise<{ facts: FactRow[] }>;
  listDebtForCompiler(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    mode?: unknown;
    readerChapter?: number;
    kind: "UNRESOLVED" | "PROMISES";
    storyPosition: number;
    limit: number;
  }): Promise<{ items: DebtRow[] }>;
  listEventsForCompiler(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    mode?: unknown;
    readerChapter?: number;
    storyPosition: number;
    limit: number;
  }): Promise<{ events: TimelineEventRow[] }>;
  listCausalForCompiler(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    mode?: unknown;
    readerChapter?: number;
    storyPosition: number;
    limit: number;
  }): Promise<{ edges: CausalEdgeRow[] }>;
}

export interface CompilerPlanningPort {
  getApprovedOutline(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<{ id: string; number: number } | null>;
  listOutlineNodesForCompiler(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    storyPosition: number;
    limit: number;
    // The service reports a missing/malformed policy loudly via
    // `horizonProblem` (never a silently invented default); the compiler
    // carries it into the tier-2 block's provenance reason (F1).
  }): Promise<{ nodes: OutlineNodeRow[]; horizonProblem: string | null }>;
  getStoryPosition(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<number>;
}

export interface CompilerCharacterPort {
  /** The ONE bounded cast derivation (invariant 3): groupBy characterId, take CAST_LIMIT. */
  listRelevantCast(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    storyPosition: number;
    limit: number;
  }): Promise<{ characterIds: string[]; entityIds: string[] }>;
  getStateAtPosition(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    characterId: string;
    characterName?: string;
    chapter: number;
  }): Promise<CharacterStateRow | null>;
}

export interface CompilerRelationshipPort {
  getStanceAtPosition(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    fromCharacterId: string;
    fromCharacterName?: string;
    toCharacterId: string;
    toCharacterName?: string;
    chapter: number;
  }): Promise<StanceRow | null>;
  getBondStageAtPosition(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    bondId: string;
    chapter: number;
  }): Promise<BondStageRow | null>;
  listBondsForCast(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    characterIds: string[];
    limit: number;
  }): Promise<Array<{ id: string }>>;
}

export interface CompilerNarrativePort {
  getDna(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<{ dna: unknown } | null>;
}

export interface CompilerRetrievalPort {
  search(input: {
    actorUserId: string;
    workspaceId: string;
    query: string;
    novelId?: string;
    mode?: unknown;
    readerChapter?: number;
    limit?: number;
  }): Promise<{
    hits: ReferenceHitRow[];
    auditId?: string;
    retrievers: string[];
    withheldCount: number;
  }>;
}

export interface CompilerHeadPort {
  readHeadRevisionId(novelId: string): Promise<string | null>;
}

/**
 * NF-WF-009 memory port. Optional: when absent, tiers 7/8 compile
 * UNAVAILABLE with the reason "memory not configured" (a deployment
 * without the memory wiring fails open on memory, not on the compile —
 * memory is derived, never required for generation).
 */
export interface CompilerMemoryPort {
  recallNovel(args: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter: number;
  }): Promise<import("@novelforge/memory").RecallNovelResult>;
}

/**
 * NF-WF-010: the state-assembly port (Consumer 1). When present, tiers
 * 4 and 6 consume the assembly services (which declare per-row
 * memory-vs-live provenance) instead of the legacy per-item fan-out.
 * Optional so deployments and tests without the 010 wiring keep the
 * legacy path.
 */
export interface CompilerStateAssemblyPort {
  assembleStates(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter: number;
  }): Promise<{
    characters: import("./state-assembly.ts").CharacterAssembly[];
    memory: import("./state-assembly.ts").MemoryStatusNote;
    divergences: import("./evidence-findings.ts").EvidenceFinding[];
  }>;
  assembleTimeline(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
  }): Promise<import("./state-assembly.ts").TimelineAssembly>;
  assembleRelationships(input: {
    actorUserId: string;
    workspaceId: string;
    novelId: string;
    chapter: number;
  }): Promise<{
    assembly: import("./state-assembly.ts").RelationshipAssembly;
    memory: import("./state-assembly.ts").MemoryStatusNote;
  }>;
}

export interface CompilerPorts {
  canon?: CompilerCanonPort;
  planning?: CompilerPlanningPort;
  characters?: CompilerCharacterPort;
  relationships?: CompilerRelationshipPort;
  narrative?: CompilerNarrativePort;
  retrieval?: CompilerRetrievalPort;
  head?: CompilerHeadPort;
  memory?: CompilerMemoryPort;
  stateAssembly?: CompilerStateAssemblyPort;
}

// ---------------------------------------------------------------------------
// Pure compilation
// ---------------------------------------------------------------------------

const TIER_NAMES: Record<number, string> = {
  [TIERS.INSTRUCTION]: "author instruction",
  [TIERS.OUTLINE]: "current outline",
  [TIERS.CANON]: "hard canon",
  [TIERS.STATES]: "current states",
  [TIERS.DEBT]: "active threads and promises",
  [TIERS.TIMELINE]: "timeline",
  [TIERS.RECENT_MEMORY]: "relevant recent memory",
  [TIERS.HISTORICAL_MEMORY]: "relevant historical memory",
  [TIERS.DNA]: "narrative DNA",
  [TIERS.REFERENCES]: "external references",
};

function block(
  tier: number,
  status: TierStatus,
  rows: unknown[],
  text: string,
  mandatory: boolean,
  provenance: Partial<TierProvenance> = {},
): CompiledBlock {
  return {
    tier,
    name: TIER_NAMES[tier] ?? `tier ${tier}`,
    status,
    rows,
    text,
    mandatory,
    provenance: {
      tier,
      name: TIER_NAMES[tier] ?? `tier ${tier}`,
      status,
      ...provenance,
    },
  };
}

function renderFactRow(f: FactRow): string {
  return `- [fact:${f.id}] ${f.predicate}: ${f.statement}`;
}

function renderOutlineRow(n: OutlineNodeRow): string {
  const where =
    n.chapterNumber !== null ? ` (ch.${n.chapterNumber}${n.sceneNumber !== null ? ` sc.${n.sceneNumber}` : ""})` : "";
  const summary = n.summary ? `: ${n.summary}` : "";
  return `- [outline:${n.id}] ${n.title}${where}${summary}`;
}

function provenanceNote(p?: StateRowProvenance): string {
  // NF-WF-010: a MEMORY_FRESH row names its source revision; LIVE rows
  // carry no suffix (the block provenance already declares the assembly
  // as live-sourced when memory is STALE/FAILED/MISSING/UNCONFIGURED).
  return p?.source === "MEMORY_FRESH"
    ? ` [memory: FRESH @${p.sourceRevisionId}]`
    : "";
}

function renderStateRow(s: CharacterStateRow): string {
  return `- [state:${s.id}] ${s.characterName}: ${s.summary}${provenanceNote(s.provenance)}`;
}

function renderStanceRow(s: StanceRow): string {
  return `- [stance:${s.id}] ${s.fromCharacterName} → ${s.toCharacterName}: ${s.stance}${provenanceNote(s.provenance)}`;
}

function renderBondRow(b: BondStageRow): string {
  const base =
    b.stage === null ? `- [bond:${b.bondId}] severed` : `- [bond:${b.bondId}] stage: ${b.stage}`;
  return `${base}${provenanceNote(b.provenance)}`;
}

function renderDebtRow(d: DebtRow): string {
  return `- [debt:${d.id}] ${d.kind} "${d.title}" (debt ${d.debt})`;
}

function renderEventRow(e: TimelineEventRow): string {
  const where = e.chapterNumber !== null ? ` [ch.${e.chapterNumber}]` : "";
  // NF-WF-010: timeline entries flag their linkage (null = unlinked,
  // never inferred) and their slot order.
  const link =
    e.linkedEventId !== undefined
      ? e.linkedEventId === null
        ? " [unlinked]"
        : ` [event:${e.linkedEventId}]`
      : "";
  const slot = e.order !== undefined ? ` [slot ${e.order}]` : "";
  return `- [event:${e.id}]${where}${slot}${link} ${e.description}${provenanceNote(e.provenance)}`;
}

function renderCausalRow(c: CausalEdgeRow): string {
  return `- [causal:${c.id}] ${c.causeDescription} ⇒ ${c.effectDescription} (${c.confidence})${provenanceNote(c.provenance)}`;
}

function renderDnaRow(dna: unknown): string {
  return `- [dna] ${JSON.stringify(dna)}`;
}

function renderReferenceRow(h: ReferenceHitRow, index: number): string {
  return `[${index + 1}] ${h.referenceTitle} (chars ${h.start}-${h.end})\n${h.text}`;
}

/**
 * Fit a droppable block's rows into the remaining char budget, in row order.
 * Returns the kept rows and whether any were dropped (recorded, not silent).
 */
function fitRows<T>(
  rows: T[],
  render: (row: T, index: number) => string,
  budgetLeft: number,
): { kept: T[]; text: string; truncated: boolean; droppedCount: number } {
  const kept: T[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const [index, row] of rows.entries()) {
    const line = render(row, index);
    // +1 for the newline joining lines; the first line pays no separator.
    const cost = line.length + (parts.length > 0 ? 1 : 0);
    if (used + cost > budgetLeft) break;
    parts.push(line);
    kept.push(row);
    used += cost;
  }
  return {
    kept,
    text: parts.join("\n"),
    truncated: kept.length < rows.length,
    droppedCount: rows.length - kept.length,
  };
}

/**
 * The pure compiler. `rows` are already fetched and already bounded by the
 * caller (every tier bound is a bound on the read, invariant 11); this
 * function orders within a tier where the contract defines an order,
 * applies the char budget, and tags every block with its status and
 * provenance. No database read, no service import, no model call.
 */
export function compileContext(
  input: ResolvedCompilerInput,
  rows: CompilerRows,
): CompiledContext {
  const mandatoryTiers = new Set(input.mandatoryTiers ?? [TIERS.INSTRUCTION]);
  const contextBudget = input.contextBudgetChars ?? CONTEXT_BUDGET_CHARS;
  const refBudget = input.refBudgetChars ?? REF_BUDGET_CHARS;
  const novelLess = !input.novelId;

  const blocks: CompiledBlock[] = [];
  let budgetLeft = contextBudget;

  const isMandatory = (tier: number): boolean => mandatoryTiers.has(tier);

  /** Add a droppable-or-mandatory novel tier block. */
  const addTier = <T>(
    tier: number,
    tierRows: T[],
    render: (row: T, index: number) => string,
    provenance: Partial<TierProvenance>,
  ): void => {
    const name = TIER_NAMES[tier] ?? `tier ${tier}`;
    const mandatory = isMandatory(tier);
    if (novelLess) {
      blocks.push(
        block(tier, "NOT_APPLICABLE", [], "", mandatory, {
          ...provenance,
          reason: "novel-less generation invents no novel context",
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
      return;
    }
    if (tierRows.length === 0) {
      blocks.push(
        block(tier, "EMPTY", [], "", mandatory, {
          ...provenance,
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
      return;
    }
    const fitted = fitRows(tierRows, render, budgetLeft);
    if (fitted.kept.length === 0 && mandatory) {
      blocks.push(
        block(tier, "OVERFLOWED", [], "", true, {
          ...provenance,
          reason:
            `mandatory block "${name}" needs ${fitted.droppedCount} row(s) ` +
            `beyond the remaining ${budgetLeft} chars of budget`,
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
      return;
    }
    budgetLeft -= fitted.text.length;
    blocks.push(
      block(
        tier,
        "PRESENT",
        fitted.kept,
        fitted.text,
        mandatory,
        {
          ...provenance,
          ...(fitted.truncated
            ? { truncated: true, droppedCount: fitted.droppedCount }
            : {}),
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        },
      ),
    );
  };

  // Tier 1 — author instruction. Always mandatory, always present: it is the
  // request itself, not retrieved context. It does not consume the shared
  // context budget (the route already caps its length); a caller that marks
  // another tier mandatory exercises the overflow path below.
  blocks.push(
    block(TIERS.INSTRUCTION, "PRESENT", [input.instruction], input.instruction, true, {
      storyPosition: input.storyPosition,
      headRevisionId: input.headRevisionId,
    }),
  );

  // Tier 2 — current outline / scenes, OUTLINE_LIMIT, horizon window applied
  // by the caller. Order: outline order (saga, then order), stated. A
  // horizon-policy problem is carried as the block reason so a broken
  // policy is loud in the output, never a bare EMPTY (F1).
  addTier(TIERS.OUTLINE, rows.outline, renderOutlineRow, {
    bound: OUTLINE_LIMIT,
    order: "sagaId asc, outline order asc",
    selectedIds: rows.outline.map((n) => n.id),
    outlineVersionId: rows.outlineVersionId ?? null,
    ...(rows.outlineHorizonProblem
      ? {
          reason:
            `planning horizon problem ${rows.outlineHorizonProblem}: no horizon ` +
            `window could be determined, so no outline nodes were selected`,
        }
      : {}),
  });

  // Tier 3 — hard canon. The caller returns rows in the contract's three-key
  // order (entity match, createdAt desc, id asc); the compiler keeps that
  // order and applies only the char budget.
  addTier(TIERS.CANON, rows.facts, renderFactRow, {
    bound: FACT_LIMIT,
    order: "entity match, createdAt desc, id asc",
    selectedIds: rows.facts.map((f) => f.id),
  });

  // Tier 4 — current states at the story position (never "now").
  // NF-WF-010: when the state-assembly port served the tier, the block
  // provenance carries the explicit memory status note (Invariant 1);
  // per-row provenance rides on the rows themselves.
  type StateTierRow = CharacterStateRow | StanceRow | BondStageRow;
  const renderStateTierRow = (row: StateTierRow): string => {
    if ("summary" in row) return renderStateRow(row as CharacterStateRow);
    if ("fromCharacterName" in row) return renderStanceRow(row as StanceRow);
    return renderBondRow(row as BondStageRow);
  };
  const stateTierRows: StateTierRow[] = [...rows.states, ...rows.stances, ...rows.bondStages];
  addTier(
    TIERS.STATES,
    stateTierRows,
    renderStateTierRow,
    {
      bound: CAST_LIMIT,
      order: "characterId asc (cast derivation); pairs bounded by PAIR_LIMIT",
      selectedIds: [
        ...rows.states.map((s) => s.id),
        ...rows.stances.map((s) => s.id),
        ...rows.bondStages.map((b) => b.id),
      ],
      ...(rows.stateMemory ? { memory: rows.stateMemory } : {}),
    },
  );

  // Tier 5 — active threads / promises, narrative-debt rank kept.
  addTier(TIERS.DEBT, rows.debt, renderDebtRow, {
    bound: THREAD_LIMIT,
    order: "narrative debt desc (documented ranking over the bounded candidate set)",
    selectedIds: rows.debt.map((d) => d.id),
  });

  // Tier 6 — timeline: events then causal edges.
  // Legacy path (no state-assembly port): story events + causal edges,
  // most-recent-first, never past the story position (enforced by the
  // caller in the query).
  // NF-WF-010 path: timeline entries (with linkedEventId flags) +
  // causal edges, order asc — 009 memory contributes nothing to tier 6
  // (timeline entries are authored prose-position records, Invariant 1).
  type TimelineTierRow = TimelineEventRow | CausalEdgeRow;
  const timelineTierRows: TimelineTierRow[] = [...rows.events, ...rows.causal];
  addTier(
    TIERS.TIMELINE,
    timelineTierRows,
    (row) =>
      "causeDescription" in row
        ? renderCausalRow(row as CausalEdgeRow)
        : renderEventRow(row as TimelineEventRow),
    {
      bound: EVENT_LIMIT,
      order: rows.stateMemory
        ? "timeline order asc (authored slots); causal edges by id"
        : "story position desc, most recent first",
      selectedIds: [
        ...rows.events.map((e) => e.id),
        ...rows.causal.map((c) => c.id),
      ],
      ...(rows.stateMemory ? { memory: rows.stateMemory } : {}),
    },
  );

  // Tiers 7 and 8 — NF-WF-009 revision-derived memory. PRESENT with
  // freshness metadata, UNAVAILABLE with an explicit reason, never an
  // empty PRESENT block and never a fabricated summary (invariant 10,
  // Q1: summary is always null/SKIPPED in 009).
  //
  // - Port absent (deployment without memory wiring) → UNAVAILABLE
  //   "memory not configured".
  // - No projection for the scope (MISSING) → UNAVAILABLE with the
  //   explicit MISSING reason.
  // - FRESH/STALE/FAILED → PRESENT with freshness + sourceRevisionId +
  //   chapterCoverage in provenance (staleness is metadata, not silence).
  const memoryTier = (
    tier: number,
    memBlocks: import("@novelforge/memory").MemoryBlock[],
    missing: boolean,
  ): void => {
    if (!rows.memory || missing) {
      blocks.push(
        block(tier, "UNAVAILABLE", [], "", isMandatory(tier), {
          reason:
            "no memory projection for this chapter (MISSING): no rebuild has materialized it, or the memory port is not configured",
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
      return;
    }
    const lines: string[] = [];
    const selectedIds: string[] = [];
    let freshness: import("@novelforge/memory").MemoryFreshness | undefined;
    let sourceRevisionId: string | null = null;
    const coverage: number[] = [];
    for (const b of memBlocks) {
      if (!freshness) freshness = b.freshness;
      if (!sourceRevisionId) sourceRevisionId = b.sourceRevisionId;
      coverage.push(...b.chapterCoverage);
      for (const f of b.structural.facts) {
        lines.push(`- [mem-fact:${f.factId}] ${f.predicate}: ${f.statement}`);
        selectedIds.push(f.factId);
      }
      for (const t of b.structural.threads) {
        lines.push(`- [mem-thread:${t.threadId}] ${t.title}: ${t.status}`);
        selectedIds.push(t.threadId);
      }
      for (const p of b.structural.promises) {
        lines.push(`- [mem-promise:${p.promiseId}] ${p.title}: ${p.status}`);
        selectedIds.push(p.promiseId);
      }
    }
    if (lines.length === 0) {
      // A projection exists but is structurally empty at this revision.
      // That is a fact about the canon (no facts/threads/promises), not a
      // missing store — EMPTY, not UNAVAILABLE.
      blocks.push(
        block(tier, "EMPTY", [], "", isMandatory(tier), {
          freshness,
          sourceRevisionId,
          chapterCoverage: [...new Set(coverage)].sort((a, b) => a - b),
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
      return;
    }
    const text = lines.join("\n");
    if (text.length > budgetLeft && isMandatory(tier)) {
      blocks.push(
        block(tier, "OVERFLOWED", [], "", true, {
          reason: `mandatory block "${TIER_NAMES[tier]}" needs ${text.length} chars beyond the remaining ${budgetLeft} of budget`,
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
    } else {
      const fitted = text.length <= budgetLeft;
      if (fitted) budgetLeft -= text.length;
      blocks.push(
        block(tier, "PRESENT", [], fitted ? text : "", isMandatory(tier), {
          freshness,
          sourceRevisionId,
          chapterCoverage: [...new Set(coverage)].sort((a, b) => a - b),
          selectedIds,
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
          ...(fitted ? {} : { truncated: true }),
        }),
      );
    }
  };

  // Tier 7: L1 (this chapter) + L2 (recent chapters).
  const recentBlocks = rows.memory
    ? [rows.memory.chapterMemory, ...rows.memory.recentMemory].filter(
        (b): b is import("@novelforge/memory").MemoryBlock => b !== null,
      )
    : [];
  memoryTier(TIERS.RECENT_MEMORY, recentBlocks, recentBlocks.length === 0);
  // Tier 8: L3/L4 (arc).
  const arcBlocks = rows.memory?.arcMemory ? [rows.memory.arcMemory] : [];
  memoryTier(TIERS.HISTORICAL_MEMORY, arcBlocks, arcBlocks.length === 0);

  // Tier 9 — Narrative DNA, per-novel singleton.
  if (novelLess) {
    blocks.push(
      block(TIERS.DNA, "NOT_APPLICABLE", [], "", isMandatory(TIERS.DNA), {
        reason: "novel-less generation invents no novel context",
        storyPosition: input.storyPosition,
        headRevisionId: input.headRevisionId,
      }),
    );
  } else if (rows.dna === null) {
    blocks.push(
      block(TIERS.DNA, "EMPTY", [], "", isMandatory(TIERS.DNA), {
        bound: 1,
        storyPosition: input.storyPosition,
        headRevisionId: input.headRevisionId,
      }),
    );
  } else {
    const text = renderDnaRow(rows.dna.dna);
    if (text.length > budgetLeft && isMandatory(TIERS.DNA)) {
      blocks.push(
        block(TIERS.DNA, "OVERFLOWED", [], "", true, {
          reason: `mandatory block "narrative DNA" needs ${text.length} chars beyond the remaining ${budgetLeft} of budget`,
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
    } else {
      const fitted = text.length <= budgetLeft;
      if (fitted) budgetLeft -= text.length;
      blocks.push(
        block(
          TIERS.DNA,
          "PRESENT",
          fitted ? [rows.dna] : [],
          fitted ? text : "",
          isMandatory(TIERS.DNA),
          {
            bound: 1,
            ...(fitted ? {} : { truncated: true, droppedCount: 1 }),
            storyPosition: input.storyPosition,
            headRevisionId: input.headRevisionId,
          },
        ),
      );
    }
  }

  // Tier 10 — external references. One unified limit (invariant 1), its own
  // char budget, relevance-ranked by the caller (kept).
  {
    const mandatory = isMandatory(TIERS.REFERENCES);
    if (rows.references.length === 0) {
      blocks.push(
        block(TIERS.REFERENCES, "EMPTY", [], "", mandatory, {
          bound: REFERENCE_LIMIT,
          order: "relevance-ranked (retrieval RRF)",
          storyPosition: input.storyPosition,
          headRevisionId: input.headRevisionId,
        }),
      );
    } else {
      const fitted = fitRows(rows.references, renderReferenceRow, refBudget);
      if (fitted.kept.length === 0 && mandatory) {
        blocks.push(
          block(TIERS.REFERENCES, "OVERFLOWED", [], "", true, {
            reason: `mandatory block "external references" needs rows beyond the remaining ${refBudget} chars of budget`,
            storyPosition: input.storyPosition,
            headRevisionId: input.headRevisionId,
          }),
        );
      } else {
        blocks.push(
          block(
            TIERS.REFERENCES,
            "PRESENT",
            fitted.kept,
            fitted.kept.length > 0
              ? "## Reference excerpts\n" + fitted.text
              : "",
            mandatory,
            {
              bound: REFERENCE_LIMIT,
              order: "relevance-ranked (retrieval RRF)",
              selectedIds: fitted.kept.map((h) => h.chunkId),
              ...(fitted.truncated
                ? { truncated: true, droppedCount: fitted.droppedCount }
                : {}),
              storyPosition: input.storyPosition,
              headRevisionId: input.headRevisionId,
            },
          ),
        );
      }
    }
  }

  const overflowed = blocks.find((b) => b.status === "OVERFLOWED");
  const factIds = rows.facts.map((f) => f.id);
  const references = rows.references.map((h) => ({
    referenceId: h.referenceId,
    referenceVersionId: h.referenceVersionId,
    chunkId: h.chunkId,
  }));
  return {
    storyPosition: input.storyPosition,
    headRevisionId: input.headRevisionId,
    blocks,
    canDispatch: overflowed === undefined,
    ...(overflowed
      ? {
          overflow: {
            tier: overflowed.tier,
            name: overflowed.name,
            reason: overflowed.provenance.reason ?? "mandatory block overflowed",
          },
        }
      : {}),
    contextSnapshot: {
      // The old shape is the floor, not the ceiling (contract §Outputs).
      ...(factIds.length > 0 ? { facts: factIds } : {}),
      ...(references.length > 0 ? { references } : {}),
      storyPosition: input.storyPosition,
      headRevisionId: input.headRevisionId,
      blocks: blocks.map((b) => b.provenance),
    },
    ...(rows.referenceMeta ? { referenceMeta: rows.referenceMeta } : {}),
  };
}

/**
 * Render the compiled PRESENT blocks as prompt text. Retrieved text goes in
 * the USER turn, fenced, never sharing the system turn (the orchestrator's
 * existing fence contract).
 */
export function renderContextText(compiled: CompiledContext): string {
  const parts: string[] = [];
  for (const b of compiled.blocks) {
    if (b.status !== "PRESENT" || b.text.length === 0) continue;
    if (b.tier === TIERS.INSTRUCTION) continue; // the instruction is appended separately
    const heading =
      b.tier === TIERS.OUTLINE
        ? "## Current outline"
        : b.tier === TIERS.CANON
          ? "## Established canon"
          : b.tier === TIERS.STATES
            ? "## Current states"
            : b.tier === TIERS.DEBT
              ? "## Open threads and promises"
              : b.tier === TIERS.TIMELINE
                ? "## Timeline"
                : b.tier === TIERS.DNA
                  ? "## Narrative DNA"
                  : `## ${b.name}`;
    parts.push(`${heading}\n${b.text}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Caller-side fetch + pin + compile (shared by both callers)
// ---------------------------------------------------------------------------

/**
 * The one fetch path both callers use (invariant 7). Tenant is gated inside
 * each port's service; this function additionally pins the source revision
 * before and after the bounded reads (invariant 6): gate → read head →
 * fetch bounded rows → read head again → typed conflict on movement, no
 * model call. The compiled rows are immutable and reused across model
 * retries because compilation happens once, before the first attempt.
 *
 * This detects covered mutations only (revisions.ts tracks the covered
 * tables); uncovered mutations are disclosed, never claimed as snapshotted
 * (GAP-004).
 */
export async function fetchAndCompileContext(
  ports: CompilerPorts,
  input: CompilerInput,
): Promise<CompiledContext> {
  const { novelId } = input;
  if (!novelId) {
    // Novel-less generic generation: no novel tiers, no head pin — there is
    // no novel to pin, and inventing one would be the GAP-018-shaped error
    // (an absent thing looking present).
    const rows = emptyCompilerRows();
    let retrievalAuditId: string | undefined;
    // The workflow RETRIEVAL step is an explicit search: it searches even
    // without a novel (searchReferencesWithoutNovel). The orchestrator's
    // novel-less path does not — it never searched before, and a
    // workspace-wide search would embed a query against no novel scope.
    if (ports.retrieval && input.searchReferencesWithoutNovel) {
      const found = await ports.retrieval.search({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        query: (input.contextQuery ?? input.instruction).slice(0, 2000),
        mode: input.mode ?? "AUTHOR",
        limit: REFERENCE_LIMIT,
      });
      rows.references = found.hits;
      rows.referenceMeta = { retrievers: found.retrievers, withheldCount: found.withheldCount };
      retrievalAuditId = found.auditId;
    }
    const compiled = compileContext({ ...input, storyPosition: 0, headRevisionId: null }, rows);
    return retrievalAuditId ? { ...compiled, retrievalAuditId } : compiled;
  }

  // All tier readers are required once a novel is in play; a deployment (or
  // test) without them fails closed instead of silently compiling a
  // partial context.
  const { canon, planning, characters, relationships, narrative, head, retrieval } = ports;
  if (!canon || !planning || !characters || !relationships || !narrative || !head) {
    throw new Error("context compiler is not configured: missing tier readers");
  }

  const headBefore = await head.readHeadRevisionId(novelId);
  // Tri-state expectation (§C12.1): undefined asserts nothing; null asserts
  // no head; a string asserts that exact head. The caller never authors the
  // pin — it only constrains it.
  if (input.expectedHeadRevisionId !== undefined && input.expectedHeadRevisionId !== headBefore) {
    throw new HeadConflictError(input.expectedHeadRevisionId, headBefore);
  }

  // Pin the approved outline alongside the head (invariant 6): the outline
  // version tier 2 reads under is recorded in its provenance. Null when no
  // version is approved — a novel without an approved outline is ordinary,
  // not an error (F3).
  const approvedOutline = await planning.getApprovedOutline({
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    novelId,
  });

  // Story position first: every temporal tier resolves against it, and the
  // caller may not override it (contract §Known unknowns).
  const storyPosition = await planning.getStoryPosition({
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    novelId,
  });

  // The ONE bounded cast derivation (invariant 3): tier 3 and tier 4 read
  // the same set; neither builds its own.
  const cast = await characters.listRelevantCast({
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    novelId,
    storyPosition,
    limit: CAST_LIMIT,
  });

  const rows = emptyCompilerRows();
  const base = {
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    novelId,
    mode: input.mode ?? "AUTHOR",
    ...(input.readerChapter !== undefined ? { readerChapter: input.readerChapter } : {}),
  };

  const [outlineResult, factsResult, debtResult, eventsResult, causalResult, dnaResult] =
    await Promise.all([
      planning.listOutlineNodesForCompiler({
        ...base,
        storyPosition,
        limit: OUTLINE_LIMIT,
      }),
      canon.listFactsForCompiler({
        ...base,
        relevantEntityIds: cast.entityIds,
        limit: FACT_LIMIT,
      }),
      canon.listDebtForCompiler({
        ...base,
        kind: "UNRESOLVED",
        storyPosition,
        limit: THREAD_LIMIT,
      }),
      canon.listEventsForCompiler({
        ...base,
        storyPosition,
        limit: EVENT_LIMIT,
      }),
      canon.listCausalForCompiler({
        ...base,
        storyPosition,
        limit: EVENT_LIMIT,
      }),
      narrative.getDna({ ...base }),
    ]);
  rows.outline = outlineResult.nodes;
  rows.outlineHorizonProblem = outlineResult.horizonProblem;
  rows.outlineVersionId = approvedOutline?.id ?? null;
  rows.facts = factsResult.facts;
  rows.debt = debtResult.items;
  rows.events = eventsResult.events;
  rows.causal = causalResult.edges;
  rows.dna = dnaResult;

  // NF-WF-009: memory is optional and never fails the compile closed.
  // The port is absent in deployments without the memory wiring, and a
  // chapter with no settled projection recalls null blocks — both compile
  // UNAVAILABLE at tiers 7/8, never an empty PRESENT.
  if (ports.memory) {
    try {
      rows.memory = await ports.memory.recallNovel({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        novelId,
        chapter: storyPosition,
      });
    } catch {
      rows.memory = null;
    }
  }

  // NF-WF-010: when the state-assembly port is present, tiers 4 and 6
  // consume the assembly services — which declare per-row memory-vs-live
  // provenance (Invariant 1) — instead of the legacy per-item fan-out
  // below. Tier 6 then carries timeline entries (with linkedEventId
  // flags), not story events; 009 memory contributes nothing to tier 6.
  if (ports.stateAssembly) {
    const assembled = await ports.stateAssembly.assembleStates({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      novelId,
      chapter: storyPosition,
    });
    for (const c of assembled.characters) {
      if (c.currentState) {
        rows.states.push({
          id: c.currentState.id,
          characterId: c.characterId,
          characterName: c.name,
          fromChapter: c.currentState.fromChapter,
          toChapter: c.currentState.toChapter,
          summary: c.currentState.summary,
          provenance: c.currentState.provenance,
        });
      }
    }
    const assembledRel = await ports.stateAssembly.assembleRelationships({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      novelId,
      chapter: storyPosition,
    });
    for (const p of assembledRel.assembly.pairs) {
      rows.stances.push({
        id: p.id,
        fromCharacterId: p.fromCharacterId,
        fromCharacterName: p.fromCharacterName,
        toCharacterId: p.toCharacterId,
        toCharacterName: p.toCharacterName,
        stance: p.stance,
        fromChapter: p.window[0],
        toChapter: p.window[1],
        provenance: p.provenance,
      });
    }
    for (const b of assembledRel.assembly.bonds) {
      rows.bondStages.push({
        id: b.id,
        bondId: b.id,
        stage: b.stageAtChapter,
        chapter: b.stageChapter ?? b.fromChapter,
        provenance: b.provenance,
      });
    }
    rows.stateMemory = assembled.memory;
    rows.stateDivergences = assembled.divergences;
    const assembledTimeline = await ports.stateAssembly.assembleTimeline({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      novelId,
    });
    rows.events = assembledTimeline.entries.map((e) => ({
      id: e.id,
      description: e.description,
      chapterNumber: e.availableFromChapter,
      order: e.order,
      linkedEventId: e.linkedEventId,
      availableFromChapter: e.availableFromChapter,
      provenance: e.provenance,
    }));
    rows.causal = assembledTimeline.causal.map((c) => ({
      id: c.id,
      causeDescription: c.causeDescription,
      effectDescription: c.effectDescription,
      confidence: c.confidence,
      provenance: c.provenance,
    }));
  } else {
    // Tier 4 at the story position (invariant 5): per-character bounded reads
    // over the already-bounded cast. Character names are carried for rendering;
    // the lookup is by id, never by name (GAP-011).
    const characterNames = new Map<string, string>();
    if (cast.characterIds.length > 0) {
      const states = await Promise.all(
        cast.characterIds.map((characterId) =>
          characters.getStateAtPosition({ ...base, characterId, chapter: storyPosition }),
        ),
      );
      for (const s of states) {
        if (s) {
          rows.states.push(s);
          characterNames.set(s.characterId, s.characterName);
        }
      }

      // Directed pairs among the cast, deterministically ordered, PAIR_LIMIT.
      const pairs: Array<[string, string]> = [];
      const sorted = [...cast.characterIds].sort();
      for (const from of sorted) {
        for (const to of sorted) {
          if (from !== to) pairs.push([from, to]);
        }
      }
      const boundedPairs = pairs.slice(0, PAIR_LIMIT);
      const stances = await Promise.all(
        boundedPairs.map(([fromCharacterId, toCharacterId]) =>
          relationships.getStanceAtPosition({
            ...base,
            fromCharacterId,
            toCharacterId,
            chapter: storyPosition,
          }),
        ),
      );
      for (const st of stances) {
        if (st) {
          rows.stances.push(st);
          characterNames.set(st.fromCharacterId, st.fromCharacterName);
          characterNames.set(st.toCharacterId, st.toCharacterName);
        }
      }

      const bonds = await relationships.listBondsForCast({
        ...base,
        characterIds: cast.characterIds,
        limit: PAIR_LIMIT,
      });
      const bondStages = await Promise.all(
        bonds.map((b) =>
          relationships.getBondStageAtPosition({
            ...base,
            bondId: b.id,
            chapter: storyPosition,
          }),
        ),
      );
      for (const bs of bondStages) {
        if (bs) rows.bondStages.push(bs);
      }
    }
  }

  let retrievalAuditId: string | undefined;
  if (retrieval) {
    const found = await retrieval.search({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      query: (input.contextQuery ?? input.instruction).slice(0, 2000),
      novelId,
      mode: input.mode ?? "AUTHOR",
      ...(input.readerChapter !== undefined ? { readerChapter: input.readerChapter } : {}),
      limit: REFERENCE_LIMIT,
    });
    rows.references = found.hits;
    rows.referenceMeta = { retrievers: found.retrievers, withheldCount: found.withheldCount };
    retrievalAuditId = found.auditId;
  }

  const headAfter = await head.readHeadRevisionId(novelId);
  if (headAfter !== headBefore) {
    // A covered mutation committed between the pin and the reads: the rows
    // are mixed-revision. Refuse; never relabel them as one revision.
    throw new HeadConflictError(headBefore, headAfter);
  }

  const compiled = compileContext({ ...input, storyPosition, headRevisionId: headBefore }, rows);
  return retrievalAuditId ? { ...compiled, retrievalAuditId } : compiled;
}
