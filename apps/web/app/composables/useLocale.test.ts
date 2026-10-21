import { describe, expect, it, beforeEach, vi } from "vitest";
import { ref, type Ref } from "vue";

/**
 * GAP-123 regression suite for the SSR-safe locale mechanism.
 *
 * The vitest+jsdom harness has no Nuxt runtime: useCookie/useState/
 * onNuxtReady are stubbed per the amended contract. useState is stubbed
 * as a KEYED map (the locale state and the once-flag are distinct keys;
 * freshLoad() clears the map to simulate a new page load). onNuxtReady
 * QUEUES its callback — tests flush explicitly with flushReady() and
 * assert the PRE-flush state first, proving that legacy adoption is
 * deferred until after hydration and runs once per load. The client
 * guard is `typeof window !== "undefined"` (true in jsdom;
 * import.meta.client is NOT defined under plain vitest). localStorage
 * is real jsdom storage.
 */

type Locale = "en" | "id";

// Harness-shared, re-created per test (the Nuxt app scope analog).
const stateMap = new Map<string, Ref<unknown>>();
let readyQueue: Array<() => void> = [];
let cookieRef: Ref<string | null> = ref(null);

const onNuxtReadyMock = vi.fn((cb: () => void) => {
  readyQueue.push(cb);
});

vi.stubGlobal(
  "useState",
  vi.fn((key: string, init?: () => unknown) => {
    if (!stateMap.has(key)) stateMap.set(key, ref(init ? init() : undefined));
    return stateMap.get(key)!;
  }),
);
vi.stubGlobal("useCookie", vi.fn(() => cookieRef));
vi.stubGlobal("onNuxtReady", onNuxtReadyMock);

import { useLocale } from "./useLocale";

function seedCookie(value: string | null) {
  cookieRef = ref(value);
}

function localeState(): Ref<Locale> {
  return stateMap.get("locale") as Ref<Locale>;
}

/** Drain the queued onNuxtReady callbacks (simulated post-hydration). */
function flushReady() {
  const queue = readyQueue;
  readyQueue = [];
  for (const cb of queue) cb();
}

/** Simulate a fresh page load: new app state, keep cookie + storage. */
function freshLoad() {
  stateMap.clear();
  readyQueue = [];
}

describe("useLocale (SSR-safe, GAP-123)", () => {
  beforeEach(() => {
    vi.resetModules();
    // Explicit: the once-per-load call-count proof must not depend on
    // vi.resetModules() also clearing vi.fn history (a side effect we
    // verified empirically on vitest 5.0.3 but do not rely on).
    onNuxtReadyMock.mockClear();
    localStorage.clear();
    readyQueue = [];
    seedCookie(null);
    freshLoad();
  });

  it("resolves English strings", () => {
    const { t } = useLocale();
    expect(t("generation.title")).toBe("Generation");
  });

  it("resolves Indonesian strings", () => {
    const { setLocale, t } = useLocale();
    setLocale("id");
    expect(t("generation.title")).toBe("Generasi");
  });

  it("falls back to English for missing id keys", () => {
    const { setLocale, t } = useLocale();
    setLocale("id");
    // Intentionally missing in id: falls back to en.
    expect(t("review.showFullHash")).toBe("Show full reference");
  });

  it("interpolates params", () => {
    const { t } = useLocale();
    expect(t("review.draftWon", { n: 2, total: 3 })).toBe("Draft 2 of 3");
  });

  it("returns the key for a fully missing key", () => {
    const { t } = useLocale();
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  // --- GAP-123 SSR-safety regressions ---

  it("initializes from a valid cookie (hydration-agreeing SSR value)", () => {
    seedCookie("id");
    const { locale, t } = useLocale();
    expect(locale.value).toBe("id");
    expect(t("generation.title")).toBe("Generasi");
  });

  it("treats an invalid cookie value as en", () => {
    seedCookie("xx");
    const { locale, t } = useLocale();
    expect(locale.value).toBe("en");
    expect(t("generation.title")).toBe("Generation");
  });

  it("migrates a localStorage-only id preference post-hydration (cookie absent)", () => {
    localStorage.setItem("novelforge-locale", "id");
    const { locale } = useLocale();
    // Deferred: pre-flush the hydration state is untouched by storage.
    expect(locale.value).toBe("en");
    expect(cookieRef.value).toBeNull();
    flushReady();
    expect(cookieRef.value).toBe("id"); // migration wrote the cookie
    expect(locale.value).toBe("id"); // post-hydration adoption
  });

  it("completes migration when the legacy value equals the locale (legacy en)", () => {
    localStorage.setItem("novelforge-locale", "en");
    const { locale } = useLocale();
    // Pre-flush: en hydration state, no cookie.
    expect(locale.value).toBe("en");
    expect(cookieRef.value).toBeNull();
    flushReady();
    expect(locale.value).toBe("en"); // unchanged…
    expect(cookieRef.value).toBe("en"); // …but migration COMPLETES (cookie written)
    expect(localStorage.getItem("novelforge-locale")).toBe("en"); // not overwritten
  });

  it("cookie wins over divergent localStorage; localStorage not overwritten", () => {
    localStorage.setItem("novelforge-locale", "en");
    seedCookie("id");
    const readSpy = vi.spyOn(Storage.prototype, "getItem");
    try {
      const { locale } = useLocale();
      flushReady(); // cookie present: the callback returns before reading storage
      const legacyReads = readSpy.mock.calls.filter(
        ([key]) => key === "novelforge-locale",
      ).length;
      expect(legacyReads).toBe(0); // zero legacy reads when the cookie is present
      expect(locale.value).toBe("id");
      expect(cookieRef.value).toBe("id");
      expect(localStorage.getItem("novelforge-locale")).toBe("en");
    } finally {
      readSpy.mockRestore();
    }
  });

  it("migration does not run when the cookie already matches localStorage", () => {
    localStorage.setItem("novelforge-locale", "id");
    seedCookie("id");
    const { locale } = useLocale();
    flushReady();
    expect(locale.value).toBe("id");
    expect(localStorage.getItem("novelforge-locale")).toBe("id");
  });

  it("ignores invalid legacy localStorage values", () => {
    localStorage.setItem("novelforge-locale", "fr");
    const { locale } = useLocale();
    flushReady();
    expect(locale.value).toBe("en");
    expect(cookieRef.value).toBeNull();
  });

  it("survives throwing localStorage access", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("denied");
      });
    try {
      const { locale, setLocale } = useLocale();
      flushReady(); // migration read throws → swallowed → no adoption, no crash
      expect(locale.value).toBe("en");
      expect(cookieRef.value).toBeNull();
      setLocale("id");
      expect(locale.value).toBe("id"); // session still works
    } finally {
      spy.mockRestore();
    }
  });

  it("survives unavailable localStorage", () => {
    const holder = globalThis as { localStorage?: Storage };
    const original = holder.localStorage;
    delete holder.localStorage; // simulate undefined storage (hardened browsers)
    try {
      const { locale, setLocale } = useLocale();
      flushReady(); // no storage → no migration, no throw
      expect(locale.value).toBe("en");
      expect(cookieRef.value).toBeNull();
      setLocale("id");
      expect(locale.value).toBe("id");
    } finally {
      holder.localStorage = original;
    }
  });

  it("setLocale writes state, cookie and localStorage", () => {
    const { setLocale } = useLocale();
    setLocale("id");
    expect(localeState().value).toBe("id");
    expect(cookieRef.value).toBe("id");
    expect(localStorage.getItem("novelforge-locale")).toBe("id");
  });

  it("setLocale rejects unsupported values", () => {
    const { setLocale, locale } = useLocale();
    // @ts-expect-error probing the runtime guard
    setLocale("fr");
    expect(locale.value).toBe("en");
  });

  it("request isolation: different simulated requests resolve different locales", () => {
    seedCookie("id");
    const a = useLocale();
    expect(a.locale.value).toBe("id");
    flushReady();
    // Second "request": new app state, different cookie header.
    seedCookie(null);
    freshLoad();
    const b = useLocale();
    expect(b.locale.value).toBe("en");
    expect(a.locale.value).toBe("id"); // first request unaffected
  });

  it("registers exactly one migration callback and one storage read per load (call counts)", () => {
    localStorage.setItem("novelforge-locale", "id");
    const readSpy = vi.spyOn(Storage.prototype, "getItem");
    try {
      useLocale();
      useLocale(); // second consumer in the same load: registers nothing
      expect(onNuxtReadyMock).toHaveBeenCalledTimes(1);
      flushReady();
      const legacyReads = readSpy.mock.calls.filter(
        ([key]) => key === "novelforge-locale",
      ).length;
      expect(legacyReads).toBe(1); // one legacy read per cookie-less load
      expect(localeState().value).toBe("id");
      expect(cookieRef.value).toBe("id");
    } finally {
      readSpy.mockRestore();
    }
    // A fresh load registers again: once per LOAD, not once per module.
    freshLoad();
    seedCookie(null);
    useLocale();
    expect(onNuxtReadyMock).toHaveBeenCalledTimes(2);
  });
});
