import path from "node:path";

export function isCollabEventPath(p: string): boolean {
  // Conservative: only validate files under `.collab/**`.
  const normalized = p.split(path.sep).join("/");
  return normalized.includes("/.collab/");
}

export function isCollabConfigPath(p: string): boolean {
  const normalized = p.split(path.sep).join("/");
  if (normalized.endsWith("/.collab/discovery.json") || (normalized.includes("/.collab/") && normalized.endsWith("/discovery.json"))) return true;
  if (normalized.endsWith("/.collab/webhooks.json")) return true;
  if (normalized.includes("/.collab/keys/")) return true;
  return false;
}

export function assertEventFilenameGrammar(filePath: string) {
  // Minimal Phase-1 grammar: filename begins with a numeric ms timestamp and contains kind suffix.
  // Example: `1734628200000_alice_0001.issue.event.created.json`
  const base = path.basename(filePath);
  const ok = /^\d{13}_[A-Za-z0-9._-]+_\d{4}\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*\.(json|md|ndjson)$/.test(base);
  if (!ok) throw new Error(`Bad event filename grammar: ${base}`);
}

export function assertEventPathGrammar(filePath: string) {
  const normalized = filePath.split(path.sep).join("/");
  // Minimal Phase 1 path grammar checks:
  // - must be under `.collab/**`
  // - issue events live under `.collab/issues/<id>/events/YYYY/MM/<filename>`
  // - PR events live under `.collab/prs/<id>/events/YYYY/MM/<filename>`
  // - agent global events live under `.collab/agents/events/YYYY/MM/<filename>`
  // - ops global events live under `.collab/ops/events/YYYY/MM/<filename>`
  const patterns = [
    /\/\.collab\/issues\/[^/]+\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md|ndjson)$/,
    /\/\.collab\/prs\/[^/]+\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md|ndjson)$/,
    /\/\.collab\/agents\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md|ndjson)$/,
    /\/\.collab\/ops\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md|ndjson)$/
  ];
  const ok = patterns.some((re) => re.test(normalized));
  if (!ok) throw new Error(`Bad event path grammar: ${normalized}`);
}


