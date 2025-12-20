import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writeAgentClaimChanged } from "@a5cforge/sdk";
import { runGit } from "../../../_lib/gitRun";

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const body = (await req.json().catch(() => null)) ?? {};
    const cfg = getRepoConfigFromEnv();

    if (cfg.remoteUrl) {
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/prs/${encodeURIComponent(key)}/claim`, {
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
    const agentId = String(body.agentId ?? actor);
    const op = String(body.op ?? "") as "claim" | "release";
    if (op !== "claim" && op !== "release") return NextResponse.json({ error: "missing op (claim|release)" }, { status: 400 });
    const note = body.note == null ? undefined : String(body.note);

    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();
    const wr = await writeAgentClaimChanged({ repoRoot: repo.root, actor, clock }, { agentId, entity: { type: "pr", id: key }, op, note, time });
    await saveHlcState(actor, clock.now());

    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.commitMessage ?? `a5c: claim ${key} ${op} ${agentId}`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


