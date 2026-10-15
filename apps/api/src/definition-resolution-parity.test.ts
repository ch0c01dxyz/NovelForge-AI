/**
 * GAP-029 regression: definition resolution must agree across callers.
 *
 * apps/api/src/services/definition-resolution.ts serves the workflow-runs
 * route and the AI orchestrator; @novelforge/workflow-executor's
 * `createDbDefinitionResolvers` serves the worker, which must not import
 * the API module (isolation boundary). The two therefore exist as separate
 * implementations of one contract:
 *
 * - workspace shadows platform: a tenant's own PUBLISHED definition wins
 *   over the shared catalog row of the same key;
 * - only PUBLISHED executes: a DRAFT never resolves;
 * - tenant isolation: another workspace's row is invisible;
 * - identical resolved payload (all ResolvedAgent/ResolvedSkill fields)
 *   and identical conflict messages for every absence case.
 *
 * If either implementation drifts from the contract, this test fails and
 * the change must land on both sides (or the implementations unified).
 * It deliberately asserts message/code parity, NOT error-class identity:
 * the error classes mirror each other by design — see the taxonomy note in
 * packages/workflow-executor/errors.ts.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { ConflictError } from "@novelforge/ai-services";
import { createDbDefinitionResolvers } from "@novelforge/workflow-executor";
import pg from "pg";
import { resolveAgent, resolveSkill } from "./services/definition-resolution.ts";

const TEST_DB = "novelforge_test_resolver_parity";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_PACKAGE_ROOT = path.join(HERE, "..", "..", "..", "packages", "database");
const PRISMA_CLI = path.join(DB_PACKAGE_ROOT, "node_modules", "prisma", "build", "index.js");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(HERE, "..", "..", "..", ".env"));
  } catch {
    throw new Error("DATABASE_URL not set and repo-root .env not found — see ADR-0003");
  }
}
const BASE_URL = process.env.DATABASE_URL!;
function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}
const TEST_URL = withDb(BASE_URL, TEST_DB);

let db: NovelForgeDb;
let seedCounter = 0;

beforeAll(async () => {
  const adminUrl = new URL(BASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    stdio: "pipe",
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  db = createDb(TEST_URL);
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.agentVersion.deleteMany();
  await db.agent.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
  await db.workspace.deleteMany();
  await db.user.deleteMany();
});

async function seedWorkspace(tag: string): Promise<{ userId: string; workspaceId: string }> {
  seedCounter += 1;
  const user = await db.user.create({
    data: { email: `u-${tag}-${seedCounter}@x.test`, passwordHash: "x", displayName: "u" },
  });
  const ws = await db.workspace.create({
    data: { name: "ws", slug: `ws-${tag}-${seedCounter}`, ownerId: user.id },
  });
  return { userId: user.id, workspaceId: ws.id };
}

interface DefinitionSeed {
  key: string;
  scope: "WORKSPACE" | "PLATFORM";
  workspaceId?: string;
  status?: "PUBLISHED" | "DRAFT";
  instructions: string;
  withVersion?: boolean;
}

/** Seeds an Agent + AgentVersion pair; version wiring optional for the no-version case. */
async function seedAgent(ownerId: string, seed: DefinitionSeed): Promise<void> {
  const agent = await db.agent.create({
    data: {
      key: seed.key,
      name: seed.key,
      scope: seed.scope,
      workspaceId: seed.workspaceId,
      status: seed.status ?? "PUBLISHED",
      createdById: ownerId,
    },
  });
  if (seed.withVersion === false) return;
  const version = await db.agentVersion.create({
    data: {
      agentId: agent.id,
      number: 1,
      instructions: seed.instructions,
      modelProfile: "CREATIVE_WRITER",
      skillKeys: [],
      createdById: ownerId,
    },
  });
  await db.agent.update({ where: { id: agent.id }, data: { currentVersionId: version.id } });
}

/** Seeds a Skill + SkillVersion pair; version wiring optional for the no-version case. */
async function seedSkill(ownerId: string, seed: DefinitionSeed): Promise<void> {
  const skill = await db.skill.create({
    data: {
      key: seed.key,
      name: seed.key,
      scope: seed.scope,
      workspaceId: seed.workspaceId,
      status: seed.status ?? "PUBLISHED",
      createdById: ownerId,
    },
  });
  if (seed.withVersion === false) return;
  const version = await db.skillVersion.create({
    data: {
      skillId: skill.id,
      number: 1,
      instructions: seed.instructions,
      modelProfile: "CREATIVE_WRITER",
      createdById: ownerId,
    },
  });
  await db.skill.update({ where: { id: skill.id }, data: { currentVersionId: version.id } });
}

/**
 * Captures the conflict contract: message + code, class identity excluded by
 * design. Accepts either side's error class via `instanceof`/`in` narrowing —
 * the package mirrors the API's `code` literals rather than sharing classes.
 */
function conflictContractOf(err: unknown): { message: string; code: string } | null {
  if (err instanceof ConflictError) return { message: err.message, code: err.code };
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    err.code === "CONFLICT" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return { message: err.message, code: err.code };
  }
  return null;
}

async function conflictContract(p: Promise<unknown>): Promise<{ message: string; code: string }> {
  let caught: unknown;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  const contract = caught !== undefined ? conflictContractOf(caught) : null;
  if (!contract) {
    // Not a conflict (or no rejection): rethrow the real failure untouched.
    throw caught ?? new Error("expected the resolver to reject with a CONFLICT");
  }
  return contract;
}

describe("definition resolution parity across callers (GAP-029)", () => {
  describe("resolveAgent", () => {
    it("workspace PUBLISHED shadows the PLATFORM row of the same key", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedAgent(userId, { key: "writer", scope: "PLATFORM", instructions: "platform instructions" });
      await seedAgent(userId, {
        key: "writer",
        scope: "WORKSPACE",
        workspaceId,
        instructions: "workspace instructions",
      });

      const [fromApi, fromWorker] = await Promise.all([
        resolveAgent(db, workspaceId, "writer"),
        createDbDefinitionResolvers(db).resolveAgent(workspaceId, "writer"),
      ]);
      // Deep equality across every ResolvedAgent field, pinned to the workspace row.
      expect(fromWorker).toEqual(fromApi);
      expect(fromApi.instructions).toBe("workspace instructions");
    });

    it("falls back to the PLATFORM row when the workspace has none", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedAgent(userId, { key: "writer", scope: "PLATFORM", instructions: "platform instructions" });

      const [fromApi, fromWorker] = await Promise.all([
        resolveAgent(db, workspaceId, "writer"),
        createDbDefinitionResolvers(db).resolveAgent(workspaceId, "writer"),
      ]);
      expect(fromWorker).toEqual(fromApi);
      expect(fromApi.instructions).toBe("platform instructions");
    });

    it("another workspace's PUBLISHED row is invisible (tenant isolation)", async () => {
      const { userId, workspaceId: wsA } = await seedWorkspace("a");
      const { workspaceId: wsB } = await seedWorkspace("b");
      await seedAgent(userId, {
        key: "writer",
        scope: "WORKSPACE",
        workspaceId: wsB,
        instructions: "workspace B instructions",
      });

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveAgent(db, wsA, "writer")),
        conflictContract(createDbDefinitionResolvers(db).resolveAgent(wsA, "writer")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`agent "writer" is not published or does not exist`);
      expect(apiContract.code).toBe("CONFLICT");
    });

    it("a DRAFT never resolves (only PUBLISHED executes)", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedAgent(userId, {
        key: "writer",
        scope: "WORKSPACE",
        workspaceId,
        status: "DRAFT",
        instructions: "draft instructions",
      });

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveAgent(db, workspaceId, "writer")),
        conflictContract(createDbDefinitionResolvers(db).resolveAgent(workspaceId, "writer")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`agent "writer" is not published or does not exist`);
    });

    it("an absent key rejects with the identical message", async () => {
      const { workspaceId } = await seedWorkspace("a");

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveAgent(db, workspaceId, "missing")),
        conflictContract(createDbDefinitionResolvers(db).resolveAgent(workspaceId, "missing")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`agent "missing" is not published or does not exist`);
    });

    it("a PUBLISHED row without a version rejects with the identical message", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedAgent(userId, {
        key: "writer",
        scope: "WORKSPACE",
        workspaceId,
        instructions: "unused",
        withVersion: false,
      });

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveAgent(db, workspaceId, "writer")),
        conflictContract(createDbDefinitionResolvers(db).resolveAgent(workspaceId, "writer")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`agent "writer" has no version`);
    });
  });

  describe("resolveSkill", () => {
    it("workspace PUBLISHED shadows the PLATFORM row of the same key", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedSkill(userId, { key: "summarize", scope: "PLATFORM", instructions: "platform skill" });
      await seedSkill(userId, {
        key: "summarize",
        scope: "WORKSPACE",
        workspaceId,
        instructions: "workspace skill",
      });

      const [fromApi, fromWorker] = await Promise.all([
        resolveSkill(db, workspaceId, "summarize"),
        createDbDefinitionResolvers(db).resolveSkill(workspaceId, "summarize"),
      ]);
      expect(fromWorker).toEqual(fromApi);
      expect(fromApi.instructions).toBe("workspace skill");
    });

    it("falls back to the PLATFORM row when the workspace has none", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedSkill(userId, { key: "summarize", scope: "PLATFORM", instructions: "platform skill" });

      const [fromApi, fromWorker] = await Promise.all([
        resolveSkill(db, workspaceId, "summarize"),
        createDbDefinitionResolvers(db).resolveSkill(workspaceId, "summarize"),
      ]);
      expect(fromWorker).toEqual(fromApi);
      expect(fromApi.instructions).toBe("platform skill");
    });

    it("another workspace's PUBLISHED row is invisible (tenant isolation)", async () => {
      const { userId, workspaceId: wsA } = await seedWorkspace("a");
      const { workspaceId: wsB } = await seedWorkspace("b");
      await seedSkill(userId, {
        key: "summarize",
        scope: "WORKSPACE",
        workspaceId: wsB,
        instructions: "workspace B skill",
      });

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveSkill(db, wsA, "summarize")),
        conflictContract(createDbDefinitionResolvers(db).resolveSkill(wsA, "summarize")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`skill "summarize" is not published or does not exist`);
      expect(apiContract.code).toBe("CONFLICT");
    });

    it("a DRAFT and an absent key reject with the identical message", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedSkill(userId, {
        key: "summarize",
        scope: "WORKSPACE",
        workspaceId,
        status: "DRAFT",
        instructions: "draft skill",
      });

      const [draftApi, draftWorker] = await Promise.all([
        conflictContract(resolveSkill(db, workspaceId, "summarize")),
        conflictContract(createDbDefinitionResolvers(db).resolveSkill(workspaceId, "summarize")),
      ]);
      expect(draftWorker).toEqual(draftApi);
      expect(draftApi.message).toBe(`skill "summarize" is not published or does not exist`);

      const [absentApi, absentWorker] = await Promise.all([
        conflictContract(resolveSkill(db, workspaceId, "missing")),
        conflictContract(createDbDefinitionResolvers(db).resolveSkill(workspaceId, "missing")),
      ]);
      expect(absentWorker).toEqual(absentApi);
      expect(absentApi.message).toBe(`skill "missing" is not published or does not exist`);
    });

    it("a PUBLISHED row without a version rejects with the identical message", async () => {
      const { userId, workspaceId } = await seedWorkspace("a");
      await seedSkill(userId, {
        key: "summarize",
        scope: "WORKSPACE",
        workspaceId,
        instructions: "unused",
        withVersion: false,
      });

      const [apiContract, workerContract] = await Promise.all([
        conflictContract(resolveSkill(db, workspaceId, "summarize")),
        conflictContract(createDbDefinitionResolvers(db).resolveSkill(workspaceId, "summarize")),
      ]);
      expect(workerContract).toEqual(apiContract);
      expect(apiContract.message).toBe(`skill "summarize" has no version`);
    });
  });
});
