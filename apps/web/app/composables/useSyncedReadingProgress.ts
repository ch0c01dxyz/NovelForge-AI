/**
 * Synced reading progress (NF-WF-019D).
 *
 * Extends the 014 device-local progress (`useReadingProgress`) with
 * server-side sync for AUTHENTICATED users. Anonymous readers keep the
 * 014 device-local behavior unchanged — `useReadingProgress` is never
 * bypassed and makes zero progress-network calls in anonymous mode.
 *
 * Session detection: a single cached `GET /api/auth/session` probe per
 * page load. Anonymous users make only that probe (required to decide
 * the branch); the 014 device-local path then applies with no further
 * network.
 *
 * Merge semantics (contract §019D): on chapter-page load with a
 * session, fetch the server row and take `max(deviceLocal.updatedAt,
 * server.updatedAt)` as the effective position, then write the winner
 * back via the idempotent LWW PUT (ties keep the stored row —
 * deterministic). Offline writes queue in localStorage and sync on
 * reconnect via the same PUT. No conflict UI — the newer timestamp
 * always wins.
 *
 * `syncState` is honest: "synced" only when the server holds the
 * current position; "offline" when writes are queued; "anonymous"
 * when there is no session.
 */
import { ref } from "vue";
import { useApi, ApiError } from "./useApi";
import { useReadingProgress } from "./useReadingProgress";

export type ProgressSyncState = "anonymous" | "offline" | "local-only" | "synced";

export interface ServerProgress {
  novelId: string;
  chapterNumber: number;
  scrollRatio: number | null;
  updatedAt: string;
}

interface QueuedWrite {
  novelId: string;
  chapterNumber: number;
  scrollRatio: number | null;
  clientUpdatedAt: string;
  deviceId: string;
}

const QUEUE_KEY = "nf:progress-sync-queue:v1";
const DEVICE_KEY = "nf:progress-device-id:v1";
/** Debounce for scroll-driven PUTs (the 014 save cadence is reused). */
const SAVE_DEBOUNCE_MS = 2000;

function readQueue(): Record<string, QueuedWrite> {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
    const raw = globalThis.localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: Record<string, QueuedWrite> = {};
    for (const [novelId, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const e = entry as Partial<QueuedWrite>;
      if (
        e !== null &&
        typeof e === "object" &&
        typeof e.chapterNumber === "number" &&
        typeof e.clientUpdatedAt === "string"
      ) {
        out[novelId] = {
          novelId,
          chapterNumber: e.chapterNumber,
          scrollRatio: typeof e.scrollRatio === "number" ? e.scrollRatio : null,
          clientUpdatedAt: e.clientUpdatedAt,
          deviceId: typeof e.deviceId === "string" ? e.deviceId : "",
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeQueue(queue: Record<string, QueuedWrite>): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable — queued writes are best-effort */
  }
}

function getDeviceId(): string {
  try {
    if (typeof globalThis.localStorage === "undefined") return "";
    let id = globalThis.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `d-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      globalThis.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function useSyncedReadingProgress() {
  const { api } = useApi();
  const { getProgress } = useReadingProgress();
  const syncState = ref<ProgressSyncState>("anonymous");

  /** Cached session probe — one network call per page load, max. */
  let sessionProbe: Promise<boolean> | null = null;
  function hasSession(): Promise<boolean> {
    if (!sessionProbe) {
      sessionProbe = api<{ userId: string }>("/auth/session")
        .then(() => true)
        .catch(() => false);
    }
    return sessionProbe;
  }

  function isOnline(): boolean {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  async function putProgress(entry: QueuedWrite): Promise<ServerProgress | null> {
    try {
      const res = await api<{ progress: ServerProgress }>("/reader/progress", {
        method: "PUT",
        body: JSON.stringify({
          novelId: entry.novelId,
          chapterNumber: entry.chapterNumber,
          ...(entry.scrollRatio !== null ? { scrollRatio: entry.scrollRatio } : {}),
          clientUpdatedAt: entry.clientUpdatedAt,
          ...(entry.deviceId ? { deviceId: entry.deviceId } : {}),
        }),
      });
      return res.progress;
    } catch (e) {
      // 404: novel not engageable (or unpublished) — the row stays
      // local-only; device-local 014 progress is unaffected.
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
        return null;
      }
      throw e;
    }
  }

  function enqueue(entry: QueuedWrite): void {
    // Latest write per novel wins the queue (LWW makes this safe).
    const queue = readQueue();
    queue[entry.novelId] = entry;
    writeQueue(queue);
    syncState.value = "offline";
  }

  function dequeue(novelId: string): void {
    const queue = readQueue();
    if (novelId in queue) {
      delete queue[novelId];
      writeQueue(queue);
    }
  }

  /** Flush queued offline writes (on reconnect / page load). */
  async function flushQueue(): Promise<void> {
    if (!(await hasSession()) || !isOnline()) return;
    const queue = readQueue();
    for (const entry of Object.values(queue)) {
      try {
        const server = await putProgress(entry);
        if (server) {
          dequeue(entry.novelId);
          syncState.value = "synced";
        }
      } catch {
        // Still offline or transient failure — keep queued, stop here.
        syncState.value = "offline";
        break;
      }
    }
  }

  /**
   * Merge device-local 014 progress with the server row. Returns the
   * winning position (or null when neither exists) and writes the
   * winner back (idempotent PUT). Never throws for sync failures —
   * the 014 device-local behavior is the fallback.
   */
  async function loadSyncedProgress(
    slug: string,
    novelId: string,
  ): Promise<{ chapterNumber: number; scrollRatio: number | null } | null> {
    if (!(await hasSession())) {
      syncState.value = "anonymous";
      return null;
    }
    await flushQueue();
    if (!isOnline()) {
      syncState.value = "offline";
      return null;
    }
    let server: ServerProgress | null = null;
    try {
      const res = await api<{ progress: ServerProgress | null }>(
        `/reader/progress?novelId=${encodeURIComponent(novelId)}`,
      );
      server = res.progress;
    } catch {
      syncState.value = "local-only";
      return null;
    }

    const local = getProgress(slug);
    // Winner = max(updatedAt); ties keep the server row (deterministic,
    // matching the PUT's tie rule).
    const serverTime = server ? Date.parse(server.updatedAt) : NaN;
    const localTime = local ? Date.parse(local.updatedAt) : NaN;
    const serverWins =
      !Number.isNaN(serverTime) &&
      (Number.isNaN(localTime) || serverTime >= localTime);

    if (serverWins && server) {
      syncState.value = "synced";
      return { chapterNumber: server.chapterNumber, scrollRatio: server.scrollRatio };
    }
    if (local && !Number.isNaN(localTime)) {
      // Write the local winner back (idempotent PUT — newer timestamp
      // overwrites; equal timestamp is a no-op returning the row).
      const entry: QueuedWrite = {
        novelId,
        chapterNumber: local.chapterNumber,
        scrollRatio: null,
        clientUpdatedAt: local.updatedAt,
        deviceId: getDeviceId(),
      };
      try {
        await putProgress(entry);
        syncState.value = "synced";
      } catch {
        enqueue(entry);
      }
      return { chapterNumber: local.chapterNumber, scrollRatio: null };
    }
    syncState.value = server ? "synced" : "local-only";
    return server
      ? { chapterNumber: server.chapterNumber, scrollRatio: server.scrollRatio }
      : null;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: QueuedWrite | null = null;

  function flushPending(): void {
    if (!pending) return;
    const entry = pending;
    pending = null;
    void (async () => {
      if (!isOnline()) {
        enqueue(entry);
        return;
      }
      try {
        const server = await putProgress(entry);
        if (server) syncState.value = "synced";
        else syncState.value = "local-only";
      } catch {
        enqueue(entry);
      }
    })();
  }

  /**
   * Save progress (debounced). Anonymous callers are ignored — the
   * 014 device-local markRead is the caller's responsibility and is
   * never bypassed.
   */
  function saveProgress(
    novelId: string,
    chapterNumber: number,
    scrollRatio?: number,
  ): void {
    void hasSession().then((ok) => {
      if (!ok) return;
      pending = {
        novelId,
        chapterNumber,
        scrollRatio:
          typeof scrollRatio === "number" &&
          Number.isFinite(scrollRatio) &&
          scrollRatio >= 0 &&
          scrollRatio <= 1
            ? scrollRatio
            : null,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: getDeviceId(),
      };
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushPending, SAVE_DEBOUNCE_MS);
    });
  }

  /** Clear the synced position server-side (idempotent). */
  async function clearSyncedProgress(novelId: string): Promise<void> {
    if (!(await hasSession())) return;
    try {
      await api(`/reader/progress/${encodeURIComponent(novelId)}`, {
        method: "DELETE",
      });
    } catch {
      /* best-effort — the local 014 entry is the caller's own */
    }
  }

  // Reconnect: flush the offline queue.
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void flushQueue();
    });
  }

  return {
    syncState,
    hasSession,
    loadSyncedProgress,
    saveProgress,
    clearSyncedProgress,
    flushQueue,
  };
}
