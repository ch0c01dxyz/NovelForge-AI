/**
 * Derived rebuild intent vocabulary shared by the API and the worker.
 *
 * ADR-0017: `PENDING` is terminal for projections with no registered
 * pipeline. ADR-0022 registers `canon`.
 */
import { PROJECTIONS, type Projection } from "./impact.ts";

/** Projections with a registered rebuild pipeline in apps/worker. */
export const PIPELINE_PROJECTIONS: readonly Projection[] = ["canon"];

export function isProjection(value: string): value is Projection {
  return (PROJECTIONS as readonly string[]).includes(value);
}
