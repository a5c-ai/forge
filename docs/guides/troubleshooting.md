# Troubleshooting + FAQ

**Audience:** users, operators  
**Status:** draft

## Common issues

### “not a git repository”

- You ran the CLI outside a repo. Re-run inside the repo root, or pass `--repo <path>`.

### `.collab/**` files missing in snapshots

- Some environments have global gitignore rules that ignore dot-directories. Ensure `.collab/**` is tracked.
- The test suite uses `git add -f .collab` to be robust against this.

### UI write actions don’t work in remote mode

- Ensure `A5C_REMOTE_URL` is set in the UI environment.
- If the server requires a token, set `A5C_REMOTE_TOKEN` in the UI and `A5C_SERVER_TOKEN` on the server.

### Webhook delivery not happening

- Confirm `.collab/webhooks.json` exists and validates against `spec/schemas/webhooks.config.schema.json`.
- Confirm outbound endpoints are allowed by the server SSRF allowlist configuration.
- Check server logs for dead-letter / retry output.

## FAQ

### Is this a database?

No: the Git repository is the source of truth, and `.collab/**` is tracked content.

### Is delivery exactly-once?

No: webhooks are at-least-once; receivers must dedupe by `deliveryId`.