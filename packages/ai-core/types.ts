/**
 * Provider-independent gateway contract (ADR-0004/ADR-005, CLAUDE.md §6).
 *
 * Application code depends on this interface and on capability profiles —
 * never on a provider model name or an SDK. Swapping OmniRoute for another
 * OpenAI-compatible gateway means a new implementation of `AIGateway`,
 * not a change to any caller.
 */

/** Capability abstractions application code requests (ADR-005). */
export type ModelProfile =
  | "CREATIVE_WRITER"
  | "DEEP_PLANNER"
  | "CONTINUITY_REVIEWER"
  | "FAST_CLASSIFIER"
  | "STRUCTURED_EXTRACTOR"
  | "LONG_CONTEXT_REVIEWER"
  | "EMBEDDING";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  /** Provider model id, resolved by the Model Manager from a profile. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the gateway to stream. Streaming callers use generateStream. */
  stream?: boolean;
  /** Abort signal owned by the caller (NovelForge timeout policy). */
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  /** Model the gateway actually served (may differ from requested). */
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
}

export interface EmbedRequest {
  model: string;
  input: string[];
  signal?: AbortSignal;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  inputTokens: number | null;
}

export interface GatewayModel {
  modelId: string;
  displayName?: string;
  capabilities: string[];
  contextWindow?: number;
}

/** A chunk of a streamed generation. */
export interface StreamChunk {
  delta: string;
}

/** Result of a liveness probe: whether it answered, and why it did not. */
export interface HealthResult {
  healthy: boolean;
  /** Null when healthy; otherwise the classified reason for failure. */
  category: import("./errors.ts").ErrorCategory | null;
}

export interface AIGateway {
  /** Stable gateway identifier (row id) for attempt records. */
  readonly id: string;
  readonly name: string;
  /** Discover the models this gateway serves (capability catalog). */
  listModels(signal?: AbortSignal): Promise<GatewayModel[]>;
  /** Non-streaming chat completion. */
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Streamed chat completion; each yield is an incremental delta. */
  generateStream(req: GenerateRequest): AsyncGenerator<StreamChunk>;
  /** Embeddings for retrieval. */
  embed(req: EmbedRequest): Promise<EmbedResult>;
  /** Cheap liveness probe for health checks. */
  healthCheck(signal?: AbortSignal): Promise<HealthResult>;
}
