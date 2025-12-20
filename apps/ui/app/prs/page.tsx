import Link from "next/link";
import { RepoBanner } from "../../components/RepoBanner";
import { Selectors } from "../../components/Selectors";
import { PrRequestForm } from "../../components/PrRequestForm";
import { UiErrorPanel } from "../../components/UiErrorPanel";
import { getRenderedPRs } from "../../lib/serverRepo";

export default async function PRsPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await props.searchParams) ?? {};
  const treeish = typeof sp.treeish === "string" ? sp.treeish : undefined;
  const inbox = typeof sp.inbox === "string" ? sp.inbox : undefined;
  const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  let prs: any[] = [];
  let loadError: string | null = null;
  try {
    prs = (await getRenderedPRs({ treeish, inboxRefs })) as any[];
  } catch (e: any) {
    loadError = String(e?.message ?? e);
  }
  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">PRs</h1>
        <Link className="text-sm text-zinc-300 hover:text-white" href="/">
          Home
        </Link>
      </div>
      <RepoBanner />
      <Selectors defaultTreeish={treeish} defaultInboxRefs={inbox} />
      <PrRequestForm />
      {loadError ? (
        <UiErrorPanel title="Unable to load PRs" message="The UI could not read `.collab/**` from the configured repo." details={loadError} />
      ) : null}

      <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900">
        {prs.length === 0 ? (
          <div className="p-4 text-sm text-zinc-300">No PRs.</div>
        ) : (
          prs.map((p) => (
            <Link key={p.prKey} href={`/prs/${p.prKey}`} className="block p-4 hover:bg-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-zinc-400">{p.prKey}</div>
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {p.kind} • base {p.baseRef} {p.headRef ? `• head ${p.headRef}` : ""} • events {p.events?.length ?? 0}
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}


