import { spawn } from "node:child_process";

export async function stageFiles(repoRoot: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["add", "--", ...paths], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const err: Buffer[] = [];
    child.stderr.on("data", (d: Buffer) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) return resolve();
      reject(new Error(`git add failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}


