"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IssueGateForm(props: { issueId: string; current?: { topic?: string; message?: string } }) {
  const router = useRouter();
  const [needsHuman, setNeedsHuman] = useState(Boolean(props.current));
  const [topic, setTopic] = useState(props.current?.topic ?? "");
  const [message, setMessage] = useState(props.current?.message ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          const res = await fetch(`/api/issues/${encodeURIComponent(props.issueId)}/gate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              needsHuman,
              topic: needsHuman ? topic.trim() || undefined : undefined,
              message: needsHuman ? message.trim() || undefined : undefined
            })
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
          router.refresh();
        } catch (e: any) {
          setErr(String(e?.message ?? e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-200">Gate: needsHuman</div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={needsHuman} onChange={(e) => setNeedsHuman(e.target.checked)} />
          enabled
        </label>
      </div>
      {needsHuman ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-xs text-zinc-400">Topic</label>
            <input
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="review"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs text-zinc-400">Message</label>
            <input
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Need a human to confirm…"
            />
          </div>
        </div>
      ) : null}
      {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}
      <div className="mt-2">
        <button
          className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900 hover:bg-white disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}


