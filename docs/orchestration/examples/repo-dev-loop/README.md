# repo-dev-loop (copy/paste template)

This directory is intended to be copied into a target repo as a practical starting point for an "agent + CI scoring" orchestration loop.

It demonstrates:

- agent step hook that generates a prompt (`agent generate-context`)
- agent execution via `agent run` (Codex/Claude/etc.)
- parsing Codex stdout into JSONL (`parse --type codex`)
- reward step that computes a `run.reward.reported` score from evidence producers

## Quick start

```bash
cp -R docs/orchestration/examples/repo-dev-loop/* .
git add -A
git commit -m "Add dev-loop orchestration template"

# uses the local echo agent by default (no external credentials)
git a5c run playbook --playbook playbooks/dev_loop.yaml@v1 --run-id run_dev_001 --max-iterations 50 --json
```

## Run with Azure Codex

The CLI bundles upstream-style profiles like `azure_codex_gpt5`.

```bash
export AZURE_OPENAI_PROJECT_NAME=...
export AZURE_OPENAI_API_KEY=...

git a5c run playbook --playbook playbooks/dev_loop.yaml@v1 --run-id run_dev_002 --agent-profile azure_codex_gpt5 --max-iterations 200 --json
```

## Files written

- Durable run state: `.collab/runs/<run_id>/events/*.json`
- Non-tracked artifacts (prompt, agent stdout, parsed events): `artifacts/runs/<run_id>/...`

