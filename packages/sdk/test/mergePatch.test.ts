import { describe, expect, it } from "vitest";
import { applyJsonMergePatch } from "../src/orchestration/mergePatch.js";

describe("mergePatch", () => {
  it("replaces non-object targets", () => {
    expect(applyJsonMergePatch(1, 2)).toBe(2);
    expect(applyJsonMergePatch({ a: 1 } as any, 2)).toBe(2);
  });

  it("merges objects recursively", () => {
    const base = { a: 1, nested: { x: 1, y: 2 } };
    const patch = { nested: { y: 3, z: 4 } };
    expect(applyJsonMergePatch(base, patch)).toEqual({ a: 1, nested: { x: 1, y: 3, z: 4 } });
  });

  it("deletes keys when patch value is null", () => {
    const base = { a: 1, b: 2 };
    const patch = { b: null };
    expect(applyJsonMergePatch(base, patch)).toEqual({ a: 1 });
  });

  it("replaces arrays wholesale", () => {
    const base = { items: [1, 2, 3] };
    const patch = { items: [9] };
    expect(applyJsonMergePatch(base, patch)).toEqual({ items: [9] });
  });
});

