import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ReadyBody } from "./app.ts";
import type { Env } from "@novelforge/config";

const env: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://user:[REDACTED:connection_string]@localhost:5432/novelforge",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "novelforge",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: "test",
  AI_ROUTING_STRATEGY: "PRIORITY",
};

/** Local TCP listener standing in for a reachable datastore. */
function startStub(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * A port guaranteed to refuse connections: bind one, read its number,
 * release it. (Fixed "closed" ports like 9 proved unreliable on this host.)
 */
async function closedPort(): Promise<number> {
  const stub = await startStub();
  const { port } = stub;
  await stub.close();
  return port;
}

describe("GET /health", () => {
  it("returns 200 ok with no dependencies", async () => {
    const app = await buildApp(env);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("GET /ready", () => {
  let dbStub: { port: number; close: () => Promise<void> };
  let redisStub: { port: number; close: () => Promise<void> };

  beforeAll(async () => {
    dbStub = await startStub();
    redisStub = await startStub();
  });

  afterAll(async () => {
    await dbStub.close();
    await redisStub.close();
  });

  it("returns 200 ok when both datastores are reachable", async () => {
    const app = await buildApp({
      ...env,
      DATABASE_URL: `postgresql://localhost:${dbStub.port}/novelforge`,
      REDIS_URL: `redis://localhost:${redisStub.port}`,
    });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      checks: { database: "up", redis: "up" },
    } satisfies ReadyBody);
    await app.close();
  });

  it("returns 503 degraded when datastores are unreachable", async () => {
    const deadPort = await closedPort();
    const app = await buildApp({
      ...env,
      DATABASE_URL: `postgresql://localhost:${deadPort}/novelforge`,
      REDIS_URL: `redis://localhost:${deadPort}`,
    });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "degraded",
      checks: { database: "down", redis: "down" },
    } satisfies ReadyBody);
    await app.close();
  });

  it("reports per-check state when only one datastore is reachable", async () => {
    const deadPort = await closedPort();
    const app = await buildApp({
      ...env,
      DATABASE_URL: `postgresql://localhost:${dbStub.port}/novelforge`,
      REDIS_URL: `redis://localhost:${deadPort}`,
    });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "degraded",
      checks: { database: "up", redis: "down" },
    } satisfies ReadyBody);
    await app.close();
  });
});
