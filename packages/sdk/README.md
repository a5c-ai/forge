# @a5c-ai/sdk

TypeScript/Node.js SDK for reading and writing `a5cforge/v1` collaboration data stored in a Git repo under `.collab/**`.

## Install

```sh
npm i @a5c-ai/sdk
```

## Concepts

- **Collab events** live in the repository under `.collab/**` as JSON/NDJSON/Markdown event files.
- **Snapshot** is a view of collab events at a Git revision (a **treeish**) plus optional **inbox refs**.
- **Inbox refs** (recommended for writes) are Git refs like `refs/a5c/inbox/<name>` that hold an append-only `.collab/**` tree. They let you stage collaboration changes without touching the currently checked-out branch.

## Read data (snapshot + renderers)

```ts
import { openRepo, loadSnapshot, listIssues, renderIssue } from "@a5c-ai/sdk";

const repo = await openRepo(process.cwd());
const snap = await loadSnapshot({
  git: repo.git,
  treeish: "HEAD",
  inboxRefs: ["refs/a5c/inbox/ui"],
});

for (const id of listIssues(snap)) {
  const issue = renderIssue(snap, id);
  console.log(issue?.issueId, issue?.title);
}
```

Common helpers:
- `listIssues(snapshot)`, `renderIssue(snapshot, issueId)`
- `listPRs(snapshot)`, `renderPR(snapshot, prKey)`

## Write events

The SDK provides file-writers that emit `a5cforge/v1` event files under `.collab/**`. You are responsible for committing them (or writing them into an inbox ref via your own Git plumbing).

```ts
import { openRepo, HlcClock, loadHlcState, saveHlcState, writeIssueCreated } from "@a5c-ai/sdk";

const actor = "alice";
const repo = await openRepo(process.cwd());
const clock = new HlcClock(await loadHlcState(actor));

const wr = await writeIssueCreated(
  { repoRoot: repo.root, actor, clock },
  { issueId: "issue-123", title: "Hello", time: new Date().toISOString() }
);

await saveHlcState(actor, clock.now());
console.log("wrote", wr.path);
```

See exports from `@a5c-ai/sdk`:
- `writeIssueCreated`, `writeCommentCreated`, `writePrRequest`, `writePrProposal`, `writeAgentClaimChanged`, …
- `stageFiles(repoRoot, [path])` to `git add` the created paths

## Treeish vs inbox refs

- `treeish` is any Git revision you can `git rev-parse` (e.g. `HEAD`, `main`, a commit SHA). It defines the “base” collab history.
- `inboxRefs` are additional refs whose `.collab/**` events are merged into the snapshot (useful for “incoming” PRs/issues, UI inboxes, etc.).

In many apps you can keep `treeish: "HEAD"` and rely on `inboxRefs` for all writes.

## License

See repository license.

