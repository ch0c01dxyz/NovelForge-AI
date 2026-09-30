-- CreateEnum
CREATE TYPE "NarrativePolicyKind" AS ENUM ('DRAMA_GAP', 'COOLDOWN', 'SCALE');

-- CreateEnum
CREATE TYPE "PolicyHardness" AS ENUM ('SOFT', 'HARD');

-- CreateEnum
CREATE TYPE "AntagonistRole" AS ENUM ('MAIN', 'ARC', 'TEMPORARY', 'RIVAL', 'IDEOLOGICAL', 'POLITICAL', 'PERSONAL', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "AntagonistStage" AS ENUM ('INTRODUCTION', 'MOTIVATION', 'FRICTION', 'UNDERESTIMATION', 'ESCALATION', 'CONFRONTATION', 'DEFEAT', 'CONSEQUENCE', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "AntagonistOutcome" AS ENUM ('REGRET', 'RESENTMENT', 'RETREAT', 'LOSS_OF_STATUS', 'EXILE', 'DEATH', 'NEUTRALITY', 'RESPECT', 'REDEMPTION', 'ALLIANCE', 'SUBORDINATION', 'FUTURE_REVENGE');

-- CreateTable
CREATE TABLE "narrative_dna_profiles" (
    "novel_id" UUID NOT NULL,
    "dna" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "narrative_dna_profiles_pkey" PRIMARY KEY ("novel_id")
);

-- CreateTable
CREATE TABLE "narrative_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "novel_id" UUID NOT NULL,
    "kind" "NarrativePolicyKind" NOT NULL,
    "hardness" "PolicyHardness" NOT NULL,
    "hard_reason" TEXT,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "narrative_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "antagonists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "novel_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "role" "AntagonistRole" NOT NULL,
    "stage" "AntagonistStage" NOT NULL DEFAULT 'INTRODUCTION',
    "outcome" "AntagonistOutcome",
    "purpose" TEXT,
    "from_chapter" INTEGER NOT NULL,
    "to_chapter" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "antagonists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "narrative_policies_novel_id_kind_key" ON "narrative_policies"("novel_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "antagonists_novel_id_character_id_key" ON "antagonists"("novel_id", "character_id");

-- CreateIndex
CREATE INDEX "antagonists_character_id_idx" ON "antagonists"("character_id");

-- AddForeignKey
ALTER TABLE "narrative_dna_profiles" ADD CONSTRAINT "narrative_dna_profiles_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_policies" ADD CONSTRAINT "narrative_policies_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antagonists" ADD CONSTRAINT "antagonists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antagonists" ADD CONSTRAINT "antagonists_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antagonists" ADD CONSTRAINT "antagonists_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antagonists" ADD CONSTRAINT "antagonists_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written constraints (not expressible in schema.prisma).
--
-- Three invariants, each one a rule the docs state and a route could forget.
-- packages/narrative-rhythm validates all three, but a validator only runs if
-- a caller calls it; these hold whether or not it does.
-- ===========================================================================

-- NARRATIVE-RHYTHM.md: temporary antagonists "may exist for ~5-20 chapters
-- when appropriate. Their purpose must be explicit." The span bound is a soft
-- preference the domain layer reports on — a 30-chapter "temporary" villain is
-- a pacing note, not an unrepresentable row. The PURPOSE is the hard half:
-- an antagonist the author cannot say why they exist for is the case the doc
-- calls out, and it is unrepresentable here.
ALTER TABLE "antagonists"
  ADD CONSTRAINT "Antagonist_temporary_needs_purpose"
  CHECK ("role" <> 'TEMPORARY' OR ("purpose" IS NOT NULL AND btrim("purpose") <> ''));

-- A span that ends before it starts is found by a continuity bug months
-- later. from_chapter >= 1 because chapters.number starts at 1.
ALTER TABLE "antagonists"
  ADD CONSTRAINT "Antagonist_chapter_span_valid"
  CHECK ("from_chapter" >= 1 AND ("to_chapter" IS NULL OR "to_chapter" >= "from_chapter"));

-- ADR-009 / NARRATIVE-DNA-AND-PLANNING.md: "Values are soft constraints
-- unless explicitly marked hard." The marker is only auditable if it says
-- why — a HARD policy with no stated reason is exactly the free-form override
-- the hardness column exists to replace, so it is refused. SOFT rows carry no
-- reason by construction (the schema comment on hard_reason says so).
ALTER TABLE "narrative_policies"
  ADD CONSTRAINT "NarrativePolicy_hard_requires_reason"
  CHECK ("hardness" <> 'HARD' OR ("hard_reason" IS NOT NULL AND btrim("hard_reason") <> ''));
