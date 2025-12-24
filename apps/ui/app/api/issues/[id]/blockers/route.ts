import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, writeDepChanged } from "@a5c-ai/sdk";
import { writeToInboxRef } from "../../../_lib/writeToInboxRef";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const bodyRaw = (await req.json().catch(() => null)) ?? {};
    const body: any = bodyRaw && typeof bodyRaw === "object" ? bodyRaw : {};
    const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "ui");
    body.actor = actor;
    const cfg = getRepoConfigFromEnv();
    const inboxRefs =
      Array.isArray(body.inboxRefs) && body.inboxRefs.every((v: any) => typeof v === "string")
        ? (body.inboxRefs as string[]).map((s) => s.trim()).filter(Boolean)
        : cfg.inboxRefs;
    const writeRef = inboxRefs?.[0];
    const isInboxRef = !!writeRef && writeRef.startsWith("refs/a5c/");

    if (cfg.remoteUrl) {
      const refParam = writeRef ? `?ref=${encodeURIComponent(writeRef)}` : "";
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/issues/${encodeURIComponent(id)}/blockers${refParam}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.remoteToken ? { authorization: `Bearer ${cfg.remoteToken}` } : {})
        },
        body: JSON.stringify({ ...body, inboxRefs })
      });
      const j = await r.json();
      return NextResponse.json(j, { status: r.status });
    }

    if (!writeRef || !isInboxRef) {
      return NextResponse.json({ error: "missing inbox ref (set A5C_INBOX_REFS or pass inboxRefs)" }, { status: 400 });
    }

    const op = String(body.op ?? "") as "add" | "remove";
    if (op !== "add" && op !== "remove") return NextResponse.json({ error: "missing op (add|remove)" }, { status: 400 });
    const byType = String(body.by?.type ?? "");
    const byId = String(body.by?.id ?? "");
    if (byType !== "issue" && byType !== "pr") return NextResponse.json({ error: "missing by.type (issue|pr)" }, { status: 400 });
    if (!byId.trim()) return NextResponse.json({ error: "missing by.id" }, { status: 400 });
    const note = body.note == null ? undefined : String(body.note);

    const msg = String(body.commitMessage ?? `a5c: blocker ${id} ${op} ${byType}:${byId}`);
    const baseRepo = await openRepo(cfg.repo);
    const writeIn = async (repoRoot: string) => {
      const repo = await openRepo(repoRoot);
      const state = await loadHlcState(actor);
      const clock = new HlcClock(state);
      const time = new Date().toISOString();
      const wr = await writeDepChanged(
        { repoRoot: repo.root, actor, clock },
        { entity: { type: "issue", id }, op, by: { type: byType as any, id: byId }, note, time }
      );
      await saveHlcState(actor, clock.now());
      return wr;
    };

    const { result } = await writeToInboxRef({ repoRoot: baseRepo.root, inboxRef: writeRef, actor, message: msg, fn: writeIn });
    return NextResponse.json({ path: (result as any).path, event: (result as any).event, committed: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
