import { describe, expect, it } from "vitest";
import { parseEventFileBytes } from "../src/collab/parseEventFile.js";

describe("parseEventFileBytes", () => {
  it("parses JSON event files", () => {
    const ev = parseEventFileBytes(
      ".collab/x.json",
      Buffer.from(
        JSON.stringify({
          schema: "a5cforge/v1",
          kind: "comment.edited",
          id: "1",
          time: "2025-12-19T00:00:00Z",
          actor: "a",
          payload: {}
        }),
        "utf8"
      )
    );
    expect(ev.kind).toBe("comment.edited");
  });

  it("parses Markdown event frontmatter", () => {
    const md = [
      "---",
      "schema: a5cforge/v1",
      "kind: comment.created",
      "id: 1",
      'time: "2025-12-19T00:00:00Z"',
      "actor: a",
      "payload:",
      "  entity:",
      "    type: issue",
      "    id: issue-1",
      "  commentId: c1",
      "---",
      "",
      "hello",
      ""
    ].join("\n");
    const ev = parseEventFileBytes(".collab/x.md", Buffer.from(md, "utf8"));
    expect(ev.kind).toBe("comment.created");
    expect(ev.time).toBe("2025-12-19T00:00:00Z");
    expect((ev as any).payload.body).toContain("hello");
  });
});


