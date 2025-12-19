import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../_lib/config";
import { loadSnapshot, openRepo, listIssues, renderIssue } from "@a5cforge/sdk";

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


