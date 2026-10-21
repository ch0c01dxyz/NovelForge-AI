import { ref } from "vue";
/**
 * Chapter-scoped generation loop state (NF-WF-007, Invariant 2).
 *
 * Owns: the selected run for the chapter, the parked approval snapshot
 * (read ONCE per review round — everything derives from that single
 * read), the diff pin (chapter version the diff was computed against),
 * and the Q2 outline-moved detection (one extra GET + ID compare at
 * review time; non-blocking; the decision still binds to the parked
 * snapshot).
 */
import { useWorkflowRuns, type RunView } from "./useWorkflowRuns";
import { useApi } from "./useApi";
import { selectDraft, draftProse, type DraftSelection } from "../utils/draftSelect";
import { isBlockedChapterDraft } from "../../../../packages/validation/chapter-draft";
import { diffOutlineContent, type OutlineChange } from "../utils/outlineDiff";

export interface OutlineVersionView {
  id: string;
  novelId: string;
  number: number;
  status: string;
  content: unknown;
  note: string | null;
  createdAt: string;
}

export interface ApprovalSnapshot {
  material: {
    instruction: unknown;
    priorOutcomes?: Record<string, unknown>;
    outcomes?: Record<string, unknown>;
    pins: unknown;
  };
  snapshotHash: string;
}

export interface ReviewModel {
  runId: string;
  snapshot: ApprovalSnapshot;
  draft: DraftSelection;
  prose: string | null;
  blocked: boolean;
  findings: Array<{
    category: string;
    severity: string;
    rule: string;
    remediation: string;
    evidence: { source: string; version: string; span: string };
  }>;
  proposals: Array<{
    kind: string;
    text: string;
    citations: Array<{ source: string; span: string }>;
  }>;
  /** The outline version id the run started from (run input outlineRef). */
  runOutlineRef: string | null;
  /** The chapter number the run targeted (run input chapterNumber). */
  chapterNumber: number | null;
}

export interface OutlineMovedInfo {
  moved: boolean;
  fromId: string | null;
  toId: string | null;
  fromNumber: number | null;
  toNumber: number | null;
  changes: OutlineChange[];
  truncated: boolean;
}

export function useChapterGeneration() {
  const { api } = useApi();
  const runs = useWorkflowRuns();

  const selectedRun = ref<RunView | null>(null);
  const review = ref<ReviewModel | null>(null);
  const diffPinnedVersion = ref<number | null>(null);
  const outlineMoved = ref<OutlineMovedInfo | null>(null);
  const loadingReview = ref(false);

  function runInputValue(run: RunView, key: string): unknown {
    const input = run.input as Record<string, unknown> | null | undefined;
    return input?.[key] ?? null;
  }

  function parkedSnapshot(run: RunView): ApprovalSnapshot | null {
    const step = (run.steps ?? []).find((s) => s.approvalSnapshot != null);
    const snap = step?.approvalSnapshot as ApprovalSnapshot | null | undefined;
    if (!snap || typeof snap !== "object" || !("snapshotHash" in snap)) return null;
    const material = (snap as { material?: unknown }).material as
      | { priorOutcomes?: unknown; outcomes?: unknown }
      | undefined;
    if (!material || typeof material !== "object" || (!("priorOutcomes" in material) && !("outcomes" in material))) return null;
    return snap as ApprovalSnapshot;
  }

  function buildReview(run: RunView): ReviewModel | null {
    const snapshot = parkedSnapshot(run);
    if (!snapshot) return null;
    const outcomes = snapshot.material.priorOutcomes ?? snapshot.material.outcomes ?? {};
    const steps = (run.steps ?? []).map((s) => ({
      stepKey: s.stepKey,
      status: s.status,
      output: s.output,
    }));
    const draft = selectDraft(steps, outcomes as Record<string, unknown>);
    const prose = draftProse(draft.draft);

    const findingsRaw =
      (outcomes.review_final as { json?: { findings?: unknown[] } } | undefined)?.json
        ?.findings ??
      (outcomes.review_vs as { json?: { findings?: unknown[] } } | undefined)?.json
        ?.findings ??
      [];
    const findings = (Array.isArray(findingsRaw) ? findingsRaw : []).map((f) => {
      const r = f as Record<string, unknown>;
      const ev = (r.evidence ?? {}) as Record<string, unknown>;
      return {
        category: String(r.category ?? ""),
        severity: String(r.severity ?? ""),
        rule: String(r.rule ?? ""),
        remediation: String(r.remediation ?? ""),
        evidence: {
          source: String(ev.source ?? ""),
          version: String(ev.version ?? ""),
          span: String(ev.span ?? ""),
        },
      };
    });

    const extraction = (
      outcomes.extract as { json?: { proposals?: unknown[] } } | undefined
    )?.json?.proposals;
    const proposals = (Array.isArray(extraction) ? extraction : []).map((p) => {
      const r = p as Record<string, unknown>;
      const cits = Array.isArray(r.citations) ? r.citations : [];
      return {
        kind: String(r.kind ?? ""),
        text: String(r.text ?? ""),
        citations: cits.map((c) => {
          const cc = c as Record<string, unknown>;
          return { source: String(cc.source ?? ""), span: String(cc.span ?? "") };
        }),
      };
    });

    const runOutlineRef = runInputValue(run, "outlineRef");
    const runChapterNumber = runInputValue(run, "chapterNumber");
    return {
      runId: run.id,
      snapshot,
      draft,
      prose,
      blocked: isBlockedChapterDraft(draft.draft),
      findings,
      proposals,
      runOutlineRef: typeof runOutlineRef === "string" ? runOutlineRef : null,
      chapterNumber: typeof runChapterNumber === "number" ? runChapterNumber : null,
    };
  }

  async function listOutlineVersions(
    workspaceId: string,
    novelId: string,
  ): Promise<OutlineVersionView[]> {
    return api<OutlineVersionView[]>(
      `/workspaces/${workspaceId}/novels/${novelId}/planning/outline-versions`,
    );
  }

  function approvedOutline(versions: OutlineVersionView[]): OutlineVersionView | null {
    return versions.find((v) => v.status === "APPROVED") ?? null;
  }

  /**
   * Q2 (author decision 2026-10-05, amended): at review time, when the
   * approved outline version differs from the one the run started from,
   * fetch the current approved outline version, diff its content against
   * the run's outline version, and surface the changed parts in a
   * NON-BLOCKING notice. The decision still binds to the parked
   * snapshot — this never blocks approve/reject.
   */
  async function checkOutlineMoved(
    workspaceId: string,
    novelId: string,
    model: ReviewModel,
  ): Promise<void> {
    outlineMoved.value = null;
    if (!model.runOutlineRef) return;
    let versions: OutlineVersionView[];
    try {
      versions = await listOutlineVersions(workspaceId, novelId);
    } catch {
      return; // best-effort: a failed check never blocks review
    }
    const current = approvedOutline(versions);
    if (!current || current.id === model.runOutlineRef) return;
    const runVersion = versions.find((v) => v.id === model.runOutlineRef);
    if (!runVersion) return;
    const { changes, truncated } = diffOutlineContent(runVersion.content, current.content);
    outlineMoved.value = {
      moved: true,
      fromId: runVersion.id,
      toId: current.id,
      fromNumber: runVersion.number,
      toNumber: current.number,
      changes,
      truncated,
    };
  }

  /**
   * Build the review model for a parked run. Reads the approval snapshot
   * ONCE (Invariant 2.4) — everything (draft, diff, findings, proposals,
   * expectedSnapshotHash) derives from that single read.
   */
  async function loadReview(
    workspaceId: string,
    novelId: string,
    run: RunView,
  ): Promise<ReviewModel | null> {
    loadingReview.value = true;
    try {
      const model = buildReview(run);
      review.value = model;
      if (model) await checkOutlineMoved(workspaceId, novelId, model);
      return model;
    } finally {
      loadingReview.value = false;
    }
  }

  function clearReview() {
    review.value = null;
    diffPinnedVersion.value = null;
    outlineMoved.value = null;
  }

  return {
    selectedRun,
    review,
    diffPinnedVersion,
    outlineMoved,
    loadingReview,
    listOutlineVersions,
    approvedOutline,
    loadReview,
    clearReview,
    buildReview,
    checkOutlineMoved,
    runs,
  };
}
