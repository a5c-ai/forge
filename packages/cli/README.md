# @a5cforge/cli

CLI for reading and writing a5cforge events.

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

## Local install from this monorepo

From the repo root:

```bash
pnpm -C packages/cli build
pnpm -C packages/cli link --global
git a5c help
```


