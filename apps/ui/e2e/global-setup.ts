import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { STATE_PATH } from "./_state";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32"
    });
    const err: Buffer[] = [];
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", (e) => {
      reject(new Error(`${cmd} ${args.join(" ")} spawn failed in ${cwd}: ${String((e as any)?.message ?? e)}`));
    });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("failed to allocate port")));
      }
    });
  });
}

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

async function waitFor(url: string, timeoutMs = 30_000, init?: RequestInit) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export default async function globalSetup() {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const fixture = path.join(repoRoot, "fixtures", "repo-basic");

  const uiDir = path.resolve(import.meta.dirname, "..");
  // Ensure build exists for next start (and server dist exists for remote project).
  await run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build"], uiDir);
  await run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["-C", "packages/server", "build"], repoRoot);

  const nextCli = path.join(uiDir, "node_modules", "next", "dist", "bin", "next");
  const logDir = path.join(uiDir, "test-results", "e2e-logs");
  await fs.mkdir(logDir, { recursive: true });

  async function initRepoFromFixture(tmpPrefix: string) {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), tmpPrefix));
    await copyDir(fixture, repoDir);
    await run("git", ["init", "-q", "-b", "main"], repoDir);
    await run("git", ["add", "-A"], repoDir);
    await run("git", ["add", "-f", ".collab"], repoDir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], repoDir);
    return repoDir;
  }

  async function startNext(args: { port: number; repoDir: string; extraEnv?: Record<string, string | undefined>; logName: string }) {
    const baseURL = `http://127.0.0.1:${args.port}`;
    const logPath = path.join(logDir, args.logName);
    const log = await fs.open(logPath, "w");
    let tail = "";
    const child = spawn(process.execPath, [nextCli, "start", "-p", String(args.port)], {
      cwd: uiDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(args.port),
        A5C_REPO: args.repoDir,
        A5C_TREEISH: "HEAD",
        ...(args.extraEnv ?? {})
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false
    });
    child.stdout.on("data", (d) => {
      const s = Buffer.from(d).toString("utf8");
      tail = (tail + s).slice(-4000);
      log.write(d);
    });
    child.stderr.on("data", (d) => {
      const s = Buffer.from(d).toString("utf8");
      tail = (tail + s).slice(-4000);
      log.write(d);
    });
    try {
      await waitFor(`${baseURL}/api/status`);
    } catch (e: any) {
      await log.close().catch(() => {});
      const exitNote = child.exitCode != null ? `\n(next exited code=${child.exitCode})` : "";
      throw new Error(`${String(e?.message ?? e)}${exitNote}\n\n${args.logName} (tail):\n${tail}`);
    }
    await log.close();
    return { baseURL, pid: child.pid! };
  }

  // Project: local
  const repoDirLocal = await initRepoFromFixture("a5cforge-e2e-local-");
  const localPort = await getFreePort();
  const localNext = await startNext({ port: localPort, repoDir: repoDirLocal, logName: "next-local.log" });

  // Project: remote (start server + Next in proxy mode)
  const repoDirRemote = await initRepoFromFixture("a5cforge-e2e-remote-");
  const serverPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const token = "e2e-token";
  const serverBin = path.join(repoRoot, "packages", "server", "dist", "bin", "a5c-server.js");
  const serverLogPath = path.join(logDir, "a5c-server.log");
  const serverLog = await fs.open(serverLogPath, "w");
  let serverTail = "";
  const serverProc = spawn(process.execPath, [serverBin], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(serverPort),
      A5C_SERVER_REPO: repoDirRemote,
      A5C_SERVER_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false
  });
  serverProc.stdout.on("data", (d) => {
    const s = Buffer.from(d).toString("utf8");
    serverTail = (serverTail + s).slice(-4000);
    serverLog.write(d);
  });
  serverProc.stderr.on("data", (d) => {
    const s = Buffer.from(d).toString("utf8");
    serverTail = (serverTail + s).slice(-4000);
    serverLog.write(d);
  });
  try {
    await waitFor(`${serverUrl}/v1/status`, 30_000, { headers: { authorization: `Bearer ${token}` } });
  } catch (e: any) {
    await serverLog.close().catch(() => {});
    const exitNote = serverProc.exitCode != null ? `\n(server exited code=${serverProc.exitCode})` : "";
    throw new Error(`${String(e?.message ?? e)}${exitNote}\n\na5c-server.log (tail):\n${serverTail}`);
  }
  await serverLog.close();

  const remotePort = await getFreePort();
  const remoteNext = await startNext({
    port: remotePort,
    repoDir: repoDirRemote,
    extraEnv: {
      A5C_REMOTE_URL: serverUrl,
      A5C_REMOTE_TOKEN: token
    },
    logName: "next-remote.log"
  });

  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(
    STATE_PATH,
    JSON.stringify(
      {
        local: { baseURL: localNext.baseURL, nextPid: localNext.pid, repoDir: repoDirLocal },
        remote: { baseURL: remoteNext.baseURL, nextPid: remoteNext.pid, repoDir: repoDirRemote, serverPid: serverProc.pid!, serverUrl }
      },
      null,
      2
    ),
    "utf8"
  );
}


