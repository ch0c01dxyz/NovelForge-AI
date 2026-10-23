import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type NovelForgeDb } from "@novelforge/database";
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from "@novelforge/auth";
import pg from "pg";
import type { Env } from "@novelforge/config";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";
import { createCoverGenerationServices, createGatewayRegistry } from "@novelforge/ai-services";
import { encryptCredential, GatewayError, GatewayManager, OmniRouteGateway } from "@novelforge/ai-core";
import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error("DATABASE_URL required for dedicated cover test database");
const TEST_DB = "novelforge_test_novel_cover";
const dbUrl = (database: string) => { const u = new URL(BASE_URL); u.pathname = `/${database}`; return u.toString(); };
const HERE = fileURLToPath(new URL(".", import.meta.url));
const DB_ROOT = path.join(HERE, "../../../packages/database");
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=";
const payload = { mimeType: "image/png", dataBase64: png, sourceName: "cover.png" };
let db: NovelForgeDb;
let app: FastifyInstance;
let cookie: string;
let userId: string;
let workspaceId: string;
let novelId: string;
let sequence = 0;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: dbUrl("postgres") });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [TEST_DB]);
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  execFileSync(process.execPath, [path.join(DB_ROOT, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: DB_ROOT, stdio: "pipe", env: { ...process.env, DATABASE_URL: dbUrl(TEST_DB) },
  });
  db = createDb(dbUrl(TEST_DB));
  const env: Env = { NODE_ENV: "test", PORT: 3000, DATABASE_URL: dbUrl(TEST_DB), REDIS_URL: "redis://localhost:6379",
    S3_ENDPOINT: "http://localhost:9000", S3_REGION: "us-east-1", S3_BUCKET: "novelforge", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test",
    OMNIROUTE_BASE_URL: "http://localhost:20128", OMNIROUTE_API_KEY: "test", APP_ENCRYPTION_KEY: "test", AI_ROUTING_STRATEGY: "PRIORITY" };
  app = await buildApp(env, { db, coverQueue: { enqueue: async () => {}, close: async () => {} },
    createGateway: row => new OmniRouteGateway(row, async url => new Response(JSON.stringify(url.endsWith("/models/image") ? { data: [{ id: "test/image" }] } : { data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] }))) });
}, 120_000);
afterAll(async () => { await app?.close(); await db?.$disconnect(); });

async function actor(role?: "VIEWER") {
  const user = await db.user.create({ data: { email: `cover-${++sequence}@example.test`, passwordHash: "not-used", displayName: "Cover tester" } });
  const token = generateSessionToken();
  await db.session.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  if (role) await db.membership.create({ data: { workspaceId, userId: user.id, role } });
  return { userId: user.id, cookie: token };
}
function request(method: "GET" | "PUT" | "POST" | "DELETE", url: string, body?: object, token: string | null = cookie) {
  return app.inject({ method, url, ...(body ? { payload: body } : {}), ...(token ? { cookies: { [SESSION_COOKIE]: token } } : {}) });
}
const base = () => `/api/workspaces/${workspaceId}/novels/${novelId}`;
function coloredCover(red: number) {
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return { mimeType: "image/png", dataBase64: Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, red, 0, 0]))), chunk("IEND", Buffer.alloc(0))]).toString("base64") };
}
beforeEach(async () => {
  const owner = await actor();
  cookie = owner.cookie; userId = owner.userId;
  workspaceId = (await request("POST", "/api/workspaces", { name: "Cover test", slug: `cover-${sequence}` })).json().id;
  novelId = (await request("POST", `/api/workspaces/${workspaceId}/novels`, { title: "Covered story", slug: "covered-story" })).json().id;
});

describe("authenticated novel cover configuration", () => {
  it("keeps current and two distinct previous images, preserving expired metadata and refusing expired restore", async () => {
    const hashes: string[] = [];
    for (const red of [10, 20, 30, 20, 40]) {
      const response = await request("PUT", `${base()}/cover`, coloredCover(red));
      expect(response.statusCode, response.body).toBe(200); hashes.push(response.json().sha256);
    }
    const rows = await db.novelCoverVersion.findMany({ where: { novelId }, orderBy: { number: "asc" } });
    const expired = rows.find(row => row.sha256 === hashes[0])!;
    expect(expired.payloadExpiredAt).not.toBeNull(); expect(expired.cover).toBeNull();
    expect(new Set(rows.filter(row => row.sha256 && !row.payloadExpiredAt).map(row => row.sha256))).toEqual(new Set([hashes[1], hashes[2], hashes[4]]));
    expect(rows[0]!.sha256).toBeNull(); expect(rows[0]!.payloadExpiredAt).toBeNull();
    const restore = await request("POST", `${base()}/cover-history/${expired.id}/restore`, { expectedCoverHash: hashes[4] });
    expect(restore.statusCode).toBe(410); expect(restore.json().error).toBe("COVER_VERSION_EXPIRED");
    expect((await request("GET", `${base()}/cover`)).rawPayload.toString("base64")).toBe(coloredCover(40).dataBase64);
    expect(await db.auditLog.count({ where: { workspaceId, action: "novel.cover-payloads-expired" } })).toBeGreaterThan(0);
  });

  it("stores bytes exactly, preserves sibling settings, audits metadata and returns only cover URLs in novel views", async () => {
    await db.novelSettings.update({ where: { novelId }, data: { settings: { scaleS3: { enabled: true }, unrelated: "preserve" } } });
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
    const put = await request("PUT", `${base()}/cover`, payload);
    expect(put.statusCode).toBe(200);
    expect(put.json().sha256).toMatch(/^[a-f0-9]{64}$/);
    const image = await request("GET", put.json().coverUrl);
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload.equals(Buffer.from(png, "base64"))).toBe(true);
    expect(image.headers).toMatchObject({ "content-type": "image/png", "x-content-type-options": "nosniff", "cache-control": "private, no-store", "content-disposition": "inline" });
    const row = await db.novelSettings.findUniqueOrThrow({ where: { novelId } });
    expect(row.settings).toMatchObject({ scaleS3: { enabled: true }, unrelated: "preserve", cover: { ...payload, sha256: put.json().sha256 } });
    for (const url of [base(), "/api/novels", `/api/workspaces/${workspaceId}/novels`]) {
      const response = await request("GET", url);
      expect(response.statusCode).toBe(200);
      const view = Array.isArray(response.json()) ? response.json().find((n: { id: string }) => n.id === novelId) : response.json();
      expect(view.coverUrl).toBe(put.json().coverUrl);
      expect(response.body).not.toContain(png);
      expect(response.body).not.toContain("dataBase64");
    }
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: novelId, action: "novel.cover-updated" } });
    expect(audit.payload).toMatchObject({ sha256: put.json().sha256, previousSha256: null, mimeType: "image/png", bytes: Buffer.from(png, "base64").length });
    expect(JSON.stringify(audit)).not.toContain(png);
    const versions = await db.novelCoverVersion.findMany({ where: { novelId }, orderBy: { number: "asc" } });
    expect(versions).toHaveLength(2);
    expect(versions[0]?.cover).toBeNull();
    expect(versions[1]?.cover).toMatchObject({ dataBase64: png, sha256: put.json().sha256 });
  });

  it("enforces session, tenant membership, UUIDs and write capability", async () => {
    for (const method of ["GET", "PUT"] as const) {
      expect((await request(method, `${base()}/cover`, method === "PUT" ? payload : undefined, null)).statusCode).toBe(401);
    }
    const outsider = await actor();
    const viewer = await actor("VIEWER");
    expect((await request("PUT", `${base()}/cover`, payload, outsider.cookie)).statusCode).toBe(404);
    expect((await request("PUT", `${base()}/cover`, payload, viewer.cookie)).statusCode).toBe(403);
    expect((await request("PUT", `${base()}/cover`, payload)).statusCode).toBe(200);
    expect((await request("GET", `${base()}/cover`, undefined, outsider.cookie)).statusCode).toBe(404);
    expect((await request("GET", `${base()}/cover`, undefined, viewer.cookie)).statusCode).toBe(200);
    expect((await request("GET", `/api/workspaces/${workspaceId}/novels/not-a-uuid/cover`)).statusCode).toBe(400);
    const createdWorkspace = await request("POST", "/api/workspaces", { name: "Other", slug: `other-${sequence}` }, outsider.cookie);
    expect(createdWorkspace.statusCode).toBe(201);
    const otherWorkspace = createdWorkspace.json().id;
    await db.membership.create({ data: { workspaceId: otherWorkspace, userId, role: "AUTHOR" } });
    for (const method of ["GET", "PUT"] as const) expect((await request(method, `/api/workspaces/${otherWorkspace}/novels/${novelId}/cover`, method === "PUT" ? payload : undefined)).statusCode).toBe(404);
  });

  it("rejects invalid encodings, unsafe types, signatures and oversized bodies without storing a cover", async () => {
    for (const bad of [
      { ...payload, dataBase64: png + "\n" }, { ...payload, mimeType: "image/jpeg" },
      { ...payload, sourceName: "../cover.png" }, { ...payload, mimeType: "image/svg+xml" },
      { ...payload, dataBase64: Buffer.alloc(512 * 1024 + 1).toString("base64") },
      { ...payload, sha256: "client-controlled" },
    ]) expect((await request("PUT", `${base()}/cover`, bad)).statusCode).toBe(400);
    expect((await request("PUT", `${base()}/cover`, { ...payload, dataBase64: "A".repeat(800_000) })).statusCode).toBe(413);
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
  });

  it("rolls back the settings write if its transaction audit fails", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION refuse_cover_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'novel.cover-updated' THEN RAISE EXCEPTION 'test refusal'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER refuse_cover_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION refuse_cover_audit()`);
    try {
      expect((await request("PUT", `${base()}/cover`, payload)).statusCode).toBe(500);
      expect((await db.novelSettings.findUniqueOrThrow({ where: { novelId } })).settings).toEqual({});
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER refuse_cover_audit ON audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION refuse_cover_audit()");
    }
    expect(await db.auditLog.count({ where: { actorUserId: userId, action: "novel.cover-updated" } })).toBe(0);
  });
});

describe("durable cover candidates", () => {
  async function jobService(mode: "normal" | "lost" | "held" | "auth" = "normal") {
    const gateway = await db.aIGateway.create({ data: { name: `jobs-${sequence}`, baseUrl: "http://jobs.test", credentialCiphertext: encryptCredential("secret", "test") } });
    const model = await db.aIModel.create({ data: { gatewayId: gateway.id, modelId: "aihorde/test-image", capabilities: ["image-generation", "nf:image-jobs=v1"] } });
    await db.modelProfileMapping.create({ data: { profile: "IMAGE_GENERATOR", modelRef: model.id } });
    const id = "b".repeat(64), calls: string[] = []; let release!: () => void, submitted!: () => void, authorized = mode !== "auth";
    const accepted = new Promise<void>(resolve => { submitted = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const receipt = { id, model: model.modelId, state: "SUCCEEDED" };
    const manager = new GatewayManager(createGatewayRegistry(db, "test"), { createGateway: row => new OmniRouteGateway(row, async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (init?.method === "POST") {
        const requestId = (init.headers as Record<string, string>)["idempotency-key"]!;
        const generation = await db.generation.findUniqueOrThrow({ where: { id: requestId } });
        expect(generation.contextSnapshot).toMatchObject({ imageJob: { requestId, gatewayId: gateway.id, modelRef: model.id } });
        submitted(); if (mode === "held") await held;
        if (mode === "lost") throw new TypeError("fetch failed");
      }
      if (url.endsWith("/result")) return authorized ? new Response(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"), { headers: { "content-type": "image/png" } }) : new Response(null, { status: 403 });
      return new Response(JSON.stringify(receipt));
    }) });
    return { covers: createCoverGenerationServices({ db, manager, enqueue: async () => {} }), calls, accepted, release, authorize: () => { authorized = true; }, modelRef: model.id, gatewayId: gateway.id, jobId: id, modelId: model.modelId };
  }
  async function service(transport?: (call: number) => Promise<Response>, dispatch?: () => Promise<void>) {
    const gateway = await db.aIGateway.create({ data: { name: `images-${sequence}`, baseUrl: "http://images.test", credentialCiphertext: encryptCredential("secret", "test") } });
    const model = await db.aIModel.create({ data: { gatewayId: gateway.id, modelId: "test/image", capabilities: ["image-generation"] } });
    await db.modelProfileMapping.create({ data: { profile: "IMAGE_GENERATOR", modelRef: model.id } });
    const calls: string[] = [];
    const queue: string[] = [];
    const manager = new GatewayManager(createGatewayRegistry(db, "test"), { createGateway: row => new OmniRouteGateway(row, async () => {
      calls.push("image");
      if (transport) return transport(calls.length);
      return new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] }));
    }) });
    return { covers: createCoverGenerationServices({ db, manager, enqueue: async id => { queue.push(id); await dispatch?.(); } }), calls, queue, modelRef: model.id };
  }
  const scope = () => ({ actorUserId: userId, workspaceId, novelId });
  const input = (modelRef: string, count = 1) => ({ ...scope(), count, style: "manhwa", notes: "", prompt: "An abstract book cover", preferredModelRef: modelRef, idempotencyKey: randomUUID() });
  const result = () => new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] }));

  it("deletes only unused completed candidates, retains records and gates tenant/role/replay", async () => {
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef));
    const itemId = batch.items[0]!.id, url = `${base()}/cover-generations/${batch.id}/items/${itemId}`;
    expect((await request("DELETE", url)).statusCode).toBe(409);
    await covers.process(batch.id, 0);
    const viewer = await actor("VIEWER"), outsider = await actor();
    expect((await request("DELETE", url, undefined, null)).statusCode).toBe(401);
    expect((await request("DELETE", url, undefined, viewer.cookie)).statusCode).toBe(403);
    expect((await request("DELETE", url, undefined, outsider.cookie)).statusCode).toBe(404);
    expect((await covers.get(scope(), batch.id)).items[0]!.canDelete).toBe(true);
    expect((await request("DELETE", url)).statusCode).toBe(200);
    expect((await request("DELETE", url)).statusCode).toBe(200);
    const item = await db.coverGenerationItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.image).toBeNull(); expect(item.payloadExpiredAt).not.toBeNull();
    expect(item.state).toBe("SUCCEEDED"); expect(item.originalSha256).toBeTruthy();
    expect((await request("GET", url + "/image")).statusCode).toBe(410);
    await expect(covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: null })).rejects.toMatchObject({ code: "COVER_IMAGE_EXPIRED" });
    expect(await db.auditLog.count({ where: { entityId: itemId, action: "cover.candidate-removed" } })).toBe(1);
  });

  it("protects active cover references and expires old applied copies only after retention releases them", async () => {
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef));
    await covers.process(batch.id, 0); const itemId = batch.items[0]!.id;
    await covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: null });
    await expect(covers.remove(scope(), batch.id, itemId)).rejects.toMatchObject({ code: "COVER_IMAGE_PROTECTED" });
    const pending = await covers.create(input(modelRef));
    for (const red of [11, 22, 33]) expect((await request("PUT", `${base()}/cover`, coloredCover(red))).statusCode).toBe(200);
    expect((await db.coverGenerationItem.findUniqueOrThrow({ where: { id: itemId } })).image).not.toBeNull();
    await covers.change(scope(), pending.id, { cancel: true }); await covers.process(pending.id, 0);
    expect((await request("PUT", `${base()}/cover`, coloredCover(44))).statusCode).toBe(200);
    const old = await db.coverGenerationItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(old.image).toBeNull(); expect(old.payloadExpiredAt).not.toBeNull();
    expect(old.appliedAt).not.toBeNull();
  });

  it("serializes removal against Apply without losing an active image", async () => {
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef));
    await covers.process(batch.id, 0); const itemId = batch.items[0]!.id;
    const results = await Promise.allSettled([covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: null }), covers.remove(scope(), batch.id, itemId)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const item = await db.coverGenerationItem.findUniqueOrThrow({ where: { id: itemId } });
    const image = await request("GET", `${base()}/cover`);
    if (item.payloadExpiredAt) expect(image.statusCode).toBe(404);
    else { expect(image.statusCode).toBe(200); expect(item.appliedAt).not.toBeNull(); expect(item.image).not.toBeNull(); }
  });

  it("persists the request before POST and recovers a lost receipt using GET without another submit", async () => {
    const { covers, calls, modelRef } = await jobService("lost"); const batch = await covers.create(input(modelRef));
    await covers.process(batch.id, 0);
    const done = await covers.get(scope(), batch.id); expect(done.status).toBe("SUCCEEDED");
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1);
    expect(calls.some(call => call.includes("/by-request/"))).toBe(true);
    expect(await db.generation.count({ where: { novelId, component: "COVER" } })).toBe(1);
    expect(await db.generationAttempt.count({ where: { generationId: done.items[0]!.activeGenerationId! } })).toBe(1);
  });

  it("resumes the original generation after a worker crash even when story context changed, then refuses stale Apply", async () => {
    const { covers, calls, modelRef, gatewayId, modelId, jobId } = await jobService(); const batch = await covers.create(input(modelRef));
    const generation = await db.generation.create({ data: { workspaceId, novelId, userId, component: "COVER", task: "COVER_GENERATION", modelProfile: "IMAGE_GENERATOR", status: "IN_PROGRESS" } });
    await db.generation.update({ where: { id: generation.id }, data: { contextSnapshot: { imageJob: { gatewayId, modelRef, modelId, jobId, requestId: generation.id, timeoutMs: 1800000, deadlineAt: Date.now() + 1800000 } } } });
    await db.coverGenerationItem.update({ where: { id: batch.items[0]!.id }, data: { state: "RUNNING", activeGenerationId: generation.id } });
    await db.novel.update({ where: { id: novelId }, data: { title: "Story changed after acceptance" } });
    await covers.process(batch.id, 0); const done = await covers.get(scope(), batch.id);
    expect(done.status).toBe("SUCCEEDED"); expect(done.items[0]!.activeGenerationId).toBe(generation.id);
    expect(calls.every(call => call.startsWith("GET"))).toBe(true);
    await expect(covers.apply({ ...scope(), batchId: batch.id, itemId: done.items[0]!.id, expectedCoverHash: null })).rejects.toMatchObject({ code: "COVER_SOURCE_CHANGED" });
    expect(await db.generationAttempt.count({ where: { generationId: generation.id } })).toBe(1);
  });

  it("fences concurrent observers of one accepted job and records one terminal attempt", async () => {
    const { covers, calls, modelRef, accepted, release } = await jobService("held"); const batch = await covers.create(input(modelRef));
    const old = covers.process(batch.id, 0); await accepted;
    await covers.process(batch.id, 0); release(); await old;
    const done = await covers.get(scope(), batch.id); expect(done.status).toBe("SUCCEEDED");
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1);
    expect(await db.generationAttempt.count({ where: { generationId: done.items[0]!.activeGenerationId! } })).toBe(1);
  });

  it("checks the existing accepted job after a connection repair without another generation or confirmation of a new request", async () => {
    const { covers, calls, modelRef, authorize } = await jobService("auth"); const batch = await covers.create(input(modelRef));
    await covers.process(batch.id, 0); const waiting = await covers.get(scope(), batch.id);
    expect(waiting.status).toBe("UNCERTAIN"); expect(waiting.items[0]!.resumeExisting).toBe(true);
    const generationId = waiting.items[0]!.activeGenerationId!;
    expect(await db.generationAttempt.count({ where: { generationId } })).toBe(0);
    await db.novel.update({ where: { id: novelId }, data: { title: "Edited while checking an accepted job" } });
    authorize(); await covers.change(scope(), batch.id, { itemId: waiting.items[0]!.id }); await covers.process(batch.id, 1);
    expect((await covers.get(scope(), batch.id)).items[0]!.activeGenerationId).toBe(generationId);
    expect(calls.filter(call => call.startsWith("POST"))).toHaveLength(1);
    expect(await db.generationAttempt.count({ where: { generationId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "cover.item-observation-resumed", workspaceId } })).toBe(1);
  });

  it("persists an idempotent batch without replacing a cover, then normalizes actual decoded candidates", async () => {
    const { covers, calls, queue, modelRef } = await service();
    const scope = { actorUserId: userId, workspaceId, novelId };
    const brief = await covers.brief(scope);
    const input = { ...scope, count: 1, style: "manhwa", notes: "No lettering", prompt: brief.prompt, preferredModelRef: modelRef, idempotencyKey: randomUUID() };
    const first = await covers.create(input);
    expect((await covers.create(input)).id).toBe(first.id);
    expect(queue).toHaveLength(1);
    expect(calls).toHaveLength(0);
    await covers.process(first.id, 0);
    const result = await covers.get(scope, first.id);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.items[0]?.state).toBe("SUCCEEDED");
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("dataBase64");
    expect(await db.generationAttempt.count({ where: { generation: { novelId } } })).toBe(1);
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
    await covers.apply({ ...scope, batchId: first.id, itemId: result.items[0]!.id, expectedCoverHash: null });
    const image = await request("GET", `${base()}/cover`);
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    const baseline = await db.novelCoverVersion.findFirstOrThrow({ where: { novelId, number: 0 } });
    const currentHash = (await db.novelCoverVersion.findFirstOrThrow({ where: { novelId, number: 1 } })).sha256;
    await covers.restore({ ...scope, versionId: baseline.id, expectedCoverHash: currentHash });
    expect((await request("GET", `${base()}/cover`)).statusCode).toBe(404);
  });

  it.each([0, 10, 1.5])("refuses invalid image count %s before creating a batch", async count => {
    const { covers, modelRef, calls } = await service();
    await expect(covers.create(input(modelRef, count))).rejects.toMatchObject({ code: "COVER_INVALID_INPUT" });
    expect(calls).toHaveLength(0);
    expect(await db.coverGenerationBatch.count({ where: { novelId } })).toBe(0);
  });

  it("returns an authorized duplicate before current model/source checks, but refuses changed request data", async () => {
    const { covers, modelRef, queue } = await service(); const request = input(modelRef);
    const batch = await covers.create(request);
    await db.aIModel.update({ where: { id: modelRef }, data: { enabled: false } });
    await db.novel.update({ where: { id: novelId }, data: { title: "Later title" } });
    expect((await covers.create(request)).id).toBe(batch.id);
    await expect(covers.create({ ...request, notes: "Changed" })).rejects.toMatchObject({ code: "COVER_REQUEST_CHANGED" });
    expect(queue).toHaveLength(1);
  });

  it("gates tenants and viewer writes, and terminates revoked queued work without a provider call", async () => {
    const { covers, modelRef, calls } = await service(); const batch = await covers.create(input(modelRef));
    const stranger = await actor(); const viewer = await actor("VIEWER");
    await expect(covers.get({ ...scope(), actorUserId: stranger.userId }, batch.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(covers.change({ ...scope(), actorUserId: viewer.userId }, batch.id, { cancel: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.membership.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role: "VIEWER" } });
    await covers.process(batch.id, 0);
    expect((await covers.get(scope(), batch.id)).items[0]).toMatchObject({ state: "FAILED", errorCategory: "ACCESS_REVOKED" });
    expect(calls).toHaveLength(0);
  });

  it("cancels undispatched slots and audits the requesting actor", async () => {
    const { covers, modelRef, calls } = await service(); const batch = await covers.create(input(modelRef, 3));
    await covers.change(scope(), batch.id, { cancel: true }); await covers.process(batch.id, 0);
    expect((await covers.get(scope(), batch.id)).items.every(item => item.state === "CANCELLED")).toBe(true);
    expect(calls).toHaveLength(0);
    expect(await db.auditLog.count({ where: { entityId: batch.id, action: "cover.batch-cancelled", actorUserId: userId } })).toBe(1);
  });

  it("keeps partial and uncertain outcomes and truthfully attributes an alternate-author explicit retry", async () => {
    const { covers, modelRef, calls } = await service(async call => {
      if (call === 2) throw new GatewayError("TRANSIENT", "timeout");
      if (call === 3) return new Response("private body", { status: 429 });
      return result();
    });
    const batch = await covers.create(input(modelRef, 3)); await covers.process(batch.id, 0);
    const partial = await covers.get(scope(), batch.id);
    expect(partial.status).toBe("UNCERTAIN"); expect(partial.items.map(item => item.state)).toEqual(["SUCCEEDED", "UNCERTAIN", "FAILED"]);
    const item = partial.items[1]!;
    await expect(covers.change(scope(), batch.id, { itemId: item.id })).rejects.toMatchObject({ code: "COVER_RETRY_CONFIRMATION_REQUIRED" });
    const author = await actor(); await db.membership.create({ data: { workspaceId, userId: author.userId, role: "AUTHOR" } });
    await covers.change({ ...scope(), actorUserId: author.userId }, batch.id, { itemId: item.id, acknowledgeUncertain: true });
    await covers.process(batch.id, 1);
    expect(calls).toHaveLength(4);
    const retried = await db.generation.findFirstOrThrow({ where: { artifactId: item.id, userId: author.userId } });
    expect(retried.contextSnapshot).toMatchObject({ previousGenerationId: item.activeGenerationId });
    expect(await db.auditLog.count({ where: { entityId: batch.id, action: "cover.item-retried", actorUserId: author.userId } })).toBe(1);
  });

  it("does not overwrite changed source or cover, and replay is a no-op only while its candidate remains current", async () => {
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef)); await covers.process(batch.id, 0);
    const itemId = batch.items[0]!.id;
    const applied = await covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: null });
    await covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: null });
    expect(await db.novelCoverVersion.count({ where: { novelId } })).toBe(2);
    await request("PUT", `${base()}/cover`, payload);
    await expect(covers.apply({ ...scope(), batchId: batch.id, itemId, expectedCoverHash: applied.sha256 })).rejects.toMatchObject({ code: "COVER_ALREADY_REPLACED" });
    const second = await covers.create(input(modelRef)); await covers.process(second.id, 0);
    await db.novel.update({ where: { id: novelId }, data: { title: "A different story direction" } });
    await expect(covers.apply({ ...scope(), batchId: second.id, itemId: second.items[0]!.id, expectedCoverHash: second.expectedCoverHash })).rejects.toMatchObject({ code: "COVER_SOURCE_CHANGED" });
    expect((await request("GET", `${base()}/cover`)).rawPayload.equals(Buffer.from(png, "base64"))).toBe(true);
  });

  it("retains an enqueue-failed identity and performs no delivery from GET", async () => {
    let failed = true; const { covers, modelRef, queue } = await service(undefined, async () => { if (failed) throw new Error("queue unavailable"); });
    const batch = await covers.create(input(modelRef)); expect(batch.enqueueError).toBe(true);
    await covers.get(scope(), batch.id); await covers.list(scope()); expect(queue).toHaveLength(1);
    failed = false; await covers.change(scope(), batch.id, {}); expect(queue).toHaveLength(2);
    await covers.process(batch.id, 1); expect((await covers.get(scope(), batch.id)).status).toBe("SUCCEEDED");
  });

  it("allows an explicit fresh selection from the same batch after its own Apply", async () => {
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef, 2)); await covers.process(batch.id, 0);
    const first = await covers.apply({ ...scope(), batchId: batch.id, itemId: batch.items[0]!.id, expectedCoverHash: null });
    const second = await covers.apply({ ...scope(), batchId: batch.id, itemId: batch.items[1]!.id, expectedCoverHash: first.sha256 });
    expect(second.sha256).toBeTruthy();
    expect((await db.novelCoverVersion.findFirstOrThrow({ where: { novelId }, orderBy: { number: "desc" } })).sourceItemId).toBe(batch.items[1]!.id);
  });

  it("invalidates unused candidates after a manual upload even when the bytes and hash are unchanged", async () => {
    await request("PUT", `${base()}/cover`, payload);
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef)); await covers.process(batch.id, 0);
    await request("PUT", `${base()}/cover`, payload);
    await expect(covers.apply({ ...scope(), batchId: batch.id, itemId: batch.items[0]!.id, expectedCoverHash: batch.expectedCoverHash })).rejects.toMatchObject({ code: "COVER_CHANGED" });
    expect((await request("GET", `${base()}/cover`)).rawPayload.equals(Buffer.from(png, "base64"))).toBe(true);
  });

  it("fences a late old result after recovery and retry without duplicating uncertain requests", async () => {
    let release!: (response: Response) => void, started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const { covers, modelRef, calls } = await service(async call => { if (call === 1) { started(); return new Promise(resolve => { release = resolve; }); } return result(); });
    const batch = await covers.create(input(modelRef)); const old = covers.process(batch.id, 0); await dispatched;
    await covers.process(batch.id, 0); expect((await covers.get(scope(), batch.id)).status).toBe("UNCERTAIN");
    expect(calls).toHaveLength(1);
    await covers.change(scope(), batch.id, { itemId: batch.items[0]!.id, acknowledgeUncertain: true }); await covers.process(batch.id, 1);
    const fresh = await covers.get(scope(), batch.id); release(result()); await old;
    expect((await covers.get(scope(), batch.id)).items[0]?.activeGenerationId).toBe(fresh.items[0]?.activeGenerationId);
    expect((await covers.get(scope(), batch.id)).status).toBe("SUCCEEDED"); expect(calls).toHaveLength(2);
    expect(await db.auditLog.count({ where: { action: "cover.late-output-discarded", workspaceId } })).toBe(1);
  });

  it("serves the authenticated HTTP journey, validates inputs and keeps image profiles off chat", async () => {
    const { covers, modelRef } = await service();
    expect((await request("GET", `${base()}/cover-brief`, undefined, null)).statusCode).toBe(401);
    const brief = await request("GET", `${base()}/cover-brief`); expect(brief.statusCode).toBe(200);
    expect((await request("POST", `${base()}/cover-generations`, { ...input(modelRef), count: 10 })).statusCode).toBe(400);
    const { actorUserId: _actor, workspaceId: _workspace, novelId: _novel, ...body } = input(modelRef);
    const created = await request("POST", `${base()}/cover-generations`, { ...body, expectedSourceFingerprint: brief.json().sourceFingerprint });
    expect(created.statusCode).toBe(200);
    const batch = created.json();
    await covers.process(batch.id, 0);
    const detail = await request("GET", `${base()}/cover-generations/${batch.id}`); expect(detail.statusCode).toBe(200); expect(detail.body).not.toContain("dataBase64");
    const image = await request("GET", detail.json().items[0].imageUrl); expect(image.statusCode).toBe(200); expect(image.headers["cache-control"]).toBe("private, no-store");
    expect((await request("POST", `${base()}/cover-generations/${batch.id}/items/${batch.items[0].id}/apply`, { expectedCoverHash: null })).statusCode).toBe(200);
    expect((await request("GET", `${base()}/cover-history`)).json()).toHaveLength(2);
    const catalog = await request("GET", `/api/workspaces/${workspaceId}/model-catalog?profile=IMAGE_GENERATOR`);
    expect(catalog.statusCode).toBe(200); expect(catalog.json().some((row: { modelRef: string }) => row.modelRef === modelRef)).toBe(true);
    expect((await request("POST", `/api/workspaces/${workspaceId}/generations`, { task: "chat", profile: "IMAGE_GENERATOR", messages: [{ role: "user", content: "Cover" }] })).statusCode).toBe(400);
  });

  it("uses the shared save lock order and either applies before a save or refuses its stale source", async () => {
    const chapter = await request("POST", `${base()}/chapters`, { title: "First chapter" }); expect(chapter.statusCode).toBe(201);
    const { covers, modelRef } = await service(); const batch = await covers.create(input(modelRef)); await covers.process(batch.id, 0);
    const [apply, save] = await Promise.all([
      request("POST", `${base()}/cover-generations/${batch.id}/items/${batch.items[0]!.id}/apply`, { expectedCoverHash: null }),
      request("PUT", `${base()}/chapters/${chapter.json().id}`, { content: "A new story event.", expectedVersion: null }),
    ]);
    expect(save.statusCode).toBe(200); expect([200, 409]).toContain(apply.statusCode);
    if (apply.statusCode === 409) expect(apply.json().error).toBe("COVER_SOURCE_CHANGED");
  });

  it("does not let a revoked old executor fail a newer authorized resume", async () => {
    const { covers, modelRef, calls } = await service(); const batch = await covers.create(input(modelRef));
    await db.membership.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role: "VIEWER" } });
    const nextActor = await actor(); await db.membership.create({ data: { workspaceId, userId: nextActor.userId, role: "AUTHOR" } });
    let transactions = 0, reached!: () => void, release!: () => void;
    const delayed = new Promise<void>(resolve => { reached = resolve; }); const ready = new Promise<void>(resolve => { release = resolve; });
    const delayedDb = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return async (callback: (tx: unknown) => Promise<unknown>) => {
        if (++transactions === 3) { reached(); await ready; }
        return target.$transaction(callback);
      };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const oldServices = createCoverGenerationServices({ db: delayedDb, manager: new GatewayManager(createGatewayRegistry(db, "test")), enqueue: async () => {} });
    const old = oldServices.process(batch.id, 0); await delayed;
    await covers.change({ ...scope(), actorUserId: nextActor.userId }, batch.id, {});
    release(); await old;
    expect((await covers.get(scope(), batch.id)).items[0]?.state).toBe("PENDING"); expect(calls).toHaveLength(0);
    await covers.process(batch.id, 1); expect((await covers.get(scope(), batch.id)).status).toBe("SUCCEEDED");
  });
});
