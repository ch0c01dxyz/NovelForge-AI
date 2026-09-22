# AI Orchestration

## Agent

Agent = role + instructions + allowed skills + context policy + model
profile + output schema + validators.

Recommended initial agents: Story Architect, Saga Planner, Arc Planner,
Scene Planner, Chapter Writer, Continuity Guardian, Lore Guardian,
Character Analyst, Relationship Analyst, Narrative Rhythm Analyst,
Simulation Analyst, Canon Extractor, Endgame Planner, Story Debugger.

## Skill

Skills are reusable operations, not personas: retrieve-canon,
retrieve-character-state, retrieve-relationship-state,
retrieve-timeline, retrieve-thread, retrieve-world-state, build-context,
analyze-impact, compare-revisions, detect-continuity-conflict,
analyze-rhythm, extract-candidate-facts.

## Context Compiler

Inputs: task, novel, revision, chapter/scene position, agent, context
policy, token budget.

Output sections: author instruction; approved outline; current scene;
hard canon; character state/knowledge; relationships; active
threads/promises; timeline; relevant world state; relevant
recent/historical memory; Narrative DNA; references/style; output
contract.

## Generation lifecycle

Authorize -\> resolve task -\> resolve agent -\> resolve skills -\>
retrieve structured state -\> retrieve relevant text -\> compile context
-\> select model profile -\> route gateway -\> generate/stream -\>
schema validate -\> review validators -\> extract candidate changes -\>
persist generation -\> propose canon/state changes -\> approve/commit by
policy -\> consolidate derived memory.

## Structured output

Prefer JSON Schema/Zod-compatible contracts for machine steps. Creative
manuscript text may remain prose but must be accompanied by structured
metadata/extraction in later steps.

## AI records

Store logical request, attempts, model profile, resolved model, gateway,
context snapshot reference, prompt/template versions, latency,
token/usage data when available, validation results, retry/fallback,
final status, and generated artifacts.
