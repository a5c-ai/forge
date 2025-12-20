import { spawn } from "node:child_process";
import type { IGit, GitTreeEntry } from "./IGit.js";

export class ShellGit implements IGit {
  constructor(private readonly repoRoot: string) {}

  private runGit(args: string[], opts?: { stdin?: Buffer | string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd: this.repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (d: Buffer) => stdout.push(Buffer.from(d)));
      child.stderr.on("data", (d: Buffer) => stderr.push(Buffer.from(d)));
      child.on("error", reject);
      child.on("close", (code: number | null) => {
        if (code === 0) return resolve(Buffer.concat(stdout));
        const err = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`git ${args.join(" ")} failed (code=${code}): ${err}`));
      });

      if (opts?.stdin !== undefined) {
        child.stdin.write(opts.stdin);
      }
      child.stdin.end();
    });
  }

  async revParse(treeish: string): Promise<string> {
    const out = await this.runGit(["rev-parse", "--verify", treeish]);
    return out.toString("utf8").trim();
  }

  async lsTree(commitOid: string, treePath: string): Promise<GitTreeEntry[]> {
    let normalizedPath = treePath.replaceAll("\\", "/").trim();
    if (normalizedPath.startsWith("./")) normalizedPath = normalizedPath.slice(2);
    if (normalizedPath.endsWith("/")) normalizedPath = normalizedPath.slice(0, -1);

    // Important: `git ls-tree <commit> <path>` returns the entry for `<path>` itself,
    // not the directory contents. To list directory contents, use `<commit>:<path>`.
    const args =
      normalizedPath === "" || normalizedPath === "."
        ? ["ls-tree", "-z", commitOid]
        : ["ls-tree", "-z", `${commitOid}:${normalizedPath}`];
    let out: Buffer;
    try {
      out = await this.runGit(args);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Missing directory in tree (common for optional `.collab/**` in fixtures or inbox refs).
      if (
        msg.includes("Not a valid object name") ||
        msg.includes("does not exist in") ||
        msg.includes("pathspec") ||
        msg.includes("fatal: path") ||
        msg.includes("fatal: Not a valid object name")
      ) {
        return [];
      }
      throw e;
    }
    // Format (NUL-separated records): "<mode> <type> <oid>\t<path>\0"
    const parts = out.toString("utf8").split("\0").filter(Boolean);
    const entries: GitTreeEntry[] = [];
    for (const rec of parts) {
      const tabIdx = rec.indexOf("\t");
      if (tabIdx === -1) continue;
      const left = rec.slice(0, tabIdx);
      const p = rec.slice(tabIdx + 1);
      const [mode, type, oid] = left.split(" ");
      if (!mode || !type || !oid) continue;
      entries.push({ mode, type: type as any, oid, path: p });
    }
    return entries;
  }

  async readBlob(commitOid: string, blobPath: string): Promise<Buffer> {
    const normalizedPath = blobPath.replaceAll("\\", "/");
    // git show <commit>:<path>
    const spec = `${commitOid}:${normalizedPath}`;
    return await this.runGit(["show", spec]);
  }
}


