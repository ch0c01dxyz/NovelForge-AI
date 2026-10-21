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
 * - fresh resolution requires PUBLISHED; internal version resolution reuses an
 *   already authorized enqueue pin even after a later edit/archive. The exact
 *   version must still belong to this key and workspace/platform scope.
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { ModelProfile } from "@novelforge/ai-core";
import { ConflictError } from "@novelforge/ai-services";

type DefinitionReader = Pick<NovelForgeDb, "agent" | "agentVersion" | "skill" | "skillVersion">;

/** A resolved definition pinned to the version the caller will use. */
export interface ResolvedAgent {
  preferredModelRef?: string | null;
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
  preferredModelRef?: string | null;
  id: string;
  key: string;
  versionId: string;
  versionNumber: number;
  instructions: string;
  modelProfile: ModelProfile;
  outputSchema: unknown;
}

export async function resolveAgent(
  db: DefinitionReader,
  workspaceId: string,
  key: string,
  versionId?: string,
): Promise<ResolvedAgent> {
  const agent = await db.agent.findFirst({
    where: {
      key,
      ...(versionId ? { versions: { some: { id: versionId } } } : { status: "PUBLISHED" as const }),
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
  const v = versionId ? await db.agentVersion.findUnique({ where: { id: versionId } }) : agent.currentVersion;
  if (!v) throw new ConflictError(`agent "${key}" has no version`);
  return {
    id: agent.id,
    key: agent.key,
    versionId: v.id,
    versionNumber: v.number,
    instructions: v.instructions,
    modelProfile: v.modelProfile as ModelProfile,
    preferredModelRef: v.preferredModelRef,
    skillKeys: v.skillKeys,
    outputSchema: v.outputSchema,
    temperature: v.temperature,
    maxTokens: v.maxTokens,
  };
}

export async function resolveSkill(
  db: DefinitionReader,
  workspaceId: string,
  key: string,
  versionId?: string,
): Promise<ResolvedSkill> {
  const skill = await db.skill.findFirst({
    where: {
      key,
      ...(versionId ? { versions: { some: { id: versionId } } } : { status: "PUBLISHED" as const }),
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
  const v = versionId ? await db.skillVersion.findUnique({ where: { id: versionId } }) : skill.currentVersion;
  if (!v) throw new ConflictError(`skill "${key}" has no version`);
  return {
    id: skill.id,
    key: skill.key,
    versionId: v.id,
    versionNumber: v.number,
    instructions: v.instructions,
    modelProfile: v.modelProfile as ModelProfile,
    preferredModelRef: v.preferredModelRef,
    outputSchema: v.outputSchema,
  };
}
