export function RepoBanner() {
  const repo = process.env.A5C_REPO;
  const treeish = process.env.A5C_TREEISH ?? "HEAD";
  const inboxRefs = process.env.A5C_INBOX_REFS ?? "";
  const remoteUrl = process.env.A5C_REMOTE_URL ?? "";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
      {repo ? (
        <div className="grid gap-1">
          <div>
            <span className="text-zinc-400">repo:</span> <code className="rounded bg-zinc-800 px-1">{repo}</code>
          </div>
          <div>
            <span className="text-zinc-400">treeish:</span> <code className="rounded bg-zinc-800 px-1">{treeish}</code>
          </div>
          {inboxRefs ? (
            <div>
              <span className="text-zinc-400">inbox refs:</span> <code className="rounded bg-zinc-800 px-1">{inboxRefs}</code>
            </div>
          ) : null}
          <div className="text-xs text-zinc-500">
            Configure via <code className="rounded bg-zinc-800 px-1">A5C_REPO</code>, <code className="rounded bg-zinc-800 px-1">A5C_TREEISH</code>,{" "}
            <code className="rounded bg-zinc-800 px-1">A5C_INBOX_REFS</code> and restart the UI process.
          </div>
          {remoteUrl ? (
            <div className="text-xs text-zinc-500">
              Writes are proxied to <code className="rounded bg-zinc-800 px-1">{remoteUrl}</code>.
            </div>
          ) : (
            <div className="text-xs text-zinc-500">Writes are applied locally (UI server writes events + commits).</div>
          )}
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="text-zinc-200">No repo configured.</div>
          <div className="text-xs text-zinc-400">
            Set <code className="rounded bg-zinc-800 px-1">A5C_REPO</code> and restart the UI, or run{" "}
            <code className="rounded bg-zinc-800 px-1">node scripts/local-bringup.mjs</code> from the repo root.
          </div>
        </div>
      )}
    </div>
  );
}


