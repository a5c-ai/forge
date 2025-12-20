# Auth

**Audience:** contributors, operators  
**Status:** draft

## Bearer token (server-wide)

If `A5C_SERVER_TOKEN` (or `A5C_REMOTE_TOKEN`) is set, every request must include:

- `Authorization: Bearer <token>`

Implementation: `packages/server/src/http/auth.ts`.

## Optional client signatures (write routes)

Write routes can require request signing by setting:

- `A5C_REQUIRE_CLIENT_SIGNATURE=1|true|yes`

Headers:

- `A5C-Client: <clientId>`
- `A5C-Client-Signature: ed25519;<clientId>;<base64(signature)>`

Verification:

- Canonicalize the JSON request body via JCS (`jcsStringify`)
- Compute `sha256` and verify the signature with the repo-tracked public key at:
  - `.collab/keys/clients/<clientId>.pub`

Implementation: `packages/server/src/auth/clientSig.ts`, JCS: `packages/sdk/src/crypto/jcs.ts`.

Notes:

- If client signatures are not present (and not required), server actor defaults to `body.actor` or `A5C_ACTOR` or `"server"`.
