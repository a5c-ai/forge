import type { IGit } from "../git/IGit.js";
import type { ParsedEventFile } from "./eventTypes.js";
import { parseEventFileBytes } from "./parseEventFile.js";
import { compareEventFilesByPath } from "./eventKey.js";

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

export type InboxSnapshot = {
  ref: string;
  commitOid: string;
  collabEvents: ParsedEventFile[];
};

export async function loadInboxSnapshot(opts: { git: IGit; inboxRef: string }): Promise<InboxSnapshot> {
  const commitOid = await opts.git.revParse(opts.inboxRef);
  const events: ParsedEventFile[] = [];
  await walkTree(opts.git, commitOid, ".collab", async (p) => {
    // Exclude non-event config files.
    if (p === ".collab/discovery.json" || p.endsWith("/discovery.json")) return;
    if (!(p.endsWith(".json") || p.endsWith(".md"))) return;
    const bytes = await opts.git.readBlob(commitOid, p);
    const event = parseEventFileBytes(p, bytes);
    events.push({ path: p, kind: event.kind, event });
  });
  events.sort((a, b) => compareEventFilesByPath(a.path, b.path));
  return { ref: opts.inboxRef, commitOid, collabEvents: events };
}


