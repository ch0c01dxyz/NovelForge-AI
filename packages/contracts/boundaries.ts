/**
 * Module boundary map — which workspace package may import which, as data.
 *
 * Source of truth for the package list is SYSTEM-ARCHITECTURE.md
 * ("Recommended monorepo"); boundaries.test.ts enforces that this map
 * stays in sync with that document.
 *
 * Conventions (ADR-0001):
 * - domain packages must not import HTTP/UI/provider code;
 * - ai-core is the only provider-adjacent package;
 * - shared and contracts are leaves: no workspace dependencies at all.
 */

export type PackageKind =
  | "contracts"
  | "infrastructure"
  | "domain"
  | "ai"
  | "app";

export interface ModuleBoundary {
  /** Layer the package belongs to. */
  kind: PackageKind;
  /**
   * Workspace packages this package may import (`@novelforge/<name>`).
   * "*" marks a composition-root app: may import everything except web
   * (api/worker are server-side; web is the frontend).
   */
  allowed: readonly string[] | "*";
}

/** Packages that carry story-domain logic (must stay free of HTTP/UI/provider imports). */
export const DOMAIN_PACKAGES = [
  "story-core",
  "story-intelligence",
  "character-intelligence",
  "relationship-intelligence",
  "story-simulation",
  "narrative-rhythm",
  "endgame-intelligence",
  "story-versioning",
] as const;

/** The only package allowed to touch LLM provider/gateway concerns. */
export const PROVIDER_ADJACENT_PACKAGE = "ai-core";

const INFRA_DEPS: readonly string[] = ["contracts", "shared"];

const DOMAIN_DEPS: readonly string[] = [
  "contracts",
  "shared",
  "story-core",
  "validation",
];

export const MODULE_BOUNDARIES: Readonly<Record<string, ModuleBoundary>> = {
  // apps
  web: { kind: "app", allowed: ["contracts", "shared"] },
  api: { kind: "app", allowed: "*" },
  worker: { kind: "app", allowed: "*" },

  // leaves — importable by everyone, import nothing from the workspace
  contracts: { kind: "contracts", allowed: [] },
  shared: { kind: "infrastructure", allowed: [] },

  // infrastructure
  config: { kind: "infrastructure", allowed: [] },
  database: { kind: "infrastructure", allowed: INFRA_DEPS },
  auth: { kind: "infrastructure", allowed: INFRA_DEPS },
  validation: { kind: "infrastructure", allowed: INFRA_DEPS },
  retrieval: { kind: "infrastructure", allowed: [...INFRA_DEPS, "ai-core"] },

  // domain
  "story-core": { kind: "domain", allowed: ["contracts", "shared"] },
  "story-intelligence": { kind: "domain", allowed: DOMAIN_DEPS },
  "character-intelligence": { kind: "domain", allowed: DOMAIN_DEPS },
  "relationship-intelligence": { kind: "domain", allowed: DOMAIN_DEPS },
  "story-simulation": { kind: "domain", allowed: DOMAIN_DEPS },
  "narrative-rhythm": { kind: "domain", allowed: DOMAIN_DEPS },
  "endgame-intelligence": { kind: "domain", allowed: DOMAIN_DEPS },
  "story-versioning": { kind: "domain", allowed: DOMAIN_DEPS },

  // ai — the only provider-adjacent package (OmniRoute gateway lives here)
  "ai-core": { kind: "ai", allowed: INFRA_DEPS },
};

export function mayImport(from: string, to: string): boolean {
  const boundary = MODULE_BOUNDARIES[from];
  if (!boundary || from === to) return false;
  if (boundary.allowed === "*") return to !== "web";
  return boundary.allowed.includes(to);
}
