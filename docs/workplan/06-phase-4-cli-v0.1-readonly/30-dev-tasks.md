# Dev tasks
1. Command router + help
2. Repo detection (`git rev-parse --show-toplevel`)
3. Render calls into SDK + formatters
4. Add `--treeish`, `--inbox-ref`, `--mirror-url`, `--json`
5. Implement `journal`:
   - read `.collab/**` events across issues + PRs (optionally constrained)
   - read global `.collab/agents/events` and `.collab/ops/events`
   - optionally include git activity (from local git log / recent refs) when `--types` includes `git.*`
   - compute “active” agents using `ttlSeconds` + current time (only for CLI journal; render remains deterministic)


