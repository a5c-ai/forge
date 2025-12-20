import type { IncomingMessage } from "node:http";

export function requireAuth(req: IncomingMessage, token?: string): boolean {
  if (!token) return true;
  const hdr = req.headers["authorization"];
  if (!hdr) return false;
  const m = /^Bearer\s+(.+)$/.exec(String(hdr));
  return !!m && m[1] === token;
}


