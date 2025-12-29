import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI agent generate-context", () => {
  it(
    "renders template with conditionals, each, and git:// includes",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-generate-context");
      const outPath = path.join(repo, "out.md");

      const oldEnv = process.env.A5C_TEST_FLAG;
      process.env.A5C_TEST_FLAG = "1";
      try {
        expect(
          await runCli(
            [
              "agent",
              "generate-context",
              "--repo",
              repo,
              "--in",
              "input.json",
              "--template",
              ".a5c/main.md",
              "--var",
              "ref=HEAD",
              "--out",
              "out.md"
            ],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);
      } finally {
        if (oldEnv === undefined) delete process.env.A5C_TEST_FLAG;
        else process.env.A5C_TEST_FLAG = oldEnv;
      }

      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("Hello world.");
      expect(out).toContain("FLAG=1");
      expect(out).toContain("- 1");
      expect(out).toContain("- 2");
      expect(out).toContain("Partial says world.");
    },
    30000
  );
});

