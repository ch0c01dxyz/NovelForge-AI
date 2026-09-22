import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  loadEnv,
  redactEnv,
  type Env,
} from "./index";

const VALID = {
  NODE_ENV: "development",
  PORT: "3000",
  DATABASE_URL: "postgres://user:secret@localhost:5432/novelforge",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "novelforge",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "super-secret-s3-key",
  OMNIROUTE_BASE_URL: "http://localhost:20128",
  OMNIROUTE_API_KEY: "sk-super-secret-key",
  APP_ENCRYPTION_KEY: "encryption-secret",
};

describe("loadEnv", () => {
  it("accepts a fully valid env", () => {
    const env = loadEnv(VALID);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.S3_BUCKET).toBe("novelforge");
    expect(env.OMNIROUTE_BASE_URL).toBe("http://localhost:20128");
  });

  it("applies defaults for optional vars", () => {
    const { PORT: _port, S3_ENDPOINT: _e, S3_REGION: _r, S3_BUCKET: _b, ...rest } = VALID;
    const env = loadEnv(rest);
    expect(env.PORT).toBe(3000);
    expect(env.S3_ENDPOINT).toBe("http://localhost:9000");
    expect(env.S3_REGION).toBe("us-east-1");
    expect(env.S3_BUCKET).toBe("novelforge");
  });

  it("fails fast when a required var is missing, without leaking secrets", () => {
    const { OMNIROUTE_API_KEY: _key, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
    try {
      loadEnv(rest);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("OMNIROUTE_API_KEY");
      expect(message).toContain("(missing)");
    }
  });

  it("reports malformed values", () => {
    const env = { ...VALID, NODE_ENV: "staging", DATABASE_URL: "not-a-url", PORT: "70000" };
    try {
      loadEnv(env);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("NODE_ENV");
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PORT");
    }
  });

  it("redacts secret values present but invalid", () => {
    // min(1) fails on empty string; the received value must be redacted, not echoed
    const env = { ...VALID, OMNIROUTE_API_KEY: "sk-super-secret-key", APP_ENCRYPTION_KEY: "" };
    try {
      loadEnv(env);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("APP_ENCRYPTION_KEY");
      expect(message).toContain("[REDACTED]");
    }
  });

  it("masks credentials embedded in a malformed DATABASE_URL", () => {
    const env = { ...VALID, DATABASE_URL: "postgres://user:hunter2@bad url" };
    try {
      loadEnv(env);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("hunter2");
      expect(message).toContain("[REDACTED]");
    }
  });
});

describe("redactEnv", () => {
  it("masks every secret and URL password", () => {
    const env: Env = loadEnv(VALID);
    const redacted = redactEnv(env);
    expect(redacted.OMNIROUTE_API_KEY).toBe("[REDACTED]");
    expect(redacted.APP_ENCRYPTION_KEY).toBe("[REDACTED]");
    expect(redacted.S3_SECRET_ACCESS_KEY).toBe("[REDACTED]");
    expect(redacted.S3_ACCESS_KEY_ID).toBe("[REDACTED]");
    expect(redacted.DATABASE_URL).toBe("postgres://user:[REDACTED]@localhost:5432/novelforge");
    // non-secret values pass through
    expect(redacted.NODE_ENV).toBe("development");
    expect(redacted.S3_BUCKET).toBe("novelforge");
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("sk-super-secret-key");
    expect(serialized).not.toContain("super-secret-s3-key");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain(":secret@");
  });
});
