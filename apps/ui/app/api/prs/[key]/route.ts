import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../_lib/config";
import { loadSnapshot, openRepo, renderPR } from "@a5cforge/sdk";

export async function GET(_: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const cfg = getRepoConfigFromEnv();
    const repo = await openRepo(cfg.repo);
    const snap = await loadSnapshot({ git: repo.git, treeish: cfg.treeish, inboxRefs: cfg.inboxRefs });
    const pr = renderPR(snap, key);
    if (!pr) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(pr);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


