"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function IssueBlockersForm(props: {
  issueId: string;
  blockers?: { by: { type: "issue" | "pr"; id: string }; note?: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [byType, setByType] = useState<"issue" | "pr">("issue");
  const [byId, setById] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(op: "add" | "remove", payload: any) {
    const inbox = sp.get("inbox") ?? undefined;
    const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const res = await fetch(`/api/issues/${encodeURIComponent(props.issueId)}/blockers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, inboxRefs, ...payload })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Blockers</div>
      <div className="p-4">
        {Array.isArray(props.blockers) && props.blockers.length ? (
          <div className="space-y-2">
            {props.blockers.map((b, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="text-sm text-zinc-200">
                  {b.by.type}:{b.by.id} {b.note ? <span className="text-zinc-400">— {b.note}</span> : null}
                </div>
                <button
                  className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    setErr(null);
                    setBusy(true);
                    try {
                      await post("remove", { by: b.by });
                      router.refresh();
                    } catch (err2: any) {
                      setErr(String(err2?.message ?? err2));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-300">No blockers.</div>
        )}

        <form
          className="mt-4 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (!byId.trim()) return;
            setBusy(true);
            try {
              await post("add", { by: { type: byType, id: byId.trim() }, note: note.trim() || undefined });
              setById("");
              setNote("");
              router.refresh();
            } catch (err2: any) {
              setErr(String(err2?.message ?? err2));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="text-sm font-medium text-zinc-200">Add blocker</div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Type</label>
              <select
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                value={byType}
                onChange={(e) => setByType(e.target.value as any)}
              >
                <option value="issue">issue</option>
                <option value="pr">pr</option>
              </select>
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Id</label>
              <input
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                value={byId}
                onChange={(e) => setById(e.target.value)}
                placeholder={byType === "issue" ? "issue-123" : "pr-123"}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-400">Note (optional)</label>
              <input
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Blocked by…"
              />
            </div>
          </div>
          {err ? <div className="text-sm text-red-300">{err}</div> : null}
          <div>
            <button
              className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900 hover:bg-white disabled:opacity-50"
              disabled={busy || !byId.trim()}
              type="submit"
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


