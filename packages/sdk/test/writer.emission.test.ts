import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { HlcClock } from "../src/write/hlc.js";
import {
  writeAgentHeartbeat,
  writeCommentCreated,
  writeIssueCreated,
  writeOpsEvent,
  writePrEvent,
  writePrRequest
} from "../src/write/writer.js";
import { parseEventFileBytes } from "../src/collab/parseEventFile.js";

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  }
  await walk(root);
  return out;
}

describe("writers (emission)", () => {
  it("emits valid .collab files with correct path/filename grammar", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-writer-"));
    const clock = new HlcClock();
    let nonce = 0;
    const ctx = { repoRoot: dir, actor: "alice", clock, nextNonce: () => String(++nonce).padStart(4, "0") };

    await writeIssueCreated(ctx, { issueId: "issue-1", title: "T", body: "B", time: "2025-12-19T10:00:00Z" });
    await writeCommentCreated(ctx, {
      entity: { type: "issue", id: "issue-1" },
      commentId: "c1",
      body: "hi",
      time: "2025-12-19T10:01:00Z"
    });
    await writePrRequest(ctx, {
      prKey: "pr-1",
      baseRef: "refs/heads/main",
      title: "Request",
      body: "body",
      time: "2025-12-19T10:02:00Z"
    });
    await writePrEvent(ctx, {
      prKey: "pr-1",
      action: "claim",
      headRef: "refs/heads/wip",
      message: "claim",
      time: "2025-12-19T10:03:00Z"
    });
    await writeAgentHeartbeat(ctx, { agentId: "agent1", ttlSeconds: 60, status: "ok", time: "2025-12-19T10:04:00Z" });
    await writeOpsEvent(ctx, {
      op: "build",
      entity: { type: "pr", id: "pr-1" },
      status: "success",
      artifact: { name: "x", uri: "https://example.invalid/x" },
      time: "2025-12-19T10:05:00Z"
    });

    const files = (await listFiles(dir)).filter((p) => p.includes(`${path.sep}.collab${path.sep}`));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const rel = f.slice(dir.length + 1).split(path.sep).join("/");
      expect(rel).toMatch(
        /^\.collab\/(issues\/[^/]+\/events|prs\/[^/]+\/events|agents\/events|ops\/events)\/\d{4}\/\d{2}\/\d{13}_[A-Za-z0-9._-]+_\d{4}\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*\.(json|md)$/
      );
      const bytes = await fs.readFile(f);
      const ev = parseEventFileBytes(rel, bytes);
      expect(ev.schema).toBe("a5cforge/v1");
      expect(typeof ev.kind).toBe("string");
      expect(typeof ev.time).toBe("string");
      expect(typeof ev.actor).toBe("string");
      expect(typeof ev.payload).toBe("object");
    }
  });
});


