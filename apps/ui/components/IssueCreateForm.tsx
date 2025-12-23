"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function IssueCreateForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [issueId, setIssueId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (!title.trim()) return;
        setBusy(true);
        try {
          const treeish = sp.get("treeish") ?? undefined;
          const inbox = sp.get("inbox") ?? undefined;
          const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
          const res = await fetch(`/api/issues`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              treeish,
              inboxRefs,
              issueId: issueId.trim() || undefined,
              title: title.trim(),
              body: body.trim() || undefined
            })
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
          const id = String(j?.issueId ?? issueId.trim());
          router.push(`/issues/${encodeURIComponent(id)}`);
          router.refresh();
        } catch (err2: any) {
          setErr(String(err2?.message ?? err2));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-sm font-medium text-zinc-200">New issue</div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div className="grid gap-1">
          <label className="text-xs text-zinc-400">Issue ID (optional)</label>
          <input
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            value={issueId}
            onChange={(e) => setIssueId(e.target.value)}
            placeholder="issue-123"
          />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <label className="text-xs text-zinc-400">Title</label>
          <input
            className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Investigate X"
          />
        </div>
      </div>
      <textarea
        className="mt-2 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional description…"
      />
      {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}
      <div className="mt-2 flex items-center gap-2">
        <button className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900 hover:bg-white disabled:opacity-50" disabled={busy || !title.trim()} type="submit">
          {busy ? "Creating…" : "Create"}
        </button>
        <div className="text-xs text-zinc-500">Writes an event and commits it.</div>
      </div>
    </form>
  );
}
