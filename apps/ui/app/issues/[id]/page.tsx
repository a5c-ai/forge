import Link from "next/link";
import { RepoBanner } from "../../../components/RepoBanner";
import { Selectors } from "../../../components/Selectors";
import { CommentForm } from "../../../components/CommentForm";
import { IssueGateForm } from "../../../components/IssueGateForm";
import { IssueBlockersForm } from "../../../components/IssueBlockersForm";
import { ClaimForm } from "../../../components/ClaimForm";
import { UiErrorPanel } from "../../../components/UiErrorPanel";
import { getRenderedIssue } from "../../../lib/serverRepo";

export default async function IssuePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const sp = (await props.searchParams) ?? {};
  const inbox = typeof sp.inbox === "string" ? sp.inbox : undefined;
  const inboxRefs = inbox ? inbox.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const qs = inbox ? `?inbox=${encodeURIComponent(inbox)}` : "";
  let issue: any = null;
  let loadError: string | null = null;
  try {
    issue = await getRenderedIssue(id, { inboxRefs });
  } catch (e: any) {
    loadError = String(e?.message ?? e);
  }

  if (loadError) {
    return (
      <main className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Issue</h1>
          <Link className="text-sm text-zinc-300 hover:text-white" href={`/issues${qs}`}>
            Back
          </Link>
        </div>
        <RepoBanner />
        <Selectors defaultInboxRefs={inbox} />
        <UiErrorPanel title="Unable to load issue" message={`The UI could not load issue '${id}'.`} details={loadError} />
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Issue not found</h1>
          <Link className="text-sm text-zinc-300 hover:text-white" href={`/issues${qs}`}>
            Back
          </Link>
        </div>
        <RepoBanner />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">{id}</div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{issue.title}</h1>
        <Link className="text-sm text-zinc-300 hover:text-white" href={`/issues${qs}`}>
          Back
        </Link>
      </div>
      <RepoBanner />
      <Selectors defaultInboxRefs={inbox} />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-xs text-zinc-400">
          {issue.issueId} • {issue.state} • {issue.createdBy} @ {issue.createdAt}
        </div>
        {issue.body ? <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">{issue.body}</div> : null}
        {issue.needsHuman ? (
          <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Needs human review{issue.needsHuman.topic ? ` (${issue.needsHuman.topic})` : ""}
            {issue.needsHuman.message ? `: ${issue.needsHuman.message}` : ""}
          </div>
        ) : null}
      </div>

      <IssueGateForm issueId={id} current={issue.needsHuman} />
      <IssueBlockersForm issueId={id} blockers={issue.blockers} />
      <ClaimForm kind="issue" id={id} claims={issue.agentClaims} />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-4 text-sm font-medium text-zinc-200">Comments</div>
        {issue.comments.length === 0 ? (
          <div className="p-4 text-sm text-zinc-300">No comments.</div>
        ) : (
          issue.comments.map((c: any) => (
            <div key={c.commentId} className="border-b border-zinc-800 p-4 last:border-b-0">
              <div className="text-xs text-zinc-400">
                {c.commentId} • {c.author} @ {c.createdAt}
              </div>
              {c.redacted ? (
                <div className="mt-2 text-sm text-zinc-500">[redacted]{c.redactedReason ? ` — ${c.redactedReason}` : ""}</div>
              ) : (
                <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{c.body ?? ""}</div>
              )}
              {c.edits?.length ? <div className="mt-2 text-xs text-zinc-500">edits: {c.edits.length}</div> : null}
            </div>
          ))
        )}
      </div>

      <CommentForm issueId={id} />
    </main>
  );
}

