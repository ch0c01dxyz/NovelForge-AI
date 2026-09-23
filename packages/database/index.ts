/**
 * @novelforge/database — data-access boundary.
 *
 * The Prisma client is created here and only here; application services
 * consume `NovelForgeDb` (the thin interface below) so the ORM does not
 * leak into domain logic (ADR-0001 module boundaries, START-HERE stack
 * note). Story-domain repositories are added by later phases.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export type NovelForgeDb = PrismaClient;

/** Create a Prisma client bound to the given connection URL. */
export function createDb(databaseUrl: string): NovelForgeDb {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export { PrismaClient } from "./generated/prisma/client.ts";
export * from "./generated/prisma/enums.ts";
export type { InputJsonValue } from "./generated/prisma/internal/prismaNamespace.ts";
