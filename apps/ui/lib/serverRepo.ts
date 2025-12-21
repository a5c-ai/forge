import "server-only";
import path from "node:path";
import { unstable_noStore as noStore } from "next/cache";
import { loadSnapshot, openRepo, listIssues, listPRs, renderIssue, renderPR } from "@a5c-ai/sdk";

function getEnvRepo() {
  const repo = process.env.A5C_REPO;
  if (!repo) throw new Error("Missing A5C_REPO");
  const treeish = process.env.A5C_TREEISH ?? "HEAD";
  const inboxRefs = process.env.A5C_INBOX_REFS ? process.env.A5C_INBOX_REFS.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  return { repo: path.resolve(repo), treeish, inboxRefs };
}

export async function loadUiSnapshot(overrides?: { treeish?: string; inboxRefs?: string[] }) {
  noStore();
  const cfg = getEnvRepo();
  const treeish = overrides?.treeish ?? cfg.treeish;
  const inboxRefs = overrides?.inboxRefs ?? cfg.inboxRefs;
  const repo = await openRepo(cfg.repo);
  const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
  return { cfg: { ...cfg, treeish, inboxRefs }, snap };
}

export async function getRenderedIssues(overrides?: { treeish?: string; inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  const ids = listIssues(snap);
  return ids.map((id) => renderIssue(snap, id)).filter(Boolean);
}

export async function getRenderedIssue(issueId: string, overrides?: { treeish?: string; inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  return renderIssue(snap, issueId);
}

export async function getRenderedPRs(overrides?: { treeish?: string; inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  const keys = listPRs(snap);
  return keys.map((k) => renderPR(snap, k)).filter(Boolean);
}

export async function getRenderedPR(prKey: string, overrides?: { treeish?: string; inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  return renderPR(snap, prKey);
}


