import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writeGateChanged } from "@a5cforge/sdk";
import { runGit } from "../../../_lib/gitRun";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) ?? {};
    const cfg = getRepoConfigFromEnv();

    if (cfg.remoteUrl) {
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/issues/${encodeURIComponent(id)}/gate`, {
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
    const needsHuman = Boolean(body.needsHuman);
    const topic = body.topic == null ? undefined : String(body.topic);
    const message = body.message == null ? undefined : String(body.message);

    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();
    const wr = await writeGateChanged(
      { repoRoot: repo.root, actor, clock },
      { entity: { type: "issue", id }, needsHuman, topic, message, time }
    );
    await saveHlcState(actor, clock.now());

    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.commitMessage ?? `a5c: gate ${id} ${needsHuman ? "needs-human" : "clear"}`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


