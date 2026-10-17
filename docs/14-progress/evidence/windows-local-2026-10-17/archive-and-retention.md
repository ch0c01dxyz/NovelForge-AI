# Private local artifact organization and retention

The author's cleanup instruction authorizes categorization, safe project
commits, private-data ignores and proven disposable-file deletion. It does
not require discarding uncommitted work or publishing raw operational data.

## Categories

| Material | Storage / treatment |
| --- | --- |
| Curated project evidence | This tracked evidence directory; English summaries with explicit scope |
| Local harness memory/state | Root .harness-memory/, ignored and preserved |
| Backups, raw logs, configuration snapshots | Root .nf-batch-worktrees/, ignored and preserved privately |
| Registered scratch worktrees | Original paths retained; private category index inventories them |
| Historical patches, contracts, prompts and review packages | Indexed by category; original referenced paths preserved |
| Unreferenced temporary snapshots | Private archive/snapshots/ under the artifact root |
| Imported harness output | Private archive/input-logs/ under the artifact root |

The ignored root contains a private LOCAL-ARTIFACT-INDEX.md and JSON catalog
with categories, relative paths, sizes, hashes and worktree status. Worktree
contents, symlink targets and dependency trees are not recursively catalogued.
Historical path references remain valid for retained evidence and tooling.
Do not treat the private catalog as a tracked source dependency.

## Actual cleanup

- Retained all15 registered nested worktrees;14 have tracked or untracked
  changes. Their equivalence to integrated code has not been exhaustively
  audited, so old HEADs were not taken as permission to discard changes.
- Preserved original backup and memory paths and active frontend log targets.
- Archived five unreferenced constant snapshots and imported output.txt with
  SHA256 read-back; preserved the full input privately rather than exposing it.
- Deleted exactly two byte-identical duplicate snapshots after verifying a
  retained canonical copy: consts.head.lf.ts and consts.staged.lf.ts. No unique
  content, stash or worktree was deleted.

Root-anchored .gitignore rules protect the two private directories and future
output.txt imports. Existing ignored directories do not become safe to delete;
Git cleanliness and data retention are separate properties. No raw dumps,
memory databases, session files or provider responses belong in the commit.
