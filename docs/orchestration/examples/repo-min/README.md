# repo-min (copy/paste template)

This directory is intended to be copied into a target repo as a minimal, runnable A5C orchestration setup.

Quick start (from the target repo root):

```bash
# One command
git a5c run playbook --playbook playbooks/web_feature.yaml@v1 --run-id run_001 --max-iterations 50

# Equivalent low-level commands
git a5c run dispatch --playbook playbooks/web_feature.yaml@v1 --run-id run_001
git a5c run tick --run-id run_001 --max-transitions 10
```

Artifacts from the example agent step are written under:

`artifacts/runs/<run_id>/step_1/attempt_1/`

Requirements:

- `git` on PATH
- `node` on PATH (hooks + the example echo agent are Node scripts)
- `git-a5c` on PATH (or set `A5C_CLI` to a `git-a5c` JS entrypoint)
