-- CreateEnum

-- CreateEnum
CREATE TYPE "GatewayHealth" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN');

-- CreateEnum
CREATE TYPE "ModelProfile" AS ENUM ('CREATIVE_WRITER', 'DEEP_PLANNER', 'CONTINUITY_REVIEWER', 'FAST_CLASSIFIER', 'STRUCTURED_EXTRACTOR', 'LONG_CONTEXT_REVIEWER', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'INCOMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'TIMEOUT', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "ErrorCategory" AS ENUM ('NONE', 'TRANSIENT', 'RATE_LIMIT', 'AUTH', 'INVALID_REQUEST', 'UNSUPPORTED', 'DETERMINISTIC', 'INTERNAL');

-- AlterTable

-- CreateTable
CREATE TABLE "ai_gateways" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "credential_ciphertext" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "health" "GatewayHealth" NOT NULL DEFAULT 'UNKNOWN',
    "last_health_check_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_category" "ErrorCategory",
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gateway_id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT,
    "capabilities" TEXT[],
    "context_window" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_profile_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile" "ModelProfile" NOT NULL,
    "model_ref" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_profile_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "novel_id" UUID,
    "user_id" UUID,
    "task" TEXT NOT NULL,
    "model_profile" "ModelProfile" NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "prompt_version" TEXT,
    "context_snapshot" JSONB NOT NULL DEFAULT '{}',
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "error_category" "ErrorCategory",
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generation_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "gateway_id" UUID,
    "model_id" TEXT,
    "status" "AttemptStatus" NOT NULL,
    "error_category" "ErrorCategory" NOT NULL DEFAULT 'NONE',
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_gateways_name_key" ON "ai_gateways"("name");

-- CreateIndex
CREATE INDEX "ai_gateways_enabled_priority_idx" ON "ai_gateways"("enabled", "priority");

-- CreateIndex
CREATE INDEX "ai_models_enabled_idx" ON "ai_models"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_gateway_id_model_id_key" ON "ai_models"("gateway_id", "model_id");

-- CreateIndex
CREATE INDEX "model_profile_mappings_profile_enabled_priority_idx" ON "model_profile_mappings"("profile", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "model_profile_mappings_profile_model_ref_key" ON "model_profile_mappings"("profile", "model_ref");

-- CreateIndex
CREATE INDEX "generations_workspace_id_created_at_idx" ON "generations"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "generations_novel_id_created_at_idx" ON "generations"("novel_id", "created_at");

-- CreateIndex
CREATE INDEX "generation_attempts_gateway_id_started_at_idx" ON "generation_attempts"("gateway_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_generation_id_attempt_number_key" ON "generation_attempts"("generation_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "ai_gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_profile_mappings" ADD CONSTRAINT "model_profile_mappings_model_ref_fkey" FOREIGN KEY ("model_ref") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "ai_gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

