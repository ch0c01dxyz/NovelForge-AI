# Claude Code workflow configuration

Applied and verified on 2026-10-01 with Claude Code 2.1.286 on this Windows
workstation. This is a local harness configuration receipt, not application
delivery evidence. Existing NovelForge implementation gates remain pending.

## Active configuration

| Area | Result |
|---|---|
| User settings | `~/.claude/settings.json` retains model/gateway credentials, Orca integration and agent-team support. Removed duplicate MCP registry and redundant Ruflo/auto-memory hook handlers. |
| MCP registry | `~/.claude.json` owns MCP definitions. Active for this repository: Engram, Ruflo, Context7 and Exa. |
| Optional MCP | Chrome DevTools and Open Design remain registered but disabled for this repository. Re-enable through `/mcp` when a specific UI task requires them. |
| Removed | Uninstalled `claude-mem@thedotmack` with `--keep-data`. Removed Caveman and Cloakbrowser MCP registrations. |
| Preserved | Engram and Ponytail plugins, Orca host hooks and coding-worker tools. The Humanizer skill remains installed; its synthetic `skills-dir` listing is separate from the removed memory plugin. |
| Ruflo tool surface | Native filter: `agent,swarm,task,workflow,coordination,hooks_route,policy_evaluate,policy_status`. Actual `tools/list`: **52** tools. |
| Instructions | Concise English user `CLAUDE.md`; repository-local `claudeMdExcludes` skips the stale user-directory Ruflo instructions and Downloads-level NovelForge/9Router instructions. Original ancestor files are preserved. |
| Output budgets | `CLAUDE_CODE_MAX_OUTPUT_TOKENS=8192`, `MAX_MCP_OUTPUT_TOKENS=8000`. A larger output should be enabled only for a task that actually requires it. |
| Hook budget | Command timeouts use seconds. Orca hooks use 10 seconds; Engram hooks use 1–15 seconds. SessionEnd overall budget is explicitly 15,000 ms. |

The MCP startup command invokes the existing installed Ruflo 3.48.0 CLI
directly using Node. A pinned offline `npx` invocation timed out during
verification; the direct entry passed. Its current installation lives under
the user npm cache, at `_npx/2ed56890c96f58f7/node_modules/@claude-flow/cli`.
Do not delete that package during cache cleanup. If relocating or upgrading
it, update the registry command and rerun the MCP checks below.

Tool filtering reduces advertised orchestration tools from the previously
observed 353 to 52. It does not remove the host's own tool schemas, loaded
skills, task documents or ordinary conversation history. This is not a
measured token-saving guarantee for every provider or session.

## Engram hook behavior

The local Engram plugin's Windows hooks now invoke their scripts directly,
without consulting Codex configuration. Startup/resume/clear registers only
the hook-provided runtime session identity and loads bounded project context.
SessionStart after compaction restores the binding and a short memory reminder.
Context retrieval uses a 4,096-byte budget, two recent sessions, five compact
observation entries and no historical prompt section.

`~/.claude/helpers/engram-claude-hook.ps1` adapts the native prompt reminder
to Claude's `additionalContext`. PostCompact saves the compacted handoff.
SessionEnd saves available final assistant text before closing the session.
Both check the registered session/project against the server; a failed save
does not close the session. Missing text cannot reconstruct an unfinished task.
The helper reports failures on stderr and does not block Claude indefinitely.

Automatic handoffs are explicitly unverified model context. Common credential
formats are redacted, but agents must still obey the no-secrets policy and
write meaningful checkpoints proactively. Automatic capture is a fallback,
not a replacement for task ID, worktree, evidence and next-action checkpoints
required by [the orchestration playbook](../06-ai/MULTI-LLM-ORCHESTRATION.md).

Engram remains the coding-context store. Ruflo coordinates work; its task or
agent registry does not prove a coding worker executed or completed a task.
Use actual host workers and completion evidence when delegation is authorized.

## Verification performed

- All modified JSON parsed; PowerShell helper parsed without errors.
  Existing credential values matched the backup and backup hashes verified.
- `claude mcp list`: Engram, Ruflo, Context7 and Exa connected; both optional
  servers disabled for this project.
- Configured stdio JSON-RPC: Ruflo `tools/list` returned 52 tools;
  `agent_list`, `task_list` and `swarm_status` succeeded. Engram returned 19
  tools and `mem_current_project` succeeded.
- Offline hook check passed Unicode, common credential redaction, provenance,
  save-before-close ordering, failed-save recovery, project mismatch and missing
  identity guards. It uses a mock server and never ends a real Engram session.
- Real Claude read-only smoke test succeeded in three turns. It invoked both
  `mem_current_project` and Ruflo `agent_list`; its runtime-owned session's
  automatic end handoff was read back from Engram after closure.
- Startup/clear and post-compaction hook replays confirmed the existing runtime
  identity with empty stderr. A real PostCompact save/read replay succeeded.
  These replays are not an actual interactive `/clear` or a long implementation
  session. No coding workers were spawned for verification.

Repeat the small local checks from the repository root:

```powershell
claude mcp list
claude plugin list --json
python "$env:USERPROFILE/.claude/helpers/check-workflow-mcp.py"
python "$env:USERPROFILE/.claude/helpers/test-engram-claude-hook.py"
```

The live smoke's individual assistant messages reported 56,500 and 56,652
input tokens, versus the historical large-session observations above 169,000.
They are different sessions/workloads and gateway-reported usage, not a
controlled benchmark. Claude still warns that the DeepSeek gateway alias is
an unrecognized model; reported context limits, token accounting and pricing
must not be treated as verified provider metadata. GLM dispatch remains
unverified; see GAP-013 in [ISSUES-AND-GAPS](ISSUES-AND-GAPS.md).

## Activation and maintenance

Save a meaningful Engram checkpoint, then restart Claude Code to reload
plugins, hooks and MCP schemas. Begin the next session with one bounded task
and recover only its relevant checkpoint. Automatic compaction remains enabled;
these changes do not guarantee that context will never fill.

The repository profile is in ignored `.claude/settings.local.json`, and MCP
disables are attached to this repository's absolute path in `~/.claude.json`.
For a new Orca worktree, copy the local profile and apply the same two MCP
disables to that worktree's project entry before starting its worker. Other
existing worktrees were not reconfigured during this task. Keep each worker's
task and write scope bounded.

Plugin-cache modifications are local. An Engram upgrade may overwrite them;
compare/reapply the Windows hook fixes and rerun checks after an upgrade.
Do not remove the required Orca hooks or the Engram runtime-registration guard.

## Backup and rollback

Backup: `C:/Users/ch0c0/.claude/backups/novelforge-workflow-20261001-072227`.
Its `manifest.json` records original paths, backup paths, hashes and newly
created local files. Keep this backup private: configuration includes credentials.

With Claude Code sessions stopped, restore the backed-up settings, user
instructions and Engram hook/scripts. For `.claude.json`, restore the backed-up
MCP definitions and relevant project settings selectively if newer project
state should be retained. Delete only the new helper files and local project
profile listed as previously absent. Reinstall `claude-mem@thedotmack` only if
intentionally returning to the previous plugin set; retained data is available.
Restart Claude Code and rerun the checks. No application rollback or database
migration is involved.
