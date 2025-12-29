import { describe, expect, it } from "vitest";
import { compareEventFilesByPath, parseEventKeyFromFilename, parseRunEventKeyFromFilename } from "../src/collab/eventKey.js";

describe("eventKey", () => {
  it("parses filename grammar into sortable parts", () => {
    const p = parseEventKeyFromFilename("1734628200000_alice_0001.issue.event.created.json");
    expect(p.tsMs).toBe(1734628200000);
    expect(p.actor).toBe("alice");
    expect(p.nonce).toBe("0001");
    expect(p.kind).toBe("issue.event.created");
  });

  it("accepts ndjson extension for bundles", () => {
    const p = parseEventKeyFromFilename("1734628200000_alice_0002.bundle.ndjson");
    expect(p.kind).toBe("bundle");
  });

  it("parses run event filename grammar into sortable parts", () => {
    const p = parseRunEventKeyFromFilename("000001__run.step.started__s3__a1__runner.json");
    expect(p.seq).toBe(1);
    expect(p.type).toBe("run.step.started");
    expect(p.stepId).toBe(3);
    expect(p.attempt).toBe(1);
    expect(p.actor).toBe("runner");
  });

  it("sorts deterministically by (tsMs, actor, nonce, kind, path)", () => {
    const a = ".collab/x/2025/12/1734628200000_alice_0002.comment.created.json";
    const b = ".collab/x/2025/12/1734628200000_alice_0001.comment.created.json";
    expect(compareEventFilesByPath(a, b)).toBeGreaterThan(0);
  });

  it("handles Windows path separators in file paths", () => {
    const a = ".collab\\x\\2025\\12\\1734628200000_alice_0002.comment.created.json";
    const b = ".collab\\x\\2025\\12\\1734628200000_alice_0001.comment.created.json";
    expect(compareEventFilesByPath(a, b)).toBeGreaterThan(0);
  });

  it("sorts run events deterministically by seq then type", () => {
    const a = ".collab/runs/run_001/events/000002__run.step.scheduled__s1__a1__tester.json";
    const b = ".collab/runs/run_001/events/000010__run.step.scheduled__s1__a1__tester.json";
    expect(compareEventFilesByPath(a, b)).toBeLessThan(0);
  });

  it("does not throw on unknown filename grammars", () => {
    const a = ".collab/runs/run_001/events/template.json";
    const b = ".collab/runs/run_001/events/000001__run.step.started__s1__a1__tester.json";
    expect(() => compareEventFilesByPath(a, b)).not.toThrow();
  });
});


