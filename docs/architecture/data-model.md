# Data model (`.collab/**`)

**Audience:** contributors, operators  
**Status:** draft

## Core principles

- `.collab/**` is tracked content inside the Git repo.
- The system is event-sourced: state is computed by reducing events in deterministic order.

## Event files

Supported formats:

- one JSON per file: `*.json`
- Markdown with YAML frontmatter: `*.md`
- bundles: `*.ndjson` (one JSON object per line)

Event ordering is derived from filenames:

`<tsMs>_<actor>_<nonce>.<kind>.<ext>`

Example:

`1734628200000_alice_0001.comment.created.json`

## Inbox refs

The snapshot loader can optionally include events from “inbox” refs (useful for proposals or external ingestion).

- Configured by `.collab/discovery.json` (or passed explicitly by caller)
- Loaded via `loadSnapshot({ inboxRefs })`

## Schemas

Event shapes are defined in JSON Schema under `spec/schemas/`.