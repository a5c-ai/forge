# Architecture overview

**Audience:** contributors, operators  
**Status:** draft

## Components

- **`packages/sdk`**: core library (parse, snapshot load, render, write helpers, verification stubs)
- **`packages/cli`**: `git a5c` commands (read + write) built on the SDK
- **`apps/ui`**: Next.js UI; reads via SDK and performs writes locally or via server proxy
- **`packages/server`**: minimal HTTP API over a Git repo; emits outgoing webhooks
- **`spec/`**: JSON Schemas + test vectors
- **`fixtures/`**: fixture repos used in tests

## Determinism

Rendering is deterministic given:

- a Git snapshot (`treeish` resolved to a commit)
- optional inbox refs

Event ordering is derived from filenames (see `packages/sdk/src/collab/eventKey.ts`).