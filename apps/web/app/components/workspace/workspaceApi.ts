import { ApiError } from "../../composables/useApi";

type T = (path: string, params?: Record<string, string | number>) => string;

/**
 * Shared request helpers for the 016 workspace panels (timeline + planning).
 *
 * Error mapping keeps full literal key paths (grep-able for the i18n
 * handoff) and never invents messages: unknown failures surface the
 * generic unknown-error key, while 400/403/404/409 map to their own keys
 * so the UI stays honest about authorization and conflicts.
 */
export function timelineErrorMessage(t: T, e: unknown): string {
  if (!(e instanceof ApiError)) return t("workspace.timeline.common.errorUnknown");
  switch (e.status) {
    case 400:
      return t("workspace.timeline.common.errorInvalid");
    case 403:
      return t("workspace.timeline.common.errorForbidden");
    case 404:
      return t("workspace.timeline.common.errorNotFound");
    case 409:
      return t("workspace.timeline.common.errorConflict");
    default:
      return t("workspace.timeline.common.errorUnknown");
  }
}

export function planningErrorMessage(t: T, e: unknown): string {
  if (!(e instanceof ApiError)) return t("workspace.planning.common.errorUnknown");
  switch (e.status) {
    case 400:
      return t("workspace.planning.common.errorInvalid");
    case 403:
      return t("workspace.planning.common.errorForbidden");
    case 404:
      return t("workspace.planning.common.errorNotFound");
    case 409:
      return t("workspace.planning.common.errorConflict");
    default:
      return t("workspace.planning.common.errorUnknown");
  }
}

/**
 * Parse an optional 0-based chapter number field. Returns null when the
 * field is empty (never defaulting to 0, per the story API contract),
 * "invalid" when out of the 0–100000 range or not an integer.
 */
export function parseOptionalChapter(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  if (n < 0 || n > 100000) return "invalid";
  return n;
}
