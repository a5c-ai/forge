import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { CodexStdoutParser, type CodexEvent } from "../src/commands/parse.js";

function parseAllLines(text: string): CodexEvent[] {
  const parser = new CodexStdoutParser();
  const events: CodexEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    events.push(...parser.parseLine(line));
  }
  const tail: CodexEvent[] = [];
  parser.flushIfAny(tail);
  events.push(...tail);
  return events;
}

describe("CodexStdoutParser (unit)", () => {
  it("parses banner and tokens used events", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample-large.txt"), "utf8");
    const events = parseAllLines(sample);
    expect(events.some((e) => e.type === "banner")).toBe(true);
    const tokens = events.filter((e) => e.type === "tokens_used");
    const counts = tokens.map((t) => Number((t.fields as any)?.tokens || 0));
    expect(counts).toContain(6037);
    expect(counts).toContain(7442);
    expect(counts).toContain(9301);
    expect(counts).toContain(9836);
  });

  it("parses exec + exec_result with success and body", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample-large.txt"), "utf8");
    const events = parseAllLines(sample);
    const execResult = events.find((e) => e.type === "exec_result" && /bash -lc 'ls -la'/.test(String((e.fields as any)?.command || "")));
    expect(execResult).toBeTruthy();
    expect((execResult!.fields as any)?.status).toBe("succeeded");
    expect(String(execResult!.raw)).toContain("total 6156");
    expect(String((execResult!.fields as any)?.result || "")).toContain("total 6156");
    expect(typeof (execResult!.fields as any)?.durationMs).toBe("number");
  });

  it("parses exec_result for failure with exit code and stderr text", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample-large.txt"), "utf8");
    const events = parseAllLines(sample);
    const failed = events.find((e) => e.type === "exec_result" && /npm test --silent/.test(String((e.fields as any)?.command || "")));
    expect(failed).toBeTruthy();
    expect((failed!.fields as any)?.status).toBe("exited");
    expect((failed!.fields as any)?.exitCode).toBe(2);
    expect(String(failed!.raw)).toContain("error TS2688");
    expect(String((failed!.fields as any)?.result || "")).toContain("error TS2688");
  });

  it("adds thought/explanation fields for thinking/codex", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample-large.txt"), "utf8");
    const events = parseAllLines(sample);
    const thinking = events.find((e) => e.type === "thinking");
    const codex = events.find((e) => e.type === "codex");
    expect(String((thinking!.fields as any)?.thought || "")).toContain("Exploring user request");
    expect(String((codex!.fields as any)?.explanation || "")).toContain("scan the repo");
  });
});
