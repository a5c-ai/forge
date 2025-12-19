import { describe, expect, it } from "vitest";
import { compareEventFilesByPath, parseEventKeyFromFilename } from "../src/collab/eventKey.js";

describe("eventKey", () => {
  it("parses filename grammar into sortable parts", () => {
    const p = parseEventKeyFromFilename("1734628200000_alice_0001.issue.event.created.json");
    expect(p.tsMs).toBe(1734628200000);
    expect(p.actor).toBe("alice");
    expect(p.nonce).toBe("0001");
    expect(p.kind).toBe("issue.event.created");
  });

  it("sorts deterministically by (tsMs, actor, nonce, kind, path)", () => {
    const a = ".collab/x/2025/12/1734628200000_alice_0002.comment.created.json";
    const b = ".collab/x/2025/12/1734628200000_alice_0001.comment.created.json";
    expect(compareEventFilesByPath(a, b)).toBeGreaterThan(0);
  });
});


