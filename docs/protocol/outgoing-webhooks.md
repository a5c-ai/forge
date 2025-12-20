# Outgoing webhooks

**Audience:** contributors, operators  
**Status:** draft

Implementation reference: `packages/server/src/webhooks/outgoing.ts`, `packages/server/src/webhooks/emitters.ts`.

## Repo config

Configured in the repo (tracked):

- `.collab/webhooks.json`
- Schema: `spec/schemas/webhooks.config.schema.json`

CLI helper to inspect config:

- `git a5c webhook status` (implementation: `packages/cli/src/commands/webhook.ts`)

## Envelope + headers (as-built)

Server sends JSON POST bodies (envelope) and includes:

- `a5c-signed: sha256:<hex>` where `<hex>` is sha256 of canonical JCS bytes
- optionally `a5c-signature: ed25519;<keyId>;<base64(signature)>` when signing is configured

Signing config (environment):

- `A5C_WEBHOOK_KEY_ID`
- `A5C_WEBHOOK_PRIVATE_KEY_PEM`

Canonicalization uses JCS (`packages/sdk/src/crypto/jcs.ts`).

## Delivery behavior

- Rate limiting (per endpoint): `A5C_WEBHOOK_RATE_PER_SEC` (default `10`)
- Allowlist / SSRF safety:
  - `A5C_WEBHOOK_ALLOW_HOSTS` (default: `127.0.0.1,localhost`)
  - `A5C_WEBHOOK_ALLOW_CIDRS` (default: `127.0.0.0/8`)
- Retries:
  - immediate retry loop (3 attempts with small backoff)
  - failures get enqueued and are retried opportunistically on future emissions (up to 10 attempts)

Queue/dead-letter storage:

- queue path (default git-path): `A5C_WEBHOOK_QUEUE_PATH`
- dead-letter path (default git-path): `A5C_WEBHOOK_DEADLETTER_PATH`

Both are written under `.git/` via `git rev-parse --git-path` by default.
