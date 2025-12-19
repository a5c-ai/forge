import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { HlcState } from "./hlc.js";

type StoreFile = {
  schema: "a5cforge/v1";
  actors: Record<string, HlcState>;
};

function defaultConfigDir(): string {
  const override = process.env.A5CFORGE_CONFIG_DIR;
  if (override && override.length > 0) return override;
  if (process.platform === "win32") {
    return process.env.APPDATA ? path.join(process.env.APPDATA, "a5cforge") : path.join(os.homedir(), "AppData", "Roaming", "a5cforge");
  }
  return path.join(os.homedir(), ".config", "a5cforge");
}

export function hlcStorePath(): string {
  return path.join(defaultConfigDir(), "hlc.json");
}

export async function loadHlcState(actor: string): Promise<HlcState | undefined> {
  try {
    const raw = await fs.readFile(hlcStorePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return parsed.actors?.[actor];
  } catch {
    return;
  }
}

export async function saveHlcState(actor: string, state: HlcState): Promise<void> {
  const p = hlcStorePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  let store: StoreFile = { schema: "a5cforge/v1", actors: {} };
  try {
    store = JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    // ignore missing/corrupt; overwrite
  }
  store.schema = "a5cforge/v1";
  store.actors = store.actors ?? {};
  store.actors[actor] = state;
  await fs.writeFile(p, JSON.stringify(store, null, 2) + "\n", "utf8");
}


