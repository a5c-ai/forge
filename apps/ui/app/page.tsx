import Link from "next/link";

export default function HomePage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">a5cforge</h1>
        <p className="text-zinc-300">Git-first collaboration UI (issues, PRs, and activity) backed by `.collab/**`.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800" href="/issues">
          <div className="text-lg font-medium">Issues</div>
          <div className="text-sm text-zinc-300">Browse issues and comment threads.</div>
        </Link>
        <Link className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800" href="/prs">
          <div className="text-lg font-medium">PRs</div>
          <div className="text-sm text-zinc-300">Browse PR proposals/requests and events.</div>
        </Link>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
        <div className="font-medium text-zinc-200">Repo configuration</div>
        <div>
          Set <code className="rounded bg-zinc-800 px-1">A5C_REPO</code> (and optionally{" "}
          <code className="rounded bg-zinc-800 px-1">A5C_TREEISH</code>) in the environment for the UI process.
        </div>
        <div className="mt-2">
          For a one-command local setup (temp repo + server + UI), run{" "}
          <code className="rounded bg-zinc-800 px-1">node scripts/local-bringup.mjs</code>.
        </div>
      </section>
    </main>
  );
}


