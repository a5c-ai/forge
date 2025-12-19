import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { loadHlcState, saveHlcState } from "../src/write/hlcStore.js";

describe("hlcStore", () => {
  it("persists per-actor HLC state", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-hlcstore-"));
    process.env.A5CFORGE_CONFIG_DIR = dir;

    await saveHlcState("alice", { wallMs: 1, counter: 2 });
    await saveHlcState("bob", { wallMs: 3, counter: 4 });

    expect(await loadHlcState("alice")).toEqual({ wallMs: 1, counter: 2 });
    expect(await loadHlcState("bob")).toEqual({ wallMs: 3, counter: 4 });
    expect(await loadHlcState("carol")).toBeUndefined();
  });
});


