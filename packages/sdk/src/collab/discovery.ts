import type { IGit } from "../git/IGit.js";

export type DiscoveryConfig = {
  schema?: string;
  inboxRefs?: string[];
};

export async function loadDiscoveryConfig(opts: { git: IGit; commitOid: string }): Promise<DiscoveryConfig | undefined> {
  try {
    const bytes = await opts.git.readBlob(opts.commitOid, ".collab/discovery.json");
    const cfg = JSON.parse(bytes.toString("utf8"));
    if (cfg && typeof cfg === "object") return cfg;
    return;
  } catch {
    return;
  }
}


