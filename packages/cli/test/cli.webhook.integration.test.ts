import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { runCli } from "../src/run.js";
import { makeEmptyRepo, run, listenOnce } from "./_util.js";

async function makeRepoWithWebhooks(): Promise<string> {
  const dir = await makeEmptyRepo("a5cforge-cli-webhook-");
  await fs.mkdir(path.join(dir, ".collab"), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".collab", "webhooks.json"),
    JSON.stringify(
      {
        schema: "a5cforge/v1",
        endpoints: [{ id: "e1", url: "https://example.invalid/webhook", events: ["git.ref.updated"], enabled: true }]
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await run("git", ["add", "-A"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add webhooks"], dir);
  return dir;
}

describe("CLI webhook helpers (Phase 8)", () => {
  it("webhook status reads from treeish (HEAD)", async () => {
    const repo = await makeRepoWithWebhooks();
    let out = "";
    const code = await runCli(["webhook", "status", "--repo", repo], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out).toContain("schema: a5cforge/v1");
    expect(out).toContain("endpoints: 1");
    expect(out).toContain("- e1: https://example.invalid/webhook (git.ref.updated)");
  });

  it("webhook test posts an envelope to the given url", async () => {
    const repo = await makeRepoWithWebhooks();
    let got: any = null;
    const rcv = await listenOnce((req, body) => {
      expect(req.method).toBe("POST");
      expect(String(req.headers["content-type"] ?? "")).toContain("application/json");
      got = JSON.parse(body.toString("utf8"));
    });

    try {
      let out = "";
      const code = await runCli(["webhook", "test", "--repo", repo, "--url", `${rcv.url}/recv`, "--type", "git.ref.updated"], {
        stdout: (s) => (out += s),
        stderr: () => {}
      });
      expect(code).toBe(0);
      expect(out).toContain("status: 200");
      expect(got).toMatchObject({ schema: "a5cforge/v1", type: "git.ref.updated", source: { serverId: "cli" } });
    } finally {
      await rcv.close();
    }
  });
});


