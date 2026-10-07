/**
 * @novelforge/ai-services — definition helpers (extracted from apps/api/src/services/definitions.ts).
 *
 * NF-WF-026 (GAP-028): `appendVersionWithRetry` and `prismaCode` are needed
 * by the moved retrieval.ts. Extracted verbatim; the full definitions.ts
 * module (1239 lines) stays in apps/api/src per the contract.
 */
import { ConflictError } from "./platform.ts";

export function prismaCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}


export async function appendVersionWithRetry<T>(
  attempt: () => Promise<T>,
  kind: string,
  parentId: string,
): Promise<T> {
  for (let i = 0; i < 5; i += 1) {
    try {
      return await attempt();
    } catch (err) {
      if (prismaCode(err) !== "P2002") throw err;
      // Small jittered pause so the two writers stop colliding in lockstep.
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
    }
  }
  throw new ConflictError(
    `could not append a version to ${kind} ${parentId}: concurrent updates`,
  );
}
