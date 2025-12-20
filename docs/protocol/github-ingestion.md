# GitHub webhook ingestion

**Audience:** contributors, operators  
**Status:** draft

Implementation reference: `packages/server/src/routes/v1/githubWebhookRoute.ts`, verification helper: `packages/server/src/webhooks/github.ts`.

## Endpoint

- `POST /v1/webhooks/github`

## Verification

Server verifies GitHub HMAC signature using:

- `A5C_GITHUB_WEBHOOK_SECRET`

Only `pull_request` events are supported, and only the `opened` action is handled.

## Result

On `pull_request: opened` the server writes a `pr.proposal.created` event into an inbox ref:

- `A5C_GITHUB_INBOX_REF` (default: `refs/a5c/inbox/github`)

It uses a detached worktree write mechanism (`packages/server/src/git/writeToInboxRef.ts`) so the main working tree is not modified.
