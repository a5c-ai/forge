import { describe, expect, it } from "vitest";
import { jcsStringify } from "../src/crypto/jcs.js";

describe("jcsStringify", () => {
  it("sorts object keys and omits undefined values", () => {
    const s = jcsStringify({ b: 1, a: 2, z: undefined });
    expect(s).toBe('{"a":2,"b":1}');
  });

  it("handles arrays with undefined as null", () => {
    const s = jcsStringify([1, undefined, "x"]);
    expect(s).toBe('[1,null,"x"]');
  });

  it("normalizes number exponent e+ to e", () => {
    const s = jcsStringify({ n: 1e21 });
    expect(s).toMatch(/"n":1e21/);
  });
});


