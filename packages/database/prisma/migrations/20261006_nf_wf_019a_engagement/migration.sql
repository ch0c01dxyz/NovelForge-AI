-- NF-WF-019A: reader engagement tables + aggregate counter columns.
--
-- Additive migration: `bookmarks`, `novel_follows`, `author_follows`,
-- `chapter_likes` tables plus `follower_count` on novels and
-- `like_count` on chapters. `comment_count` on chapters is pinned here
-- too but is ALSO added by the 019B migration — the ADD COLUMN
-- IF NOT EXISTS makes both orders converge (shared additive block,
-- noted in schema.prisma).
--
-- Re-runnability (GAP-030): every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE
-- INDEX IF NOT EXISTS) so a partially-applied retry converges. Unique
-- constraints ride inside CREATE TABLE, so they are idempotent with
-- the table. Purely additive: no existing row is rewritten; rollback =
-- drop tables + drop columns (engagement rows are non-canonical reader
-- state; 0 is the correct backfill — no engagement exists).

-- The engagement tables. All relations onDelete: Cascade (engagement
-- rows die with their user, novel, or followed author). Dedup keys are
-- the unique constraints (Invariant 3): bookmark (user_id, novel_id);
-- novel-follow (user_id, novel_id); author-follow (user_id, author_id);
-- like (user_id, novel_id, chapter_number).
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bookmarks_user_id_novel_id_key" UNIQUE ("user_id", "novel_id")
);

CREATE TABLE IF NOT EXISTS "novel_follows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "novel_follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "novel_follows_user_id_novel_id_key" UNIQUE ("user_id", "novel_id")
);

CREATE TABLE IF NOT EXISTS "author_follows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "author_follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "author_follows_user_id_author_id_key" UNIQUE ("user_id", "author_id")
);

CREATE TABLE IF NOT EXISTS "chapter_likes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "chapter_number" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chapter_likes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chapter_likes_user_id_novel_id_chapter_number_key" UNIQUE ("user_id", "novel_id", "chapter_number")
);

-- Reader-owned list indexes (cursor pagination by created_at).
CREATE INDEX IF NOT EXISTS "bookmarks_user_id_created_at_idx"
  ON "bookmarks" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "novel_follows_user_id_created_at_idx"
  ON "novel_follows" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "author_follows_user_id_created_at_idx"
  ON "author_follows" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "chapter_likes_user_id_created_at_idx"
  ON "chapter_likes" ("user_id", "created_at");

-- Aggregate counters, maintained transactionally with the engagement
-- writes (INSERT ... ON CONFLICT DO NOTHING + conditional UPDATE;
-- decrements GREATEST(n-1, 0)). No counter column on User for author
-- follows — that count is an aggregate query (Invariant 4).
ALTER TABLE "novels" ADD COLUMN IF NOT EXISTS "follower_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "like_count" INTEGER NOT NULL DEFAULT 0;
-- Shared with the 019B migration block (VISIBLE-comment counter).
ALTER TABLE "chapters" ADD COLUMN IF NOT EXISTS "comment_count" INTEGER NOT NULL DEFAULT 0;
