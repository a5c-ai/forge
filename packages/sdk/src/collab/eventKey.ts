export type EventKeyParts = {
  tsMs: number;
  actor: string;
  nonce: string;
  kind: string;
};

// Filename example:
//   1734628200000_alice_0001.issue.event.created.json
export function parseEventKeyFromFilename(filename: string): EventKeyParts {
  const m = /^(\d{13})_([A-Za-z0-9._-]+)_(\d{4})\.([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\.(json|md)$/.exec(
    filename
  );
  if (!m) {
    throw new Error(`Invalid event filename grammar: ${filename}`);
  }
  return { tsMs: Number(m[1]), actor: m[2], nonce: m[3], kind: m[4] };
}

export function compareEventFilesByPath(aPath: string, bPath: string): number {
  // Deterministic ordering by filename (Phase 2 baseline). We sort by:
  //   tsMs asc, actor asc, nonce asc, kind asc, then full path lexicographically.
  const aBase = aPath.split("/").pop() ?? aPath;
  const bBase = bPath.split("/").pop() ?? bPath;
  const a = parseEventKeyFromFilename(aBase);
  const b = parseEventKeyFromFilename(bBase);

  if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  if (a.nonce !== b.nonce) return a.nonce < b.nonce ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (aPath === bPath) return 0;
  return aPath < bPath ? -1 : 1;
}


