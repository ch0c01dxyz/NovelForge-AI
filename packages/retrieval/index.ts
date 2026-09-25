/**
 * @novelforge/retrieval — knowledge retrieval (Phase 5).
 *
 * Pure logic lives here; IO (embedding, vector search, persistence) is
 * injected by the API layer so this package stays testable without a
 * database or a gateway.
 */
export {
  chunkText,
  resolveChunkSpan,
  verifyChunks,
  DEFAULT_MAX_CHARS,
  type Chunk,
  type ChunkOptions,
} from "./chunk.ts";

export {
  fuse,
  DEFAULT_RRF_K,
  RETRIEVERS,
  type Retriever,
  type Hit,
  type Contribution,
  type FusedResult,
  type FuseOptions,
} from "./fuse.ts";

export {
  canView,
  visibleTo,
  canReadDrafts,
  parseViewMode,
  VIEW_MODES,
  type ViewMode,
  type SpoilerBoundary,
  type ViewerContext,
} from "./spoiler.ts";
