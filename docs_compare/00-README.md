# NovelForge AI — Claude Code Prompt Pack

This directory contains the implementation instructions for building NovelForge AI with Claude Code.

## How to use

1. Put `CLAUDE.md` in the project root.
2. Copy the `docs/` directory into the project.
3. Start Claude Code from the project root.
4. Ask Claude Code to read `CLAUDE.md`, then inspect the repository.
5. Use the phase files as the implementation roadmap.
6. Keep `docs/implementation/progress.md` updated.

## Recommended first command

> Read CLAUDE.md and all files under docs/architecture and docs/specs. Inspect the existing repository before changing anything. Produce a grounded CURRENT ARCHITECTURE, GAPS, RISKS, and IMPLEMENTATION PLAN. Do not implement yet.

## Prompting approach

The files intentionally separate:
- permanent project rules,
- product requirements,
- architecture,
- data model,
- AI architecture,
- gateway architecture,
- UI,
- workflows,
- testing/deployment,
- implementation phases.

This keeps the long master prompt maintainable and lets Claude Code load only the relevant specification when working on a feature.

The structure also follows Anthropic's current guidance for complex coding/agentic work: explicit instructions, structured context, investigation before action, durable progress files, and verification after implementation. citeturn0search0
