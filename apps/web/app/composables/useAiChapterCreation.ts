import { ref } from "vue";
import { useApi, ApiError } from "./useApi";
import { useWorkflowRuns } from "./useWorkflowRuns";
import { readWorkflowStart, saveWorkflowStart, clearWorkflowStart } from "../utils/workflowStartJournal";
import { readChapterCreation, saveChapterCreation, clearChapterCreation, type ChapterCreationIntent } from "../utils/chapterCreationJournal";

export interface AiChapterSetup {
  workflowId: string; outlineRef: string; styleNotes: string; targetWordCount?: number;
  stepModelRefs: Record<string, string>; fingerprint: string;
}

export function useAiChapterCreation() {
  const { api } = useApi();
  const runs = useWorkflowRuns();
  const pending = ref<ChapterCreationIntent | null>(null);
  async function restore() {
    const session = await api<{ userId: string }>("/auth/session");
    pending.value = readChapterCreation(session.userId);
    return session.userId;
  }
  async function start(workspaceId: string, novelId: string, title: string, setup: AiChapterSetup | undefined, onReserved: (chapterId: string) => Promise<void>, isCurrent: () => boolean = () => true) {
    const actor = await restore();
    if (!isCurrent()) throw new Error("Chapter scope changed");
    if (!pending.value) {
      if (!setup || readWorkflowStart(actor)) throw new Error("Resolve the pending workflow before creating another chapter");
      const intent: ChapterCreationIntent = { reserved: false, pending: {
        actorUserId: actor, chapterId: runs.newIdempotencyKey(), chapterTitle: title,
        request: { workspaceId, novelId, workflowId: setup.workflowId, idempotencyKey: runs.newIdempotencyKey(), expectedModelPreferenceFingerprint: setup.fingerprint,
          stepModelRefs: { ...setup.stepModelRefs }, input: { chapterNumber: 1, outlineRef: setup.outlineRef, styleNotes: setup.styleNotes, ...(setup.targetWordCount ? { targetWordCount: setup.targetWordCount } : {}) } },
      } };
      intent.pending.request.input.chapterId = intent.pending.chapterId;
      saveChapterCreation(intent);
      pending.value = intent;
    }
    const intent = pending.value;
    const p = intent.pending;
    if (p.request.workspaceId !== workspaceId || p.request.novelId !== novelId) throw new Error("Resume the pending creation in its original novel");
    if (!intent.reserved) {
      const chapter = await api<{ id: string; number: number }>(`/workspaces/${workspaceId}/novels/${novelId}/chapters`, { method: "POST", body: JSON.stringify({ title: p.chapterTitle, creationRequestId: p.chapterId }) });
      if (chapter.id !== p.chapterId) throw new Error("Reservation identity mismatch");
      p.request.input.chapterNumber = chapter.number;
      intent.reserved = true;
      saveChapterCreation(intent);
    }
    await onReserved(p.chapterId);
    if ((await api<{ userId: string }>("/auth/session")).userId !== actor) throw new Error("Account changed; return to the original account to resume");
    if (!isCurrent()) throw new Error("Chapter scope changed");
    saveWorkflowStart(p);
    try {
      const result = await runs.startRun(p.request);
      clearWorkflowStart(p);
      clearChapterCreation(intent);
      pending.value = null;
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status < 500 && ![401, 403, 404, 408, 429].includes(error.status)) {
        clearWorkflowStart(p);
        clearChapterCreation(intent);
        pending.value = null;
      }
      throw error;
    }
  }
  async function resolveReservation(workspaceId: string, novelId: string) {
    await restore();
    const intent = pending.value;
    if (!intent || readWorkflowStart(intent.pending.actorUserId) || intent.pending.request.workspaceId !== workspaceId || intent.pending.request.novelId !== novelId) throw new Error("Resolve the pending workflow before releasing its reservation");
    const receipt = await api<{ chapter: { id: string; title: string; number: number } | null }>(`/workspaces/${workspaceId}/novels/${novelId}/chapters/creation-requests/${intent.pending.chapterId}`);
    clearChapterCreation(intent);
    pending.value = null;
    return receipt.chapter;
  }
  return { pending, restore, start, resolveReservation };
}
