# Server HTTP API (`/v1/*`)

**Audience:** contributors, operators  
**Status:** draft

Implementation reference: `packages/server/src/server.ts`, `packages/server/src/routes/v1/*`.

## Query parameters (read routes)

- `treeish`: git ref/oid to render (default `HEAD`)
- `inbox`: comma-separated inbox refs (alternative to repeated `inboxRef`)
- `inboxRef`: may be repeated (`?inboxRef=refs/...&inboxRef=refs/...`)

Server parses these in `packages/server/src/server.ts`.

## Read routes (GET)

Defined in `packages/server/src/routes/v1/readRoutes.ts`:

- `GET /v1/status` → `{ treeish, issues, prs }`
- `GET /v1/issues` → rendered issues array
- `GET /v1/issues/:id` → rendered issue or 404
- `GET /v1/prs` → rendered PRs array
- `GET /v1/prs/:key` → rendered PR or 404

## Write routes (POST)

Defined in `packages/server/src/routes/v1/writeRoutes.ts`. All write routes accept JSON bodies.

### `POST /v1/issues/:id/comments`

Body:

- `body` (required): string
- `commentId` (optional): default `c_<ms>`
- `message` (optional): git commit message
- `actor` (optional): used only when client signatures are not required and no `A5C-Client` headers are present

### `POST /v1/issues/:id/gate`

Body:

- `needsHuman` (boolean)
- `topic` (optional string)
- `message` (optional string, also used as commit message default)

### `POST /v1/issues/:id/blockers`

Body:

- `op` (required): `"add" | "remove"`
- `by.type` (required): `"issue" | "pr"`
- `by.id` (required): string
- `note` (optional string)

### `POST /v1/issues/:id/claim` and `POST /v1/prs/:key/claim`

Body:

- `op` (required): `"claim" | "release"`
- `agentId` (optional): defaults to `actor`
- `note` (optional)

### `POST /v1/prs/:key/request`

Body:

- `baseRef` (required)
- `title` (required)
- `body` (optional)

### `POST /v1/prs/:key/proposal`

Body:

- `baseRef` (required)
- `headRef` (required)
- `title` (required)
- `body` (optional)

### Commit behavior for write routes

Write routes support a query parameter controlling committing:

- `?commit=true|false|1|0` (default: commit)

See `commitFlagFromQuery()` in `packages/server/src/routes/v1/writeRoutes.ts`.

## Git events route (POST)

Defined in `packages/server/src/routes/v1/gitRoutes.ts`:

- `POST /v1/git/ref-updated`
  - Body: `{ ref, oldOid, newOid, actor? }`
  - Emits `git.ref.updated`, `git.commit.created` (for each introduced commit), and `git.tree.changed`.
