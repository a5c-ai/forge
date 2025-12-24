"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

function normalizeCsv(s: string): string {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(",");
}

export function Selectors(props: { defaultInboxRefs?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialInbox = sp.get("inbox") ?? props.defaultInboxRefs ?? "";

  const [inbox, setInbox] = useState(initialInbox);

  const query = useMemo(() => {
    const q = new URLSearchParams(sp.toString());
    q.delete("treeish");
    const inboxNorm = normalizeCsv(inbox);
    if (inboxNorm) q.set("inbox", inboxNorm);
    else q.delete("inbox");
    return q.toString();
  }, [sp, inbox]);

  return (
    <form
      className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`${pathname}?${query}`);
      }}
    >
      <div className="grid gap-1">
        <label className="text-zinc-300">Inbox refs (comma-separated)</label>
        <input
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          value={inbox}
          onChange={(e) => setInbox(e.target.value)}
          placeholder="refs/a5c/inbox/a,refs/a5c/inbox/b"
        />
      </div>
      <div className="flex gap-2">
        <button className="rounded bg-zinc-100 px-3 py-1 text-zinc-900 hover:bg-white" type="submit">
          Apply
        </button>
        <button
          className="rounded border border-zinc-800 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
          type="button"
          onClick={() => {
            router.push(pathname);
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}


