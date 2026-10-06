-- NF-WF-019B: reader comments + moderation (additive).
--
-- New tables: `comments` (chapter-scoped threads, depth <= 1, states
-- VISIBLE/HIDDEN/DELETED) and `comment_reports` (dedup-keyed per
-- (comment, reporter) with a pinned reason enum). New counter column
-- `chapters.comment_count` counting VISIBLE comments only, maintained
-- transactionally by the comment write path.
--
-- Coordination with the 019A migration block: the frozen 019 contract
-- pins `Chapter.commentCount` in 019A's migration contents AND in 019B's
-- acceptance. Whichever migration lands first creates the column; the
-- other converges via `ADD COLUMN IF NOT EXISTS`. No backfill needed
-- (0 is correct — no comments exist).
--
-- Re-runnability (GAP-030): every statement is idempotent (IF NOT
-- EXISTS / DO-block for CREATE TYPE — PostgreSQL has no
-- `CREATE TYPE IF NOT EXISTS`) so a partially-applied retry converges.
-- Purely additive: no existing row is rewritten; rollback = drop
-- tables + drop column (engagement history is non-canonical data).

-- Comment moderation states.
DO $$ BEGIN
  CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Pinned report reasons (Invariant 5).
DO $$ BEGIN
  CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'SPOILER', 'OFF_TOPIC', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- VISIBLE-comment counter on the current chapter row (see coordination
-- note above).
ALTER TABLE "chapters"
  ADD COLUMN IF NOT EXISTS "comment_count" INTEGER NOT NULL DEFAULT 0;

-- Comments: plain-text bodies, chapter identity = (novel_id,
-- chapter_number) so threads survive republication; parent_id gives the
-- single reply level (NULL = top-level).
CREATE TABLE IF NOT EXISTS "comments" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID         NOT NULL,
  "novel_id"       UUID         NOT NULL,
  "chapter_number" INTEGER      NOT NULL,
  "parent_id"      UUID,
  "body"           TEXT         NOT NULL,
  "status"         "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comments_novel_id_fkey"
    FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "comments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- Reports: dedup-keyed per (comment, reporter) as the backstop.
CREATE TABLE IF NOT EXISTS "comment_reports" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "comment_id"  UUID         NOT NULL,
  "reporter_id" UUID         NOT NULL,
  "reason"      "ReportReason" NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comment_reports_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comment_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- List-query index: chapter thread ordered by createdAt, filtered by
-- status at query time (the pinned @@index in schema.prisma).
CREATE INDEX IF NOT EXISTS "comments_novel_id_chapter_number_status_created_at_idx"
  ON "comments" ("novel_id", "chapter_number", "status", "created_at");

-- Dedup backstop for reports (the pinned @@unique in schema.prisma).
DO $$ BEGIN
  ALTER TABLE "comment_reports"
    ADD CONSTRAINT "comment_reports_comment_id_reporter_id_key"
    UNIQUE ("comment_id", "reporter_id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
