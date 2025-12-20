import type http from "node:http";
import { sendJson } from "../../http/io.js";
import { readJsonObject } from "../../http/json.js";
import { runGitCapture } from "../../git/exec.js";
import { emitGitWebhook } from "../../webhooks/emitters.js";

function parseNameStatus(nameStatus: string) {
  return nameStatus
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split("\t");
      const status = parts[0];
      if (status.startsWith("R") || status.startsWith("C")) {
        return { path: parts[2], status: status[0], oldPath: parts[1] };
      }
      return { path: parts[1], status };
    });
}

export async function handleV1GitRefUpdated(args: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  repoRoot: string;
  pathname: string;
}): Promise<boolean> {
  const { req, res, repoRoot, pathname } = args;
  if (req.method !== "POST" || pathname !== "/v1/git/ref-updated") return false;

  const body = await readJsonObject(req, 512_000);
  const ref = String(body.ref ?? "");
  const oldOid = String(body.oldOid ?? "");
  const newOid = String(body.newOid ?? "");
  if (!ref || !newOid) {
    sendJson(res, 400, { error: "missing ref/newOid" });
    return true;
  }

  const zero = "0000000000000000000000000000000000000000";
  const range = oldOid && oldOid !== zero ? `${oldOid}..${newOid}` : newOid;

  const commitsRaw = await runGitCapture(["rev-list", range], repoRoot);
  const commitOids = commitsRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .reverse(); // oldest->newest for stable seq

  // 1) ref updated
  await emitGitWebhook({
    repoRoot,
    ref,
    seq: 0,
    eventType: "git.ref.updated",
    data: { ref, oldOid: oldOid || zero, newOid, actor: body.actor }
  });

  // 2) commits
  let seq = 1;
  for (const oid of commitOids) {
    const fmt = await runGitCapture(["show", "-s", "--format=%H%n%P%n%an%n%ae%n%at%n%cn%n%ce%n%ct%n%B", oid], repoRoot);
    const lines = fmt.split(/\r?\n/);
    const commitOid = lines[0]?.trim();
    const parents = (lines[1] ?? "").trim().split(" ").filter(Boolean);
    const author = { name: lines[2] ?? "", email: lines[3] ?? "", time: new Date(Number(lines[4] ?? "0") * 1000).toISOString() };
    const committer = { name: lines[5] ?? "", email: lines[6] ?? "", time: new Date(Number(lines[7] ?? "0") * 1000).toISOString() };
    const message = lines.slice(8).join("\n").trim();

    const nameStatus = await runGitCapture(["show", "--name-status", "--format=", oid], repoRoot);
    const filesChanged = parseNameStatus(nameStatus);

    await emitGitWebhook({
      repoRoot,
      ref,
      seq,
      eventType: "git.commit.created",
      data: { ref, oldOid: oldOid || zero, newOid, commitOid, parents, author, committer, message, filesChanged }
    });
    seq++;
  }

  // 3) tree changed summary
  const diffNs = oldOid && oldOid !== zero ? await runGitCapture(["diff", "--name-status", oldOid, newOid], repoRoot) : "";
  const diffNum = oldOid && oldOid !== zero ? await runGitCapture(["diff", "--numstat", oldOid, newOid], repoRoot) : "";
  const filesChanged = parseNameStatus(diffNs);

  let additions = 0;
  let deletions = 0;
  for (const l of diffNum.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const [a, d] = l.split("\t");
    const aa = Number(a);
    const dd = Number(d);
    if (Number.isFinite(aa)) additions += aa;
    if (Number.isFinite(dd)) deletions += dd;
  }

  await emitGitWebhook({
    repoRoot,
    ref,
    seq,
    eventType: "git.tree.changed",
    data: { ref, oldOid: oldOid || zero, newOid, stats: { additions, deletions }, filesChanged }
  });

  sendJson(res, 200, { ok: true, ref, commits: commitOids.length });
  return true;
}


