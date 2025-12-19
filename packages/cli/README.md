# @a5cforge/cli

Read-only CLI (Phase 4).

## Usage
Installed as a `git` subcommand binary (`git-a5c`), so you can run:

- `git a5c status`
- `git a5c issue list`
- `git a5c issue show <id>`
- `git a5c pr list`
- `git a5c pr show <prKey>`
- `git a5c verify`
- `git a5c journal`

Common flags:
- `--repo <path>`: override repo detection
- `--treeish <ref>`: load snapshot from a commit/ref (default: `HEAD`)
- `--inbox-ref <ref>`: include events from an inbox ref (repeatable)
- `--json`: JSON output


