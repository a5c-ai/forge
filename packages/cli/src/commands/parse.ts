import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import type { CommandArgs } from "./types.js";

export type CodexEvent = {
  type:
    | "user_instructions_event"
    | "tokens_used"
    | "thinking"
    | "turn_diff"
    | "codex"
    | "exec"
    | "exec_result"
    | "banner";
  timestamp: string;
  raw: string;
  fields?: Record<string, unknown>;
};

// Streaming, line-by-line parser for Codex stdout format.
export class CodexStdoutParser {
  private currentTimestamp: string | null = null;
  private currentType:
    | "user_instructions_event"
    | "thinking"
    | "turn_diff"
    | "codex"
    | "exec"
    | "exec_result"
    | "banner"
    | null = null;
  private bufferLines: string[] = [];
  private currentExecMeta: {
    command?: string;
    cwd?: string;
    status?: string;
    durationMs?: number;
    exitCode?: number;
  } | null = null;

  private readonly tsRe = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]/;
  private readonly headerUserInstructions = /^User instructions:\s*$/;
  private readonly headerThinking = /^thinking\s*$/;
  private readonly headerTurnDiff = /^turn diff:\s*$/i;
  private readonly headerCodex = /^codex\s*$/;
  private readonly headerExec = /^exec\s+(.+?)\s+in\s+(.+)\s*$/;
  private readonly headerTokensUsed = /^tokens used:\s*(\d+)\s*$/i;
  private readonly bannerFirst = /^OpenAI Codex\s+(v?.+)$/;
  private readonly bannerRule = /^-+$/;
  private readonly kvLine = /^([^:]+):\s*(.*)$/;
  private readonly successLine = /^(.+?)\s+succeeded\s+in\s+(\d+)ms:$/;
  private readonly exitLine = /^(.+?)\s+exited\s+(\d+)\s+in\s+([0-9.]+)s:$/;

  parseLine(line: string): CodexEvent[] {
    const events: CodexEvent[] = [];

    let currentLine = line;
    const tsMatch = this.tsRe.exec(line);
    if (tsMatch) {
      const rest = line.slice(tsMatch[0].length).trimStart();
      if (this.currentType === "exec") {
        this.currentTimestamp = tsMatch[1];
        if (rest.length === 0) return events;
        currentLine = rest;
      } else {
        this.flushIfAny(events);
        this.currentTimestamp = tsMatch[1];
        this.currentType = null;
        this.bufferLines = [];
        if (rest.length === 0) return events;
        currentLine = rest;
      }
    }

    if (!this.currentTimestamp) return events;
    this.processWithinTimestamp(currentLine, events);
    return events;
  }

  private processWithinTimestamp(currentLine: string, events: CodexEvent[]): void {
    if (!this.currentType) {
      const succ = this.successLine.exec(currentLine);
      if (succ) {
        this.currentType = "exec_result";
        this.bufferLines = [currentLine];
        this.currentExecMeta = {
          ...(this.currentExecMeta || {}),
          command: succ[1],
          status: "succeeded",
          durationMs: Number(succ[2])
        };
        return;
      }
      const ex = this.exitLine.exec(currentLine);
      if (ex) {
        this.currentType = "exec_result";
        this.bufferLines = [currentLine];
        const seconds = Number(ex[3]);
        const durationMs = Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
        this.currentExecMeta = {
          ...(this.currentExecMeta || {}),
          command: ex[1],
          status: "exited",
          exitCode: Number(ex[2]),
          durationMs
        };
        return;
      }

      const tokenM = this.headerTokensUsed.exec(currentLine);
      if (tokenM) {
        events.push({
          type: "tokens_used",
          timestamp: this.currentTimestamp || "",
          raw: currentLine,
          fields: { tokens: Number(tokenM[1]) }
        });
        return;
      }

      if (this.headerUserInstructions.test(currentLine)) {
        this.currentType = "user_instructions_event";
        this.bufferLines = [currentLine];
        return;
      }
      if (this.headerThinking.test(currentLine)) {
        this.currentType = "thinking";
        this.bufferLines = [currentLine];
        return;
      }
      if (this.headerTurnDiff.test(currentLine)) {
        this.currentType = "turn_diff";
        this.bufferLines = [currentLine];
        return;
      }
      if (this.headerCodex.test(currentLine)) {
        this.currentType = "codex";
        this.bufferLines = [currentLine];
        return;
      }

      const execM = this.headerExec.exec(currentLine);
      if (execM) {
        this.currentType = "exec";
        this.bufferLines = [currentLine];
        this.currentExecMeta = { command: execM[1], cwd: execM[2] };
        events.push({
          type: "exec",
          timestamp: this.currentTimestamp || "",
          raw: currentLine,
          fields: { command: execM[1], cwd: execM[2] }
        });
        return;
      }

      const bannerM = this.bannerFirst.exec(currentLine);
      if (bannerM) {
        this.currentType = "banner";
        this.bufferLines = [currentLine];
        return;
      }

      return;
    }

    this.bufferLines.push(currentLine);

    if (this.currentType === "exec_result") return;

    if (this.currentType === "exec") {
      const m = this.successLine.exec(currentLine);
      if (m) {
        this.currentType = "exec_result";
        this.bufferLines = [currentLine];
        this.currentExecMeta = {
          ...(this.currentExecMeta || {}),
          command: this.currentExecMeta?.command || m[1],
          status: "succeeded",
          durationMs: Number(m[2])
        };
        return;
      }
      const e = this.exitLine.exec(currentLine);
      if (e) {
        this.currentType = "exec_result";
        this.bufferLines = [currentLine];
        const seconds = Number(e[3]);
        const durationMs = Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
        this.currentExecMeta = {
          ...(this.currentExecMeta || {}),
          command: this.currentExecMeta?.command || e[1],
          status: "exited",
          exitCode: Number(e[2]),
          durationMs
        };
        return;
      }
      return;
    }

    if (this.currentType === "banner") {
      if (this.bannerRule.test(currentLine)) {
        const dashedIdxs = this.bufferLines
          .map((l, i) => (this.bannerRule.test(l) ? i : -1))
          .filter((i) => i >= 0);
        if (dashedIdxs.length >= 2) {
          const fields: Record<string, unknown> = {};
          const start = dashedIdxs[0] + 1;
          const end = dashedIdxs[1];
          for (let i = start; i < end; i++) {
            const kv = this.kvLine.exec(this.bufferLines[i]!);
            if (kv) fields[kv[1]!.trim()] = kv[2]!.trim();
          }
          const versionMatch = this.bannerFirst.exec(this.bufferLines[0]!);
          if (versionMatch) {
            fields.version = this.bufferLines[0]!.replace(/^OpenAI Codex\s+/, "").trim();
          }
          const raw = this.bufferLines.join("\n");
          events.push({
            type: "banner",
            timestamp: this.currentTimestamp || "",
            raw,
            fields
          });
          this.currentType = null;
          this.bufferLines = [];
        }
      }
      return;
    }
  }

  flushIfAny(out: CodexEvent[]): void {
    if (!this.currentTimestamp || !this.currentType) {
      this.currentTimestamp = null;
      this.currentType = null;
      this.bufferLines = [];
      this.currentExecMeta = null;
      return;
    }
    if (this.currentType !== "exec") {
      const raw = this.bufferLines.join("\n");
      let fields: Record<string, unknown> | undefined = undefined;
      if (this.currentType === "exec_result") {
        const lines = raw.split(/\r?\n/);
        const result = lines.length > 1 ? lines.slice(1).join("\n") : "";
        fields = { ...(this.currentExecMeta || {}), result };
      } else if (this.currentType === "thinking") {
        const thought = this.stripHeaderAndTrim(raw, "thinking");
        fields = { thought };
      } else if (this.currentType === "turn_diff") {
        const diff = this.stripHeaderAndTrim(raw, "turn diff:");
        fields = { diff };
      } else if (this.currentType === "codex") {
        const explanation = this.stripHeaderAndTrim(raw, "codex");
        fields = { explanation };
      }
      out.push({ type: this.currentType, timestamp: this.currentTimestamp, raw, fields });
    }
    this.currentTimestamp = null;
    this.currentType = null;
    this.bufferLines = [];
    this.currentExecMeta = null;
  }

  private stripHeaderAndTrim(raw: string, header: string): string {
    const lines = raw.split(/\r?\n/);
    if (lines.length === 0) return "";
    const first = lines[0]!;
    const headerRe = new RegExp(`^${header.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "i");
    const rest = headerRe.test(first) ? lines.slice(1) : lines;
    return rest.join("\n").trim();
  }
}

export async function handleParse(args: CommandArgs): Promise<number | undefined> {
  const cmd = args.positionals[0];
  if (cmd !== "parse") return;

  if ((args.flags.type || "").toLowerCase() !== "codex") {
    args.io.writeLine(args.io.err, "parse: unsupported --type (expected 'codex')");
    return 2;
  }

  const parser = new CodexStdoutParser();
  let fileStream: fs.WriteStream | null = null;
  if (args.flags.out) {
    const outPath = path.isAbsolute(args.flags.out) ? args.flags.out : path.resolve(args.repoRoot, args.flags.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fileStream = fs.createWriteStream(outPath, { flags: "w", encoding: "utf8" });
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const events = parser.parseLine(line);
    for (const evt of events) {
      const rawLine = JSON.stringify(evt);
      if (fileStream) fileStream.write(rawLine + "\n");
      if (args.flags.pretty) args.io.writeLine(args.io.out, JSON.stringify(evt, null, 2));
      else args.io.writeLine(args.io.out, rawLine);
    }
  });

  return await new Promise((resolve) => {
    rl.on("close", () => {
      const tail: CodexEvent[] = [];
      parser.flushIfAny(tail);
      for (const evt of tail) {
        const rawLine = JSON.stringify(evt);
        if (fileStream) fileStream.write(rawLine + "\n");
        if (args.flags.pretty) args.io.writeLine(args.io.out, JSON.stringify(evt, null, 2));
        else args.io.writeLine(args.io.out, rawLine);
      }
      if (fileStream) fileStream.end();
      resolve(0);
    });
  });
}

