import { readonly, type Ref } from "vue";
/**
 * Locale mechanism for the writer workspace (NF-WF-007, Invariant 9).
 *
 * `en` and `id` resources with English fallback per key. Machine error
 * codes stay English and are mapped to localized messages by callers.
 * Default is `en`.
 *
 * SSR-safe (GAP-123): the locale lives in Nuxt `useState` — per-request
 * on the server (no cross-request leakage), payload-hydrated on the
 * client — so server HTML and the hydration render always agree. The
 * selected locale is persisted in the `nf-locale` cookie, which the
 * server reads for the initial render. Existing users whose preference
 * lives only in the legacy `novelforge-locale` localStorage key are
 * migrated once per page load, AFTER hydration (onNuxtReady): cookie
 * wins when present; localStorage is consulted only when the cookie is
 * absent, and outside `setLocale` nothing overwrites localStorage.
 */
import { en } from "../i18n/en";
import { id } from "../i18n/id";

export type SupportedLocale = "en" | "id";

const STORAGE_KEY = "novelforge-locale";
const COOKIE_KEY = "nf-locale";

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

function isSupported(value: unknown): value is SupportedLocale {
  return value === "en" || value === "id";
}

function readLegacyLocale(): SupportedLocale | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isSupported(stored) ? stored : null;
  } catch {
    return null; // storage unavailable/throwing — fall back to en
  }
}

const resources: Record<SupportedLocale, Dict> = {
  en: en as unknown as Dict,
  id: id as unknown as Dict,
};

export function useLocale() {
  const cookie = useCookie<SupportedLocale | null>(COOKIE_KEY, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    default: () => null,
  });

  const state = useState<SupportedLocale>("locale", () =>
    isSupported(cookie.value) ? cookie.value : "en",
  );

  // One-time localStorage migration, initialized once per client app/load:
  // the first consumer flips a request/app-scoped once-flag and registers
  // the single post-hydration callback; later consumers register nothing.
  // Adoption stays post-hydration only — a pre-mount state change would
  // land in the hydration render and recreate the GAP-123 mismatch.
  // Cookie wins; localStorage only fills an absent cookie and is never
  // overwritten outside setLocale. Both supported legacy values complete
  // the migration: the cookie is written even when the legacy value
  // already equals the current locale (an early return there would leave
  // legacy "en" users unmigrated and re-arm the migration every load).
  // `typeof window` (not import.meta.client, which only Nuxt's build
  // defines) so the same source works in SSR, the browser and the
  // vitest jsdom harness alike.
  if (typeof window !== "undefined") {
    const migrated = useState<boolean>("locale-migrated", () => false);
    if (!migrated.value) {
      migrated.value = true;
      onNuxtReady(() => {
        if (cookie.value !== null) return;
        const legacy = readLegacyLocale();
        if (legacy === null) return;
        if (legacy !== state.value) state.value = legacy;
        try {
          cookie.value = legacy;
        } catch {
          /* cookie write failed — session-scoped locale only */
        }
      });
    }
  }

  function t(path: string, params?: Record<string, string | number>): string {
    const primary = getPath(resources[state.value]!, path);
    const fallback = getPath(resources.en, path);
    const value = typeof primary === "string" ? primary : fallback;
    if (typeof value !== "string") return path; // missing key: show the key
    return interpolate(value, params);
  }

  function setLocale(next: SupportedLocale) {
    if (!isSupported(next)) return;
    state.value = next;
    try {
      cookie.value = next;
    } catch {
      /* cookie unavailable — locale still applies for this session */
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — locale still applies for this session */
    }
  }

  return {
    locale: readonly(state) as Readonly<Ref<SupportedLocale>>,
    t,
    setLocale,
  };
}
