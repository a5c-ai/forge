import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writeCommentCreated } from "@a5cforge/sdk";
import { runGit } from "../../../_lib/gitRun";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) ?? {};
    const commentBody = String(body.body ?? "");
    if (!commentBody.trim()) return NextResponse.json({ error: "missing body" }, { status: 400 });

    const cfg = getRepoConfigFromEnv();

    // Remote mode: proxy to a5c-server.
    if (cfg.remoteUrl) {
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/issues/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.remoteToken ? { authorization: `Bearer ${cfg.remoteToken}` } : {})
        },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      return NextResponse.json(j, { status: r.status });
    }

    // Local mode: write into repo and commit so reads at HEAD update.
    const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "ui");
    const commentId = String(body.commentId ?? `c_${Date.now()}`);
    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();

    const wr = await writeCommentCreated(
      { repoRoot: repo.root, actor, clock },
      { entity: { type: "issue", id }, commentId, body: commentBody, time }
    );
    await saveHlcState(actor, clock.now());
    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.message ?? `a5c: comment ${id} ${commentId}`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


