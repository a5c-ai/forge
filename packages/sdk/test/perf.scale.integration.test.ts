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
  listIssues,
  listPRs,
  writeCommentCreated,
  writeGateChanged,
  writeIssueCreated,
  writePrRequest
} from "../src/index.js";

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

function hrMs(start: bigint, end: bigint) {
  return Number(end - start) / 1e6;
}

type GenOpts = {
  issues: number;
  commentsPerIssue: number;
  prs: number;
  actors: string[];
};

async function generateTeamLoadRepo(dir: string, opts: GenOpts) {
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "init"], dir);

  const baseWall = Date.parse("2025-01-01T00:00:00.000Z");
  let wallMs = baseWall;
  const nextTime = () => new Date((wallMs += 1)).toISOString();
  const pickActor = (i: number) => opts.actors[i % opts.actors.length]!;

  // A single clock per actor makes timestamps monotonic per actor while still interleaving across actors.
  const clocks = new Map<string, HlcClock>();
  const nextNonce = (() => {
    let n = 0;
    return () => String(++n).padStart(4, "0");
  })();

  const ulid = new UlidGenerator();

  // Create issues, comments, and a few gates.
  for (let i = 0; i < opts.issues; i++) {
    const actor = pickActor(i);
    const clock = clocks.get(actor) ?? new HlcClock({ wallMs: 0, counter: 0 });
    clocks.set(actor, clock);
    const time = nextTime();
    const issueId = `issue-scale-${i}-${ulid.generate()}`;
    await writeIssueCreated({ repoRoot: dir, actor, clock, nextNonce }, { issueId, title: `Issue ${i}`, body: `body ${i}`, time });

    // Sprinkle gate events like a human reviewer would.
    if (i % 5 === 0) {
      await writeGateChanged(
        { repoRoot: dir, actor, clock, nextNonce },
        { entity: { type: "issue", id: issueId }, needsHuman: true, topic: "review", message: "needs eyes", time: nextTime() }
      );
    }

    for (let c = 0; c < opts.commentsPerIssue; c++) {
      const cActor = pickActor(i + c + 1);
      const cClock = clocks.get(cActor) ?? new HlcClock({ wallMs: 0, counter: 0 });
      clocks.set(cActor, cClock);
      await writeCommentCreated(
        { repoRoot: dir, actor: cActor, clock: cClock, nextNonce },
        { entity: { type: "issue", id: issueId }, commentId: `c-${i}-${c}`, body: `comment ${c} on issue ${i}`, time: nextTime() }
      );
    }
  }

  // Create PR requests (team coordination).
  for (let p = 0; p < opts.prs; p++) {
    const actor = pickActor(p);
    const clock = clocks.get(actor) ?? new HlcClock({ wallMs: 0, counter: 0 });
    clocks.set(actor, clock);
    const time = nextTime();
    const prKey = `pr-scale-${p}-${ulid.generate()}`;
    await writePrRequest({ repoRoot: dir, actor, clock, nextNonce }, { prKey, baseRef: "refs/heads/main", title: `PR ${p}`, body: `pr body ${p}`, time });
  }

  // Commit everything. Be robust against global gitignore rules that might ignore `.collab/**`.
  await run("git", ["add", "-A"], dir);
  await run("git", ["add", "-f", ".collab"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "scale load"], dir);
}

describe("performance (scale) - SDK snapshot/render", () => {
  it(
    "loads and renders a team-sized repo without egregious regressions (smoke)",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-perf-scale-"));

      const tGen0 = process.hrtime.bigint();
      await generateTeamLoadRepo(dir, {
        issues: 40,
        commentsPerIssue: 2,
        prs: 12,
        actors: ["alice", "bob", "carol", "dave", "erin", "frank"]
      });
      const tGen1 = process.hrtime.bigint();

      const repo = await openRepo(dir);

      const t0 = process.hrtime.bigint();
      const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD" });
      const t1 = process.hrtime.bigint();

      const issueIds = listIssues(snap);
      const prKeys = listPRs(snap);

      const sampleIssues = issueIds.slice(0, 20).map((id) => renderIssue(snap, id)).filter(Boolean);
      const samplePrs = prKeys.slice(0, 20).map((k) => renderPR(snap, k)).filter(Boolean);
      const t2 = process.hrtime.bigint();

      expect(issueIds.length).toBe(40);
      expect(prKeys.length).toBe(12);
      expect(sampleIssues.length).toBeGreaterThan(0);
      expect(samplePrs.length).toBeGreaterThan(0);

      const genMs = hrMs(tGen0, tGen1);
      const loadMs = hrMs(t0, t1);
      const renderMs = hrMs(t1, t2);

      // Default thresholds are intentionally generous for Windows+CI; tighten locally with env vars if desired.
      const maxGenMs = Number(process.env.A5C_PERF_MAX_GEN_MS ?? "25000");
      const maxLoadMs = Number(process.env.A5C_PERF_MAX_LOAD_MS ?? "15000");
      const maxRenderMs = Number(process.env.A5C_PERF_MAX_RENDER_MS ?? "5000");

      expect(genMs).toBeLessThan(maxGenMs);
      expect(loadMs).toBeLessThan(maxLoadMs);
      expect(renderMs).toBeLessThan(maxRenderMs);

      if (process.env.A5C_PERF_LOG === "1") {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({ genMs, loadMs, renderMs, issues: issueIds.length, prs: prKeys.length, events: snap.collabEvents.length }, null, 2)
        );
      }
    },
    30_000
  );

  it.skipIf(process.env.A5C_PERF_LARGE !== "1")(
    "loads and renders a larger repo (optional: set A5C_PERF_LARGE=1)",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-perf-scale-large-"));
      await generateTeamLoadRepo(dir, {
        issues: 150,
        commentsPerIssue: 3,
        prs: 60,
        actors: ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"]
      });

      const repo = await openRepo(dir);
      const t0 = process.hrtime.bigint();
      const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD" });
      const t1 = process.hrtime.bigint();

      const issueIds = listIssues(snap);
      const prKeys = listPRs(snap);
      const sampleIssues = issueIds.slice(0, 50).map((id) => renderIssue(snap, id)).filter(Boolean);
      const samplePrs = prKeys.slice(0, 50).map((k) => renderPR(snap, k)).filter(Boolean);
      const t2 = process.hrtime.bigint();

      expect(issueIds.length).toBe(150);
      expect(prKeys.length).toBe(60);
      expect(sampleIssues.length).toBeGreaterThan(0);
      expect(samplePrs.length).toBeGreaterThan(0);

      const loadMs = hrMs(t0, t1);
      const renderMs = hrMs(t1, t2);
      if (process.env.A5C_PERF_LOG === "1") {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ loadMs, renderMs, issues: issueIds.length, prs: prKeys.length, events: snap.collabEvents.length }, null, 2));
      }
    },
    120_000
  );
});


