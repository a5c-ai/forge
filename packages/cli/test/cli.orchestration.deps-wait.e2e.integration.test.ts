import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI orchestration end-to-end (deps wait)", () => {
  it(
    "spawns a dep run, blocks parent, then unblocks after dep completion",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-deps-wait");

      expect(
        await runCli(["run", "dispatch", "--repo", repo, "--playbook", "playbooks/parent.yaml@v1", "--run-id", "run_010"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      // Execute parent step 1 (spawns dependency) then stop blocked on deps.
      expect(
        await runCli(["run", "tick", "--repo", repo, "--run-id", "run_010", "--max-transitions", "3"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(30);

      // Reconcile output should show WAIT_DEPS.
      let out = "";
      expect(
        await runCli(["run", "reconcile", "--repo", repo, "--run-id", "run_010", "--json"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(30);
      const envelope = JSON.parse(out);
      expect((envelope.plans ?? []).some((p: any) => p.kind === "WAIT_DEPS")).toBe(true);

      const parentEventsDir = path.join(repo, ".collab", "runs", "run_010", "events");
      const names = (await fs.readdir(parentEventsDir)).sort();
      const spawned = names.find((n) => n.includes("__run.dep.spawned__"));
      expect(spawned).toBeTruthy();
      const spawnedEv = JSON.parse(await fs.readFile(path.join(parentEventsDir, spawned!), "utf8"));
      const depRunId = spawnedEv?.payload?.dep_run_id;
      expect(typeof depRunId).toBe("string");

      // Run the dependent to completion.
      expect(
        await runCli(["run", "tick", "--repo", repo, "--run-id", depRunId, "--max-transitions", "3"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      // Reconcile parent should detect completion and append run.dep.completed.
      expect(
        await runCli(["run", "reconcile", "--repo", repo, "--run-id", "run_010"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(30);

      const names2 = (await fs.readdir(parentEventsDir)).sort();
      expect(names2.some((n) => n.includes("__run.dep.completed__"))).toBe(true);

      // Now parent can proceed to step 2.
      expect(
        await runCli(["run", "tick", "--repo", repo, "--run-id", "run_010", "--max-transitions", "3"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      const names3 = (await fs.readdir(parentEventsDir)).sort();
      expect(names3.some((n) => n.includes("__run.step.completed__s2__a1__"))).toBe(true);
    },
    60000
  );
});

