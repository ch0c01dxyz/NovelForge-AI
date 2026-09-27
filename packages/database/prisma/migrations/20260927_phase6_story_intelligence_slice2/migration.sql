-- CreateEnum
CREATE TYPE "ThreadKind" AS ENUM ('MYSTERY', 'CONFLICT', 'QUESTION', 'OBJECTIVE', 'SUBPLOT');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('ACTIVE', 'DORMANT', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PromiseStatus" AS ENUM ('SETUP', 'DEVELOPING', 'READY_FOR_PAYOFF', 'PAID_OFF', 'ABANDONED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "CausalConfidence" AS ENUM ('EXPLICIT', 'INFERRED', 'SPECULATIVE');

-- CreateTable
CREATE TABLE "story_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "chapter_id" UUID,
    "available_from_chapter" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "available_from_chapter" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "kind" "ThreadKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "importance" INTEGER NOT NULL,
    "introduced_at_chapter" INTEGER,
    "resolved_at_chapter" INTEGER,
    "payoff_intent" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_thread_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_thread_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_promises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PromiseStatus" NOT NULL DEFAULT 'SETUP',
    "importance" INTEGER NOT NULL,
    "introduced_at_chapter" INTEGER,
    "payoff_at_chapter" INTEGER,
    "payoff_intent" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_promises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causal_edges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "cause_event_id" UUID NOT NULL,
    "effect_event_id" UUID NOT NULL,
    "confidence" "CausalConfidence" NOT NULL,
    "approved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "causal_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_events_novel_id_idx" ON "story_events"("novel_id");

-- CreateIndex
CREATE INDEX "story_events_chapter_id_idx" ON "story_events"("chapter_id");

-- CreateIndex
CREATE INDEX "story_events_available_from_chapter_idx" ON "story_events"("available_from_chapter");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_events_novel_id_order_key" ON "timeline_events"("novel_id", "order");

-- CreateIndex
CREATE INDEX "story_threads_novel_id_status_idx" ON "story_threads"("novel_id", "status");

-- CreateIndex
CREATE INDEX "story_threads_novel_id_kind_idx" ON "story_threads"("novel_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "story_thread_events_thread_id_event_id_key" ON "story_thread_events"("thread_id", "event_id");

-- CreateIndex
CREATE INDEX "story_thread_events_event_id_idx" ON "story_thread_events"("event_id");

-- CreateIndex
CREATE INDEX "story_promises_novel_id_status_idx" ON "story_promises"("novel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "causal_edges_novel_id_cause_event_id_effect_event_id_key" ON "causal_edges"("novel_id", "cause_event_id", "effect_event_id");

-- CreateIndex
CREATE INDEX "causal_edges_effect_event_id_idx" ON "causal_edges"("effect_event_id");

-- AddForeignKey
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_threads" ADD CONSTRAINT "story_threads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_thread_events" ADD CONSTRAINT "story_thread_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "story_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_thread_events" ADD CONSTRAINT "story_thread_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "story_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_thread_events" ADD CONSTRAINT "story_thread_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_promises" ADD CONSTRAINT "story_promises_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_promises" ADD CONSTRAINT "story_promises_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_promises" ADD CONSTRAINT "story_promises_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_cause_event_id_fkey" FOREIGN KEY ("cause_event_id") REFERENCES "story_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_effect_event_id_fkey" FOREIGN KEY ("effect_event_id") REFERENCES "story_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 6 slice 2 story-intelligence invariants that prisma migrate diff
-- cannot express:

-- 1. timeline_events_order_strict — two events in one timeline slot assert
--    an order the data cannot support (the write-side twin of
--    isChronological()'s tie refusal in packages/story-intelligence).
--    Expressed as a table-level unique pair in the schema above; this
--    comment documents the rule for reviewers. No statement needed.

-- 2. debt importance is an INPUT, not a score — narrativeDebt() derives
--    importance × (readyForPayoff?2:1) × (10+ageChapters) at read time
--    and must never be persisted. A stored score would go stale the
--    moment any input changes. CHECKs below bound the inputs.

ALTER TABLE "story_threads"
  ADD CONSTRAINT "StoryThread_importance_1_to_5" CHECK ("importance" >= 1 AND "importance" <= 5);

ALTER TABLE "story_promises"
  ADD CONSTRAINT "StoryPromise_importance_1_to_5" CHECK ("importance" >= 1 AND "importance" <= 5);

-- 3. thread resolution is a coherent pair: DORMANT/ACTIVE threads have no
--    resolution chapter; a RESOLVED thread names the chapter where the
--    reader saw it close. Without this, an "open" thread with a
--    resolved_at_chapter reports debt it no longer owes.
ALTER TABLE "story_threads"
  ADD CONSTRAINT "StoryThread_resolution_pair" CHECK (
    ("status" IN ('ACTIVE', 'DORMANT') AND "resolved_at_chapter" IS NULL)
    OR
    ("status" = 'RESOLVED' AND "resolved_at_chapter" IS NOT NULL)
  );

-- 4. promise payoff is a coherent pair (mirror of thread resolution).
ALTER TABLE "story_promises"
  ADD CONSTRAINT "StoryPromise_payoff_pair" CHECK (
    ("status" <> 'PAID_OFF' AND "payoff_at_chapter" IS NULL)
    OR
    ("status" = 'PAID_OFF' AND "payoff_at_chapter" IS NOT NULL)
  );

-- 5. A self-edge asserts that an event caused itself.
ALTER TABLE "causal_edges"
  ADD CONSTRAINT "CausalEdge_not_self" CHECK ("cause_event_id" <> "effect_event_id");

-- 6. AI-derived causal edges are candidate canon (CLAUDE.md §2.13): an
--    INFERRED or SPECULATIVE edge carries the author who approved it; an
--    EXPLICIT edge is grounded in prose and needs no approver. Without
--    this, unapproved AI causal claims silently become story truth.
ALTER TABLE "causal_edges"
  ADD CONSTRAINT "CausalEdge_approval_matches_confidence" CHECK (
    ("confidence" = 'EXPLICIT' AND "approved_by_id" IS NULL)
    OR
    ("confidence" IN ('INFERRED', 'SPECULATIVE') AND "approved_by_id" IS NOT NULL)
  );
