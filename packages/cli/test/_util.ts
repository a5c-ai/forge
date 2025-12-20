import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export function run(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${stderr}`));
    });
  });
}

export async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

export async function makeRepoFromFixture(fixtureName: string): Promise<string> {
  const root = path.resolve(import.meta.dirname, "../../..");
  const fixture = path.join(root, "fixtures", fixtureName);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `a5cforge-cli-${fixtureName}-`));
  await copyDir(fixture, dir);
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["add", "-A"], dir);
  await run("git", ["add", "-f", ".collab"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], dir);
  return dir;
}

export async function makeEmptyRepo(tmpPrefix = "a5cforge-cli-write-"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), tmpPrefix));
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "init"], dir);
  return dir;
}

export function listenOnce(handler: (req: http.IncomingMessage, body: Buffer) => Promise<void> | void): Promise<{ url: string; close: () => Promise<void> }> {
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(Buffer.from(d)));
    req.on("end", async () => {
      try {
        await handler(req, Buffer.concat(chunks));
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain");
        res.end("ok\n");
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end(String(e?.message ?? e));
      }
    });
  });

  return new Promise((resolve, reject) => {
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") return reject(new Error("bad listen addr"));
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: async () =>
          await new Promise<void>((r) => {
            srv.close(() => r());
          })
      });
    });
  });
}


