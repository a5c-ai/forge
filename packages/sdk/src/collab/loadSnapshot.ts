import type { IGit } from "../git/IGit.js";
import type { ParsedEventFile } from "./eventTypes.js";
import { parseEventFileBytes } from "./parseEventFile.js";
import { compareEventFilesByPath } from "./eventKey.js";
import { loadInboxSnapshot } from "./loadInbox.js";

export type Snapshot = {
  treeish: string;
  commitOid: string;
  collabEvents: ParsedEventFile[];
  inbox?: {
    refs: string[];
    events: ParsedEventFile[];
  };
};

async function walkTree(
  git: IGit,
  commitOid: string,
  treePath: string,
  onFile: (filePath: string) => Promise<void>
): Promise<void> {
  const entries = await git.lsTree(commitOid, treePath);
  for (const e of entries) {
    const p = treePath ? `${treePath.replace(/\/$/, "")}/${e.path}` : e.path;
    if (e.type === "tree") {
      await walkTree(git, commitOid, p, onFile);
    } else if (e.type === "blob") {
      await onFile(p);
    }
  }
}

export async function loadSnapshot(opts: { git: IGit; treeish: string; inboxRefs?: string[] }): Promise<Snapshot> {
  const commitOid = await opts.git.revParse(opts.treeish);
  const events: ParsedEventFile[] = [];

  // Scan `.collab/**` in the commit tree.
  await walkTree(opts.git, commitOid, ".collab", async (p) => {
    if (!(p.endsWith(".json") || p.endsWith(".md"))) return;
    const bytes = await opts.git.readBlob(commitOid, p);
    const event = parseEventFileBytes(p, bytes);
    events.push({ path: p, kind: event.kind, event });
  });

  events.sort((a, b) => compareEventFilesByPath(a.path, b.path));

  let inbox: Snapshot["inbox"];
  if (opts.inboxRefs && opts.inboxRefs.length > 0) {
    const inboxEvents: ParsedEventFile[] = [];
    for (const ref of opts.inboxRefs) {
      const inboxSnap = await loadInboxSnapshot({ git: opts.git, inboxRef: ref });
      inboxEvents.push(...inboxSnap.collabEvents);
    }
    inboxEvents.sort((a, b) => compareEventFilesByPath(a.path, b.path));
    inbox = { refs: [...opts.inboxRefs], events: inboxEvents };
  }

  return { treeish: opts.treeish, commitOid, collabEvents: events, inbox };
}


