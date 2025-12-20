# Event files + ordering

**Audience:** contributors  
**Status:** draft

Implementation reference: `packages/sdk/src/collab/*`, schemas: `spec/schemas/*`.

## Supported formats

- `*.json`: a single JSON event object
- `*.md`: YAML frontmatter containing the JSON-ish event envelope; markdown body is injected into `payload.body` if missing
- `*.ndjson`: bundle; one JSON event per non-empty line

Parser: `packages/sdk/src/collab/parseEventFile.ts`.

## Deterministic ordering

Events are ordered by filename “event key” parts:

`<tsMs>_<actor>_<nonce>.<kind>.<ext>`

Ordering comparator: `packages/sdk/src/collab/eventKey.ts` sorts by:

- `tsMs` ascending
- `actor` ascending
- `nonce` ascending
- `kind` ascending
- then full path lexicographically

For `.ndjson` bundles, ordering within a bundle preserves line order via `::lineIndex`.

## Snapshot loading

The SDK loads snapshots from a Git treeish:

- main `.collab/**` events from a commit tree
- optional inbox refs (from `.collab/discovery.json` or caller-provided `inboxRefs`)

Loader: `packages/sdk/src/collab/loadSnapshot.ts`, inbox loader: `packages/sdk/src/collab/loadInbox.ts`.
