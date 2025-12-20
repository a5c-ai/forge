import type { CommandArgs } from "./types.js";
import path from "node:path";

export async function handleWebhook(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "webhook") return;

  const sub = args.positionals[1];
  if (sub === "status") {
    try {
      const commitOid = await args.repo.git.revParse(args.treeish);
      const raw = await args.repo.git.readBlob(commitOid, ".collab/webhooks.json");
      const cfg = JSON.parse(raw.toString("utf8"));
      const endpoints = Array.isArray(cfg?.endpoints) ? cfg.endpoints : [];
      if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify({ schema: cfg?.schema, endpoints }, null, 2));
      else {
        args.io.writeLine(args.io.out, `schema: ${cfg?.schema ?? "?"}`);
        args.io.writeLine(args.io.out, `endpoints: ${endpoints.length}`);
        for (const e of endpoints) {
          args.io.writeLine(args.io.out, `- ${e.id}: ${e.url} (${(e.events ?? []).join(",")}) ${e.enabled === false ? "[disabled]" : ""}`);
        }
      }
      return 0;
    } catch {
      args.io.writeLine(args.io.err, `no webhooks config at .collab/webhooks.json in ${args.treeish}`);
      return 2;
    }
  }

  if (sub === "test") {
    const url = args.flags.url;
    if (!url) {
      args.io.writeLine(args.io.err, "usage: git a5c webhook test --url <url> [--type <type>]");
      return 2;
    }
    const type = args.flags.type ?? "git.ref.updated";
    const envelope = {
      schema: "a5cforge/v1",
      type,
      id: `cli:${Date.now()}`,
      time: new Date(args.nowMs()).toISOString(),
      repo: { id: path.basename(args.repoRoot), path: args.repoRoot },
      source: { serverId: "cli", keyId: undefined },
      data: { note: "test" }
    };
    const r = await fetch(String(url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope, null, 2) + "\n"
    });
    const text = await r.text();
    if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify({ status: r.status, body: text }, null, 2));
    else {
      args.io.writeLine(args.io.out, `status: ${r.status}`);
      args.io.writeLine(args.io.out, text.trim());
    }
    return r.ok ? 0 : 1;
  }

  args.io.writeLine(args.io.err, "usage: git a5c webhook status|test ...");
  return 2;
}


