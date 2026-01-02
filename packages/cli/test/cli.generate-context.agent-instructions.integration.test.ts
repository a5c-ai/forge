import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture, run } from "./_util.js";

describe("agent generate-context (agent instruction modules)", () => {
  it(
    "includes shared contract and profile-specific module",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // Write a minimal prompt template into the fixture repo.
      await fs.mkdir(path.join(repo, ".a5c", "prompt", "profiles"), { recursive: true });
      await fs.writeFile(path.join(repo, ".a5c", "prompt", "shared.md"), "SHARED_CONTRACT\n", "utf8");
      await fs.writeFile(path.join(repo, ".a5c", "prompt", "profiles", "alt.md"), "PROFILE_ALT\n", "utf8");
      await fs.writeFile(
        path.join(repo, ".a5c", "main.md"),
        [
          "{{#include \"git://HEAD/.a5c/prompt/shared.md\" }}",
          "{{#include \"git://HEAD/.a5c/prompt/profiles/{{vars.profile}}.md\" }}",
          "",
          "{{event.instructions}}",
          ""
        ].join("\n"),
        "utf8"
      );

      // `git://` templates read from the git tree, so commit the new files.
      await run("git", ["add", "-A"], repo);
      await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add prompt modules"], repo);

      const event = {
        run_id: "run_x",
        step_id: 1,
        attempt: 1,
        instructions: "TASK"
      };
      const eventPath = path.join(repo, "event.json");
      await fs.writeFile(eventPath, JSON.stringify(event, null, 2), "utf8");

      let out = "";
      expect(
        await runCli(["agent", "generate-context", "--repo", repo, "--in", "event.json", "--template", ".a5c/main.md", "--var", "profile=alt"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);

      expect(out).toContain("SHARED_CONTRACT");
      expect(out).toContain("PROFILE_ALT");
      expect(out).toContain("TASK");
    },
    30000
  );
});
