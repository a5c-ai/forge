import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../_lib/config";
import { loadSnapshot, openRepo, renderIssue } from "@a5cforge/sdk";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const cfg = getRepoConfigFromEnv();
    const repo = await openRepo(cfg.repo);
    const snap = await loadSnapshot({ git: repo.git, treeish: cfg.treeish, inboxRefs: cfg.inboxRefs });
    const issue = renderIssue(snap, id);
    if (!issue) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(issue);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


