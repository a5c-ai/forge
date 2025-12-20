import { runGit, runGitCapture } from "./exec.js";
import { emitA5cforgeWebhook } from "../webhooks/emitters.js";

export async function maybeCommitAndEmit(args: {
  repoRoot: string;
  actor: string;
  doCommit: boolean;
  message: string;
  path: string;
  event: any;
}) {
  if (!args.doCommit) return;
  await runGit(["add", "-A"], args.repoRoot);
  await runGit(["-c", `user.name=${args.actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", args.message], args.repoRoot);
  const commit = (await runGitCapture(["rev-parse", "HEAD"], args.repoRoot)).trim();
  await emitA5cforgeWebhook({ repoRoot: args.repoRoot, commit, path: args.path, event: args.event });
}


