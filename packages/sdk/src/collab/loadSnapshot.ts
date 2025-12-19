import type { IGit } from "../git/IGit.js";
import type { ParsedEventFile } from "./eventTypes.js";
import { parseEventFileBytes, parseEventFileBytesMany } from "./parseEventFile.js";
import { compareEventFilesByPath } from "./eventKey.js";
import { loadInboxSnapshot } from "./loadInbox.js";
import { loadDiscoveryConfig } from "./discovery.js";

export type Snapshot = {
  treeish: string;
  commitOid: string;
  collabEvents: ParsedEventFile[];
  inbox?: {
    refs: string[];
    events: ParsedEventFile[];
  };
  discovery?: {
    inboxRefs?: string[];
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
    // Exclude non-event config files.
    if (p === ".collab/discovery.json" || p.endsWith("/discovery.json")) return;
    if (!(p.endsWith(".json") || p.endsWith(".md") || p.endsWith(".ndjson"))) return;
    const bytes = await opts.git.readBlob(commitOid, p);
    const evs = p.endsWith(".ndjson") ? parseEventFileBytesMany(p, bytes) : [parseEventFileBytes(p, bytes)];
    for (let i = 0; i < evs.length; i++) {
      const event = evs[i]!;
      const ep = p.endsWith(".ndjson") ? `${p}::${i}` : p;
      events.push({ path: ep, kind: event.kind, event });
    }
  });

  events.sort((a, b) => compareEventFilesByPath(a.path, b.path));

  const discoveryCfg = await loadDiscoveryConfig({ git: opts.git, commitOid });
  const resolvedInboxRefs = (opts.inboxRefs && opts.inboxRefs.length > 0 ? opts.inboxRefs : discoveryCfg?.inboxRefs) ?? [];

  let inbox: Snapshot["inbox"];
  if (resolvedInboxRefs.length > 0) {
    const inboxEvents: ParsedEventFile[] = [];
    for (const ref of resolvedInboxRefs) {
      const inboxSnap = await loadInboxSnapshot({ git: opts.git, inboxRef: ref });
      inboxEvents.push(...inboxSnap.collabEvents);
    }
    inboxEvents.sort((a, b) => compareEventFilesByPath(a.path, b.path));
    inbox = { refs: [...resolvedInboxRefs], events: inboxEvents };
  }

  return { treeish: opts.treeish, commitOid, collabEvents: events, inbox, discovery: { inboxRefs: discoveryCfg?.inboxRefs } };
}


