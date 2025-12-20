import path from "node:path";
import { emitEnvelope, loadWebhooksConfig, type WebhooksConfig } from "./outgoing.js";

export async function emitA5cforgeWebhook(args: { repoRoot: string; commit: string; path: string; event: any }) {
  const cfg: WebhooksConfig | undefined = await loadWebhooksConfig(args.repoRoot);
  const serverId = process.env.A5C_SERVER_ID ?? "server";
  const repoId = process.env.A5C_REPO_ID ?? path.basename(args.repoRoot);
  const envelope = {
    schema: "a5cforge/v1",
    type: String(args.event?.kind ?? "unknown"),
    id: `${repoId}:${args.commit}:${args.path}:${String(args.event?.id ?? "unknown")}`,
    time: new Date().toISOString(),
    repo: { id: repoId, path: args.repoRoot },
    source: { serverId, keyId: process.env.A5C_WEBHOOK_KEY_ID ?? undefined },
    data: { path: args.path, event: args.event }
  };
  await emitEnvelope(args.repoRoot, cfg, envelope);
}

export async function emitGitWebhook(args: { repoRoot: string; ref: string; seq: number; eventType: string; data: any }) {
  const cfg: WebhooksConfig | undefined = await loadWebhooksConfig(args.repoRoot);
  const serverId = process.env.A5C_SERVER_ID ?? "server";
  const repoId = process.env.A5C_REPO_ID ?? path.basename(args.repoRoot);
  const envelope = {
    schema: "a5cforge/v1",
    type: args.eventType,
    id: `${repoId}:${args.data?.newOid ?? "unknown"}:${args.ref}:${args.seq}`,
    time: new Date().toISOString(),
    repo: { id: repoId, path: args.repoRoot },
    source: { serverId, keyId: process.env.A5C_WEBHOOK_KEY_ID ?? undefined },
    data: args.data
  };
  await emitEnvelope(args.repoRoot, cfg, envelope);
}


