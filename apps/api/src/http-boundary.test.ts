import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { loadEnv } from "@novelforge/config";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost:6379",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "test",
  APP_ENCRYPTION_KEY: "test",
  PUBLIC_ORIGIN: "https://novelforge.example",
});
const apps: FastifyInstance[] = [];
async function setup(trusted = false) {
  const app = await buildApp({ ...env, TRUST_PROXY: trusted ? "loopback" : undefined });
  apps.push(app);
  app.post("/api/boundary-test", () => ({ status: "changed" }));
  app.get(
    "/api/client-test",
    { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } },
    (request) => ({ ip: request.ip }),
  );
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("browser write origin boundary", () => {
  it("blocks a simple sibling-origin POST before the handler", async () => {
    const app = await setup();
    const result = await app.inject({
      method: "POST",
      url: "/api/boundary-test",
      headers: {
        cookie: "nf_session=opaque",
        origin: "https://untrusted.novelforge.example",
        "content-type": "text/plain",
      },
      payload: "",
    });
    expect(result.statusCode).toBe(403);
    expect(result.json()).toEqual({ error: "FORBIDDEN_ORIGIN" });
  });
  it.each([
    "null",
    "malformed",
    "https://novelforge.example.evil.test",
    "https://novelforge.example/path",
  ])("rejects invalid or foreign Origin %s", async (origin) => {
    const app = await setup();
    expect(
      (await app.inject({ method: "POST", url: "/api/boundary-test", headers: { origin } }))
        .statusCode,
    ).toBe(403);
  });
  it("accepts the configured origin, never a forwarded host substitute", async () => {
    const app = await setup(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/boundary-test",
          headers: { origin: env.PUBLIC_ORIGIN },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/boundary-test",
          headers: { origin: "https://evil.test", "x-forwarded-host": "evil.test" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("requires an origin or same-origin Referer for cookie mutations", async () => {
    const app = await setup();
    const base = { method: "POST" as const, url: "/api/boundary-test" };
    expect(
      (await app.inject({ ...base, headers: { cookie: "nf_session=opaque" } })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          ...base,
          headers: { cookie: "nf_session=opaque", referer: env.PUBLIC_ORIGIN + "/workspace" },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject(base)).statusCode).toBe(200);
  });
});
describe("proxy client identity", () => {
  it("separates real forwarded clients while ignoring a forged earlier hop", async () => {
    const app = await setup(true);
    const result = await app.inject({
      method: "GET",
      url: "/api/client-test",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "192.0.2.66, 198.51.100.1" },
    });
    expect(result.json().ip).toBe("198.51.100.1");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/client-test",
          remoteAddress: "127.0.0.1",
          headers: { "x-forwarded-for": "198.51.100.2" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/client-test",
          remoteAddress: "127.0.0.1",
          headers: { "x-forwarded-for": "203.0.113.4, 198.51.100.1" },
        })
      ).statusCode,
    ).toBe(429);
  });
  it("ignores forwarding headers from public sockets and when trust is disabled", async () => {
    for (const trusted of [true, false]) {
      const app = await setup(trusted);
      const result = await app.inject({
        method: "GET",
        url: "/api/client-test",
        remoteAddress: "198.51.100.7",
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      expect(result.json().ip).toBe("198.51.100.7");
    }
  });
});
