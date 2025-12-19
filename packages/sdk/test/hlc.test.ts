import { describe, expect, it } from "vitest";
import { HlcClock } from "../src/write/hlc.js";

describe("HlcClock", () => {
  it("increments counter within same ms", () => {
    const c = new HlcClock({ wallMs: 1000, counter: 0 });
    const a = c.tick(1000);
    const b = c.tick(1000);
    expect(b.state.counter).toBe(a.state.counter + 1);
    expect(b.token > a.token).toBe(true);
  });

  it("resets counter when wall time increases", () => {
    const c = new HlcClock({ wallMs: 1000, counter: 5 });
    const t = c.tick(1001);
    expect(t.state.wallMs).toBe(1001);
    expect(t.state.counter).toBe(0);
  });

  it("stays monotonic when wall time goes backwards", () => {
    const c = new HlcClock({ wallMs: 1000, counter: 5 });
    const t = c.tick(999);
    expect(t.state.wallMs).toBe(1000);
    expect(t.state.counter).toBe(6);
  });
});


