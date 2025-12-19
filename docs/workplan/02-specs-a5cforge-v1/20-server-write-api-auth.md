# A.3 Server write API authentication (asymmetric)
External orchestrators will write back a5cforge events via the server. Authentication SHOULD be asymmetric.

**Public keys in repo (tracked):**
- `.collab/keys/clients/<clientId>.pub`

**Request signing (recommended):**
- Header: `A5C-Client: <clientId>`
- Header: `A5C-Client-Signature: ed25519;<clientId>;<base64(signature)>`
- Canonicalize request body JSON via JCS and sign `sha256` hash.

Server verifies signature against the repo-tracked public key.
Authorization policy MAY be expressed in `.collab/policy.json` (optional) and applied when verification mode is enabled.


