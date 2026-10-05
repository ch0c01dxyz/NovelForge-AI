-- NF-WF-014: browse/search/genre discovery and reading progress.
--
-- Additive migration 1: `genres` on novels — the reader-facing discovery
-- taxonomy (text[]), author-set via the member genre route. Non-nullable
-- with an empty-array default; backfill is trivially empty (no existing
-- novel has genres). Private writing preferences stay in
-- NarrativeDnaProfile (never exposed to readers).
--
-- Additive migration 2: functional GIN indexes for tsvector search over
-- the PINNED public corpus (Invariant 3): to_tsvector('english', title)
-- on novels, to_tsvector('english', content) on chapter_versions. The
-- pinned-publication join (status = 'PUBLISHED' on the pinned
-- chapterVersionId) is a query-time predicate, not part of the index — a
-- functional index cannot span a join, and functional indexes are
-- auto-maintained so the index can never drift from the Publication truth
-- (no stored generated column, no duplication).
--
-- Re-runnability (GAP-030): every statement is idempotent (IF NOT EXISTS
-- / DO-block) so a partially-applied retry converges. Purely additive:
-- no existing row is rewritten; rollback = drop index + drop column
-- (genres are re-settable author metadata; the index is derived).
-- pg_trgm is intentionally NOT required: tsvector, plainto_tsquery,
-- ts_rank, ts_headline and GIN are core PostgreSQL (Q2).

-- The genre taxonomy column.
ALTER TABLE "novels" ADD COLUMN IF NOT EXISTS "genres" TEXT[] NOT NULL DEFAULT '{}';

-- Functional GIN indexes for published-only search. The index predicate
-- covers ALL rows (no partial index): visibility is enforced at query
-- time by the PUBLISHED-publication join, which the corpus cannot outrun.
CREATE INDEX IF NOT EXISTS "novels_title_ts_gin"
  ON "novels" USING gin (to_tsvector('english', "title"));

CREATE INDEX IF NOT EXISTS "chapter_versions_content_ts_gin"
  ON "chapter_versions" USING gin (to_tsvector('english', "content"));
