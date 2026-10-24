/**
 * @novelforge/config — shared environment validation.
 *
 * Fail-fast Zod schema for process env. Secret values are NEVER included in
 * error messages or any logging path; use redactEnv() to log config safely
 * (CLAUDE.md §14/§31: secrets never logged).
 */
import { z } from "zod";

/** Env keys whose values must never appear in errors, logs, or toString paths. */
const SECRET_KEYS = [
  "OMNIROUTE_API_KEY",
  "APP_ENCRYPTION_KEY",
  "S3_SECRET_ACCESS_KEY",
  "S3_ACCESS_KEY_ID",
  "POSTGRES_PASSWORD",
] as const;

const port = z.coerce.number().int().min(1).max(65535);
const url = z.url();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),

    // App / gateway ports
    PORT: port.default(3000),
    API_HOST: z.union([z.ipv4(), z.ipv6()]).optional(),
    TRUST_PROXY: z.literal("loopback").optional(),
    PUBLIC_ORIGIN: url
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return (
            ["http:", "https:"].includes(parsed.protocol) &&
            !parsed.username &&
            !parsed.password &&
            parsed.pathname === "/" &&
            !parsed.search &&
            !parsed.hash
          );
        } catch {
          return false;
        }
      }, "Expected an HTTP(S) origin without credentials, path or query")
      .optional(),

    // Datastores (credentials may be embedded in the URL — treat as sensitive
    // in logs via redactEnv)
    DATABASE_URL: url,
    REDIS_URL: url,

    // S3-compatible object storage
    S3_ENDPOINT: url.default("http://localhost:9000"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(1).default("novelforge"),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),

    // OmniRoute AI gateway
    OMNIROUTE_BASE_URL: url,
    OMNIROUTE_API_KEY: z.string().min(1),

    // How the gateway router orders candidate gateways for a request.
    // Deployment-level, not per-request: an operator picks one policy.
    AI_ROUTING_STRATEGY: z
      .enum(["PRIORITY", "WEIGHTED", "ROUND_ROBIN", "LEAST_LATENCY", "FAILOVER"])
      .default("PRIORITY"),

    // App-level encryption secret (gateway credentials at rest, CLAUDE.md §14)
    APP_ENCRYPTION_KEY: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.PUBLIC_ORIGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "Required in production for browser origin protection",
      });
    }
  });

export type Env = z.output<typeof envSchema>;

const REDACTED = "[REDACTED]";

function isSecret(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/**
 * Parse and validate an env source (defaults to process.env).
 * Throws an EnvValidationError on the first batch of problems; the message
 * lists offending keys and issues but redacts every secret value and masks
 * credentials embedded in datastore URLs.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    const raw = source[key];
    let value: string;
    if (raw === undefined) value = "(missing)";
    else if (isSecret(key)) value = REDACTED;
    else value = maskUrlCredentials(raw);
    return `  ${key}: ${issue.message} [received: ${value}]`;
  });
  throw new EnvValidationError(`Invalid environment configuration:\n${lines.join("\n")}`);
}

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError";
}

/** Copy of env safe to log/serialize: secrets masked, URL credentials masked. */
export function redactEnv(env: Env): Record<string, unknown> {
  const out: Record<string, unknown> = { ...env };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value !== "string") continue;
    out[key] = isSecret(key) ? REDACTED : maskUrlCredentials(value);
  }
  return out;
}

/** Replace the password component of credentials in a URL string. */
function maskUrlCredentials(value: string): string {
  // Greedy password group: must swallow '@' chars inside the password
  // (legal unencoded in WHATWG URLs) and stop at the LAST '@', else the
  // tail of the password leaks past the redaction.
  return value.replace(/:\/\/([^:/@\s]+):(.+)@/, "://$1:" + REDACTED + "@");
}
