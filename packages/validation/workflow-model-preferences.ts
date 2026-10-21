import { z } from "zod";
import { ABSOLUTE_STEP_CEILING, type WorkflowGraph } from "./workflow-graph.ts";
import { fail, type ValidationResult } from "./failure.ts";

export const workflowModelPreferencesSchema = z.object({
  preferredModelRef: z.string().uuid().optional(),
  stepModelRefs: z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), z.string().uuid())
    .refine(value => Object.keys(value).length <= ABSOLUTE_STEP_CEILING).optional(),
}).strict();
export type WorkflowModelPreferences = z.infer<typeof workflowModelPreferencesSchema>;

export function validateWorkflowModelPreferences(input: unknown, graph: WorkflowGraph): ValidationResult<WorkflowModelPreferences> {
  const parsed = workflowModelPreferencesSchema.safeParse(input);
  if (!parsed.success) return fail("$", "INVALID_MODEL_PREFERENCES", "Model choices must be bounded internal UUID references");
  const aiKeys = new Set(graph.steps.filter(step => step.kind === "AGENT" || step.kind === "SKILL").map(step => step.key));
  if ((parsed.data.preferredModelRef && !aiKeys.size) || Object.keys(parsed.data.stepModelRefs ?? {}).some(key => !aiKeys.has(key))) {
    return fail("$", "INVALID_MODEL_PREFERENCE_STEP", "Model choices may reference only declared AI steps");
  }
  return { ok: true, value: parsed.data };
}

export function workflowModelPreferenceForStep(preferences: WorkflowModelPreferences, stepKey: string): string | undefined {
  return preferences.stepModelRefs && Object.hasOwn(preferences.stepModelRefs, stepKey)
    ? preferences.stepModelRefs[stepKey] : preferences.preferredModelRef;
}
