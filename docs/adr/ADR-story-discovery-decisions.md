# Evidence-bound group and research suggestions

Status: Accepted for implementation under the author's shared AI/reader amendment.

Use a separate operational StoryDiscoveryBatch with immutable workflow source
hash/branch/chapter pins, generation attribution and versioned candidate decisions.
The existing character discovery source reader is shared; neither job rewrites
the generated prose or automatically approves canon. A candidate's exact quote
must exist in the pinned draft. Approval additionally requires the applied draft,
current chapter version, branch and head revision to match the author's view.

Clans use FACTION and organizations use ORGANIZATION. Reuse existing identities;
ambiguity requires explicit author selection. Approving a group creates/reuses its
StoryEntity and approved character affiliation facts in one story transaction,
with a required pre-change checkpoint, revision, audit and rebuild intent. Use
predicate affiliation:<group UUID> with the group as object, allowing multiple
affiliations without changing canon's functional uniqueness. Store the role
separately as `affiliation-role:<group UUID>` with MEMBER/LEADER in objectText,
so the existing canon correction flow can change it as a structured value.
Display text is not role identity. Role changes never
overwrite a live affiliation silently; they require the existing canon correction
flow. A surname alone is not membership evidence. Unresolved character identities
must be resolved through the existing Character UI first.

Research suggestions distinguish NEEDS_SOURCE, FICTIONAL_ADAPTATION and
REAL_REFERENCE. Real-source linking requires an author-selected accessible exact
reference version and supporting quotation. This establishes a citation, not proof
that the source's claim is true. New notes are DRAFT NOTE references, explicitly
labelled as fictional adaptation or unverified research. They do not become world
rules/canon or silently ingest web content. Existing references are linked with
immutable version pins, never merged or overwritten.

Reference material is outside story-state rollback; candidate decision history
also survives rollback. Group entities/facts/sources are covered by the existing
snapshot scope and restore creates a new revision. Past approval remains historical
evidence after rollback; it must not automatically recreate rolled-back entities.
The additive operational table migration does not mutate any manuscript or canon.
