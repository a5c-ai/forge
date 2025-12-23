import Link from "next/link";
import { RepoBanner } from "../../components/RepoBanner";
import { UiErrorPanel } from "../../components/UiErrorPanel";
import { getRenderedIssues } from "../../lib/serverRepo";
import { Selectors } from "../../components/Selectors";
import { IssueCreateForm } from "../../components/IssueCreateForm";

export default async function IssuesPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await props.searchParams) ?? {};
  const treeish = typeof sp.treeish === "string" ? sp.treeish : undefined;
  const inbox = typeof sp.inbox === "string" ? sp.inbox : undefined;
  const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  let issues: any[] = [];
  let loadError: string | null = null;
  try {
    issues = (await getRenderedIssues({ treeish, inboxRefs } as any)) as any[];
  } catch (e: any) {
    loadError = String(e?.message ?? e);
  }
  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Issues</h1>
        <Link className="text-sm text-zinc-300 hover:text-white" href="/">
          Home
        </Link>
      </div>
      <RepoBanner />
      <Selectors defaultTreeish={treeish} defaultInboxRefs={inbox} />
      <IssueCreateForm />

      {loadError ? (
        <UiErrorPanel title="Unable to load issues" message="The UI could not read `.collab/**` from the configured repo." details={loadError} />
      ) : null}

      <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900">
        {issues.length === 0 ? (
          <div className="p-4 text-sm text-zinc-300">No issues found.</div>
        ) : (
          issues.map((i: any) => (
            <Link key={i.issueId} href={`/issues/${i.issueId}`} className="block p-4 hover:bg-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{i.title}</div>
                <div className="text-xs text-zinc-400">{i.issueId}</div>
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {i.state} • {i.comments?.length ?? 0} comments • {i.createdBy} @ {i.createdAt}
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}

