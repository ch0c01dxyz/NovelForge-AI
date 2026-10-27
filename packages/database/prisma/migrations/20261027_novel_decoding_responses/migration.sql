-- Private model artifacts are operational evidence, never approved story truth.
ALTER TABLE "novel_decode_chunks" ADD COLUMN "responses" JSONB NOT NULL DEFAULT '[]';
