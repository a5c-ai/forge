# Contributing

**Audience:** contributors  
**Status:** draft

## Setup

```bash
pnpm install
```

## Useful scripts

- `pnpm lint`
- `pnpm dupcheck`
- `pnpm test`
- `pnpm coverage`
- `pnpm docs:check`

## Repo layout

- `packages/sdk`: core logic + tests
- `packages/cli`: git subcommand CLI + integration tests
- `packages/server`: remote API + webhooks + integration tests
- `apps/ui`: Next.js UI + unit tests + Playwright e2e
- `spec/`: JSON schemas + vectors
- `fixtures/`: fixture repos

## Adding a new event kind

1. Add a schema under `spec/schemas/*.schema.json`
2. Add mapping in `spec/schemas/kind-map.v1.json`
3. Add/extend fixtures under `fixtures/**/.collab/**`
4. Extend SDK writers/renderers if needed
5. Ensure `pnpm test` and `pnpm coverage` pass