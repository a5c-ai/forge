import path from "node:path";
import fs from "node:fs/promises";

export function repoRootFromHere(fromDir: string): string {
  // packages/spec-tests/* -> repo root
  return path.resolve(fromDir, "../../..");
}

export async function readJson(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}


