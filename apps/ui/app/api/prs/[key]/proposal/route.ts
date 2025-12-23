import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writePrProposal } from "@a5c-ai/sdk";
import { runGit } from "../../../_lib/gitRun";
import { withWorktree } from "../../../_lib/worktree";
import { writeToInboxRef } from "../../../_lib/writeToInboxRef";

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const bodyRaw = (await req.json().catch(() => null)) ?? {};
    const body: any = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : {};
    const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "ui");
    body.actor = actor;
    const cfg = getRepoConfigFromEnv();

    const treeish = typeof body.treeish === "string" && body.treeish.trim() ? body.treeish.trim() : cfg.treeish;
    const inboxRefs =
      Array.isArray(body.inboxRefs) && body.inboxRefs.every((v: any) => typeof v === "string")
        ? (body.inboxRefs as string[]).map((s) => s.trim()).filter(Boolean)
        : cfg.inboxRefs;
    const writeRef = inboxRefs?.[0] ?? (treeish && treeish !== "HEAD" ? treeish : undefined);
    const isInboxRef = !!writeRef && writeRef.startsWith("refs/a5c/");

    // Remote mode: proxy to a5c-server.
    if (cfg.remoteUrl) {
      const refParam = writeRef ? `?ref=${encodeURIComponent(writeRef)}` : "";
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/prs/${encodeURIComponent(key)}/proposal${refParam}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.remoteToken ? { authorization: `Bearer ${cfg.remoteToken}` } : {})
        },
        body: JSON.stringify({ ...body, treeish, inboxRefs })
      });
      const j = await r.json();
      return NextResponse.json(j, { status: r.status });
    }

    const baseRef = String(body.baseRef ?? "");
    const headRef = String(body.headRef ?? "");
    const title = String(body.title ?? "");
    const prBody = body.body == null ? undefined : String(body.body);
    if (!baseRef.trim()) return NextResponse.json({ error: "missing baseRef" }, { status: 400 });
    if (!headRef.trim()) return NextResponse.json({ error: "missing headRef" }, { status: 400 });
    if (!title.trim()) return NextResponse.json({ error: "missing title" }, { status: 400 });

    const baseRepo = await openRepo(cfg.repo);
    const commitIn = async (repoRoot: string) => {
      const repo = await openRepo(repoRoot);
      const state = await loadHlcState(actor);
      const clock = new HlcClock(state);
      const time = new Date().toISOString();
      const wr = await writePrProposal({ repoRoot: repo.root, actor, clock }, { prKey: key, baseRef, headRef, title, body: prBody, time });
      await saveHlcState(actor, clock.now());
      return wr;
    };

    const msg = String(body.message ?? `a5c: pr proposal ${key}`);
    if (writeRef && isInboxRef) {
      const { result } = await writeToInboxRef({ repoRoot: baseRepo.root, inboxRef: writeRef, actor, message: msg, fn: commitIn });
      return NextResponse.json({ path: result.path, event: result.event, committed: true });
    }

    const wr = writeRef ? await withWorktree(baseRepo.root, writeRef, async (wt) => {
      const res = await commitIn(wt);
      await stageFiles(wt, [res.path]);
      await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], wt);
      return res;
    }) : await (async () => {
      const res = await commitIn(baseRepo.root);
      await stageFiles(baseRepo.root, [res.path]);
      await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], baseRepo.root);
      return res;
    })();

    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
