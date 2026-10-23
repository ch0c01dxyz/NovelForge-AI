import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import type { AuthService } from "@novelforge/auth";
import type { NovelForgeDb } from "@novelforge/database";
import { registerBrandingRoutes } from "./branding-routes.ts";
import { DEFAULT_BRANDING } from "./services/platform-branding.ts";
import { SESSION_COOKIE } from "./auth-routes.ts";

describe("platform branding routes", () => {
  let app: FastifyInstance;
  const validateSession = vi.fn();
  const tx = { user: { findUnique: vi.fn() }, platformBranding: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() }, auditLog: { create: vi.fn() }, $executeRaw: vi.fn() };
  const db = { ...tx, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)) };
  const body = { name: "novel forge", mark: "n", markColor: "#102030", expectedVersion: 0 };
  const write = (payload: Record<string, unknown> = body) => app.inject({ method: "PUT", url: "/api/platform/branding", cookies: { [SESSION_COOKIE]: "test-session" }, payload });
  beforeEach(async () => {
    vi.clearAllMocks(); validateSession.mockResolvedValue({ userId: "admin" }); tx.user.findUnique.mockResolvedValue({ platformRole: "SUPER_ADMIN" });
    tx.platformBranding.findUnique.mockResolvedValue(null); tx.platformBranding.updateMany.mockResolvedValue({ count: 1 });
    tx.platformBranding.findUniqueOrThrow.mockResolvedValue({ name: body.name, mark: body.mark, markColor: body.markColor, version: 1 });
    app = Fastify(); await app.register(cookie); await registerBrandingRoutes(app, { auth: { validateSession } as unknown as AuthService, db: db as unknown as NovelForgeDb });
  });
  afterEach(async () => { await app.close(); });
  it("returns the safe default projection anonymously without authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/api/public/branding" });
    expect(response.json()).toEqual(DEFAULT_BRANDING); expect(validateSession).not.toHaveBeenCalled();
    expect(tx.platformBranding.findUnique).toHaveBeenCalledWith({ where: { id: "platform" }, select: { name: true, mark: true, markColor: true, version: true } });
  });
  it("refuses missing sessions and real ordinary database roles", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/platform/branding", payload: body })).statusCode).toBe(401);
    validateSession.mockResolvedValueOnce(null); expect((await write()).statusCode).toBe(401);
    tx.user.findUnique.mockResolvedValue({ platformRole: null }); expect((await write()).statusCode).toBe(403);
    expect(tx.platformBranding.updateMany).not.toHaveBeenCalled(); expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it.each([{ ...body, markColor: "red;display:none" }, { ...body, mark: "<N>" }, { ...body, name: " " }, { ...body, name: "n".repeat(41) }, { ...body, mark: "long" }, { ...body, expectedVersion: -1 }, { ...body, unexpected: true }])("rejects unsafe or out-of-contract input %j", async payload => {
    expect((await write(payload)).statusCode).toBe(400); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("preserves text case and writes the revision and audit in one transaction", async () => {
    const response = await write(); expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ name: "novel forge", mark: "n", markColor: "#102030", version: 1 });
    expect(tx.platformBranding.updateMany).toHaveBeenCalledWith({ where: { id: "platform", version: 0 }, data: { name: "novel forge", mark: "n", markColor: "#102030", version: { increment: 1 } } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: "admin", action: "platform-branding.updated", payload: expect.objectContaining({ previousVersion: 0, version: 1, mark: "n" }) }) });
  });
  it("refuses a stale version without an audit or overwrite", async () => {
    tx.platformBranding.updateMany.mockResolvedValue({ count: 0 }); const response = await write();
    expect(response.statusCode).toBe(409); expect(response.json()).toEqual({ error: "BRANDING_CHANGED" }); expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("reports an audit failure as failure rather than successful save", async () => {
    tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed")); expect((await write()).statusCode).toBe(500);
  });
});
