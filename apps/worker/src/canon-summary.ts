import type { NovelForgeDb } from "@novelforge/database";
import { rebuildCanonSummary } from "@novelforge/ai-services";
import type { RebuildHandler } from "./derived-intents.ts";

/** ADR-0022: the `canon` projection's rebuild handler. */
export function createCanonSummaryHandler(_deps: { db: NovelForgeDb }): RebuildHandler {
  return {
    projection: "canon",
    async rebuild({ db, workspaceId, novelId, sourceRevisionId }) {
      await rebuildCanonSummary(db, { workspaceId, novelId, sourceRevisionId });
    },
  };
}
