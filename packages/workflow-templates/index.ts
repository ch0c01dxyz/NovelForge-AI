/**
 * @novelforge/workflow-templates — versioned workflow templates (NF-WF-006).
 *
 * The chapter generation/review template: a 16-stage DAG
 * (compile → plan → write → voice/style review → bounded correction →
 * final review → extract → human approval) with machine-validated
 * contracts at every AI stage. The template source lives in git
 * (graph.json, agents/*.md, schemas/*.json); instantiation publishes it
 * as a PLATFORM workflow through the public API (see
 * scripts/seed-chapter-template.ts).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(HERE, "chapter-generation-review");

/**
 * Canonical JSON encoding — the SAME algorithm as NF-WF-005's
 * `snapshot.ts` (`canonicalizeJson`): object keys sorted recursively
 * (UTF-16 code-unit order), arrays keep order, `undefined` values dropped,
 * no whitespace. Implemented locally (instead of importing
 * `@novelforge/workflow-executor`) so this package — and the seed script
 * that consumes it — has no heavy dependency chain; the byte format is
 * what matters, and it is pinned by the test below against the executor's
 * implementation.
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeysDeep(v);
    return out;
  }
  return value;
}

export interface AgentSpec {
  key: string;
  name: string;
  modelProfile: string;
  instructions: string;
}

export interface ChapterTemplate {
  key: string;
  name: string;
  description: string;
  graph: unknown;
  agents: AgentSpec[];
  schemas: Record<string, unknown>;
}

/** Minimal frontmatter parser: `---\nkey: value\n---\n<body>`. */
function parseAgentFile(text: string, filename: string): AgentSpec {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`agent spec ${filename} is missing frontmatter`);
  const front: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const key = front["key"];
  const name = front["name"];
  const modelProfile = front["modelProfile"];
  if (!key || !name || !modelProfile) {
    throw new Error(`agent spec ${filename} frontmatter must define key, name, modelProfile`);
  }
  return { key, name, modelProfile, instructions: m[2]!.trim() };
}

const SCHEMA_NAMES = ["plan-schema", "draft-schema", "findings-schema", "extraction-schema"] as const;

function loadTemplate(): ChapterTemplate {
  const graph = JSON.parse(
    readFileSync(join(TEMPLATE_DIR, "graph.json"), "utf8"),
  ) as unknown;
  const schemas: Record<string, unknown> = {};
  for (const name of SCHEMA_NAMES) {
    schemas[name] = JSON.parse(
      readFileSync(join(TEMPLATE_DIR, "schemas", `${name}.json`), "utf8"),
    ) as unknown;
  }
  const agentFiles = [
    "chapter-planner.md",
    "chapter-writer.md",
    "voice-style-reviewer.md",
    "final-reviewer.md",
    "chapter-extractor.md",
  ];
  const agents = agentFiles.map((f) =>
    parseAgentFile(readFileSync(join(TEMPLATE_DIR, "agents", f), "utf8"), f),
  );
  return {
    key: "chapter-generation-review",
    name: "Chapter Generation & Review",
    description:
      "Versioned chapter generation/review pipeline: compile context, plan, write, " +
      "voice/style review, bounded correction (2 attempts), final review, extraction, " +
      "human approval. Every AI stage emits a machine-validated contract.",
    graph,
    agents,
    schemas,
  };
}

/** The frozen chapter generation/review template (loaded once). */
export const CHAPTER_GENERATION_REVIEW: ChapterTemplate = loadTemplate();

/**
 * Canonical JSON byte equality — the SAME canonicalization as NF-WF-005's
 * snapshot.ts (recursive key sort, UTF-8). Used by the instantiation script
 * to decide whether the published version's graph matches the template.
 */
export function graphsEqual(a: unknown, b: unknown): boolean {
  return canonicalizeJson(a) === canonicalizeJson(b);
}
