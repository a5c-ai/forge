import { spawn } from "node:child_process";

export async function git(args: string[], cwd: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d: Buffer) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) return resolve(Buffer.concat(out).toString("utf8"));
      reject(new Error(`git ${args.join(" ")} failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

export async function detectRepoRoot(cwd: string): Promise<string> {
  const out = await git(["rev-parse", "--show-toplevel"], cwd);
  return out.trim();
}

export async function gitConfigGet(cwd: string, key: string): Promise<string | undefined> {
  try {
    const out = await git(["config", "--get", key], cwd);
    const v = out.trim();
    return v.length ? v : undefined;
  } catch {
    return undefined;
  }
}

export async function gitPath(cwd: string, name: string): Promise<string> {
  const out = await git(["rev-parse", "--git-path", name], cwd);
  return out.trim();
}


