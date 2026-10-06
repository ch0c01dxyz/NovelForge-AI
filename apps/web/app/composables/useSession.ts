/**
 * Session probe (NF-WF-019A): determines whether the reader has a
 * session, so engagement affordances render only for signed-in readers
 * (Invariant 1 — UI gating is progressive enhancement; the server
 * enforces with 401 on every /api/reader/* route).
 */
import { useApi, ApiError } from "./useApi";

export function useSession() {
  const { api } = useApi();
  const userId = ref<string | null>(null);
  const checked = ref(false);

  async function checkSession(): Promise<void> {
    try {
      const session = await api<{ userId: string }>("/auth/session");
      // Validate the shape: a non-session payload (or a 200 with an
      // unexpected body) must not flip the UI into signed-in mode.
      userId.value =
        session && typeof session.userId === "string" ? session.userId : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        userId.value = null;
      } else {
        throw e;
      }
    } finally {
      checked.value = true;
    }
  }

  const signedIn = computed(() => userId.value !== null);

  return { userId, signedIn, checked, checkSession };
}
