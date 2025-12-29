export type EventKeyParts = {
  tsMs: number;
  actor: string;
  nonce: string;
  kind: string;
};

export type RunEventKeyParts = {
  seq: number;
  type: string;
  stepId: number;
  attempt: number;
  actor: string;
};

// Filename example:
//   1734628200000_alice_0001.issue.event.created.json
export function parseEventKeyFromFilename(filename: string): EventKeyParts {
  const m = /^(\d{13})_([A-Za-z0-9._-]+)_(\d{4})\.([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\.(json|md|ndjson)$/.exec(
    filename
  );
  if (!m) {
    throw new Error(`Invalid event filename grammar: ${filename}`);
  }
  return { tsMs: Number(m[1]), actor: m[2], nonce: m[3], kind: m[4] };
}

// Filename example:
//   000001__run.step.started__s3__a1__runner.json
export function parseRunEventKeyFromFilename(filename: string): RunEventKeyParts {
  const m = /^(\d+)__([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)__s(\d+)__a(\d+)__([A-Za-z0-9._-]+)\.(json|md|ndjson)$/.exec(
    filename
  );
  if (!m) {
    throw new Error(`Invalid run event filename grammar: ${filename}`);
  }
  return { seq: Number(m[1]), type: m[2], stepId: Number(m[3]), attempt: Number(m[4]), actor: m[5] };
}

export function compareEventFilesByPath(aPath: string, bPath: string): number {
  // Deterministic ordering by filename (Phase 2 baseline). We sort by:
  //   tsMs asc, actor asc, nonce asc, kind asc, then full path lexicographically.
  const [aFile, aIdxRaw] = aPath.split("::");
  const [bFile, bIdxRaw] = bPath.split("::");
  const aIdx = aIdxRaw ? Number(aIdxRaw) : undefined;
  const bIdx = bIdxRaw ? Number(bIdxRaw) : undefined;

  // Be robust to Windows-style separators in case callers pass filesystem paths.
  const aBase = (aFile.split(/[/\\]/).pop() ?? aFile) as string;
  const bBase = (bFile.split(/[/\\]/).pop() ?? bFile) as string;

  // Support both timestamp-based event filenames and seq-based run event filenames.
  // Unknown/invalid filenames must never throw; fall back to lexical ordering.
  let aOld: EventKeyParts | undefined;
  let bOld: EventKeyParts | undefined;
  let aRun: RunEventKeyParts | undefined;
  let bRun: RunEventKeyParts | undefined;
  try {
    aOld = parseEventKeyFromFilename(aBase);
  } catch {}
  try {
    bOld = parseEventKeyFromFilename(bBase);
  } catch {}
  try {
    aRun = parseRunEventKeyFromFilename(aBase);
  } catch {}
  try {
    bRun = parseRunEventKeyFromFilename(bBase);
  } catch {}

  if (aOld && bOld) {
    if (aOld.tsMs !== bOld.tsMs) return aOld.tsMs - bOld.tsMs;
    if (aOld.actor !== bOld.actor) return aOld.actor < bOld.actor ? -1 : 1;
    if (aOld.nonce !== bOld.nonce) return aOld.nonce < bOld.nonce ? -1 : 1;
    if (aOld.kind !== bOld.kind) return aOld.kind < bOld.kind ? -1 : 1;
    // For bundles, preserve line order within the same file.
    if (aFile === bFile && aIdx !== undefined && bIdx !== undefined && aIdx !== bIdx) return aIdx - bIdx;
  }

  if (aRun && bRun) {
    if (aRun.seq !== bRun.seq) return aRun.seq - bRun.seq;
    if (aRun.type !== bRun.type) return aRun.type < bRun.type ? -1 : 1;
    if (aRun.stepId !== bRun.stepId) return aRun.stepId - bRun.stepId;
    if (aRun.attempt !== bRun.attempt) return aRun.attempt - bRun.attempt;
    if (aRun.actor !== bRun.actor) return aRun.actor < bRun.actor ? -1 : 1;
    if (aFile === bFile && aIdx !== undefined && bIdx !== undefined && aIdx !== bIdx) return aIdx - bIdx;
  }

  if (aPath === bPath) return 0;
  return aPath < bPath ? -1 : 1;
}


