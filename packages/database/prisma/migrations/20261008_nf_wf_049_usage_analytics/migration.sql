-- ADR-0015: additive analytics only; retain historical counters and model metadata.
ALTER TABLE generations ADD COLUMN component TEXT NOT NULL DEFAULT 'OTHER',
                        ADD COLUMN artifact_id UUID;
ALTER TABLE generations ADD CONSTRAINT generations_component_check
  CHECK (component IN ('CHAPTER', 'COVER', 'LORE', 'OUTLINE', 'EMBEDDING', 'OTHER'));
ALTER TABLE generation_attempts ADD COLUMN requested_model_id TEXT,
  ADD COLUMN reported_model_id TEXT, ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER;
ALTER TABLE generation_attempts ADD CONSTRAINT generation_attempts_tokens_check
  CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND
         (output_tokens IS NULL OR output_tokens >= 0));
-- No historical model/usage backfill: those values cannot be reconstructed reliably.
