# Dev tasks

1. Information architecture (IA) for `docs/`:
   - create/refresh `docs/README.md` as the entrypoint + map of documents
   - define a stable doc taxonomy: specs, RFCs, requirements, guides, architecture, operations
   - add “audience” and “status” labels (draft/stable/deprecated) at top of major docs
2. Specs + RFCs:
   - ensure `docs/workplan/02-specs-a5cforge-v1/*` is complete, consistent, and cross-linked to `spec/schemas/**`
   - add an RFC directory (or conventions) for design changes and decisions
3. Requirements and product documentation:
   - capture “what/why”: requirements, non-goals, and roadmap notes (keep implementation details in workplan)
4. Guides:
   - user guide: install, local mode usage (CLI + UI), common workflows
   - administrator guide: remote mode setup, keys/auth, webhooks configuration, backups, upgrades
   - troubleshooting + FAQ: common failure modes and how to diagnose
5. Architecture documentation:
   - high-level architecture diagrams/notes for monorepo components (SDK/CLI/UI/server/spec)
   - data model: `.collab/**` layout, event kinds, invariants, determinism expectations
6. “How to contribute”:
   - local dev setup (pnpm, Node versions), running tests, fixtures, adding schemas, release process
   - coding standards: formatting/linting, commit conventions (if used), PR checklist


