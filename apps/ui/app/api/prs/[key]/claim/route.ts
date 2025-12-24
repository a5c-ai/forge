import { NextResponse } from "next/server";
import { getRepoConfigFromEnv } from "../../../_lib/config";
import { HlcClock, loadHlcState, openRepo, saveHlcState, writeAgentClaimChanged } from "@a5c-ai/sdk";
import { writeToInboxRef } from "../../../_lib/writeToInboxRef";

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
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
      const r = await fetch(`${cfg.remoteUrl.replace(/\/$/, "")}/v1/prs/${encodeURIComponent(key)}/claim${refParam}`, {
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

    const agentId = String(body.agentId ?? actor);
    const op = String(body.op ?? "") as "claim" | "release";
    if (op !== "claim" && op !== "release") return NextResponse.json({ error: "missing op (claim|release)" }, { status: 400 });
    const note = body.note == null ? undefined : String(body.note);

    const msg = String(body.commitMessage ?? `a5c: claim ${key} ${op} ${agentId}`);
    const baseRepo = await openRepo(cfg.repo);
    const writeIn = async (repoRoot: string) => {
      const repo = await openRepo(repoRoot);
      const state = await loadHlcState(actor);
      const clock = new HlcClock(state);
      const time = new Date().toISOString();
      const wr = await writeAgentClaimChanged(
        { repoRoot: repo.root, actor, clock },
        { agentId, entity: { type: "pr", id: key }, op, note, time }
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
