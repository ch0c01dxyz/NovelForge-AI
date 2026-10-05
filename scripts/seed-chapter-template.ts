/**
 * Idempotent instantiation of the chapter generation/review template
 * (NF-WF-006).
 *
 * Drives the PUBLIC API as a platform administrator (`platform:define`):
 * creates and publishes the PLATFORM workflow (key
 * `chapter-generation-review`) and its five platform agents. Safe to
 * re-run:
 * - agents: key-exists → no-op (a changed agent is a new version via the
 *   versions endpoint; this script never mutates a published version);
 *   NOTE (operator footgun): the key-exists check does NOT compare
 *   instructions — editing an agent .md in git and re-running this
 *   script leaves the platform agent stale. Publish a new agent version
 *   explicitly when instructions change.
 * - workflow: key-exists + graph byte-equal (canonical JSON) → no-op;
 *   graph changed → a NEW WorkflowVersion is published, v1 is never
 *   edited.
 *
 * The script never deletes anything and never touches run history.
 *
 * Usage as a module (tests):
 *   import { ensureChapterTemplate } from "./seed-chapter-template.ts";
 *   await ensureChapterTemplate(injectAdapter(app, superAdminCookie), { workspaceId });
 *
 * Usage as a CLI against a running API:
 *   NOVELFORGE_API_URL=https://api.example.com NOVELFORGE_ADMIN_COOKIE=... \
 *   NOVELFORGE_WORKSPACE_ID=<any workspace the admin belongs to> \
 *   node --experimental-strip-types scripts/seed-chapter-template.ts
 */
import {
  CHAPTER_GENERATION_REVIEW,
  graphsEqual,
} from "../packages/workflow-templates/index.ts";

export interface SeedResponse {
  status: number;
  body: unknown;
}

export type SeedHttp = (
  method: "GET" | "POST",
  url: string,
  opts?: { body?: unknown; headers?: Record<string, string> },
) => Promise<SeedResponse>;

export interface SeedOptions {
  /** Session cookie of a platform administrator (SUPER_ADMIN). */
  cookie: string;
  /**
   * Any workspace the admin belongs to — used only for the read-only
   * list lookups (the list endpoints are workspace-scoped reads).
   */
  workspaceId: string;
}

export interface SeedResult {
  workflowId: string;
  /** Current version number after the run. */
  version: number;
  /** True when the workflow row was created by this run. */
  workflowCreated: boolean;
  /** True when a new version was published by this run. */
  versionCreated: boolean;
  /** Agent keys created by this run (already-existing keys are skipped). */
  agentsCreated: string[];
}

interface Row {
  id: string;
  scope: string;
  key: string;
}

function asRows(body: unknown): Row[] {
  return Array.isArray(body) ? (body as Row[]) : [];
}

export async function ensureChapterTemplate(
  http: SeedHttp,
  opts: SeedOptions,
): Promise<SeedResult> {
  const headers = { cookie: opts.cookie };
  const template = CHAPTER_GENERATION_REVIEW;

  // ---- 1. Agents: key-exists → no-op ----
  const agentsCreated: string[] = [];
  const agentList = await http("GET", `/api/workspaces/${opts.workspaceId}/agents`, { headers });
  if (agentList.status !== 200) {
    throw new Error(`agent list failed with status ${agentList.status}`);
  }
  const existingAgentKeys = new Set(
    asRows(agentList.body)
      .filter((a) => a.scope === "PLATFORM")
      .map((a) => a.key),
  );
  for (const agent of template.agents) {
    if (existingAgentKeys.has(agent.key)) continue;
    const created = await http(
      "POST",
      "/api/agents",
      {
        headers,
        body: {
          scope: "PLATFORM",
          key: agent.key,
          name: agent.name,
          instructions: agent.instructions,
          modelProfile: agent.modelProfile,
        },
      },
    );
    if (created.status !== 201) {
      throw new Error(`agent create for "${agent.key}" failed with status ${created.status}`);
    }
    const id = (created.body as { id: string }).id;
    const published = await http("POST", `/api/agents/${id}/publish`, { headers });
    if (published.status !== 200) {
      throw new Error(`agent publish for "${agent.key}" failed with status ${published.status}`);
    }
    agentsCreated.push(agent.key);
  }

  // ---- 2. Workflow: create, or no-op, or new version ----
  const wfList = await http("GET", `/api/workspaces/${opts.workspaceId}/workflows`, { headers });
  if (wfList.status !== 200) {
    throw new Error(`workflow list failed with status ${wfList.status}`);
  }
  const existing = asRows(wfList.body).find(
    (w) => w.scope === "PLATFORM" && w.key === template.key,
  );
  if (!existing) {
    const created = await http(
      "POST",
      "/api/workflows",
      {
        headers,
        body: {
          scope: "PLATFORM",
          key: template.key,
          name: template.name,
          description: template.description,
          graph: template.graph,
        },
      },
    );
    if (created.status !== 201) {
      throw new Error(`workflow create failed with status ${created.status}`);
    }
    const id = (created.body as { id: string }).id;
    const published = await http("POST", `/api/workflows/${id}/publish`, { headers });
    if (published.status !== 200) {
      throw new Error(`workflow publish failed with status ${published.status}`);
    }
    return { workflowId: id, version: 1, workflowCreated: true, versionCreated: false, agentsCreated };
  }

  const detail = await http("GET", `/api/workflows/${existing.id}`, { headers });
  if (detail.status !== 200) {
    throw new Error(`workflow detail failed with status ${detail.status}`);
  }
  const current = detail.body as { version: number; graph: unknown };
  if (graphsEqual(current.graph, template.graph)) {
    return {
      workflowId: existing.id,
      version: current.version,
      workflowCreated: false,
      versionCreated: false,
      agentsCreated,
    };
  }
  // Graph changed → NEW version, never a mutation of v1.
  const versioned = await http(
    "POST",
    `/api/workflows/${existing.id}/versions`,
    { headers, body: { graph: template.graph } },
  );
  if (versioned.status !== 201 && versioned.status !== 200) {
    throw new Error(`workflow version create failed with status ${versioned.status}`);
  }
  const published = await http("POST", `/api/workflows/${existing.id}/publish`, { headers });
  if (published.status !== 200) {
    throw new Error(`workflow publish failed with status ${published.status}`);
  }
  const after = (await http("GET", `/api/workflows/${existing.id}`, { headers })).body as {
    version: number;
  };
  return {
    workflowId: existing.id,
    version: after.version,
    workflowCreated: false,
    versionCreated: true,
    agentsCreated,
  };
}

// ---- CLI entry: only when executed directly, not when imported ----
const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
  } catch {
    return false;
  }
})();

if (isMain) {
  const baseUrl = process.env["NOVELFORGE_API_URL"];
  const cookie = process.env["NOVELFORGE_ADMIN_COOKIE"];
  const workspaceId = process.env["NOVELFORGE_WORKSPACE_ID"];
  if (!baseUrl || !cookie || !workspaceId) {
    console.error(
      "Set NOVELFORGE_API_URL, NOVELFORGE_ADMIN_COOKIE (SUPER_ADMIN session), and " +
        "NOVELFORGE_WORKSPACE_ID (any workspace the admin belongs to).",
    );
    process.exit(1);
  }
  const http: SeedHttp = async (method, url, opts) => {
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts?.headers ?? {}),
      },
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  ensureChapterTemplate(http, { cookie, workspaceId })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
