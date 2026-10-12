/**
 * GAP-121 regression guard: every SCALE-review i18n key referenced by the
 * SCALE components must resolve against the REAL dictionaries (en and id),
 * not against a hand-written test mock. The original defect shipped because
 * five suites each carried a flat mock dictionary that mirrored the same
 * wrong call-site assumption (`workspace.scaleReview.*`) while the real
 * dicts nest the strings at `workspace.narrative.scaleReview.*`.
 *
 * Pattern follows workspace-characters.test.ts / workspace-relationships.test.ts,
 * which already resolve against the real locale modules.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

const COMPONENTS = [
  "./NarrativePanel.vue",
  "./ScalePayloadForm.vue",
  "./ScaleReviewPanel.vue",
  // 050C amendment 1 (finding A): the toggle references the
  // workspace.narrative.scaleReview.s3.setting.* family through dynamic
  // t(errorKey) calls, so both its static keys and its two dynamic error
  // keys are pinned against the real dictionaries here.
  "./ScaleS3SettingToggle.vue",
] as const;

const PREFIX = "workspace.narrative.scaleReview.";

/** Static t("...") call sites (double- or single-quoted literals). */
function callSiteKeys(source: string): string[] {
  return [
    ...source.matchAll(/\bt\(\s*["'](workspace\.narrative\.scaleReview\.[A-Za-z0-9_.]+)["']/g),
  ].map((m) => m[1] as string);
}

/**
 * Runtime-interpolated key families. The two dynamic call sites
 * (ScaleReviewPanel stateKey/checklistText) interpolate values from the
 * ScaleReviewProtocol state union and the checklist item-code × field
 * matrix; both enumerations are mirrored here so the dictionaries are
 * pinned against every key the component can actually request.
 */
const STATE_VALUES = [
  "NOT_CONFIGURED",
  "INCOMPLETE",
  "WITHIN_REACH",
  "VIOLATION",
  "EXCEPTED",
  "NO_OPERATIVE_CONFLICT",
] as const;
const CHECKLIST_ITEM_CODES = [
  "RECEIPT_ABSENT",
  "RECEIPT_STALE",
  "RECEIPT_LEGACY",
  "STANDING_ABSENT",
  "STANDING_MALFORMED",
  "EVIDENCE_ABSENT",
  "EVIDENCE_STALE",
] as const;
const CHECKLIST_FIELDS = ["label", "explanation", "example", "nextAction"] as const;

function dynamicKeys(): string[] {
  const keys: string[] = [];
  for (const state of STATE_VALUES) keys.push(`${PREFIX}state.${state}`);
  for (const code of CHECKLIST_ITEM_CODES) {
    for (const field of CHECKLIST_FIELDS) keys.push(`${PREFIX}checklist.items.${code}.${field}`);
  }
  // ScaleS3SettingToggle assigns these to errorKey and renders t(errorKey).
  keys.push(
    `${PREFIX}s3.setting.reasonInvalid`,
    `${PREFIX}s3.setting.forbidden`,
    `${PREFIX}s3.setting.saveFailed`,
  );
  return keys;
}

function resolve(dict: Record<string, unknown>, path: string): boolean {
  let cur: unknown = dict;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(seg in (cur as Record<string, unknown>))) {
      return false;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" && cur.length > 0;
}

describe("SCALE review i18n real-dictionary parity (GAP-121)", () => {
  const keys = new Set<string>();
  for (const file of COMPONENTS) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const k of callSiteKeys(source)) keys.add(k);
  }
  for (const k of dynamicKeys()) keys.add(k);

  it("finds the SCALE review call sites it guards", () => {
    expect(keys.size).toBeGreaterThanOrEqual(80);
  });

  it("resolves every referenced key in the real en dictionary", () => {
    const missing = [...keys].filter((k) => !resolve(en, k));
    expect(missing).toEqual([]);
  });

  it("resolves every referenced key in the real id dictionary", () => {
    const missing = [...keys].filter((k) => !resolve(id, k));
    expect(missing).toEqual([]);
  });

  it("no longer references the old flat workspace.scaleReview.* path", () => {
    for (const file of COMPONENTS) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/["'`]workspace\.scaleReview\./);
    }
  });
});
