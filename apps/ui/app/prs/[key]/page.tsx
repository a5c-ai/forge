import Link from "next/link";
import { RepoBanner } from "../../../components/RepoBanner";
import { Selectors } from "../../../components/Selectors";
import { getRenderedPR } from "../../../lib/serverRepo";

export default async function PRPage(props: {
  params: Promise<{ key: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await props.params;
  const sp = (await props.searchParams) ?? {};
  const treeish = typeof sp.treeish === "string" ? sp.treeish : undefined;
  const inbox = typeof sp.inbox === "string" ? sp.inbox : undefined;
  const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const pr: any = await getRenderedPR(key, { treeish, inboxRefs });

  if (!pr) {
    return (
      <main className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">PR not found</h1>
          <Link className="text-sm text-zinc-300 hover:text-white" href="/prs">
            Back
          </Link>
        </div>
        <RepoBanner />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">{key}</div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{pr.title}</h1>
        <Link className="text-sm text-zinc-300 hover:text-white" href="/prs">
          Back
        </Link>
      </div>
      <RepoBanner />
      <Selectors defaultTreeish={treeish} defaultInboxRefs={inbox} />
      <Selectors defaultTreeish={treeish} defaultInboxRefs={inbox} />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-xs text-zinc-400">
          {pr.prKey} • {pr.kind} • {pr.createdBy} @ {pr.createdAt}
        </div>
        <div className="mt-2 text-sm text-zinc-300">base: {pr.baseRef}</div>
        {pr.headRef ? <div className="text-sm text-zinc-300">head: {pr.headRef}</div> : null}
        {pr.body ? <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">{pr.body}</div> : null}

        {pr.needsHuman ? (
          <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            needsHuman{pr.needsHuman.topic ? ` (${pr.needsHuman.topic})` : ""}: {pr.needsHuman.message ?? ""}
          </div>
        ) : null}

        {Array.isArray(pr.blockers) && pr.blockers.length ? (
          <div className="mt-4 text-sm text-zinc-300">
            <div className="font-medium text-zinc-200">Blockers</div>
            <ul className="mt-2 list-disc pl-5">
              {pr.blockers.map((b: any, idx: number) => (
                <li key={idx}>
                  {b.by?.type}:{b.by?.id} {b.note ? `— ${b.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {Array.isArray(pr.inboxProposals) && pr.inboxProposals.length ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Inbox proposals</div>
          {pr.inboxProposals.map((p: any, idx: number) => (
            <div key={idx} className="border-b border-zinc-800 p-4 last:border-b-0">
              <div className="text-xs text-zinc-400">
                {p.actor} @ {p.time}
              </div>
              <div className="mt-1 text-sm text-zinc-200">{p.title}</div>
              <div className="text-xs text-zinc-400">{p.headRef}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Events</div>
        {pr.events.length === 0 ? (
          <div className="p-4 text-sm text-zinc-300">No events.</div>
        ) : (
          pr.events.map((e: any, idx: number) => (
            <div key={idx} className="border-b border-zinc-800 p-4 last:border-b-0">
              <div className="text-xs text-zinc-400">
                {e.time} • {e.actor} • {e.action} {e.headRef ? `(${e.headRef})` : ""}
              </div>
              {e.message ? <div className="mt-1 text-sm text-zinc-200">{e.message}</div> : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}


