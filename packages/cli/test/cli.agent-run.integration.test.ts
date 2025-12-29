import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI agent run (predefined agent CLIs)", () => {
  it(
    "runs a predefined profile and writes --out",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-run-predefined");
      const outPath = path.join(repo, "out.md");
      expect(
        await runCli(
          ["agent", "run", "--repo", repo, "--profile", "default", "--in", "prompt.md", "--out", "out.md", "--model", "m1"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);
      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("This is a prompt");
    },
    30000
  );

  it(
    "merges --config overrides on top of predefined.yaml",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-run-predefined");
      const outPath = path.join(repo, "out.md");
      expect(
        await runCli(
          [
            "agent",
            "run",
            "--repo",
            repo,
            "--profile",
            "default",
            "--config",
            "override.yaml",
            "--in",
            "prompt.md",
            "--out",
            "out.md",
            "--model",
            "m2"
          ],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);
      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("MODEL=m2");
      expect(out).toContain("This is a prompt");
    },
    30000
  );
});
