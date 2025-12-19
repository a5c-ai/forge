# Commands (write)
- Issues:
  - `git a5c issue new --title ... [--body ...]`
  - `git a5c issue comment <id> -m ...`
  - `git a5c issue edit-comment <commentId> -m ...`
  - `git a5c issue redact-comment <commentId>`
  - `git a5c issue close|reopen <id>`
  - `git a5c block <entity> --by <issue/pr>` / `git a5c unblock ...`
  - `git a5c gate needs-human <entity> --topic ... -m ...`
  - `git a5c gate clear <entity>`
- PRs:
  - `git a5c pr propose --base main --head feature-x --title ...`
  - `git a5c pr request --base main --title ... --body ...`
  - `git a5c pr claim <prKey> --head-ref ...`
  - `git a5c pr bind-head <prKey> --head-ref ...`
  - `git a5c pr merge-record <prKey> --method squash --commit <oid>`
- Agents/ops:
  - `git a5c agent heartbeat ...`
  - `git a5c agent dispatch ...`
  - `git a5c ops deploy ... --env staging --rev HEAD --artifact ...`
- Hooks:
  - `git a5c hooks install|uninstall`


