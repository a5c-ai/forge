import fs from "node:fs/promises";
import path from "node:path";
import type { HlcClock } from "./hlc.js";

export type WriterContext = {
  repoRoot: string;
  actor: string;
  clock: HlcClock;
  // nonce generator for filename uniqueness within same ms
  nextNonce?: () => string; // must return 4 digits
};

export function defaultNonceGen() {
  let n = 0;
  return () => String(++n).padStart(4, "0");
}

export async function writeJsonFile(absPath: string, obj: any): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

export function tsMsFromIso(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO time: ${iso}`);
  return ms;
}


