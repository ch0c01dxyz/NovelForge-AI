# Character & Relationship Intelligence

Integration gate (M3/M5): the chapter compiler resolves state at the target
story position; final-text reviewers check knowledge/relationship constraints;
the author can inspect evidence and propose corrections through the UI.
API-only state storage is a partial slice. Establish explicit stable links
to canon subjects and story events where consumers need them; never join
identities by display name. Mutations participate in the revision/checkpoint
contract from ADR-0013.

## Character state

Track current and historical: location, goals, motivations, knowledge,
beliefs, condition/injury, abilities, possessions, social role,
reputation, commitments, secrets, development milestones.

## Knowledge boundary

Facts can be known, suspected, believed falsely, or unknown per
character/faction. Dialogue/planning validators must check access to
information.

## Genius protagonist

Store knowledge by domain and source: `REMEMBERED`, `DERIVED`,
`LEARNED_IN_WORLD`, `EXPERIMENTED`, `TAUGHT`, `RESEARCHED`.

Separate conceptual knowledge, practical knowledge, local-material
knowledge, and production capability.

## Relationship graph

Never assume one `mainLoveInterestId`.

Relationships are directional where necessary and can track semantic
dimensions such as trust, affection, respect, attraction, loyalty,
jealousy, resentment, rivalry, fear, commitment. Numeric values are
optional/derived and require evidence.

## Relationship groups

Support monogamy, multiple love interests, harem, reverse harem,
polygamy, polyamory, political marriage, and custom structures.

A group can hold: members, agreements, hierarchy rules, disclosure
rules, shared goals, residence, family state, political implications,
succession/inheritance configuration.

Harem is an allowed structure, not an instruction that every character
becomes a love interest.

## Relationship lifecycle

Marriage/commitment does not complete the character: attraction -\>
courtship -\> commitment -\> marriage -\>
family/shared-goal/conflict/growth/legacy.

## Relationship attention

Distinguish: appearance, interaction, meaningful interaction,
relationship development, milestone, conflict, payoff.

Detect long neglect based on meaningful evidence, not simple chapter
presence.
