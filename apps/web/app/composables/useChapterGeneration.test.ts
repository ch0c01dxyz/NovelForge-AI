import { expect, it, vi } from "vitest";
import { useChapterGeneration } from "./useChapterGeneration";
import type { RunView } from "./useWorkflowRuns";
vi.mock("./useWorkflowRuns", () => ({ useWorkflowRuns: () => ({}) }));
vi.mock("./useApi", () => ({ useApi: () => ({ api: vi.fn() }) }));

it("reads the executor's actual priorOutcomes snapshot without altering its approval hash or artifact", () => {
  const draft = { title: "The Unopened Letter", prose: "A reviewed chapter draft." };
  const snapshot = { snapshotHash: "unchanged-approval-hash", material: { instruction: "Review", priorOutcomes: { write: { text: JSON.stringify(draft), json: draft }, review_final: { json: { findings: [] } }, extract: { json: { proposals: [] } } }, workflowVersionNumber: 1, agentVersions: {}, skillVersions: {} } };
  const run = { id: "run", workflowKey: "chapter-creation-review", input: { chapterNumber: 1, outlineRef: "outline" }, steps: [{ stepKey: "approve", status: "AWAITING_APPROVAL", approvalSnapshot: snapshot }, { stepKey: "write", status: "SUCCEEDED", output: { json: draft } }] } as unknown as RunView;
  const review = useChapterGeneration().buildReview(run);
  expect(review?.snapshot).toBe(snapshot);expect(review?.snapshot.snapshotHash).toBe("unchanged-approval-hash");
  expect(review?.draft.draft).toEqual(draft);expect(review?.prose).toBe(draft.prose);
});
