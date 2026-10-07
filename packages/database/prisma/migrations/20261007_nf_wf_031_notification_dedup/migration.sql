-- NF-WF-031 (GAP-096): at-most-once delivery per recipient per
-- NEW_CHAPTER event — the dedup prerequisite for bounded retry.
--
-- Additive-only: one DELETE (dedupe of pre-existing duplicates, explicit
-- not silent) + one partial unique index. No existing table is altered;
-- no column is added; no data is rewritten beyond the dedupe.
--
-- Why a partial index: only NEW_CHAPTER carries chapter identity
-- (user_id, novel_id, chapter_number). COMMENT_REPLY/MODERATION_NOTICE
-- carry no chapter identity and are unaffected.
--
-- Chapter-identity precedent (019A): the identity is (user_id, type,
-- novel_id, chapter_number) — a republication of the same chapter
-- number does not generate a second notification.
--
-- Re-runnability (GAP-030): IF NOT EXISTS on the index; the DELETE is
-- naturally idempotent (second run finds no duplicates).
--
-- Rollback: DROP INDEX IF EXISTS "notifications_new_chapter_dedup_idx"
-- — loses dedup enforcement; existing rows untouched. Rollback does
-- not restore duplicate rows (none exist post-migration).

-- Dedupe pre-existing duplicates: keep the earliest row per
-- (user_id, type, novel_id, chapter_number) for NEW_CHAPTER.
-- Notifications are non-canonical social data (never story truth), so
-- deduping is safe — but it is explicit here, not silent.
DELETE FROM "notifications" n
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "user_id", "type", "novel_id", "chapter_number"
    ORDER BY "created_at" ASC, "id" ASC
  ) AS rn
  FROM "notifications"
  WHERE "type" = 'NEW_CHAPTER'
) d
WHERE n."id" = d."id" AND d."rn" > 1;

-- At-most-once per recipient per NEW_CHAPTER event. Partial: other
-- notification types are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_new_chapter_dedup_idx"
  ON "notifications" ("user_id", "type", "novel_id", "chapter_number")
  WHERE "type" = 'NEW_CHAPTER';
