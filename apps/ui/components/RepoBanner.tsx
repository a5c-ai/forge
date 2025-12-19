export function RepoBanner() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
      Using <code className="rounded bg-zinc-800 px-1">A5C_REPO</code> / <code className="rounded bg-zinc-800 px-1">A5C_TREEISH</code>
      . Change env vars and restart the UI to switch repos.
    </div>
  );
}


