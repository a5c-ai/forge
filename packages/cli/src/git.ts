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

export async function gitHasOrigin(cwd: string): Promise<boolean> {
  try {
    const out = await git(["remote", "get-url", "origin"], cwd);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function gitCurrentBranch(cwd: string): Promise<string | undefined> {
  try {
    const out = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
    const v = out.trim();
    return v.length ? v : undefined;
  } catch {
    return undefined;
  }
}

export async function gitHasUpstream(cwd: string): Promise<boolean> {
  try {
    const out = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function gitIsClean(cwd: string): Promise<boolean> {
  try {
    const out = await git(["status", "--porcelain"], cwd);
    return out.trim().length === 0;
  } catch {
    return false;
  }
}

export async function gitPullFFOnly(cwd: string): Promise<void> {
  await git(["pull", "--ff-only"], cwd);
}

export async function gitPush(cwd: string): Promise<void> {
  await git(["push"], cwd);
}

export async function gitFetchRef(cwd: string, remote: string, ref: string): Promise<void> {
  await git(["fetch", remote, `${ref}:${ref}`], cwd);
}


