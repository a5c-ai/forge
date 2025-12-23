import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { runGit, runGitCapture } from "./exec.js";
import { emitA5cforgeWebhook } from "../webhooks/emitters.js";

export async function writeToInboxRef<T>(
  repoRoot: string,
  inboxRef: string,
  args: { actor: string; message: string; fn: (worktreeDir: string) => Promise<T> }
): Promise<{ result: T; commit: string }> {
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-inbox-"));
  const tmpBranch = `a5cforge-inbox-tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  try {
    // Create an empty worktree (no checkout), then commit only `.collab/**` onto `inboxRef`.
    await runGit(["worktree", "add", "--detach", "--no-checkout", wt, "HEAD"], repoRoot);
    await runGit(["checkout", "--orphan", tmpBranch], wt);

    const inboxExists = await runGitCapture(["show-ref", "--verify", "--quiet", inboxRef], repoRoot)
      .then(() => true)
      .catch(() => false);
    if (inboxExists) {
      try {
        await runGit(["checkout", inboxRef, "--", ".collab"], wt);
      } catch {
        // If the ref exists but has no `.collab`, treat as empty inbox.
      }
    }

    const res = await args.fn(wt);
    await runGit(["add", "-A"], wt);
    await runGit(["-c", `user.name=${args.actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", args.message], wt);
    const commit = (await runGitCapture(["rev-parse", "HEAD"], wt)).trim();
    await runGit(["update-ref", inboxRef, commit], repoRoot);
    if (res && typeof res === "object" && "path" in (res as any) && "event" in (res as any)) {
      await emitA5cforgeWebhook({ repoRoot, commit, path: String((res as any).path), event: (res as any).event });
    }
    return { result: res, commit };
  } finally {
    try {
      await runGit(["worktree", "remove", "--force", wt], repoRoot);
    } catch {}
    try {
      await runGit(["branch", "-D", tmpBranch], repoRoot);
    } catch {}
    try {
      await fs.rm(wt, { recursive: true, force: true });
    } catch {}
  }
}


