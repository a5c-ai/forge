# A.1 Webhook specification

**Audience:** contributors, operators  
**Status:** draft

Related:
- Schemas index: `spec/schemas/README.md`
- Webhooks config schema: `spec/schemas/webhooks.config.schema.json`
- JCS implementation: `packages/sdk/src/crypto/jcs.ts`

## A.1.1 Goals
- Enable **external orchestration** (agents/CI/CD/workflows) to react to both:
  - a5cforge events (`.collab/**`)
  - standard Git activity (commits, ref updates)
- No shared database.
- Strong authenticity without shared secrets: **asymmetric cryptography**.

## A.1.2 Configuration
Server reads webhook config from repo (tracked):
- `.collab/webhooks.json`

Example:
```json
{
  "schema": "a5cforge/v1",
  "endpoints": [
    {
      "id": "orchestrator-main",
      "url": "https://orchestrator.example.com/webhook/a5c",
      "events": ["git.*", "issue.*", "pr.*", "agent.*", "dep.*", "gate.*", "ops.*"],
      "enabled": true
    }
  ]
}
```

## A.1.3 Event envelope
All webhooks use HTTP POST with JSON body:

```json
{
  "schema": "a5cforge/v1",
  "type": "<eventType>",
  "id": "<deliveryId>",
  "time": "2025-12-19T14:30:00Z",
  "repo": {"id": "<repoId>", "remote": "<optional>", "path": "<optional>"},
  "source": {"serverId": "<id>", "keyId": "<keyId>"},
  "data": { }
}
```

- `deliveryId` MUST be stable and idempotent per emitted event.
- RECOMMENDED deliveryId for a5cforge events: `{repoId}:{treeish}:{path}:{eventId}`
- RECOMMENDED deliveryId for git events: `{repoId}:{newCommit}:{ref}:{seq}`

## A.1.4 Signing and verification (asymmetric)
Webhook payload authenticity is provided by a **server signature**.

**Public keys in repo (tracked):**
- `.collab/keys/webhooks/<keyId>.pub`

**Headers (recommended):**
- `A5C-Signature: ed25519;<keyId>;<base64(signature)>`
- `A5C-Signed: <canonical-hash>` where `<canonical-hash>` is `sha256:<hex>`

**Canonicalization:**
- Canonical JSON bytes via RFC 8785 (JCS)
- `payloadHash = sha256(jcs(envelope))`
- Signature is over `payloadHash` bytes (or over the JCS bytes; choose one and document—RECOMMENDED: sign the hash).

**Verification algorithm (receiver):**
1) Load the server public key from `.collab/keys/webhooks/<keyId>.pub` (or cached copy).
2) Recompute `payloadHash`.
3) Verify signature.

**Key rotation:**
- New public key is added in a normal commit.
- Server begins signing with new `keyId` after the commit is in the repo.

## A.1.5 Replay and duplication
- Delivery is **at-least-once**; receivers MUST dedupe by `deliveryId`.
- Receivers MAY enforce a max clock skew using `time`.

## A.1.6 Endpoint allowlist and safety
Server MUST support an allowlist mechanism (server config) to prevent SSRF:
- allowed hostnames / CIDRs
- max payload size
- per-endpoint rate limiting


