/**
 * @novelforge/ai-core — provider-independent AI gateway (Phase 3).
 *
 * The ONLY provider-adjacent package (ADR-0001 §3): OmniRoute / OpenAI
 * compatible transport lives here and nowhere else. Domain code asks for
 * a capability, not a provider model (CLAUDE.md §6, ADR-005).
 */
export * from "./errors.ts";
export * from "./crypto.ts";
export * from "./types.ts";
export * from "./omniroute.ts";
export * from "./router.ts";
export * from "./manager.ts";
