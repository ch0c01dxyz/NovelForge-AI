-- NF-WF-019C: reader notifications + privacy (in-app inbox, preferences).
--
-- Additive-only: one new enum + two new tables. No existing table is
-- altered; no data is rewritten; backfill is empty (no notifications
-- exist). Rollback = drop the two tables + drop the type. That DESTROYS
-- notification history — documented here, not silently: notification rows
-- are non-canonical social data (never story truth), so dropping them
-- cannot corrupt canon, manuscripts, or publications.
--
-- Re-runnability (GAP-030): every statement is idempotent (DO-block for
-- the enum, IF NOT EXISTS for tables/indexes) so a partially-applied
-- retry converges.
--
-- Pinned types (Klein Q5, 2026-10-06): NEW_CHAPTER, COMMENT_REPLY,
-- MODERATION_NOTICE — all default ON; an absent preference row means ON.

-- The pinned NotificationType enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('NEW_CHAPTER', 'COMMENT_REPLY', 'MODERATION_NOTICE');
  END IF;
END
$$;

-- One row per delivered in-app notification. Every row traces to a real
-- event (Invariant 7 — never fabricated). Rows carry IDs + type only;
-- display names resolve at read time from "users"; no email, no
-- credential material (Invariant 4).
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "NotificationType" NOT NULL,
  "novel_id" UUID REFERENCES "novels"("id") ON DELETE CASCADE,
  "chapter_number" INTEGER,
  "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbox reads are always (user_id) ordered by recency with the unread
-- filter on read_at — the composite index covers both.
CREATE INDEX IF NOT EXISTS "notifications_user_read_created_idx"
  ON "notifications" ("user_id", "read_at", "created_at");

-- Per-user per-type opt-out. Absent row = pinned default ON (Q5).
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "NotificationType" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  CONSTRAINT "notification_preferences_user_id_type_key"
    UNIQUE ("user_id", "type")
);
