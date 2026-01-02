# repo-evidence-scoring (copy/paste template)

This directory is intended to be copied into a target repo as a minimal, runnable A5C orchestration setup that demonstrates:

- agent step execution (hook)
- reward scoring computed from evidence producers

Quick start (from the target repo root):

```bash
cp -R docs/orchestration/examples/repo-evidence-scoring/* .
git add -A
git commit -m "Add evidence scoring orchestration template"

git a5c run playbook --playbook playbooks/min.yaml@v1 --run-id run_score_001 --max-iterations 50 --json
```

Notes:

- This template expects `pnpm test` and `pnpm lint` to exist in the repo.
- The reward hook intentionally omits `reward_report`, so the runner:
  - runs evidence hooks for each signal
  - computes `run.reward.reported`
