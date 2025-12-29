# a5cforge docs

**Audience:** users, operators, contributors  
**Status:** draft

## What is a5cforge?

a5cforge is a Git-first, event-sourced collaboration system. The source of truth is tracked content under `.collab/**`, and the rendered state is deterministic from a Git snapshot.

## Document map

- **Start here**: `docs/overview.md`
- **Workplan (implementation plan)**: `docs/workplan/README.md`
- **Specs (behavioral contracts)**
  - Webhooks spec (workplan section): `docs/workplan/02-specs-a5cforge-v1/00-webhook-spec.md`
  - Webhook event types: `docs/workplan/02-specs-a5cforge-v1/10-webhook-event-types.md`
  - Server write API + auth: `docs/workplan/02-specs-a5cforge-v1/20-server-write-api-auth.md`
  - JSON Schemas: `spec/schemas/README.md`
- **Guides**
  - User guide (local mode): `docs/guides/user-guide.md`
  - Admin guide (remote mode): `docs/guides/admin-guide.md`
  - Troubleshooting + FAQ: `docs/guides/troubleshooting.md`
- **Orchestration**
  - Index: `docs/orchestration/README.md`
- **Architecture**
  - Overview: `docs/architecture/overview.md`
  - Data model (`.collab/**`): `docs/architecture/data-model.md`
- **Protocol (as-built)**
  - Index: `docs/protocol/README.md`
  - RFC (git-layer protocol): `docs/protocol/rfc-a5cforge-v1.md`
- **Scripts**
  - Local bring-up: `scripts/local-bringup.mjs`
- **CLI**
  - CLI reference: `docs/cli/reference.md`
- **Contributing**
  - Contributing guide: `docs/contributing.md`

## Repo quick links

- **Schemas**: `spec/schemas/`
- **SDK**: `packages/sdk/`
- **CLI**: `packages/cli/`
- **Server**: `packages/server/`
- **UI**: `apps/ui/`
