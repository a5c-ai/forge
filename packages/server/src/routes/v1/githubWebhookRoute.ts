import type http from "node:http";
import { readRaw, sendJson } from "../../http/io.js";
import { parseJsonOrEmpty } from "../../http/json.js";
import { verifyGitHubHmac } from "../../webhooks/github.js";
import { writeToInboxRef } from "../../git/writeToInboxRef.js";
import { HlcClock, loadHlcState, saveHlcState, writePrProposal } from "@a5cforge/sdk";

export async function handleV1GithubWebhook(args: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  repoRoot: string;
  pathname: string;
}): Promise<boolean> {
  const { req, res, repoRoot, pathname } = args;
  if (req.method !== "POST" || pathname !== "/v1/webhooks/github") return false;

  const secret = process.env.A5C_GITHUB_WEBHOOK_SECRET;
  const inboxRef = process.env.A5C_GITHUB_INBOX_REF ?? "refs/a5c/inbox/github";
  const raw = await readRaw(req, 512_000);
  if (!verifyGitHubHmac(req, raw, secret)) {
    sendJson(res, 401, { error: "invalid signature" });
    return true;
  }
  const evt = String(req.headers["x-github-event"] ?? "");
  const parsed = parseJsonOrEmpty(raw);
  if (evt !== "pull_request") {
    sendJson(res, 400, { error: "unsupported event" });
    return true;
  }
  const action = String(parsed?.action ?? "");
  if (action !== "opened") {
    sendJson(res, 200, { ok: true, ignored: true, reason: `action:${action}` });
    return true;
  }

  const pr = parsed?.pull_request;
  const sender = parsed?.sender;
  const number = pr?.number;
  const prKey = `pr-gh-${number}`;
  const baseRef = String(pr?.base?.ref ?? "main");
  const headRef = `refs/heads/${String(pr?.head?.ref ?? "unknown")}`;
  const title = String(pr?.title ?? `PR ${number}`);
  const body = pr?.body == null ? undefined : String(pr.body);
  const actor = String(sender?.login ?? "github");
  const time = String(pr?.created_at ?? new Date().toISOString());

  const { result, commit } = await writeToInboxRef(repoRoot, inboxRef, async (worktreeDir) => {
    const state = await loadHlcState(actor);
    const clock = new HlcClock(state);
    const wr = await writePrProposal({ repoRoot: worktreeDir, actor, clock }, { prKey, baseRef, headRef, title, body, time });
    await saveHlcState(actor, clock.now());
    return wr;
  });

  sendJson(res, 200, { ok: true, inboxRef, commit, path: (result as any).path });
  return true;
}


