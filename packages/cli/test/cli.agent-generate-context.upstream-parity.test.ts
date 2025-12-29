import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeEmptyRepo } from "./_util.js";

describe("CLI agent generate-context (upstream parity)", () => {
  it(
    "renders include args into vars ({{> uri key=value }})",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-include-");
      const main = path.join(repo, "main.md");
      const part = path.join(repo, "part.md");
      const eventFile = path.join(repo, "event.json");

      await fs.writeFile(part, "Part {{ vars.name }}!\n", "utf8");
      await fs.writeFile(
        main,
        [
          "Hello {{ event.repository.full_name }}",
          "List: {{#each event.labels}}{{ this }} {{/each}}",
          "Include:",
          `{{> file://${part.replace(/\\/g, "/")} name=World }}`,
          ""
        ].join("\n"),
        "utf8"
      );
      await fs.writeFile(eventFile, JSON.stringify({ repository: { full_name: "a/b" }, labels: ["x", "y"] }), "utf8");

      const outPath = path.join(repo, "out.md");
      const code = await runCli(
        ["agent", "generate-context", "--repo", repo, "--in", "event.json", "--template", `file://${main.replace(/\\/g, "/")}`, "--out", "out.md"],
        { stdout: () => {}, stderr: () => {} }
      );
      expect(code).toBe(0);
      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("Hello a/b");
      expect(out).toMatch(/List: x y/);
      expect(out).toContain("Part World!");
    },
    20000
  );

  it(
    "does not leak global object for top-level {{ this }}",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-this-");
      const main = path.join(repo, "main.md");
      const eventFile = path.join(repo, "event.json");
      await fs.writeFile(main, "Outside: {{ this }}\n", "utf8");
      await fs.writeFile(eventFile, JSON.stringify({ repository: { full_name: "a/b" } }), "utf8");

      let stdout = "";
      const code = await runCli(
        ["agent", "generate-context", "--repo", repo, "--in", "event.json", "--template", `file://${main.replace(/\\/g, "/")}`],
        { stdout: (s) => (stdout += s), stderr: () => {} }
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/Outside:\s*\n/);
      expect(stdout).not.toContain("[object global]");
      expect(stdout).not.toContain("[object Object]");
    },
    20000
  );

  it.skipIf(!process.env.A5C_AGENT_GITHUB_TOKEN && !process.env.GITHUB_TOKEN)(
    "supports refs with slashes in github:// URIs",
    async () => {
      let stdout = "";
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          process.cwd(),
          "--template",
          "github://a5c-ai/a5c/a5c/main/README.md"
        ],
        { stdout: (s) => (stdout += s), stderr: () => {} }
      );
      expect(code).toBe(0);
      expect(stdout).toContain("a5c SDK & CLI");
    },
    60000
  );

  it.skipIf(!process.env.A5C_AGENT_GITHUB_TOKEN && !process.env.GITHUB_TOKEN)(
    "supports github:// globs",
    async () => {
      let stdout = "";
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          process.cwd(),
          "--template",
          // Glob should match README.md.
          "github://a5c-ai/a5c/branch/main/a5c/main/README*.md"
        ],
        { stdout: (s) => (stdout += s), stderr: () => {} }
      );
      expect(code).toBe(0);
      expect(stdout).toContain("a5c SDK & CLI");
    },
    60000
  );
});
