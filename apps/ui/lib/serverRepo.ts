import "server-only";
import path from "node:path";
import { unstable_noStore as noStore } from "next/cache";
import { loadSnapshot, openRepo, listIssues, listPRs, renderIssue, renderPR } from "@a5c-ai/sdk";

function getEnvRepo() {
  const repo = process.env.A5C_REPO;
  if (!repo) throw new Error("Missing A5C_REPO");
  const inboxRefs = process.env.A5C_INBOX_REFS ? process.env.A5C_INBOX_REFS.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  return { repo: path.resolve(repo), inboxRefs };
}

export async function loadUiSnapshot(overrides?: { inboxRefs?: string[] }) {
  noStore();
  const cfg = getEnvRepo();
  const inboxRefs = overrides?.inboxRefs ?? cfg.inboxRefs;
  const repo = await openRepo(cfg.repo);
  const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD", inboxRefs });
  return { cfg: { ...cfg, inboxRefs }, snap };
}

export async function getRenderedIssues(overrides?: { inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  const ids = listIssues(snap);
  return ids.map((id) => renderIssue(snap, id)).filter(Boolean);
}

export async function getRenderedIssue(issueId: string, overrides?: { inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  return renderIssue(snap, issueId);
}

export async function getRenderedPRs(overrides?: { inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  const keys = listPRs(snap);
  return keys.map((k) => renderPR(snap, k)).filter(Boolean);
}

export async function getRenderedPR(prKey: string, overrides?: { inboxRefs?: string[] }) {
  const { snap } = await loadUiSnapshot(overrides);
  return renderPR(snap, prKey);
}


