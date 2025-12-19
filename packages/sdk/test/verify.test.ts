import { describe, expect, it } from "vitest";
import { verify } from "../src/verify/verify.js";

describe("verify (stub)", () => {
  it("returns unverified status for all events", () => {
    const snap: any = {
      collabEvents: [
        { path: "a", kind: "x", event: { id: "1" } },
        { path: "b", kind: "y", event: { id: "2" } }
      ]
    };
    const r = verify(snap);
    expect(r).toEqual([
      { path: "a", kind: "x", id: "1", status: "unverified" },
      { path: "b", kind: "y", id: "2", status: "unverified" }
    ]);
  });
});


