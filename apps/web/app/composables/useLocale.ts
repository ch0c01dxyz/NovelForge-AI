import { ref, readonly } from "vue";
/**
 * Locale mechanism for the writer workspace (NF-WF-007, Invariant 9).
 *
 * `en` and `id` resources with English fallback per key. Machine error
 * codes stay English and are mapped to localized messages by callers.
 * The selection persists in localStorage; default is `en`.
 */
import { en } from "../i18n/en";
import { id } from "../i18n/id";

export type SupportedLocale = "en" | "id";

const STORAGE_KEY = "novelforge-locale";

type Dict = Record<string, unknown>;

function getPath(dict: Dict, path: string): unknown {
  let cur: unknown = dict;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[part];
  }
  return cur;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    params[k] !== undefined ? String(params[k]) : m,
  );
}

const resources: Record<SupportedLocale, Dict> = {
  en: en as unknown as Dict,
  id: id as unknown as Dict,
};

const locale = ref<SupportedLocale>("en");

if (typeof globalThis.localStorage !== "undefined") {
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "id") locale.value = stored;
}

export function useLocale() {
  function t(path: string, params?: Record<string, string | number>): string {
    const primary = getPath(resources[locale.value]!, path);
    const fallback = getPath(resources.en, path);
    const value = typeof primary === "string" ? primary : fallback;
    if (typeof value !== "string") return path; // missing key: show the key
    return interpolate(value, params);
  }

  function setLocale(next: SupportedLocale) {
    locale.value = next;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — locale still applies for this session */
    }
  }

  return { locale: readonly(locale), t, setLocale };
}
