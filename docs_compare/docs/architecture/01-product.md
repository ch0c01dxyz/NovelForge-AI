# Product Blueprint

## Product
NovelForge AI is an AI-powered webnovel writing and publishing platform.

## Core engines

### Novel Engine
Responsible for:
- novels
- chapters
- chapter versions
- scenes
- characters
- relationships
- locations
- factions
- items
- world rules
- lore
- timeline
- story arcs
- plot points
- publishing

### AI Engine
Responsible for:
- agents
- skills
- prompts
- model profiles
- AI orchestration
- workflows
- generation history
- evaluation

### Knowledge Engine
Responsible for:
- novel canon
- world bible
- character bible
- references
- documents
- chunks
- embeddings
- facts
- timeline retrieval
- continuity checks
- spoiler-aware retrieval

### Gateway Engine
Responsible for:
- multiple 9Router instances
- model registry
- gateway health
- routing policies
- retry/failover
- usage metrics
- model capability discovery

## User roles
- USER
- AUTHOR
- EDITOR
- ADMIN
- SUPER_ADMIN

Permissions should be granular rather than role-name checks scattered throughout application code.

## Main success criteria
- Authors can build a structured novel universe.
- AI can generate content grounded in that universe.
- Multiple 9Router instances can be managed and routed.
- Agents and skills are reusable and versioned.
- Canon and references are distinguishable.
- Generated content is traceable and reversible.
- Readers can discover and read published novels.
- The platform remains provider-independent.
