import path from "node:path";

export type UiRepoConfig = {
  repo: string;
  treeish: string;
  inboxRefs?: string[];
};

export function getRepoConfigFromEnv(): UiRepoConfig {
  const repo = process.env.A5C_REPO;
  if (!repo) throw new Error("Missing A5C_REPO env var");
  const treeish = process.env.A5C_TREEISH ?? "HEAD";
  const inboxRefs = process.env.A5C_INBOX_REFS ? process.env.A5C_INBOX_REFS.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  return { repo: path.resolve(repo), treeish, inboxRefs };
}


