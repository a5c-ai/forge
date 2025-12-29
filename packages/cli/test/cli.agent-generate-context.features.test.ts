import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeEmptyRepo, run } from "./_util.js";

describe("CLI agent generate-context (templating features)", () => {
  it(
    "supports printers, pipes, glob includes, and dynamic include URIs",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-features-");

      await fs.mkdir(path.join(repo, "partials"), { recursive: true });
      await fs.writeFile(path.join(repo, "partials", "a.md"), "A={{ vars.a }}\n", "utf8");
      await fs.writeFile(path.join(repo, "partials", "b.md"), "B={{ vars.b }}\n", "utf8");
      await fs.writeFile(path.join(repo, "inc.md"), "INC {{ vars.name }} {{ vars.flag }}\n", "utf8");
      await fs.writeFile(path.join(repo, "dyn.md"), "DYN {{ vars.dynValue }}\n", "utf8");

      const eventFile = path.join(repo, "event.json");
      await fs.writeFile(
        eventFile,
        JSON.stringify(
          {
            name: "world",
            obj: { k: "v" },
            items: [{ x: 1 }, { x: 2 }],
            top: { env: { SECRET: "dont-print" } }
          },
          null,
          2
        ),
        "utf8"
      );

      const main = path.join(repo, "main.md");
      await fs.writeFile(
        main,
        [
          "Hello {{ event.name }}",
          "JSON={{#printJSON event.obj}}",
          "YAML={{#printYAML event.obj}}",
          "XML={{#printXML event.obj}}",
          "Masked={{#printJSON event.top}}",
          "Loop:",
          "{{#each event.items }}- x={{ this | select(\"x\") }} json={{ this.x | toJSON(0) }}",
          "{{/each}}",
          "Include args:",
          "{{> ./inc.md name=World flag=true }}",
          "Dynamic URI:",
          "{{> \"./{{ vars.dynFile }}\" dynValue=ok }}",
          "Glob include:",
          "{{> partials/*.md a=1 b=2 }}",
          ""
        ].join("\n"),
        "utf8"
      );

      const outPath = path.join(repo, "out.md");
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          repo,
          "--in",
          "event.json",
          "--template",
          `file://${main.replace(/\\/g, "/")}`,
          "--var",
          "dynFile=dyn.md",
          "--out",
          "out.md"
        ],
        { stdout: () => {}, stderr: () => {} }
      );
      expect(code).toBe(0);

      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("Hello world");
      expect(out).toContain('"k": "v"');
      expect(out).toContain("k: v");
      expect(out).toContain("<k>v</k>");
      expect(out).toContain('"env": "REDACTED"');
      expect(out).toContain("- x=1 json=1");
      expect(out).toContain("- x=2 json=2");
      expect(out).toContain("INC World true");
      expect(out).toContain("DYN ok");
      expect(out).toContain("A=1");
      expect(out).toContain("B=2");
    },
    20000
  );

  it(
    "supports {{#include}} and protocol-relative // includes",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-include-hash-");

      await fs.writeFile(path.join(repo, "inc.md"), "INC={{ vars.name }}\n", "utf8");
      await fs.writeFile(path.join(repo, "sub.md"), "SUB\n", "utf8");

      const main = path.join(repo, "main.md");
      await fs.writeFile(
        main,
        [
          "A:",
          "{{#include ./inc.md name=World }}",
          "B:",
          `{{> file://${path
            .join(repo, "sub.md")
            .replace(/\\/g, "/")} }}`,
          // protocol-relative: inherit file:// from the base.
          "C:",
          "{{#include //inc.md name=Earth }}",
          ""
        ].join("\n"),
        "utf8"
      );

      const eventFile = path.join(repo, "event.json");
      await fs.writeFile(eventFile, JSON.stringify({ ok: true }), "utf8");

      const outPath = path.join(repo, "out.md");
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          repo,
          "--in",
          "event.json",
          "--template",
          `file://${main.replace(/\\/g, "/")}`,
          "--out",
          "out.md"
        ],
        { stdout: () => {}, stderr: () => {} }
      );
      expect(code).toBe(0);

      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("INC=World");
      expect(out).toContain("SUB");
      expect(out).toContain("INC=Earth");
    },
    20000
  );

  it(
    "supports include(uri) helper and escaped glob metacharacters",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-include-helper-");

      await fs.mkdir(path.join(repo, "partials"), { recursive: true });
      await fs.writeFile(path.join(repo, "inc.md"), "INC\n", "utf8");
      await fs.writeFile(path.join(repo, "partials", "x.md"), "X\n", "utf8");

      const main = path.join(repo, "main.md");
      await fs.writeFile(
        main,
        [
          "A:",
          "{{ include(\"./inc.md\") }}",
          "B:",
          // Users often write this in Markdown to avoid italic formatting.
          // The renderer unescapes glob metacharacters so it still works.
          "{{> partials/\\*.md }}",
          ""
        ].join("\n"),
        "utf8"
      );

      const eventFile = path.join(repo, "event.json");
      await fs.writeFile(eventFile, JSON.stringify({ ok: true }), "utf8");

      const outPath = path.join(repo, "out.md");
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          repo,
          "--in",
          "event.json",
          "--template",
          `file://${main.replace(/\\/g, "/")}`,
          "--out",
          "out.md"
        ],
        { stdout: () => {}, stderr: () => {} }
      );
      expect(code).toBe(0);

      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("INC");
      expect(out).toContain("X");
    },
    20000
  );

  it(
    "supports git:// templates with protocol-relative includes and globs",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-git-uri-");

      await fs.mkdir(path.join(repo, "partials"), { recursive: true });
      await fs.writeFile(path.join(repo, "partials", "a.md"), "A\n", "utf8");
      await fs.writeFile(path.join(repo, "partials", "b.md"), "B\n", "utf8");
      await fs.writeFile(
        path.join(repo, "main.md"),
        [
          "From git:// root:",
          // `//` inherits scheme from the git:// base.
          "{{> //partials/*.md }}",
          ""
        ].join("\n"),
        "utf8"
      );
      await run("git", ["add", "-A"], repo);
      await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add templates"], repo);

      await fs.writeFile(path.join(repo, "event.json"), JSON.stringify({ ok: true }), "utf8");

      const outPath = path.join(repo, "out.md");
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          repo,
          "--in",
          "event.json",
          "--template",
          "git://HEAD/main.md",
          "--out",
          "out.md"
        ],
        { stdout: () => {}, stderr: () => {} }
      );
      expect(code).toBe(0);

      const out = await fs.readFile(outPath, "utf8");
      expect(out).toContain("From git:// root:");
      expect(out).toContain("A");
      expect(out).toContain("B");
    },
    20000
  );

  it(
    "treats missing includes as empty content",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-gctx-missing-inc-");

      const main = path.join(repo, "main.md");
      await fs.writeFile(
        main,
        [
          "A{{> ./nope.md }}B",
          "C{{#include ./nope2.md }}D",
          ""
        ].join("\n"),
        "utf8"
      );
      await fs.writeFile(path.join(repo, "event.json"), JSON.stringify({ ok: true }), "utf8");

      let stdout = "";
      const code = await runCli(
        [
          "agent",
          "generate-context",
          "--repo",
          repo,
          "--in",
          "event.json",
          "--template",
          `file://${main.replace(/\\/g, "/")}`
        ],
        { stdout: (s) => (stdout += s), stderr: () => {} }
      );
      expect(code).toBe(0);
      expect(stdout.replace(/\r/g, "")).toContain("AB");
      expect(stdout.replace(/\r/g, "")).toContain("CD");
    },
    20000
  );
});
