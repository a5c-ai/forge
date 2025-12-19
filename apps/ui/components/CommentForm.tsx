"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommentForm(props: { issueId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (!body.trim()) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/issues/${encodeURIComponent(props.issueId)}/comments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body })
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error ?? `HTTP ${res.status}`);
          }
          setBody("");
          router.refresh();
        } catch (e: any) {
          setErr(String(e?.message ?? e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-sm font-medium text-zinc-200">Add comment</div>
      <textarea
        className="mt-2 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment…"
      />
      {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}
      <div className="mt-2 flex items-center gap-2">
        <button
          className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900 hover:bg-white disabled:opacity-50"
          disabled={busy || !body.trim()}
          type="submit"
        >
          {busy ? "Posting…" : "Post"}
        </button>
        <div className="text-xs text-zinc-500">Writes an event and commits it.</div>
      </div>
    </form>
  );
}


