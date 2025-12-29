import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run reconcile treeish determinism", () => {
  it(
    "uses playbook content from --treeish, not working directory",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      // Mutate the working tree playbook without committing; if reconcile reads
      // from the filesystem, it would plan WAIT_HUMAN (step 1 has no hook).
      const playbookPath = path.join(repo, "playbooks", "web_feature.yaml");
      const mutated = [
        "template_id: web_feature",
        "version: v1",
        "steps:",
        "  - step_id: 1",
        "    type: human",
        "    breakpoint:",
        "      enabled: true"
      ].join("\n");
      await fs.writeFile(playbookPath, mutated + "\n", "utf8");

      let out = "";
      expect(
        await runCli(["run", "reconcile", "--repo", repo, "--json", "--run-id", "run_001"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);

      const obj = JSON.parse(out);
      expect(Array.isArray(obj.plans)).toBe(true);
      expect(obj.plans[0]?.kind).toBe("EXECUTE_STEP");
    },
    30000
  );
});

