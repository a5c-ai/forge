import type { IncomingMessage } from "node:http";
import { readRaw } from "./io.js";

export function parseJsonOrEmpty(raw: Buffer): any {
  const s = raw.toString("utf8").trim();
  if (!s) return {};
  return JSON.parse(s);
}

export async function readJsonObject(req: IncomingMessage, maxBytes = 256_000): Promise<any> {
  const raw = await readRaw(req, maxBytes);
  return parseJsonOrEmpty(raw);
}


