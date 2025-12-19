import fs from "node:fs/promises";
import path from "node:path";
import { ShellGit } from "../git/ShellGit.js";
import type { IGit } from "../git/IGit.js";

export type RepoHandle = {
  root: string;
  git: IGit;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function openRepo(repoPath: string): Promise<RepoHandle> {
  const root = path.resolve(repoPath);
  const gitDir = path.join(root, ".git");
  if (!(await pathExists(gitDir))) {
    throw new Error(`Not a git repository (missing .git): ${root}`);
  }
  return { root, git: new ShellGit(root) };
}


