import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  HlcClock,
  UlidGenerator,
  loadSnapshot,
  openRepo,
  renderIssue,
  renderPR,
  writeAgentClaimChanged,
  writeCommentCreated,
  writeDepChanged,
  writeGateChanged,
  writeIssueCreated,
  writePrEvent,
  writePrRequest
} from "@a5cforge/sdk";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const err: Buffer[] = [];
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

describe("scenarios: team workflow", () => {
  it(
    "issue -> blockers -> needsHuman -> comments -> claims; pr request -> claim/bind-head yields expected rendered state",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-scenario-team-"));
      await run("git", ["init", "-q", "-b", "main"], dir);
      await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "init"], dir);

      const ulid = new UlidGenerator();
      let wall = Date.parse("2025-01-01T00:00:00.000Z");
      const t = () => new Date((wall += 1)).toISOString();
      const nonce = (() => {
        let n = 0;
        return () => String(++n).padStart(4, "0");
      })();

      const clockAlice = new HlcClock({ wallMs: 0, counter: 0 });
      const clockBob = new HlcClock({ wallMs: 0, counter: 0 });
      const clockCarol = new HlcClock({ wallMs: 0, counter: 0 });

      const issueId = `issue-scenario-${ulid.generate()}`;
      await writeIssueCreated({ repoRoot: dir, actor: "alice", clock: clockAlice, nextNonce: nonce }, { issueId, title: "Scenario issue", body: "Top-level", time: t() });

      // Blocked by a PR (unknown yet) + another issue.
      await writeDepChanged(
        { repoRoot: dir, actor: "alice", clock: clockAlice, nextNonce: nonce },
        { entity: { type: "issue", id: issueId }, op: "add", by: { type: "issue", id: "issue-xyz" }, note: "Waiting on upstream", time: t() }
      );
      await writeGateChanged(
        { repoRoot: dir, actor: "bob", clock: clockBob, nextNonce: nonce },
        { entity: { type: "issue", id: issueId }, needsHuman: true, topic: "review", message: "needs human confirmation", time: t() }
      );
      await writeCommentCreated(
        { repoRoot: dir, actor: "carol", clock: clockCarol, nextNonce: nonce },
        { entity: { type: "issue", id: issueId }, commentId: "c-1", body: "I can take a look", time: t() }
      );
      await writeAgentClaimChanged(
        { repoRoot: dir, actor: "carol", clock: clockCarol, nextNonce: nonce },
        { agentId: "agent-carol", entity: { type: "issue", id: issueId }, op: "claim", note: "Working on it", time: t() }
      );

      const prKey = `pr-scenario-${ulid.generate()}`;
      await writePrRequest({ repoRoot: dir, actor: "alice", clock: clockAlice, nextNonce: nonce }, { prKey, baseRef: "refs/heads/main", title: "Implement scenario", body: "Does the thing", time: t() });
      await writePrEvent(
        { repoRoot: dir, actor: "carol", clock: clockCarol, nextNonce: nonce },
        { prKey, action: "claim", headRef: "refs/heads/feature/scenario", message: "claimed", time: t() }
      );
      await writePrEvent(
        { repoRoot: dir, actor: "carol", clock: clockCarol, nextNonce: nonce },
        { prKey, action: "bindHead", headRef: "refs/heads/feature/scenario", message: "bound", time: t() }
      );

      // Unblock (simulate dependency resolved).
      await writeDepChanged(
        { repoRoot: dir, actor: "alice", clock: clockAlice, nextNonce: nonce },
        { entity: { type: "issue", id: issueId }, op: "remove", by: { type: "issue", id: "issue-xyz" }, note: "Resolved", time: t() }
      );

      await run("git", ["add", "-A"], dir);
      await run("git", ["add", "-f", ".collab"], dir);
      await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "scenario"], dir);

      const repo = await openRepo(dir);
      const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD" });

      const renderedIssue = renderIssue(snap, issueId);
      expect(renderedIssue).toBeTruthy();
      expect((renderedIssue as any).issueId).toBe(issueId);
      // Renderer represents needsHuman as either false or the latest gate payload (topic/message).
      expect(Boolean((renderedIssue as any).needsHuman)).toBe(true);
      expect((renderedIssue as any).needsHuman).toMatchObject({ topic: "review", message: "needs human confirmation" });
      expect((renderedIssue as any).comments.map((c: any) => c.commentId)).toContain("c-1");
      // blockers list should NOT include removed dependency.
      const blockers = (renderedIssue as any).blockers ?? [];
      expect(blockers.some((b: any) => b.by?.id === "issue-xyz")).toBe(false);
      // claims should include carol's claim.
      const claims = (renderedIssue as any).agentClaims ?? [];
      expect(claims.some((c: any) => c.agentId === "agent-carol" && c.note === "Working on it")).toBe(true);

      const renderedPr = renderPR(snap, prKey);
      expect(renderedPr).toBeTruthy();
      expect((renderedPr as any).prKey).toBe(prKey);
      // For pr.request.created roots, headRef lives on pr.event.created entries (not on the root).
      expect((renderedPr as any).headRef).toBeUndefined();
      const prEvents = (renderedPr as any).events ?? [];
      expect(prEvents.some((e: any) => e.action === "bindHead" && e.headRef === "refs/heads/feature/scenario")).toBe(true);
    },
    30_000
  );
});


