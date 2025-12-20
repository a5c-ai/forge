# Admin guide (remote mode)

**Audience:** operators  
**Status:** draft

## Overview

Remote mode splits the system:

- **UI** (`apps/ui`) serves the web experience.
- **Server** (`packages/server`) exposes a minimal HTTP API over a Git repo and emits outgoing webhooks.

## Server setup

The server reads configuration from environment variables:

- `A5C_SERVER_REPO` (or `A5C_REPO`): absolute path to the git repo on disk
- `A5C_SERVER_TOKEN` (or `A5C_REMOTE_TOKEN`): optional bearer token required for requests

Run it:

```bash
pnpm -C packages/server build
PORT=3939 node packages/server/dist/bin/a5c-server.js
```

## UI remote mode

Configure the UI to proxy write actions to the server:

- `A5C_REMOTE_URL` (example: `http://localhost:8787`)
- `A5C_REMOTE_TOKEN` (must match server token if enabled)

## Webhooks configuration

Outgoing webhooks are configured in the repo (tracked):

- `.collab/webhooks.json` (schema: `spec/schemas/webhooks.config.schema.json`)

Public keys used by receivers are tracked in the repo:

- `.collab/keys/webhooks/<keyId>.pub`

Private signing keys are stored outside the repo (server/operator responsibility).

## Backups + upgrades

- Back up the repository like any other Git repo (including `.collab/**`).
- Prefer upgrading server/UI/CLI together; schemas are designed to be forward-compatible.
