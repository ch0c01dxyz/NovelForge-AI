-- Platform-level administration (ADR-0005).
--
-- Gateway and model-registry administration is platform-wide, while
-- MembershipRole is per-workspace. Reusing a workspace role would let any
-- user who creates a workspace manage global LLM gateway credentials, so
-- platform administration gets its own role on users.

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "platform_role" "PlatformRole";
