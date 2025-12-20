import crypto from "node:crypto";
import type http from "node:http";

export function verifyGitHubHmac(req: http.IncomingMessage, rawBody: Buffer, secret?: string): boolean {
  if (!secret) return true;
  const sig = String(req.headers["x-hub-signature-256"] ?? "");
  const m = /^sha256=([0-9a-f]{64})$/i.exec(sig);
  if (!m) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // timing-safe compare
  const a = Buffer.from(m[1].toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}


