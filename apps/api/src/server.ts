/**
 * @novelforge/api — entrypoint.
 *
 * loadEnv() fails fast on invalid configuration (masked error, no secrets
 * in output). Bind after the app is ready; exit non-zero on any failure.
 */
import { loadEnv } from "@novelforge/config";
import { buildApp } from "./app.ts";

const env = loadEnv();
const app = await buildApp(env);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
