# a5cforge/v1 — JSON Schemas (Phase 1)

These schemas validate tracked collaboration event files under `.collab/**`.

Notes:
- This is an intentionally minimal v1 baseline so fixtures can be validated early.
- Schemas are designed to be forward-compatible: most allow additional fields.
- Event type uses `kind` (namespaced string like `comment.created`).


