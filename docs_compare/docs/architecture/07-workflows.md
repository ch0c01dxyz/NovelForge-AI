# AI Workflow Engine

## Chapter generation workflow

Chapter Request
→ Context Retrieval
→ Scene Planner
→ Character Voice Analysis
→ Chapter Writer
→ Continuity Guardian
→ Lore Guardian
→ Style Editor
→ Finalizer

The workflow should be configurable rather than hard-coded exclusively into one service.

## Workflow node types
- AGENT
- SKILL
- RETRIEVAL
- CONDITION
- TRANSFORM
- VALIDATOR
- HUMAN_APPROVAL

## Requirements
- version workflows
- validate node/edge graphs
- prevent accidental infinite loops
- enforce execution limits
- record each step
- support retries for appropriate nodes
- support human approval for sensitive/canon-changing operations

## Human-in-the-loop
Require approval for major changes such as:
- character identity changes
- world-rule changes
- timeline retcons
- relationship retcons
- destructive publication changes

## Editor AI actions
Inside Tiptap, support actions such as:
- Rewrite
- Expand
- Shorten
- Make emotional
- Make cinematic
- Improve dialogue
- Show, don't tell
- Change tone
- Continue

Each action should use the same AI orchestration layer and should be traceable.

## Generic workflow execution
A workflow run should persist:
- workflow/version
- input
- node execution order
- agent/skill used
- context references
- model/gateway
- output
- errors
- validation
- duration
- final result
