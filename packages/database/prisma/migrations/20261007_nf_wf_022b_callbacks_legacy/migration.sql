-- NF-WF-022B: Callbacks and legacy.
--
-- Adds `endgame_callbacks` and `endgame_legacies` tables plus the
-- `EndgameCallbackStatus` and `EndgameLegacyKind` enums. 022B owns these
-- tables; 022A owns `endgame_ledger`/`endgame_gate_approval` (separate
-- migration 20261007_nf_wf_022a_endgame — the two children parallelize).
--
-- Invariant 5: callbacks are EXPLICIT author-made links. There is no
-- detection or auto-linking — the table is written only by the explicit
-- POST .../endgame/callbacks route.
--
-- Re-runnability (GAP-030): every statement is idempotent — DO-blocks guard
-- enum creation, CREATE TABLE IF NOT EXISTS guards tables, and index
-- creation uses IF NOT EXISTS. A partially-applied retry converges.
-- Purely additive: no existing table is altered.

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EndgameCallbackStatus') THEN
    CREATE TYPE "EndgameCallbackStatus" AS ENUM ('PENDING', 'PAID');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EndgameLegacyKind') THEN
    CREATE TYPE "EndgameLegacyKind" AS ENUM ('CHARACTER', 'WORLD', 'THEMATIC');
  END IF;
END
$$;

-- endgame_callbacks
CREATE TABLE IF NOT EXISTS "endgame_callbacks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "setup_event_id" UUID NOT NULL,
  "payoff_event_id" UUID,
  "status" "EndgameCallbackStatus" NOT NULL DEFAULT 'PENDING',
  "description" TEXT,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "endgame_callbacks_setup_payoff_check"
    CHECK ("setup_event_id" <> "payoff_event_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "endgame_callbacks_novel_setup_uidx"
  ON "endgame_callbacks"("novel_id", "setup_event_id");
CREATE INDEX IF NOT EXISTS "endgame_callbacks_novel_status_idx"
  ON "endgame_callbacks"("novel_id", "status");

-- endgame_legacies
CREATE TABLE IF NOT EXISTS "endgame_legacies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "novel_id" UUID NOT NULL REFERENCES "novels"("id") ON DELETE CASCADE,
  "kind" "EndgameLegacyKind" NOT NULL,
  "subject_id" UUID,
  "description" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "endgame_legacies_novel_kind_idx"
  ON "endgame_legacies"("novel_id", "kind");
