-- Phase 9 follow-up: the two "explicitly stated" CHECKs accepted a blank string.
--
-- 20261004_phase9_narrative_dna added Antagonist_temporary_needs_purpose and
-- NarrativePolicy_hard_requires_reason with `btrim(x) <> ''`. PostgreSQL's
-- single-argument btrim strips ONLY the ASCII space (U+0020): a purpose or
-- hard_reason consisting of a tab, newline, CR, VT, FF, NBSP, ideographic
-- space, BOM, NEL, figure space or narrow NBSP (or a mixture) satisfies
-- `btrim(x) <> ''` and was therefore ACCEPTED. The migration comment calls
-- that row "unrepresentable here"; it was not.
--
-- The consequence was not cosmetic. A TEMPORARY antagonist stored with a
-- whitespace-only purpose is flagged MISSING_PURPOSE by the domain validator
-- on EVERY later read, and MISSING_PURPOSE is in HARD_ANTAGONIST_PROBLEMS —
-- so the row could never be advanced through its lifecycle again. The row was
-- legal to write and illegal to use.
--
-- Replaced with a POSIX class negated over the full blank set PostgreSQL's
-- [[:space:]] misses (NEL, NBSP, figure space, narrow NBSP, BOM). Verified
-- against all 19 blank shapes and a set of non-blank controls before writing.
-- The HTTP write path already trims with JS String.prototype.trim (which
-- covers the same set plus U+3000), so this is the backstop the comment
-- always claimed it was — for a direct write, a seed, or a migration.
--
-- Both constraints keep their IS NOT NULL arm: NULL satisfies a CHECK, and
-- the point of each constraint is that the value must be present.

-- Loud, not silent (ADR-0011 §2): if a row already slipped in under the old
-- CHECK, the ADD CONSTRAINT below would fail with a bare 23514 that names no
-- row. Say which rows, and say it before touching the constraint.
DO $$
DECLARE
  bad_antagonists int;
  bad_policies   int;
BEGIN
  SELECT count(*) INTO bad_antagonists
    FROM "antagonists"
   WHERE "role" = 'TEMPORARY'
     AND ("purpose" IS NULL
          OR "purpose" !~ E'[^[:space:]   ﻿\u0085]');

  SELECT count(*) INTO bad_policies
    FROM "narrative_policies"
   WHERE "hardness" = 'HARD'
     AND ("hard_reason" IS NULL
          OR "hard_reason" !~ E'[^[:space:]   ﻿\u0085]');

  IF bad_antagonists > 0 OR bad_policies > 0 THEN
    RAISE EXCEPTION
      'blank reason/purpose rows must be repaired before this constraint can hold: % antagonists, % policies',
      bad_antagonists, bad_policies;
  END IF;
END $$;

ALTER TABLE "antagonists"
  DROP CONSTRAINT "Antagonist_temporary_needs_purpose";

ALTER TABLE "antagonists"
  ADD CONSTRAINT "Antagonist_temporary_needs_purpose"
  CHECK (
    "role" <> 'TEMPORARY'
    OR ("purpose" IS NOT NULL
        AND "purpose" ~ E'[^[:space:]   ﻿\u0085]')
  );

ALTER TABLE "narrative_policies"
  DROP CONSTRAINT "NarrativePolicy_hard_requires_reason";

ALTER TABLE "narrative_policies"
  ADD CONSTRAINT "NarrativePolicy_hard_requires_reason"
  CHECK (
    "hardness" <> 'HARD'
    OR ("hard_reason" IS NOT NULL
        AND "hard_reason" ~ E'[^[:space:]   ﻿\u0085]')
  );
