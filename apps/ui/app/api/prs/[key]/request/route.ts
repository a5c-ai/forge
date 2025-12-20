import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writePrRequest } from "@a5cforge/sdk";
import { runGit } from "../../../_lib/gitRun";

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const body = (await req.json().catch(() => null)) ?? {};
    const cfg = getRepoConfigFromEnv();

    // Remote mode: proxy to a5c-server.
    if (cfg.remoteUrl) {
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/prs/${encodeURIComponent(key)}/request`, {
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

    const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "ui");
    const baseRef = String(body.baseRef ?? "");
    const title = String(body.title ?? "");
    const prBody = body.body == null ? undefined : String(body.body);
    if (!baseRef.trim()) return NextResponse.json({ error: "missing baseRef" }, { status: 400 });
    if (!title.trim()) return NextResponse.json({ error: "missing title" }, { status: 400 });

    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();
    const wr = await writePrRequest({ repoRoot: repo.root, actor, clock }, { prKey: key, baseRef, title, body: prBody, time });
    await saveHlcState(actor, clock.now());

    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.message ?? `a5c: pr request ${key}`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


