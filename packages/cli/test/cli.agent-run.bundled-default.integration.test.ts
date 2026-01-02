import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeEmptyRepo } from "./_util.js";

describe("CLI agent run (bundled default predefined.yaml)", () => {
  it(
    "falls back to bundled predefined.yaml when repo config is missing",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-agent-run-bundled-");
      await fs.writeFile(path.join(repo, "prompt.md"), "Hello from prompt\n", "utf8");
      await fs.writeFile(
        path.join(repo, "echo.js"),
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          "const args = process.argv.slice(2);",
          "const pIdx = args.indexOf('--prompt');",
          "const oIdx = args.indexOf('--out');",
          "const prompt = pIdx >= 0 ? args[pIdx + 1] : '';",
          "const out = oIdx >= 0 ? args[oIdx + 1] : '';",
          "if (!prompt || !out) process.exit(2);",
          "const txt = fs.readFileSync(prompt, 'utf8');",
          "fs.mkdirSync(path.dirname(out), { recursive: true });",
          "fs.writeFileSync(out, txt, 'utf8');",
          ""
        ].join("\n"),
        "utf8"
      );
      await fs.writeFile(
        path.join(repo, "override.yaml"),
        [
          "cli:",
          "  echo:",
          "    cli_command: \"node echo.js\"",
          "profiles:",
          "  test:",
          "    cli: echo",
          "    cli_params: \"--prompt {{prompt_path}} --out {{output_last_message_path}}\"",
          ""
        ].join("\n"),
        "utf8"
      );

      // Use --config to define a runnable profile (so the test does not depend on codex/claude binaries).
      // Verify that agent run does not error due to missing predefined.yaml.
      expect(
        await runCli(
          ["agent", "run", "--repo", repo, "--profile", "test", "--config", "override.yaml", "--in", "prompt.md", "--out", "out.md"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      const out = await fs.readFile(path.join(repo, "out.md"), "utf8");
      expect(out).toContain("Hello from prompt");
    },
    30000
  );
});
