/**
 * Same-origin proxy for the Fastify API.
 *
 * The session cookie is HttpOnly + SameSite=Lax (ADR-0002 §6). SameSite is
 * site-scoped, not origin-scoped; the API validates PUBLIC_ORIGIN for writes.
 * Proxying /api/** through Nitro avoids opening cross-origin CORS.
 * The proxy is transparent: it forwards
 * method, headers (incl. Cookie), raw body, status, and Set-Cookie.
 *
 * Target comes from NUXT_API_BASE (server-only runtime config), so the
 * API origin is configuration, never a code constant.
 */
export default defineEventHandler((event) => {
  const { apiBase } = useRuntimeConfig(event);
  const path = getRouterParam(event, "path") ?? "";
  const query = getRequestURL(event).search;
  return proxyRequest(event, `${apiBase}/api/${path}${query}`);
});
