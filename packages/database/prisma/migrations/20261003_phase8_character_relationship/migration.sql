-- CreateEnum
CREATE TYPE "KnowledgeStance" AS ENUM ('KNOWN', 'SUSPECTED', 'BELIEVED_FALSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('REMEMBERED', 'DERIVED', 'LEARNED_IN_WORLD', 'EXPERIMENTED', 'TAUGHT', 'RESEARCHED');

-- CreateEnum
CREATE TYPE "ArcStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RelationshipStanceKind" AS ENUM ('ALLY', 'FRIENDLY', 'NEUTRAL', 'WARY', 'HOSTILE', 'ENEMY');

-- CreateEnum
CREATE TYPE "BondStructure" AS ENUM ('MONOGAMY', 'POLYGAMY', 'POLYAMORY', 'HAREM', 'REVERSE_HAREM', 'POLITICAL_MARRIAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BondStage" AS ENUM ('ATTRACTION', 'COURTSHIP', 'COMMITMENT', 'MARRIAGE', 'LEGACY');

-- CreateEnum
CREATE TYPE "BondTransitionKind" AS ENUM ('ADVANCE', 'REGRESS', 'SEVER');

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "from_chapter" INTEGER NOT NULL,
    "to_chapter" INTEGER,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_knowledge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "fact_id" UUID NOT NULL,
    "stance" "KnowledgeStance" NOT NULL,
    "source" "KnowledgeSource" NOT NULL,
    "from_chapter" INTEGER NOT NULL,
    "to_chapter" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_arcs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "status" "ArcStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_arcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_arc_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "arc_id" UUID NOT NULL,
    "chapter" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_arc_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_stances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "from_character_id" UUID NOT NULL,
    "to_character_id" UUID NOT NULL,
    "stance" "RelationshipStanceKind" NOT NULL,
    "from_chapter" INTEGER NOT NULL,
    "to_chapter" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_stances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "structure" "BondStructure" NOT NULL,
    "from_chapter" INTEGER NOT NULL,
    "to_chapter" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bond_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bond_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bond_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bond_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bond_id" UUID NOT NULL,
    "chapter" INTEGER NOT NULL,
    "stage" "BondStage" NOT NULL,
    "kind" "BondTransitionKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bond_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meaningful_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "bond_id" UUID NOT NULL,
    "chapter" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meaningful_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_novel_id_key_key" ON "characters"("novel_id", "key");

-- CreateIndex
CREATE INDEX "character_states_character_id_idx" ON "character_states"("character_id");

-- CreateIndex
CREATE INDEX "character_knowledge_character_id_idx" ON "character_knowledge"("character_id");

-- CreateIndex
CREATE INDEX "character_knowledge_fact_id_idx" ON "character_knowledge"("fact_id");

-- CreateIndex
CREATE INDEX "character_arcs_character_id_idx" ON "character_arcs"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_arc_milestones_arc_id_chapter_key" ON "character_arc_milestones"("arc_id", "chapter");

-- CreateIndex
CREATE INDEX "relationship_stances_from_character_id_idx" ON "relationship_stances"("from_character_id");

-- CreateIndex
CREATE INDEX "relationship_stances_to_character_id_idx" ON "relationship_stances"("to_character_id");

-- CreateIndex
CREATE INDEX "bonds_novel_id_idx" ON "bonds"("novel_id");

-- CreateIndex
CREATE INDEX "bond_members_character_id_idx" ON "bond_members"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "bond_members_bond_id_character_id_key" ON "bond_members"("bond_id", "character_id");

-- CreateIndex
CREATE UNIQUE INDEX "bond_transitions_bond_id_chapter_key" ON "bond_transitions"("bond_id", "chapter");

-- CreateIndex
CREATE INDEX "meaningful_interactions_bond_id_chapter_idx" ON "meaningful_interactions"("bond_id", "chapter");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "canon_facts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_arcs" ADD CONSTRAINT "character_arcs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_arc_milestones" ADD CONSTRAINT "character_arc_milestones_arc_id_fkey" FOREIGN KEY ("arc_id") REFERENCES "character_arcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_stances" ADD CONSTRAINT "relationship_stances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_stances" ADD CONSTRAINT "relationship_stances_from_character_id_fkey" FOREIGN KEY ("from_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_stances" ADD CONSTRAINT "relationship_stances_to_character_id_fkey" FOREIGN KEY ("to_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_members" ADD CONSTRAINT "bond_members_bond_id_fkey" FOREIGN KEY ("bond_id") REFERENCES "bonds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_members" ADD CONSTRAINT "bond_members_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_transitions" ADD CONSTRAINT "bond_transitions_bond_id_fkey" FOREIGN KEY ("bond_id") REFERENCES "bonds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaningful_interactions" ADD CONSTRAINT "meaningful_interactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaningful_interactions" ADD CONSTRAINT "meaningful_interactions_bond_id_fkey" FOREIGN KEY ("bond_id") REFERENCES "bonds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written constraints (not expressible in schema.prisma).
--
-- The overlap EXCLUDEs are the point of this block. packages/
-- character-intelligence and packages/relationship-intelligence already
-- refuse overlapping windows (validateStateHistory, validateStanceHistory),
-- but a validator only runs if a caller calls it — and the failure mode is
-- silent: two rows claiming chapter 12 make "where was she in chapter 12"
-- answerable two ways, and whichever the query happens to return becomes
-- accidental canon. The constraint holds whether or not a route remembers.
--
-- Half-open [from, to) throughout, matching a canon fact's validity window:
-- the chapter a state changes on belongs to the NEW state. A NULL to_chapter
-- means "still current", which int4range renders as unbounded-upper — so an
-- open-ended window overlaps every later one, exactly as intended.
-- ===========================================================================

-- btree_gist supplies the equality operator classes the EXCLUDE needs for
-- the UUID and integer columns. Trusted extension (verified against
-- pgvector/pgvector:pg16): no superuser required.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A window that ends before it starts is the kind of row otherwise found by
-- a continuity bug months later. from_chapter >= 1 because chapter 0 does
-- not exist (chapters.number starts at 1).
ALTER TABLE "character_states"
  ADD CONSTRAINT "CharacterState_window_valid"
  CHECK ("from_chapter" >= 1 AND ("to_chapter" IS NULL OR "to_chapter" > "from_chapter"));

ALTER TABLE "character_states"
  ADD CONSTRAINT "character_states_no_overlap"
  EXCLUDE USING gist (
    "character_id" WITH =,
    int4range("from_chapter", "to_chapter", '[)') WITH &&
  );

ALTER TABLE "character_knowledge"
  ADD CONSTRAINT "CharacterKnowledge_window_valid"
  CHECK ("from_chapter" >= 1 AND ("to_chapter" IS NULL OR "to_chapter" > "from_chapter"));

-- Scoped per (character, fact): a character may hold beliefs about many
-- facts at once, and many characters may hold beliefs about one fact.
ALTER TABLE "character_knowledge"
  ADD CONSTRAINT "character_knowledge_no_overlap"
  EXCLUDE USING gist (
    "character_id" WITH =,
    "fact_id" WITH =,
    int4range("from_chapter", "to_chapter", '[)') WITH &&
  );

-- A character cannot regard themselves. The domain validator reports
-- SELF_REFERENCE; this makes the row unrepresentable.
ALTER TABLE "relationship_stances"
  ADD CONSTRAINT "RelationshipStance_not_self"
  CHECK ("from_character_id" <> "to_character_id");

ALTER TABLE "relationship_stances"
  ADD CONSTRAINT "RelationshipStance_window_valid"
  CHECK ("from_chapter" >= 1 AND ("to_chapter" IS NULL OR "to_chapter" > "from_chapter"));

-- Per DIRECTION, deliberately: a one-sided feud needs A->B ENEMY while
-- B->A stays FRIENDLY, and the enemy-to-ally turn is a second span on the
-- same direction, not a second direction.
ALTER TABLE "relationship_stances"
  ADD CONSTRAINT "relationship_stances_no_overlap"
  EXCLUDE USING gist (
    "from_character_id" WITH =,
    "to_character_id" WITH =,
    int4range("from_chapter", "to_chapter", '[)') WITH &&
  );

-- No EXCLUDE on bonds: overlapping bonds are the author's business. A
-- monogamy bond and a political marriage may run concurrently; refusing
-- that would be the engine overruling the author (CLAUDE.md §2.13). The
-- exclusivity rule needs the sibling MEMBERS of a bond, which no CHECK can
-- see, so it stays in validateBondStructures where the whole set is in hand.
ALTER TABLE "bonds"
  ADD CONSTRAINT "Bond_window_valid"
  CHECK ("from_chapter" >= 1 AND ("to_chapter" IS NULL OR "to_chapter" > "from_chapter"));

ALTER TABLE "character_arc_milestones"
  ADD CONSTRAINT "CharacterArcMilestone_chapter_valid"
  CHECK ("chapter" >= 1);

ALTER TABLE "bond_transitions"
  ADD CONSTRAINT "BondTransition_chapter_valid"
  CHECK ("chapter" >= 1);

-- weight is the input MEANINGFUL_WEIGHT_FLOOR compares against, so a value
-- outside 0..1 does not fail loudly — it silently makes every interaction
-- clear (or miss) the floor. Bound the input; the rule stays in the domain.
ALTER TABLE "meaningful_interactions"
  ADD CONSTRAINT "MeaningfulInteraction_weight_0_to_1"
  CHECK ("weight" >= 0 AND "weight" <= 1);

ALTER TABLE "meaningful_interactions"
  ADD CONSTRAINT "MeaningfulInteraction_chapter_valid"
  CHECK ("chapter" >= 1);
