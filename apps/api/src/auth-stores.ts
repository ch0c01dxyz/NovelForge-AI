/**
 * Composition layer (ADR-0002 §7): Prisma-backed implementations of the
 * auth store interfaces. This is the only place @novelforge/auth meets
 * @novelforge/database — domain code stays ORM-free (ADR-0001).
 */
import type { NovelForgeDb } from "@novelforge/database";
import type { SessionStore, UserStore } from "@novelforge/auth";

export function prismaUserStore(db: NovelForgeDb): UserStore {
  return {
    findByEmail(email) {
      return db.user.findUnique({ where: { email } });
    },
    findById(id) {
      return db.user.findUnique({ where: { id } });
    },
    create({ email, passwordHash, displayName }) {
      return db.user.create({ data: { email, passwordHash, displayName } });
    },
  };
}

export function prismaSessionStore(db: NovelForgeDb): SessionStore {
  return {
    findByTokenHash(tokenHash) {
      return db.session.findUnique({ where: { tokenHash } });
    },
    async create({ tokenHash, userId, expiresAt }) {
      return db.session.create({ data: { tokenHash, userId, expiresAt } });
    },
    async revoke(id) {
      await db.session.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    async extend(id, expiresAt) {
      await db.session.update({ where: { id }, data: { expiresAt } });
    },
  };
}
