/**
 * Draft-selection rule (NF-WF-006): the review draft is the
 * latest-available producer outcome — `rewrite_2` > `rewrite_1` > `write`.
 * The panel MUST name which draft won ("Draft 2 of 2" style: ordinal of
 * the winner in the producer chain, of the drafts actually produced),
 * and MUST show "pending stage" rather than fabricate text when the
 * producing step is not SUCCEEDED.
 */
export interface StepLike {
  stepKey: string;
  status: string;
  output?: unknown;
}

export interface DraftSelection {
  /** Which producer won: "rewrite_2" | "rewrite_1" | "write" | null (pending). */
  winner: "rewrite_2" | "rewrite_1" | "write" | null;
  /** Ordinal of the winner in the producer chain (write=1, rewrite_1=2, rewrite_2=3). */
  ordinal: number;
  /** How many drafts were produced. */
  total: number;
  /** The draft JSON (expects `{ prose, ... }`), or null when pending. */
  draft: Record<string, unknown> | null;
  pending: boolean;
}

const CHAIN = ["write", "rewrite_1", "rewrite_2"] as const;
type Producer = (typeof CHAIN)[number];

function producerDraft(steps: StepLike[], key: Producer): Record<string, unknown> | null {
  const step = steps.find((s) => s.stepKey === key);
  if (!step || step.status !== "SUCCEEDED") return null;
  const out = step.output as { json?: unknown } | null | undefined;
  if (!out || typeof out !== "object" || out.json === null || typeof out.json !== "object") {
    return null;
  }
  return out.json as Record<string, unknown>;
}

function outcomeDraft(
  outcomes: Record<string, unknown>,
  key: Producer,
): Record<string, unknown> | null {
  const o = outcomes[key] as { json?: unknown } | undefined;
  if (!o || typeof o !== "object" || o.json === null || typeof o.json !== "object") {
    return null;
  }
  return o.json as Record<string, unknown>;
}

/**
 * Select the review draft from the snapshot material's prior outcomes.
 * `outcomes` is keyed by step key. Never fabricates: when no producer
 * has a SUCCEEDED outcome, `draft` is null and `pending` is true.
 */
export function selectDraft(
  steps: StepLike[],
  outcomes: Record<string, unknown>,
): DraftSelection {
  const produced: Producer[] = CHAIN.filter((k) =>
    steps.length > 0 ? producerDraft(steps, k) !== null : outcomeDraft(outcomes, k) !== null,
  );
  if (produced.length === 0) {
    return { winner: null, ordinal: 0, total: 0, draft: null, pending: true };
  }
  const winner = produced[produced.length - 1]!;
  const draft =
    steps.length > 0 ? producerDraft(steps, winner) : outcomeDraft(outcomes, winner);
  return {
    winner,
    ordinal: CHAIN.indexOf(winner) + 1,
    total: produced.length,
    draft,
    pending: draft === null,
  };
}

/** Extract the prose text from a draft-schema JSON object. */
export function draftProse(draft: Record<string, unknown> | null): string | null {
  if (!draft || typeof draft.prose !== "string") return null;
  return draft.prose;
}
