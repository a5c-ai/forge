# CLI reference (`git a5c`)

**Audience:** users  
**Status:** draft

This is the reference for the implemented CLI commands in `packages/cli/src/commands/*`.

## Running the CLI from this repo

The executable name is `git-a5c` (Git runs it as `git a5c ...` when it is on your `PATH`).

For local dev from this monorepo, install the CLI globally from the workspace so `git a5c` works:

```bash
pnpm -C packages/cli build
pnpm -C packages/cli link --global
git a5c help
```

If `git a5c` is not found, ensure pnpm's global bin dir is on your `PATH` (run `pnpm setup` or add the directory printed by `pnpm bin -g`).

## Global flags

- `--repo <path>`: repo root (defaults to detected git root)
- `--treeish <ref>`: snapshot ref/oid (default `HEAD`)
- `--inbox-ref <ref>`: may be repeated
- `--json`: JSON output when supported

## status

```bash
git a5c status [--json] [--treeish <ref>]
```

## o

```bash
git a5c o [args...]
```

`git a5c o init` can populate `.a5c/functions`, `.a5c/processes`, and `.a5c/o.md` from a registry (default: `https://github.com/a5c-ai/forge`):

```bash
git a5c o init --registry <path|url>
```

## issue

```bash
git a5c issue list [--json]
git a5c issue show <issueId> [--json]
git a5c issue new --title <t> [--body <b>] [--id <issueId>] [--stage-only|--commit] [-m|--message <msg>]
git a5c issue comment <issueId> -m <text> [--comment-id <id>] [--stage-only|--commit]
git a5c issue edit-comment <commentId> --id <issueId> -m <text> [--stage-only|--commit]
git a5c issue redact-comment <commentId> --id <issueId> [--reason <r>] [--stage-only|--commit]
```

## pr

```bash
git a5c pr list [--json]
git a5c pr show <prKey> [--json]
git a5c pr propose --base <ref> --head <ref> --title <t> [--body <b>] [--id <prKey>] [--stage-only|--commit]
git a5c pr request --base <ref> --title <t> [--body <b>] [--id <prKey>] [--stage-only|--commit]
git a5c pr claim <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]
git a5c pr bind-head <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]
```

## gate / block

```bash
git a5c gate needs-human <entityId> [--topic <t>] [-m <msg>] [--stage-only|--commit]
git a5c gate clear <entityId> [-m <msg>] [--stage-only|--commit]

git a5c block <entityId> --by <issue|pr> [--op add|remove] [-m <note>] [--stage-only|--commit]
```

## agent / ops

```bash
git a5c agent heartbeat [--agent-id <id>] [--ttl-seconds N] [--entity <id>] [-m <status>] [--stage-only|--commit]
git a5c agent dispatch --entity <id> --agent-id <id> --task <task> [--dispatch-id <id>] [--stage-only|--commit]

git a5c agent generate-context [--in <path>] [--template <uri>] [--var k=v]... [--out <path>] [--token <t>]
git a5c agent run [--profile <name>] [--in <path>] [--out <path>] [--stdout <path>] [--stderr <path>] [--model <m>] [--mcps <path>] [--config <uri>]

git a5c ops deploy --entity <id> [--artifact <uri>] [-m <status>] [--stage-only|--commit]
```

See also:

- `docs/cli/agent-generate-context.md`

## journal

```bash
git a5c journal [--since <2h|2025-...>] [--limit N] [--types a,b] [--entity <id>] [--active] [--json]
```

Notes:

- `--types` supports exact kinds or prefix patterns ending in `.*` (e.g. `comment.*`).
- `--active` adds `activeAgents` derived from recent `agent.heartbeat.created` events.

## hooks

```bash
git a5c hooks install
git a5c hooks uninstall
```

## webhook

```bash
git a5c webhook status [--json]
git a5c webhook test --url <url> [--type <type>] [--json]
```

## parse

```bash
git a5c parse --type codex [--out <path>] [--pretty]
```

See also:

- `docs/cli/parse.md`

## orchestration

```bash
git a5c run dispatch --playbook <path>@<version> [--run-id <id>] [--overrides-file <path>]
git a5c run playbook --playbook <path>@<version> [--run-id <id>] [--overrides-file <path>] [--max-iterations N] [--json]
git a5c run reconcile --run-id <id> [--max-transitions N] [--json] [--dry-run]
git a5c run tick --run-id <id> [--max-transitions N] [--dry-run]
git a5c hook exec --plan <path|->
git a5c run sweep [--max N]
git a5c run resume --run-id <id> [-m <msg>]
git a5c run complete-step --run-id <id> [-m <msg>]
```

See also:

- `docs/orchestration/README.md`
- `docs/orchestration/end-to-end.md`
