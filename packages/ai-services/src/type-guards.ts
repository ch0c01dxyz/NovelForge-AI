/**
 * Shared type guard for the ai-services package (single canonical
 * definition; consumers import, never re-declare).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
