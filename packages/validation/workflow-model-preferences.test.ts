import { describe, expect, it } from "vitest";
import { validateWorkflowModelPreferences, workflowModelPreferenceForStep } from "./workflow-model-preferences.ts";
import type { WorkflowGraph } from "./workflow-graph.ts";
const model = "00000000-0000-4000-8000-000000000123";
const override = "00000000-0000-4000-8000-000000000124";
const graph: WorkflowGraph = { steps: [{ key: "write", kind: "AGENT", ref: "writer" }, { key: "approval", kind: "HUMAN_APPROVAL" }], edges: [], maxSteps: 2 };
describe("workflow requested model contract", () => {
  it("prefers an own step choice over global request and permits empty inheritance", () => {
    const result = validateWorkflowModelPreferences({ preferredModelRef: model, stepModelRefs: { write: override } }, graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(workflowModelPreferenceForStep(result.value, "write")).toBe(override);
    expect(workflowModelPreferenceForStep({ preferredModelRef: model, stepModelRefs: {} }, "constructor")).toBe(model);
    expect(validateWorkflowModelPreferences({}, graph).ok).toBe(true);
  });
  it.each([
    { preferredModelRef: "provider/model" }, { preferredModelRef: null }, { stepModelRefs: { missing: model } },
    { stepModelRefs: { approval: model } }, { stepModelRefs: { write: "bad" } },
    { stepModelRefs: { "bad.key": model } }, { routing: { preferredModelRef: model } },
  ])("refuses malformed or non-AI choices %j", input => {
    expect(validateWorkflowModelPreferences(input, graph).ok).toBe(false);
  });
  it("refuses a global model for deterministic-only workflows and oversized maps", () => {
    expect(validateWorkflowModelPreferences({ preferredModelRef: model }, { ...graph, steps: [{ key: "approval", kind: "HUMAN_APPROVAL" }] }).ok).toBe(false);
    expect(validateWorkflowModelPreferences({ stepModelRefs: Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`key${index}`, model])) }, graph).ok).toBe(false);
  });
});
