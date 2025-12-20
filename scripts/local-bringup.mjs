import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function pickCmd(bin) {
  if (process.platform === "win32") return `${bin}.cmd`;
  return bin;
}

function runInherit(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code})`));
    });
  });
}

function spawnLong(cmd, args, opts) {
  // On Windows, spawning `.cmd` and even some PATH-resolved executables is more robust via a shell.
  // This avoids `spawn EINVAL` issues when launching pnpm/node from mixed shells.
  const child = spawn(cmd, args, { ...opts, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" });
  return child;
}

function parseArgs(argv) {
  const flags = {
    repo: undefined,
    serverPort: 3939,
    uiPort: 3000,
    token: "devtoken",
    skipInstall: false,
    skipBuild: false,
    seed: true
  };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === "--repo") flags.repo = rest.shift();
    else if (a === "--server-port") flags.serverPort = Number(rest.shift());
    else if (a === "--ui-port") flags.uiPort = Number(rest.shift());
    else if (a === "--token") flags.token = String(rest.shift());
    else if (a === "--skip-install") flags.skipInstall = true;
    else if (a === "--skip-build") flags.skipBuild = true;
    else if (a === "--no-seed") flags.seed = false;
    else if (a === "--help" || a === "-h") {
      flags.help = true;
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return flags;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeJson(p, obj) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function eventFilename({ tsMs, actor, nonce4, kind, ext }) {
  return `${tsMs}_${actor}_${nonce4}.${kind}.${ext}`;
}

async function seedRepo(repoDir) {
  const actor = "alice";
  const t = Date.now();
  const time = nowIso();
  const yyyy = time.slice(0, 4);
  const mm = time.slice(5, 7);

  // Minimal discovery config (no inbox by default).
  await writeJson(path.join(repoDir, ".collab", "discovery.json"), { schema: "a5cforge/v1", inboxRefs: [] });

  // Minimal webhooks config (disabled) to show how it fits into the repo.
  await writeJson(path.join(repoDir, ".collab", "webhooks.json"), {
    schema: "a5cforge/v1",
    endpoints: [{ id: "local-dev", url: "http://127.0.0.1:0/disabled", events: ["*.*"], enabled: false }]
  });

  // Create a sample issue + comment so UI has something to render.
  const issueId = "issue-1";
  const issueDir = path.join(repoDir, ".collab", "issues", issueId, "events", yyyy, mm);
  await ensureDir(issueDir);
  const issueEvent = {
    schema: "a5cforge/v1",
    kind: "issue.event.created",
    id: `evt_${issueId}_0001`,
    time,
    actor,
    payload: { issueId, title: "Hello a5cforge", body: "This repo was created by scripts/local-bringup.mjs", state: "open" }
  };
  await writeJson(path.join(issueDir, eventFilename({ tsMs: t, actor, nonce4: "0001", kind: issueEvent.kind, ext: "json" })), issueEvent);

  const commentEvent = {
    schema: "a5cforge/v1",
    kind: "comment.created",
    id: `evt_${issueId}_c1_0002`,
    time,
    actor,
    payload: { entity: { type: "issue", id: issueId }, commentId: "c1", body: "First comment from local bring-up." }
  };
  await writeJson(path.join(issueDir, eventFilename({ tsMs: t + 1, actor, nonce4: "0002", kind: commentEvent.kind, ext: "json" })), commentEvent);

  // Generate a dev client key (optional; useful if you later enable client signatures).
  const client = crypto.generateKeyPairSync("ed25519");
  const clientPub = client.publicKey.export({ format: "pem", type: "spki" }).toString();
  await ensureDir(path.join(repoDir, ".collab", "keys", "clients"));
  await fs.writeFile(path.join(repoDir, ".collab", "keys", "clients", "alice.pub"), clientPub, "utf8");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(
      [
        "usage: node scripts/local-bringup.mjs [options]",
        "",
        "options:",
        "  --repo <path>         Use an existing directory (otherwise creates a temp dir)",
        "  --server-port <n>     Server port (default 3939)",
        "  --ui-port <n>         UI port (default 3000)",
        "  --token <token>       Bearer token for server/UI (default devtoken)",
        "  --skip-install        Skip pnpm install",
        "  --skip-build          Skip building server/cli",
        "  --no-seed             Do not seed .collab events/config",
        ""
      ].join("\n")
    );
    return;
  }

  const repoRoot = path.resolve(import.meta.dirname, "..");
  const repoDir = flags.repo
    ? path.resolve(flags.repo)
    : await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-local-"));

  await ensureDir(repoDir);
  await runInherit("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
  await runInherit("git", ["config", "user.name", "alice"], { cwd: repoDir });
  await runInherit("git", ["config", "user.email", "alice@example.invalid"], { cwd: repoDir });

  if (flags.seed) {
    await seedRepo(repoDir);
    await runInherit("git", ["add", "-A"], { cwd: repoDir });
    await runInherit("git", ["add", "-f", ".collab"], { cwd: repoDir });
    await runInherit("git", ["commit", "-q", "-m", "seed .collab"], { cwd: repoDir });
  } else {
    await runInherit("git", ["commit", "--allow-empty", "-q", "-m", "empty repo"], { cwd: repoDir });
  }

  if (!flags.skipInstall) {
    await runInherit(pickCmd("pnpm"), ["install"], { cwd: repoRoot });
  }
  if (!flags.skipBuild) {
    await runInherit(pickCmd("pnpm"), ["-C", "packages/server", "build"], { cwd: repoRoot });
    await runInherit(pickCmd("pnpm"), ["-C", "packages/cli", "build"], { cwd: repoRoot });
  }

  // Create a server signing keypair (kept in env; public key could be tracked if desired).
  const webhookKeyId = "local-dev";
  const webhookKey = crypto.generateKeyPairSync("ed25519");
  const webhookPrivatePem = webhookKey.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  const serverEnv = {
    ...process.env,
    PORT: String(flags.serverPort),
    A5C_SERVER_REPO: repoDir,
    A5C_SERVER_TOKEN: flags.token,
    A5C_WEBHOOK_KEY_ID: webhookKeyId,
    A5C_WEBHOOK_PRIVATE_KEY_PEM: webhookPrivatePem,
    A5C_WEBHOOK_ALLOW_HOSTS: "127.0.0.1,localhost"
  };

  const uiEnv = {
    ...process.env,
    PORT: String(flags.uiPort),
    A5C_REPO: repoDir,
    A5C_TREEISH: "HEAD",
    A5C_REMOTE_URL: `http://127.0.0.1:${flags.serverPort}`,
    A5C_REMOTE_TOKEN: flags.token
  };

  console.log("");
  console.log("repo:", repoDir);
  console.log("server:", `http://127.0.0.1:${flags.serverPort}`);
  console.log("ui:", `http://127.0.0.1:${flags.uiPort}`);
  console.log("");
  console.log("Tip: try 'git a5c status --repo <repoDir>' against this repo (after installing the CLI).");
  console.log("");

  const server = spawnLong("node", ["packages/server/dist/bin/a5c-server.js"], { cwd: repoRoot, env: serverEnv });
  // Prefer PORT env var for Next dev, avoids cross-platform arg parsing issues.
  const ui = spawnLong(pickCmd("pnpm"), ["-C", "apps/ui", "dev"], { cwd: repoRoot, env: uiEnv });

  const shutdown = () => {
    try {
      ui.kill("SIGINT");
    } catch (e) {
      void e;
    }
    try {
      server.kill("SIGINT");
    } catch (e) {
      void e;
    }
  };

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());

  // Keep the parent alive until one exits.
  await new Promise((resolve) => {
    server.on("exit", resolve);
    ui.on("exit", resolve);
  });
  shutdown();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


