-- NF-WF-050C amendment 1 (finding B): provenance of author-applied SCALE
-- evidence. Additive nullable column on the existing OPERATIONAL
-- scale_evidence_sets table. Bare UUID, NO foreign key — same policy as
-- scale_s3_proposals.generation_id: the referenced row lives in a table with
-- a different deletion mechanism (novel/chapter cascade + explicit cleanup),
-- so integrity is validated at write time against the pinned proposal, never
-- by a cross-table constraint. NULL = plain S1 authoring (existing behavior
-- byte-identical; no backfill).

ALTER TABLE "scale_evidence_sets"
  ADD COLUMN "source_s3_proposal_id" UUID;
