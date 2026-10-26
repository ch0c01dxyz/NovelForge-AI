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
  | "EMBEDDING"
  | "IMAGE_GENERATOR";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  /** Collect a complete SSE response before returning a structured artifact. */
  bufferStream?: boolean;
  /** Provider model id, resolved by the Model Manager from a profile. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional provider-neutral structured-output mode. `"json_object"`
   * asks the adapter to request JSON-only output from the gateway; each
   * adapter maps it to the parameter its provider supports (OmniRoute:
   * `response_format`). Omitted by ordinary callers — absence must stay
   * the default wire behavior.
   */
  outputMode?: "json_object";
  /** Abort signal owned by the caller (NovelForge timeout policy). */
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  /** Model the gateway actually served (may differ from requested). */
  model: string;
  /** Null when the response does not identify its model; no request fallback. */
  reportedModel?: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
}

export interface EmbedRequest {
  model: string;
  input: string[];
  dimensions?: number;
  signal?: AbortSignal;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  reportedModel?: string | null;
  inputTokens: number | null;
}

export const MAX_GENERATED_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_GENERATED_IMAGE_BASE64_LENGTH = 4 * Math.ceil(MAX_GENERATED_IMAGE_BYTES / 3);
export const MAX_IMAGE_TIMEOUT_MS = 3_600_000;

export interface GenerateImageRequest {
  model: string;
  prompt: string;
  responseFormat?: "binary";
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  /** Untrusted image encoding; the cover service must decode and normalize it. */
  dataBase64: string;
  model: string;
  reportedModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ImageJobReceipt {
  id: string;
  model: string;
  state: "SUBMITTING" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  progress?: { queuePosition?: number; waitSeconds?: number; processing?: number };
}
export interface ImageJobRoute { gatewayId: string; modelRef: string; modelId: string; timeoutMs: number }
export interface ImageJobContext extends ImageJobRoute { requestId: string; jobId?: string; deadlineAt: number; state?: ImageJobReceipt["state"]; progress?: ImageJobReceipt["progress"] }

export interface GatewayModel {
  modelId: string;
  displayName?: string;
  capabilities: string[];
  contextWindow?: number;
}

/**
 * Application-managed observed structured-output markers. They live
 * inside `AIModel.capabilities` under an `nf:` namespace that gateway
 * catalog discovery never reports, so an ordinary catalog refresh
 * preserves them instead of erasing observed evidence (NF053 JSON
 * follow-up). Absence of a marker is UNKNOWN, not verified: routing
 * only excludes candidates with recorded incompatibility.
 */
export const JSON_MODE_PREFIX = "nf:json_object=";
export const JSON_MODE_OK = `${JSON_MODE_PREFIX}ok`;
export const JSON_MODE_INCOMPATIBLE = `${JSON_MODE_PREFIX}incompatible`;
export const IMAGE_OUTPUT_INCOMPATIBLE = "nf:image-output=incompatible";

/**
 * Namespace reserved for application-managed (observed/authorized)
 * capability entries. Gateway catalog discovery never reports `nf:`
 * tags, so syncModels can preserve them across refreshes without
 * freezing gateway-reported values.
 */
export const OBSERVED_CAPABILITY_PREFIX = "nf:";

/** A chunk of a streamed generation. */
export interface StreamChunk {
  delta: string;
  model?: string;
  finishReason?: string;
  /** Cumulative usage snapshot for this attempt, not a per-frame increment. */
  usage?: { inputTokens: number | null; outputTokens: number | null };
}

export const GENERATION_COMPONENTS = ["CHAPTER", "COVER", "LORE", "OUTLINE", "EMBEDDING", "OTHER"] as const;
export type GenerationComponent = typeof GENERATION_COMPONENTS[number];

/** Match the existing PostgreSQL Int receipt fields; malformed counts stay unknown. */
export function reportedTokens(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

/** Result of a liveness probe: whether it answered, and why it did not. */
export interface HealthResult {
  healthy: boolean;
  /** Null when healthy; otherwise the classified reason for failure. */
  category: import("./errors.ts").ErrorCategory | null;
}

export interface AIGateway {
  submitImageJob?(input: { model: string; prompt: string; requestId: string; signal?: AbortSignal }): Promise<ImageJobReceipt>;
  findImageJob?(requestId: string, signal?: AbortSignal): Promise<ImageJobReceipt>;
  getImageJob?(id: string, signal?: AbortSignal): Promise<ImageJobReceipt>;
  getImageJobResult?(id: string, model: string, signal?: AbortSignal): Promise<GenerateImageResult>;
  /** Stable gateway identifier (row id) for attempt records. */
  readonly id: string;
  readonly name: string;
  /** Discover the models this gateway serves (capability catalog). */
  listModels(signal?: AbortSignal): Promise<GatewayModel[]>;
  /** Separate output-image catalog; absence does not imply text models can render images. */
  listImageModels?(signal?: AbortSignal): Promise<GatewayModel[]>;
  /** Separate embedding catalog; a text catalog alone does not advertise vector support. */
  listEmbeddingModels?(signal?: AbortSignal): Promise<GatewayModel[]>;
  /** Exactly one image per request; no automatic transport retry. */
  generateImage?(req: GenerateImageRequest): Promise<GenerateImageResult>;
  /** Non-streaming chat completion. */
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Streamed chat completion; each yield is an incremental delta. */
  generateStream(req: GenerateRequest): AsyncGenerator<StreamChunk>;
  /** Embeddings for retrieval. */
  embed(req: EmbedRequest): Promise<EmbedResult>;
  /** Cheap liveness probe for health checks. */
  healthCheck(signal?: AbortSignal): Promise<HealthResult>;
}
