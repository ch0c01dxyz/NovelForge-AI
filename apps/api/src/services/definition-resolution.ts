/**
 * Definition resolution (AI Orchestrator milestone — lifted from the
 * workflow executor).
 *
 * Both orchestration entry points — workflow runs and the AI orchestrator —
 * must resolve the SAME published definition the same way, or a run and a
 * direct generation could disagree about which agent version executed.
 * Rules kept from workflow-runs.ts:
 *
 * - workspace shadows platform: a tenant's own PUBLISHED definition wins
 *   over the shared catalog's row of the same key;
 * - only PUBLISHED executes: a DRAFT is mid-edit and pinning a run to an
 *   unfinished definition would make the run unexplainable after the next
 *   edit (documented regression — the gate once covered PLATFORM only).
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { ModelProfile } from "@novelforge/ai-core";
import { ConflictError } from "@novelforge/ai-services";

/** A resolved definition pinned to the version the caller will use. */
export interface ResolvedAgent {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  skillKeys: string[];
  outputSchema: unknown;
  temperature: number | null;
  maxTokens: number | null;
}

export interface ResolvedSkill {
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  outputSchema: unknown;
}

export async function resolveAgent(
  db: NovelForgeDb,
  workspaceId: string,
  key: string,
): Promise<ResolvedAgent> {
  const agent = await db.agent.findFirst({
    where: {
      key,
      status: "PUBLISHED",
      OR: [
        { scope: "WORKSPACE", workspaceId },
        { scope: "PLATFORM" },
      ],
    },
    include: { currentVersion: true },
    // WORKSPACE sorts AFTER PLATFORM in the DefinitionScope enum, so
    // `desc` is what puts a tenant's own definition first. (PostgreSQL
    // orders enums by declaration position: PLATFORM, WORKSPACE.)
    orderBy: { scope: "desc" },
  });
  if (!agent) throw new ConflictError(`agent "${key}" is not published or does not exist`);
  const v = agent.currentVersion;
  if (!v) throw new ConflictError(`agent "${key}" has no version`);
  return {
    id: agent.id,
    key: agent.key,
    versionId: v.id,
    versionNumber: v.number,
    instructions: v.instructions,
    modelProfile: v.modelProfile as ModelProfile,
    skillKeys: v.skillKeys,
    outputSchema: v.outputSchema,
    temperature: v.temperature,
    maxTokens: v.maxTokens,
  };
}

export async function resolveSkill(
  db: NovelForgeDb,
  workspaceId: string,
  key: string,
): Promise<ResolvedSkill> {
  const skill = await db.skill.findFirst({
    where: {
      key,
      status: "PUBLISHED",
      OR: [
        { scope: "WORKSPACE", workspaceId },
        { scope: "PLATFORM" },
      ],
    },
    include: { currentVersion: true },
    // WORKSPACE sorts after PLATFORM in the enum; `desc` prefers the
    // tenant's own definition (see resolveAgent).
    orderBy: { scope: "desc" },
  });
  if (!skill) throw new ConflictError(`skill "${key}" is not published or does not exist`);
  const v = skill.currentVersion;
  if (!v) throw new ConflictError(`skill "${key}" has no version`);
  return {
    id: skill.id,
    key: skill.key,
    versionId: v.id,
    versionNumber: v.number,
    instructions: v.instructions,
    modelProfile: v.modelProfile as ModelProfile,
    outputSchema: v.outputSchema,
  };
}
