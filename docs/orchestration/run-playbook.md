# `git a5c run playbook`

Run a playbook end-to-end locally without creating an issue.

This command is a convenience wrapper around:

- `git a5c run dispatch`
- repeated `git a5c run tick`

It will execute agent steps (via step hooks), context generation, parsing, and reward steps, as defined by your repo's hook mapping.

## Usage

```bash
git a5c run playbook --playbook playbooks/web_feature.yaml@v1 \
  [--run-id run_001] \
  [--overrides-file overrides.json] \
  [--max-iterations 50] \
  [--json]
```

## Notes

- The playbook is read from the git `--treeish` (default: `HEAD`). Ensure it is committed.
- The run is event-sourced under `/.collab/runs/<run_id>/events/*.json` and committed to git.
- If the root run blocks on deps, the command exits with code `30` (same as `run tick`).
- If the run blocks on a human breakpoint, it exits non-zero (code `20`) and prints a status summary.

