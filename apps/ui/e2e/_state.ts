import fs from "node:fs/promises";
import path from "node:path";

export type E2EStateEntry = {
  baseURL: string;
  nextPid: number;
  repoDir: string;
  serverPid?: number;
  serverUrl?: string;
};

export type E2EState = {
  local: E2EStateEntry;
  remote: E2EStateEntry;
};

export const STATE_PATH = path.join(process.cwd(), ".playwright", "state.json");

export async function readState(projectName: "local" | "remote"): Promise<E2EStateEntry> {
  const raw = await fs.readFile(STATE_PATH, "utf8");
  const all = JSON.parse(raw) as E2EState;
  return all[projectName];
}


