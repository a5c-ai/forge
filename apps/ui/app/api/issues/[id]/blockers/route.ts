import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, stageFiles, writeDepChanged } from "@a5cforge/sdk";
import { runGit } from "../../../_lib/gitRun";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) ?? {};
    const cfg = getRepoConfigFromEnv();

    if (cfg.remoteUrl) {
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/issues/${encodeURIComponent(id)}/blockers`, {
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
    const op = String(body.op ?? "") as "add" | "remove";
    if (op !== "add" && op !== "remove") return NextResponse.json({ error: "missing op (add|remove)" }, { status: 400 });
    const byType = String(body.by?.type ?? "");
    const byId = String(body.by?.id ?? "");
    if (byType !== "issue" && byType !== "pr") return NextResponse.json({ error: "missing by.type (issue|pr)" }, { status: 400 });
    if (!byId.trim()) return NextResponse.json({ error: "missing by.id" }, { status: 400 });
    const note = body.note == null ? undefined : String(body.note);

    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();
    const wr = await writeDepChanged(
      { repoRoot: repo.root, actor, clock },
      { entity: { type: "issue", id }, op, by: { type: byType as any, id: byId }, note, time }
    );
    await saveHlcState(actor, clock.now());

    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.commitMessage ?? `a5c: blocker ${id} ${op} ${byType}:${byId}`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


