import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../_lib/config";
import { loadSnapshot, openRepo, listIssues, listPRs } from "@a5cforge/sdk";

export async function GET() {
  try {
    const cfg = getRepoConfigFromEnv();
    const repo = await openRepo(cfg.repo);
    const snap = await loadSnapshot({ git: repo.git, treeish: cfg.treeish, inboxRefs: cfg.inboxRefs });
    return NextResponse.json({
      treeish: cfg.treeish,
      issues: listIssues(snap).length,
      prs: listPRs(snap).length
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}


