import { gitCurrentBranch, gitFetchRef, gitHasOrigin, gitHasUpstream, gitIsClean, gitPullFFOnly, gitPush } from "./git.js";

export async function autoPullForRead(args: { repoRoot: string; inboxRefs?: string[]; warn?: (s: string) => void }): Promise<void> {
  const warn = args.warn ?? (() => {});
  if (!(await gitHasOrigin(args.repoRoot))) return;

  // Keep inbox refs fresh if requested. These are not guaranteed to be covered by the default fetchspec.
  if (args.inboxRefs?.length) {
    for (const ref of args.inboxRefs) {
      try {
        await gitFetchRef(args.repoRoot, "origin", ref);
      } catch (e: any) {
        warn(`warning: git fetch origin ${ref} failed: ${String(e?.message ?? e).trim()}`);
      }
    }
  }

  const branch = await gitCurrentBranch(args.repoRoot);
  if (!branch) return; // detached HEAD
  if (!(await gitHasUpstream(args.repoRoot))) return;
  if (!(await gitIsClean(args.repoRoot))) return;

  try {
    await gitPullFFOnly(args.repoRoot);
  } catch (e: any) {
    warn(`warning: git pull --ff-only failed: ${String(e?.message ?? e).trim()}`);
  }
}

export async function syncBeforeWrite(args: { repoRoot: string; inboxRefs?: string[] }): Promise<void> {
  if (!(await gitHasOrigin(args.repoRoot))) return;
  if (args.inboxRefs?.length) {
    for (const ref of args.inboxRefs) {
      await gitFetchRef(args.repoRoot, "origin", ref);
    }
  }
  const branch = await gitCurrentBranch(args.repoRoot);
  if (!branch) throw new Error("sync requires a checked out branch (not detached HEAD)");
  if (!(await gitHasUpstream(args.repoRoot))) throw new Error("sync requires an upstream (set upstream or push once)");
  if (!(await gitIsClean(args.repoRoot))) throw new Error("sync requires a clean working tree");
  await gitPullFFOnly(args.repoRoot);
}

export async function syncAfterWrite(args: { repoRoot: string }): Promise<void> {
  if (!(await gitHasOrigin(args.repoRoot))) return;
  const branch = await gitCurrentBranch(args.repoRoot);
  if (!branch) throw new Error("sync requires a checked out branch (not detached HEAD)");
  if (!(await gitHasUpstream(args.repoRoot))) throw new Error("sync requires an upstream (set upstream or push once)");
  await gitPush(args.repoRoot);
}

