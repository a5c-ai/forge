import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { runGit, runGitCapture } from "./gitRun";

export async function writeToInboxRef<T>(args: {
  repoRoot: string;
  inboxRef: string;
  actor: string;
  message: string;
  fn: (worktreeDir: string) => Promise<T>;
}): Promise<{ result: T; commit: string }> {
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-ui-inbox-"));
  const tmpBranch = `a5cforge-ui-inbox-tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  try {
    await runGit(["worktree", "add", "--detach", "--no-checkout", wt, "HEAD"], args.repoRoot);
    await runGit(["checkout", "--orphan", tmpBranch], wt);

    const inboxExists = await runGitCapture(["show-ref", "--verify", "--quiet", args.inboxRef], args.repoRoot)
      .then(() => true)
      .catch(() => false);
    if (inboxExists) {
      try {
        await runGit(["checkout", args.inboxRef, "--", ".collab"], wt);
      } catch {
        // If the ref exists but has no `.collab`, treat as empty inbox.
      }
    }

    const result = await args.fn(wt);
    await runGit(["add", "-A"], wt);
    await runGit(["-c", `user.name=${args.actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", args.message], wt);
    const commit = (await runGitCapture(["rev-parse", "HEAD"], wt)).trim();
    await runGit(["update-ref", args.inboxRef, commit], args.repoRoot);
    return { result, commit };
  } finally {
    try {
      await runGit(["worktree", "remove", "--force", wt], args.repoRoot);
    } catch {}
    try {
      await runGit(["branch", "-D", tmpBranch], args.repoRoot);
    } catch {}
    await fs.rm(wt, { recursive: true, force: true });
  }
}
