import { describe, expect, it } from "vitest";
import { UlidGenerator } from "../src/write/ulid.js";

describe("UlidGenerator", () => {
  it("generates 26-char Crockford base32 ULIDs", () => {
    const g = new UlidGenerator({
      nowMs: () => 1734628200000,
      randomBytes: () => new Uint8Array(10).fill(0)
    });
    const id = g.generate();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is monotonic within the same ms", () => {
    const g = new UlidGenerator({
      nowMs: () => 1,
      randomBytes: () => new Uint8Array(10).fill(0)
    });
    const a = g.generate();
    const b = g.generate();
    expect(b > a).toBe(true);
  });
});


