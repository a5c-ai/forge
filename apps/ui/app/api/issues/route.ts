import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../_lib/config";
import { HlcClock, loadHlcState, loadSnapshot, openRepo, saveHlcState, stageFiles, writeIssueCreated, listIssues, renderIssue } from "@a5c-ai/sdk";
import { runGit } from "../_lib/gitRun";

export async function GET() {
  try {
    const cfg = getRepoConfigFromEnv();
    const repo = await openRepo(cfg.repo);
    const snap = await loadSnapshot({ git: repo.git, treeish: cfg.treeish, inboxRefs: cfg.inboxRefs });
    const ids = listIssues(snap);
    const items = ids.map((id) => renderIssue(snap, id)).filter(Boolean);
    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const bodyRaw = (await req.json().catch(() => null)) ?? {};
    const body: any = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : {};
    const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "ui");
    body.actor = actor;
    const cfg = getRepoConfigFromEnv();

    // Remote mode: proxy to a5c-server.
    if (cfg.remoteUrl) {
      const issueId = String(body.issueId ?? `issue-${Date.now()}`);
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/issues/${encodeURIComponent(issueId)}`, {
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

    const issueId = String(body.issueId ?? `issue-${Date.now()}`);
    const title = String(body.title ?? "");
    const issueBody = body.body == null ? undefined : String(body.body);
    if (!title.trim()) return NextResponse.json({ error: "missing title" }, { status: 400 });

    const repo = await openRepo(cfg.repo);
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const time = new Date().toISOString();
    const wr = await writeIssueCreated({ repoRoot: repo.root, actor, clock }, { issueId, title: title.trim(), body: issueBody, time });
    await saveHlcState(actor, clock.now());
    await stageFiles(repo.root, [wr.path]);
    const msg = String(body.message ?? `a5c: issue ${issueId} created`);
    await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
    return NextResponse.json({ path: wr.path, event: wr.event, committed: true, issueId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


