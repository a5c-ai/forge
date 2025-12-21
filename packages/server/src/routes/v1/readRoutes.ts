import type http from "node:http";
import { sendJson } from "../../http/io.js";
import { loadSnapshot, openRepo, renderIssue, renderPR, listIssues, listPRs, type SnapshotCache } from "@a5c-ai/sdk";

export async function handleV1Read(args: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  repoRoot: string;
  treeish: string;
  inboxRefs?: string[];
  pathname: string;
  snapshotCache?: SnapshotCache;
}): Promise<boolean> {
  const { req, res, repoRoot, treeish, inboxRefs, pathname, snapshotCache } = args;

  if (req.method === "GET" && pathname === "/v1/status") {
    const repo = await openRepo(repoRoot);
    const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs, cache: snapshotCache });
    sendJson(res, 200, { treeish, issues: listIssues(snap).length, prs: listPRs(snap).length });
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/issues") {
    const repo = await openRepo(repoRoot);
    const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs, cache: snapshotCache });
    const ids = listIssues(snap);
    sendJson(res, 200, ids.map((id) => renderIssue(snap, id)).filter(Boolean));
    return true;
  }

  {
    const m = /^\/v1\/issues\/([^/]+)$/.exec(pathname);
    if (req.method === "GET" && m) {
      const id = decodeURIComponent(m[1]);
      const repo = await openRepo(repoRoot);
      const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs, cache: snapshotCache });
      const issue = renderIssue(snap, id);
      if (!issue) {
        sendJson(res, 404, { error: "not found" });
        return true;
      }
      sendJson(res, 200, issue);
      return true;
    }
  }

  if (req.method === "GET" && pathname === "/v1/prs") {
    const repo = await openRepo(repoRoot);
    const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs, cache: snapshotCache });
    const keys = listPRs(snap);
    sendJson(res, 200, keys.map((k) => renderPR(snap, k)).filter(Boolean));
    return true;
  }

  {
    const m = /^\/v1\/prs\/([^/]+)$/.exec(pathname);
    if (req.method === "GET" && m) {
      const key = decodeURIComponent(m[1]);
      const repo = await openRepo(repoRoot);
      const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs, cache: snapshotCache });
      const pr = renderPR(snap, key);
      if (!pr) {
        sendJson(res, 404, { error: "not found" });
        return true;
      }
      sendJson(res, 200, pr);
      return true;
    }
  }

  return false;
}


