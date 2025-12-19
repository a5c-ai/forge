import { describe, expect, it } from "vitest";
import { agentsEventDir, eventFilename, issueEventDir, opsEventDir, prEventDir } from "../src/write/paths.js";

describe("paths", () => {
  it("builds event directories", () => {
    expect(issueEventDir("issue-1", "2025-12-19T00:00:00Z")).toBe(".collab/issues/issue-1/events/2025/12");
    expect(prEventDir("pr-1", "2025-12-19T00:00:00Z")).toBe(".collab/prs/pr-1/events/2025/12");
    expect(agentsEventDir("2025-12-19T00:00:00Z")).toBe(".collab/agents/events/2025/12");
    expect(opsEventDir("2025-12-19T00:00:00Z")).toBe(".collab/ops/events/2025/12");
  });

  it("builds event filenames matching Phase-1 grammar", () => {
    const f = eventFilename({
      tsMs: 1734628200000,
      actor: "alice",
      nonce4: "0001",
      kind: "comment.created",
      ext: "json"
    });
    expect(f).toBe("1734628200000_alice_0001.comment.created.json");
  });
});


