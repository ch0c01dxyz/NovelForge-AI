import type { useWorkflowRuns } from "../composables/useWorkflowRuns";

export interface PendingWorkflowStart {
  actorUserId: string;
  chapterId: string;
  chapterTitle: string;
  request: Parameters<ReturnType<typeof useWorkflowRuns>["startRun"]>[0];
}

const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const keyFor = (actor: string) => {
  if (!identifier(actor)) throw new Error("Invalid journal actor");
  return `nf:workflow-start:v1:${actor}`;
};

export function validWorkflowStart(value: unknown, actor: string): value is PendingWorkflowStart {
  if (!object(value) || !fields(value, ["actorUserId", "chapterId", "chapterTitle", "request"]) || value.actorUserId !== actor || !identifier(value.chapterId) || typeof value.chapterTitle !== "string" || value.chapterTitle.length > 1000) return false;
  const r = value.request;
  if (!object(r) || !fields(r, ["workspaceId", "workflowId", "novelId", "input", "idempotencyKey", "preferredModelRef", "stepModelRefs", "expectedModelPreferenceFingerprint"])) return false;
  if (![r.workspaceId, r.workflowId, r.novelId, r.idempotencyKey].every(identifier) || String(r.idempotencyKey).length > 64) return false;
  if (r.preferredModelRef !== undefined && !identifier(r.preferredModelRef)) return false;
  if (r.expectedModelPreferenceFingerprint !== undefined && (typeof r.expectedModelPreferenceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(r.expectedModelPreferenceFingerprint))) return false;
  if (r.stepModelRefs !== undefined && (!object(r.stepModelRefs) || Object.keys(r.stepModelRefs).length > 1000 || !Object.entries(r.stepModelRefs).every(([key, ref]) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) && identifier(ref)))) return false;
  const input = r.input;
  return object(input) && fields(input, ["chapterId", "chapterNumber", "outlineRef", "targetWordCount", "styleNotes"])
    && (input.chapterId === undefined || identifier(input.chapterId))
    && typeof input.chapterNumber === "number" && Number.isSafeInteger(input.chapterNumber) && input.chapterNumber > 0
    && identifier(input.outlineRef)
    && (input.targetWordCount === undefined || typeof input.targetWordCount === "number" && Number.isSafeInteger(input.targetWordCount) && input.targetWordCount > 0)
    && (input.styleNotes === undefined || typeof input.styleNotes === "string");
}

/** Fail closed: an unreadable record may represent a committed run. */
export function readWorkflowStart(actor: string): PendingWorkflowStart | null {
  const raw = sessionStorage.getItem(keyFor(actor));
  if (raw === null) return null;
  if (raw.length > 131072) throw new Error("Workflow start journal too large");
  const parsed: unknown = JSON.parse(raw);
  if (!validWorkflowStart(parsed, actor)) throw new Error("Invalid workflow start journal");
  return parsed;
}

export function saveWorkflowStart(pending: PendingWorkflowStart): void {
  const raw = JSON.stringify(pending);
  if (raw.length > 131072 || !validWorkflowStart(pending, pending.actorUserId)) throw new Error("Invalid workflow start request");
  const existing = readWorkflowStart(pending.actorUserId);
  if (existing && JSON.stringify(existing) !== raw) throw new Error("Another workflow start is unresolved");
  const key = keyFor(pending.actorUserId);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw) throw new Error("Workflow start journal not persisted");
}

export function clearWorkflowStart(pending: PendingWorkflowStart): void {
  const existing = readWorkflowStart(pending.actorUserId);
  if (!existing) return;
  if (JSON.stringify(existing) !== JSON.stringify(pending)) throw new Error("Workflow start journal changed");
  const key = keyFor(pending.actorUserId);
  sessionStorage.removeItem(key);
  if (sessionStorage.getItem(key) !== null) throw new Error("Workflow start journal not cleared");
}
