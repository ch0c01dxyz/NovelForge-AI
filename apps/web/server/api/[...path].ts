/**
 * Same-origin proxy for the Fastify API.
 *
 * The session cookie is HttpOnly + SameSite=Lax (ADR-0002 §6), so the
 * browser only sends it on same-origin requests. Proxying /api/** through
 * Nitro keeps that invariant in dev and in production instead of opening
 * the API to cross-origin CORS. The proxy is transparent: it forwards
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
