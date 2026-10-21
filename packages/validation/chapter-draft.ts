/** Explicit provider refusals are diagnostic artifacts, never chapter prose. */
export function isBlockedChapterDraft(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("prose" in value)) return false;
  const draft = value as Record<string, unknown>;
  return (typeof draft.status === "string" && ["blocked", "failed", "refused"].includes(draft.status.toLowerCase().trim())) ||
    (typeof draft.blocker === "string" && draft.blocker.trim().length > 0);
}
