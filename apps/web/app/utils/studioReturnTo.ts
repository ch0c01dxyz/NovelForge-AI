import { UUID_RE } from "../components/workspace/canon-types";
export function studioReturnTo(workspaceId: string, novelId: unknown): string {
  return UUID_RE.test(workspaceId) && typeof novelId === "string" && UUID_RE.test(novelId)
    ? `/workspaces/${workspaceId}/novels/${novelId}` : "/";
}
