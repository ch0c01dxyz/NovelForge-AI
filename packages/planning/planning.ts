/**
 * Planning rules (Phase 7, slice 1).
 *
 * Pure and IO-free. This package is a DOMAIN package (ADR-0001): it may
 * import contracts/shared/story-core/validation and NOTHING else — no
 * Prisma, no HTTP, no provider. The enum-shaped unions are declared
 * locally rather than imported from the generated Prisma client (same
 * discipline as packages/story-intelligence/canon.ts) and pinned by a
 * test.
 *
 * Rules implemented here (CLAUDE.md §4, §2.4, §2.8):
 *  - validateHierarchy — the Saga/Arc nesting tree is acyclic and respects
 *    the kind ordering (vision > saga > arc > chapter_group).
 *  - horizonFor — the Planning Horizon detail level comes from the novel's
 *    OWN policy (per-novel JSONB), never universal constants.
 *  - plannerContext — the APPROVED outline is the primary planning source;
 *    the synopsis is demoted to background, and any synopsis bullet not
 *    represented in the approved outline is flagged instead of silently
 *    shaping the plan.
 */

// ---------------------------------------------------------------------------
// Vocabulary (mirrors schema.prisma — keep in sync, pinned by a test)
// ---------------------------------------------------------------------------

export const PLANNING_KINDS = ["SAGA", "ARC", "CHAPTER_GROUP"] as const;
export type PlanningKind = (typeof PLANNING_KINDS)[number];

export const OUTLINE_NODE_KINDS = ["CHAPTER_GROUP", "CHAPTER", "SCENE"] as const;
export type OutlineNodeKind = (typeof OUTLINE_NODE_KINDS)[number];

export const OUTLINE_VERSION_STATUSES = ["DRAFT", "APPROVED", "SUPERSEDED"] as const;
export type OutlineVersionStatus = (typeof OUTLINE_VERSION_STATUSES)[number];

export const SYNOPSIS_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type SynopsisStatus = (typeof SYNOPSIS_STATUSES)[number];

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

/**
 * Nesting rank of the planning containers. The schema stores only kind +
 * parentId; this ordering is what makes "an ARC inside a SAGA" meaningful
 * and "a SAGA inside an ARC" a bug. Ranks, lowest-first:
 *
 *   vision (implicit, the Novel row — not a Saga row)
 *     > saga > arc > chapter_group
 *
 * A child's rank must be strictly greater than its parent's, so a chapter
 * group can nest under an arc or a saga (flat stories), but a saga can
 * never nest under anything but another saga.
 */
export const PLANNING_RANK: Record<PlanningKind, number> = {
  SAGA: 0,
  ARC: 1,
  CHAPTER_GROUP: 2,
};

/** One node of the saga/arc tree as the caller fetched it (id + parentId). */
export interface HierarchyNode {
  id: string;
  parentId: string | null;
  kind: PlanningKind;
}

export type HierarchyErrorKind =
  | "UNKNOWN_PARENT"
  | "CYCLE"
  | "KIND_ORDER"
  | "SELF_PARENT";

export interface HierarchyError {
  /** The node whose relationship to its parent is rejected. */
  nodeId: string;
  kind: HierarchyErrorKind;
  message: string;
}

export interface HierarchyResult {
  ok: boolean;
  errors: HierarchyError[];
}

/**
 * Validate a whole fetched batch of planning nodes in one pass.
 *
 * Checks, per node with a parentId:
 *  - the parent exists in the batch (UNKNOWN_PARENT — the schema FK
 *    catches a hard delete, not a stale reference in a caller's payload);
 *  - the parent is not the node itself (SELF_PARENT);
 *  - the parent's rank is strictly lower (KIND_ORDER);
 *  - the parent chain terminates (CYCLE — a > b > a passes the per-node
 *    checks above because each pair is individually ordered).
 *
 * Root nodes (parentId null) are always valid here; which roots a caller
 * may create is the caller's policy.
 */
export function validateHierarchy(nodes: readonly HierarchyNode[]): HierarchyResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const errors: HierarchyError[] = [];

  const push = (node: HierarchyNode, kind: HierarchyErrorKind, message: string) =>
    errors.push({ nodeId: node.id, kind, message });

  for (const node of nodes) {
    if (node.parentId === null) continue;

    if (node.parentId === node.id) {
      push(node, "SELF_PARENT", `node ${node.id} is its own parent`);
      continue;
    }

    const parent = byId.get(node.parentId);
    if (!parent) {
      push(node, "UNKNOWN_PARENT", `parent ${node.parentId} not present in the batch`);
      continue;
    }

    if (PLANNING_RANK[node.kind] <= PLANNING_RANK[parent.kind]) {
      push(
        node,
        "KIND_ORDER",
        `${node.kind} (rank ${PLANNING_RANK[node.kind]}) cannot nest under ` +
          `${parent.kind} (rank ${PLANNING_RANK[parent.kind]})`,
      );
      continue;
    }

    // Walk the parent chain. Bounded by the batch size: a fresh id is
    // required at every step, so revisiting any node proves a cycle.
    const seen = new Set<string>([node.id]);
    let cursor: HierarchyNode | undefined = parent;
    let cyclic = false;
    while (cursor && cursor.parentId !== null) {
      if (seen.has(cursor.id)) {
        push(node, "CYCLE", `parent chain of ${node.id} loops back through ${cursor.id}`);
        cyclic = true;
        break;
      }
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId);
      if (cursor && seen.has(cursor.id)) {
        push(node, "CYCLE", `parent chain of ${node.id} loops back through ${cursor.id}`);
        cyclic = true;
        break;
      }
    }
    if (cyclic) continue;
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Planning Horizon
// ---------------------------------------------------------------------------

/** Detail level a generation/planning pass may spend at a narrative distance. */
export const HORIZON_DETAILS = ["FULL", "BEATS", "SKETCH", "VAGUE"] as const;
export type HorizonDetail = (typeof HORIZON_DETAILS)[number];

/**
 * One band of a novel's horizon policy: chapters up to `maxDistance` away
 * from the writing edge are planned at `detail`. Bands must ascend by
 * maxDistance; the first band whose maxDistance covers the distance wins.
 * A band with `maxDistance: null` is the open-ended tail (Infinity).
 */
export interface HorizonBand {
  maxDistance: number | null;
  detail: HorizonDetail;
}

/**
 * The novel's own horizon policy (planning_horizons.policy JSONB shape).
 * shape is validated here, not trusted: the column is written by hand and
 * by future AI proposals.
 */
export interface HorizonPolicy {
  bands: readonly HorizonBand[];
}

/** Result of horizonFor: the resolved detail plus why, for traceability. */
export interface HorizonDecision {
  detail: HorizonDetail;
  /** Which policy band decided it (1-based), null for the fallback. */
  band: number | null;
}

export type HorizonProblem = "EMPTY_POLICY" | "MALFORMED_POLICY" | "UNCOVERED_DISTANCE";

/**
 * Resolve the detail level for a chapter `distance` chapters ahead of the
 * writing edge, using THIS novel's policy — never a universal constant
 * (CLAUDE.md §2.8: "Planning Horizon prevents detailed overplanning of
 * distant chapters", and the policy column is per novel).
 *
 * Failure is loud, not silent: an empty, malformed, or non-covering policy
 * returns a problem instead of inventing a default. A caller that wants a
 * fallback policy makes that an explicit local decision.
 */
export function horizonFor(
  distance: number,
  policy: unknown,
): HorizonDecision | { problem: HorizonProblem } {
  if (!Number.isInteger(distance) || distance < 0) {
    return { problem: "MALFORMED_POLICY" }; // caller bug: distance is a chapter count
  }

  if (policy === null || policy === undefined) return { problem: "EMPTY_POLICY" };

  const bands = (policy as HorizonPolicy).bands;
  if (!Array.isArray(bands) || bands.length === 0) return { problem: "MALFORMED_POLICY" };

  for (const band of bands) {
    const valid =
      band !== null &&
      typeof band === "object" &&
      (band.maxDistance === null ||
        (Number.isInteger(band.maxDistance) && band.maxDistance >= 0)) &&
      HORIZON_DETAILS.includes(band.detail);
    if (!valid) return { problem: "MALFORMED_POLICY" };
  }

  // Ascending maxDistance, tail last, no two tails.
  for (let i = 0; i < bands.length; i++) {
    const max = bands[i].maxDistance;
    if (max === null && i !== bands.length - 1) return { problem: "MALFORMED_POLICY" };
    if (i > 0) {
      const prev = bands[i - 1].maxDistance;
      // A null tail comes after everything by definition — only bounded
      // bands participate in the ascending check.
      if (prev !== null && max !== null && max <= prev) return { problem: "MALFORMED_POLICY" };
    }
  }

  for (let i = 0; i < bands.length; i++) {
    const { maxDistance, detail } = bands[i];
    if (maxDistance === null || distance <= maxDistance) {
      return { detail, band: i + 1 };
    }
  }
  return { problem: "UNCOVERED_DISTANCE" };
}

// ---------------------------------------------------------------------------
// Anti-overfitting: approved outline first, synopsis demoted
// ---------------------------------------------------------------------------

/**
 * The synopsis as a candidate planning source. One bullet per line of the
 * stored synopsis content (Synopsis.content convention).
 */
export interface SynopsisCandidate {
  id: string;
  bullets: readonly string[];
}

/**
 * The APPROVED outline version as planning source. content is the frozen
 * JSONB of OutlineVersion; only the title/summary text of its nodes is
 * matched against synopsis bullets — the outline is authoritative, so the
 * synopsis must fit inside it, never the reverse.
 */
export interface ApprovedOutline {
  id: string;
  number: number;
  nodes: readonly { title: string; summary?: string | null }[];
}

/**
 * Everything a planner pass may treat as "what to plan from" (CLAUDE.md §4:
 * Current Approved Outline > Synopsis). The outline is PRIMARY; the
 * synopsis is BACKGROUND — attached only as flagged deltas, never as
 * instructions.
 */
export interface PlannerContext {
  primary: {
    source: "approved_outline";
    outlineId: string;
    outlineNumber: number;
  } | null;
  background: {
    source: "synopsis";
    synopsisId: string;
  } | null;
  /** Synopsis bullets with no representation in the approved outline. */
  unrepresented: { synopsisId: string; bullet: string }[];
  /** True when an outline is primary — the only state a planning pass may run in. */
  canPlan: boolean;
}

/**
 * Does `outline` represent `bullet`? Bag-of-words match: every word of the
 * bullet (lowercased) must appear in the outline node's title+summary text.
 * Catches "The Iron Gate" vs "the iron  gate" and cross-field phrasings
 * without pretending to understand prose.
 *
 * ponytail: bag-of-words, no fuzzy/semantic matching. Upgrade path: swap
 * `bulletRepresented` for an embedding-similarity check when paraphrased
 * synopses start slipping through; the plannerContext contract does not
 * change.
 */
export function bulletRepresented(
  bullet: string,
  outline: ApprovedOutline,
): boolean {
  const words = (s: string) => s.toLowerCase().match(/[^\s]+/g) ?? [];
  const needle = words(bullet);
  if (needle.length === 0) return true; // empty bullet represents nothing and blocks nothing
  return outline.nodes.some((node) => {
    const hay = new Set(words(`${node.title ?? ""} ${node.summary ?? ""}`));
    return needle.every((w) => hay.has(w));
  });
}

/**
 * Build the planning context from the novel's candidate sources.
 *
 * - An APPROVED outline is required for planning (canPlan). Demoting the
 *   synopsis only matters when there is something better to plan from;
 *   with no approved outline there is nothing to demote against and the
 *   caller must not run a planning pass on synopsis alone.
 * - The synopsis is background in every case: its bullets surface ONLY as
 *   unrepresented flags. A bullet already covered by the outline is
 *   dropped entirely — repeating it would just re-amplify it (overfitting
 *   the plan to whichever phrasing appears twice).
 */
export function plannerContext(
  approvedOutline: ApprovedOutline | null,
  synopses: readonly SynopsisCandidate[],
): PlannerContext {
  const unrepresented: { synopsisId: string; bullet: string }[] = [];
  for (const synopsis of synopses) {
    for (const bullet of synopsis.bullets) {
      if (bullet.trim() === "") continue;
      if (approvedOutline && bulletRepresented(bullet, approvedOutline)) continue;
      unrepresented.push({ synopsisId: synopsis.id, bullet });
    }
  }
  return {
    primary: approvedOutline
      ? {
          source: "approved_outline",
          outlineId: approvedOutline.id,
          outlineNumber: approvedOutline.number,
        }
      : null,
    background:
      synopses.length > 0 && synopses[0]
        ? { source: "synopsis", synopsisId: synopses[0].id }
        : null,
    unrepresented,
    canPlan: approvedOutline !== null,
  };
}
