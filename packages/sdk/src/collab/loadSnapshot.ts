import type { IGit } from "../git/IGit.js";
import type { ParsedEventFile } from "./eventTypes.js";
import { parseEventFileBytes, parseEventFileBytesMany } from "./parseEventFile.js";
import { compareEventFilesByPath } from "./eventKey.js";
import { loadInboxSnapshot } from "./loadInbox.js";
import { loadDiscoveryConfig } from "./discovery.js";
import type { SnapshotCache } from "./snapshotCache.js";

export type Snapshot = {
  treeish: string;
  commitOid: string;
  collabEvents: ParsedEventFile[];
  parseErrors?: Array<{ path: string; error: string }>;
  inbox?: {
    refs: string[];
    events: ParsedEventFile[];
    parseErrors?: Array<{ path: string; error: string }>;
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

export async function loadSnapshot(opts: {
  git: IGit;
  treeish: string;
  inboxRefs?: string[];
  cache?: SnapshotCache;
}): Promise<Snapshot> {
  return loadSnapshotWithCache({ ...opts });
}

export async function loadSnapshotWithCache(opts: {
  git: IGit;
  treeish: string;
  inboxRefs?: string[];
  cache?: SnapshotCache;
}): Promise<Snapshot> {
  const commitOid = await opts.git.revParse(opts.treeish);

  const cached = opts.cache?.getMain<{ events: ParsedEventFile[]; parseErrors?: Array<{ path: string; error: string }>; discovery?: any }>(
    commitOid
  );

  let events: ParsedEventFile[];
  let parseErrors: Array<{ path: string; error: string }> | undefined;
  let discoveryCfg: any | undefined;

  if (cached) {
    events = [...cached.events];
    parseErrors = cached.parseErrors ? [...cached.parseErrors] : undefined;
    discoveryCfg = cached.discovery;
  } else {
    events = [];
    const errs: Array<{ path: string; error: string }> = [];

    // Scan `.collab/**` in the commit tree.
    await walkTree(opts.git, commitOid, ".collab", async (p) => {
      // Exclude non-event config files.
      if (p === ".collab/discovery.json" || p.endsWith("/discovery.json")) return;
    if (p === ".collab/webhooks.json" || p.endsWith("/webhooks.json")) return;
      if (!(p.endsWith(".json") || p.endsWith(".md") || p.endsWith(".ndjson"))) return;
      try {
        const bytes = await opts.git.readBlob(commitOid, p);
        const evs = p.endsWith(".ndjson") ? parseEventFileBytesMany(p, bytes) : [parseEventFileBytes(p, bytes)];
        for (let i = 0; i < evs.length; i++) {
          const event = evs[i]!;
          const ep = p.endsWith(".ndjson") ? `${p}::${i}` : p;
          events.push({ path: ep, kind: event.kind, event });
        }
      } catch (e: any) {
        errs.push({ path: p, error: String(e?.message ?? e) });
      }
    });

    events.sort((a, b) => compareEventFilesByPath(a.path, b.path));
    parseErrors = errs.length ? errs : undefined;

    discoveryCfg = await loadDiscoveryConfig({ git: opts.git, commitOid });

    opts.cache?.setMain(commitOid, { events, parseErrors, discovery: discoveryCfg });
  }

  const resolvedInboxRefs = (opts.inboxRefs && opts.inboxRefs.length > 0 ? opts.inboxRefs : discoveryCfg?.inboxRefs) ?? [];

  let inbox: Snapshot["inbox"];
  if (resolvedInboxRefs.length > 0) {
    const inboxEvents: ParsedEventFile[] = [];
    const inboxParseErrors: Array<{ path: string; error: string }> = [];
    for (const ref of resolvedInboxRefs) {
      const inboxSnap = await loadInboxSnapshot({ git: opts.git, inboxRef: ref, cache: opts.cache });
      inboxEvents.push(...inboxSnap.collabEvents);
      if (inboxSnap.parseErrors) inboxParseErrors.push(...inboxSnap.parseErrors);
    }
    inboxEvents.sort((a, b) => compareEventFilesByPath(a.path, b.path));
    inbox = { refs: [...resolvedInboxRefs], events: inboxEvents, parseErrors: inboxParseErrors.length ? inboxParseErrors : undefined };
  }

  return {
    treeish: opts.treeish,
    commitOid,
    collabEvents: events,
    parseErrors,
    inbox,
    discovery: { inboxRefs: discoveryCfg?.inboxRefs }
  };
}


