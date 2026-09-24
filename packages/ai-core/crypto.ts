/**
 * Gateway credential encryption at rest (CLAUDE.md §14).
 *
 * AES-256-GCM with a random 12-byte IV per encryption; the auth tag makes
 * tampering detectable. Stored form is `v1:<iv>:<tag>:<ciphertext>`, all
 * base64url. The plaintext is never logged, never returned from an API,
 * and never placed in a URL.
 *
 * Key derivation: the env secret is hashed to exactly 32 bytes, so an
 * operator can supply any-length secret without a length footgun.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  // SHA-256 -> 32 bytes. Deterministic, so the same secret decrypts.
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptCredential(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

/**
 * Decrypt a stored credential. Throws CredentialError on malformed input
 * or a failed auth tag — the message never echoes the ciphertext or key.
 */
export function decryptCredential(stored: string, secret: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CredentialError("malformed credential payload");
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  // Buffer.from(..., "base64url") does not throw on invalid input — it
  // silently skips characters — so there is nothing to catch here. The
  // length checks below plus GCM's auth tag are what actually reject a
  // malformed or tampered payload.
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new CredentialError("malformed credential payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Wrong key or tampered ciphertext — same message either way.
    throw new CredentialError("credential could not be decrypted");
  }
}

/**
 * Constant-time equality for secret material. Lengths must match for
 * `timingSafeEqual`, so a length difference returns early — that leaks
 * only the length, which callers must not treat as secret.
 */
export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
