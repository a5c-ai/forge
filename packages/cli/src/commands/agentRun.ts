import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import yaml from "js-yaml";
import type { CommandArgs } from "./types.js";
import { readTextFromUri } from "../util/uri.js";

type PredefinedSpec = {
  cli: Record<
    string,
    {
      cli_command?: string;
      description?: string;
      install?: string;
      stdin_enabled?: boolean;
      envs?: Record<string, string>;
    }
  >;
  profiles: Record<
    string,
    {
      default?: boolean;
      cli: string;
      model?: string;
      description?: string;
      cli_params?: string;
    }
  >;
};

export async function handleAgentRun(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "agent") return;
  if (args.positionals[1] !== "run") return;

  try {
    const predefined = await loadPredefined(args);
    const profileName = args.flags.profile || findDefaultProfileName(predefined) || Object.keys(predefined.profiles ?? {})[0];
    if (!profileName || !predefined.profiles?.[profileName]) {
      args.io.writeLine(args.io.err, `agent run: unknown profile '${args.flags.profile ?? profileName ?? ""}'`);
      return 2;
    }
    const profile = predefined.profiles[profileName]!;
    const cliProvider = predefined.cli?.[profile.cli];
    if (!cliProvider) {
      args.io.writeLine(args.io.err, `agent run: unknown cli provider '${profile.cli}'`);
      return 2;
    }

    const promptContent = await readInputPrompt(args);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a5c-agent-run-"));
    const promptPath = path.join(tmpDir, "prompt.md");
    fs.writeFileSync(promptPath, promptContent, "utf8");

    const outputLastMsgPath = path.join(tmpDir, "agent-output.md");
    const outPath = normalizePath(args, args.flags.out);
    const stdoutPath = normalizePath(args, args.flags.stdout);
    const stderrPath = normalizePath(args, args.flags.stderr);

    const mcpsPath = args.flags.mcps ?? ".a5c/mcps.json";

    const templateCtx = {
      prompt_path: promptPath,
      model: args.flags.model || profile.model || "",
      output_last_message_path: outputLastMsgPath,
      mcp_config: normalizePath(args, mcpsPath),
      envs: process.env as Record<string, string>
    };

    const extraEnv = renderEnvVars(cliProvider.envs || {}, templateCtx);
    const childEnv = { ...process.env, ...extraEnv };

    if (cliProvider.install && cliProvider.install.trim().length > 0) {
      const installCmd = renderString(cliProvider.install, templateCtx);
      const instCode = await runShell(installCmd, { env: childEnv, cwd: args.repoRoot });
      if (instCode !== 0) {
        args.io.writeLine(args.io.err, `agent run: install failed: ${installCmd}`);
        return instCode;
      }
    }

    const baseCmd = renderString(cliProvider.cli_command || "", templateCtx);
    if (!baseCmd) {
      args.io.writeLine(args.io.err, "agent run: cli_command is empty");
      return 2;
    }
    const params = renderString(profile.cli_params || "", templateCtx).trim();
    const fullCmd = params ? `${baseCmd} ${params}` : baseCmd;

    const code = await runShell(fullCmd, { env: childEnv, cwd: args.repoRoot, stdoutPath, stderrPath });

    if (args.flags.out && fs.existsSync(outputLastMsgPath)) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(outputLastMsgPath, outPath);
    }

    return code;
  } catch (e: any) {
    args.io.writeLine(args.io.err, String(e?.message ?? e));
    return 1;
  }
}

function normalizePath(args: CommandArgs, p?: string): string {
  const v = p ?? "";
  if (!v) return "";
  return path.isAbsolute(v) ? v : path.resolve(args.repoRoot, v);
}

async function readInputPrompt(args: CommandArgs): Promise<string> {
  const input = args.flags.in;
  if (!input || input === "-") {
    // Default stdin.
    if (process.stdin.isTTY) return "";
    const chunks: Buffer[] = [];
    for await (const ch of process.stdin) chunks.push(Buffer.from(ch));
    return Buffer.concat(chunks).toString("utf8");
  }
  return await readTextFromUri({
    repoRoot: args.repoRoot,
    uriOrPath: input,
    token: process.env.A5C_AGENT_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  });
}

function resolveUri(raw: string): { scheme: string; path: string } {
  const m = /^(\w+):\/\/(.+)$/.exec(raw);
  if (m) return { scheme: m[1]!, path: m[2]! };
  return { scheme: "file", path: raw };
}

async function loadPredefined(args: CommandArgs): Promise<PredefinedSpec> {
  const base = readBundledPredefined(args);
  if (!args.flags.config) return base;
  const cfgText = await readTextFromUri({
    repoRoot: args.repoRoot,
    uriOrPath: args.flags.config,
    token: process.env.A5C_AGENT_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  });
  const cfg = (yaml.load(cfgText) as any) || {};
  return deepMerge(base, cfg);
}

function readBundledPredefined(args: CommandArgs): PredefinedSpec {
  const candidates = [path.resolve(args.repoRoot, ".a5c", "predefined.yaml"), path.resolve(args.repoRoot, "predefined.yaml")];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const parsed = yaml.load(fs.readFileSync(p, "utf8")) as PredefinedSpec;
      if (parsed && parsed.cli && parsed.profiles) return parsed;
    }
  }
  throw new Error("agent run: predefined.yaml not found (expected .a5c/predefined.yaml or predefined.yaml)");
}

function findDefaultProfileName(spec: PredefinedSpec): string | undefined {
  for (const [name, prof] of Object.entries(spec.profiles || {})) {
    if (prof && (prof as any).default) return name;
  }
  return undefined;
}

function renderEnvVars(envs: Record<string, string>, ctx: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(envs)) out[k] = renderString(String(v ?? ""), ctx);
  return out;
}

function renderString(tpl: string, ctx: Record<string, any>): string {
  return String(tpl).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, expr) => {
    const val = lookupPath(ctx, String(expr));
    return val == null ? "" : String(val);
  });
}

function lookupPath(obj: any, dotted: string): any {
  const parts = dotted
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function deepMerge<T extends Record<string, any>>(a: T, b: Partial<T>): T {
  const out: any = Array.isArray(a) ? [...(a as any)] : { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && a && typeof (a as any)[k] === "object" && !Array.isArray((a as any)[k])) {
      out[k] = deepMerge((a as any)[k], v as any);
    } else {
      out[k] = v as any;
    }
  }
  return out as T;
}

async function runShell(command: string, options?: { env?: NodeJS.ProcessEnv; cwd?: string; stdoutPath?: string; stderrPath?: string }): Promise<number> {
  const wantStdout = !!options?.stdoutPath;
  const wantStderr = !!options?.stderrPath;
  const wantCapture = wantStdout || wantStderr;

  return await new Promise<number>((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: wantCapture ? ["inherit", "pipe", "pipe"] : "inherit",
      env: options?.env,
      cwd: options?.cwd
    });

    let outStream: fs.WriteStream | undefined;
    let errStream: fs.WriteStream | undefined;

    if (wantStdout && options?.stdoutPath) {
      fs.mkdirSync(path.dirname(options.stdoutPath), { recursive: true });
      outStream = fs.createWriteStream(options.stdoutPath, { flags: "w" });
      child.stdout?.on("data", (d) => {
        process.stdout.write(d);
        outStream!.write(d);
      });
    } else if (wantCapture) {
      child.stdout?.on("data", (d) => process.stdout.write(d));
    }

    if (wantStderr && options?.stderrPath) {
      fs.mkdirSync(path.dirname(options.stderrPath), { recursive: true });
      errStream = fs.createWriteStream(options.stderrPath, { flags: "w" });
      child.stderr?.on("data", (d) => {
        process.stderr.write(d);
        errStream!.write(d);
      });
    } else if (wantCapture) {
      child.stderr?.on("data", (d) => process.stderr.write(d));
    }

    const finish = (code: number) => {
      outStream?.end();
      errStream?.end();
      resolve(code);
    };

    child.on("close", (code) => finish(code ?? 0));
    child.on("error", () => finish(1));
  });
}
