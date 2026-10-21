import { validWorkflowStart, type PendingWorkflowStart } from "./workflowStartJournal";

export interface ChapterCreationIntent { pending: PendingWorkflowStart; reserved: boolean }
const keyFor = (actor: string) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(actor)) throw new Error("Invalid creation actor");
  return `nf:chapter-creation:v1:${actor}`;
};
function valid(value: unknown, actor: string): value is ChapterCreationIntent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every(key => ["pending", "reserved"].includes(key)) && typeof record.reserved === "boolean" && validWorkflowStart(record.pending, actor);
}
export function readChapterCreation(actor: string): ChapterCreationIntent | null {
  const raw = sessionStorage.getItem(keyFor(actor));
  if (raw === null) return null;
  if (raw.length > 131072) throw new Error("Creation journal too large");
  const parsed: unknown = JSON.parse(raw);
  if (!valid(parsed, actor)) throw new Error("Invalid creation journal");
  return parsed;
}
export function saveChapterCreation(intent: ChapterCreationIntent): void {
  const actor = intent.pending.actorUserId;
  const raw = JSON.stringify(intent);
  if (raw.length > 131072 || !valid(intent, actor)) throw new Error("Invalid creation intent");
  const existing = readChapterCreation(actor);
  if (existing && existing.pending.chapterId !== intent.pending.chapterId) throw new Error("Another chapter creation is unresolved");
  sessionStorage.setItem(keyFor(actor), raw);
  if (sessionStorage.getItem(keyFor(actor)) !== raw) throw new Error("Creation journal not persisted");
}
export function clearChapterCreation(intent: ChapterCreationIntent): void {
  const actor = intent.pending.actorUserId;
  const existing = readChapterCreation(actor);
  if (existing && JSON.stringify(existing) !== JSON.stringify(intent)) throw new Error("Creation intent changed");
  sessionStorage.removeItem(keyFor(actor));
  if (sessionStorage.getItem(keyFor(actor)) !== null) throw new Error("Creation journal not cleared");
}
