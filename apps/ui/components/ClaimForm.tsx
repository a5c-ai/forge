"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimForm(props: {
  kind: "issue" | "pr";
  id: string;
  claims?: { agentId: string; by: string; time: string; note?: string }[];
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(op: "claim" | "release", payload: any) {
    const url =
      props.kind === "issue"
        ? `/api/issues/${encodeURIComponent(props.id)}/claim`
        : `/api/prs/${encodeURIComponent(props.id)}/claim`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, ...payload })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Claims</div>
      <div className="p-4">
        {Array.isArray(props.claims) && props.claims.length ? (
          <div className="space-y-2">
            {props.claims.map((c) => (
              <div key={c.agentId} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-sm text-zinc-200">
                  {c.agentId} <span className="text-zinc-500">by</span> {c.by} <span className="text-zinc-500">@</span> {c.time}
                  {c.note ? <span className="text-zinc-400"> — {c.note}</span> : null}
                </div>
                <button
                  className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    setErr(null);
                    setBusy(true);
                    try {
                      await post("release", { agentId: c.agentId });
                      router.refresh();
                    } catch (e: any) {
                      setErr(String(e?.message ?? e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Release
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-300">No active claims.</div>
        )}

        <form
          className="mt-4 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (!agentId.trim()) return;
            setBusy(true);
            try {
              await post("claim", { agentId: agentId.trim(), note: note.trim() || undefined });
              setAgentId("");
              setNote("");
              router.refresh();
            } catch (e: any) {
              setErr(String(e?.message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="text-sm font-medium text-zinc-200">Add claim</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Agent id</label>
              <input
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent-1"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Note (optional)</label>
              <input
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Working on it"
              />
            </div>
          </div>
          {err ? <div className="text-sm text-red-300">{err}</div> : null}
          <div>
            <button
              className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900 hover:bg-white disabled:opacity-50"
              disabled={busy || !agentId.trim()}
              type="submit"
            >
              {busy ? "Saving…" : "Claim"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


