/**
 * Thin fetch wrapper for the same-origin API (proxied by server/api).
 *
 * Parses the {error: CODE} envelope the API returns and surfaces it as a
 * typed ApiError so callers can branch on status (401 -> sign in, 409 ->
 * reload, 403 -> permission) instead of guessing from a string.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`${status} ${code}`);
    this.name = "ApiError";
  }
}

export function useApi() {
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      ...init,
    });
    if (!res.ok) {
      let code = String(res.status);
      try {
        code = ((await res.json()) as { error?: string }).error ?? code;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(code, res.status);
    }
    // 204 / empty body is valid for some endpoints.
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  return { api };
}
