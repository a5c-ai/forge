import type { CommandArgs } from "./types.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

const DEFAULT_REGISTRY = "https://github.com/a5c-ai/forge";

function usage(args: CommandArgs): void {
  const out = args.io.out;
  const { writeLine } = args.io;
  writeLine(out, "Usage:");
  writeLine(out, "  git a5c o init [--registry <path|url>]");
  writeLine(out, '  git a5c o "your request here"');
  writeLine(out, "  git a5c o help");
}

function isFlag(s: string | undefined): boolean {
  return typeof s === "string" && s.startsWith("-");
}

function isLikelyUrl(s: string): boolean {
  if (!s) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) return true;
  if (s.startsWith("git@")) return true;
  return false;
}

async function copyDirRecursive(srcDir: string, dstDir: string): Promise<void> {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) await copyDirRecursive(srcPath, dstPath);
    else if (entry.isFile()) await fs.copyFile(srcPath, dstPath);
  }
}

async function copyManagedFromRegistry(registryRoot: string, repoRoot: string): Promise<void> {
  const srcFunctions = path.join(registryRoot, ".a5c", "functions");
  const srcProcesses = path.join(registryRoot, ".a5c", "processes");
  const srcTemplate = path.join(registryRoot, ".a5c", "o.md");

  try {
    const st = await fs.stat(srcFunctions);
    if (!st.isDirectory()) throw new Error("not a directory");
  } catch {
    const e: any = new Error(`registry missing .a5c/functions: ${srcFunctions}`);
    e.exitCode = 2;
    throw e;
  }

  try {
    const st = await fs.stat(srcProcesses);
    if (!st.isDirectory()) throw new Error("not a directory");
  } catch {
    const e: any = new Error(`registry missing .a5c/processes: ${srcProcesses}`);
    e.exitCode = 2;
    throw e;
  }

  const dstFunctions = path.join(repoRoot, ".a5c", "functions");
  const dstProcesses = path.join(repoRoot, ".a5c", "processes");
  await fs.mkdir(dstFunctions, { recursive: true });
  await fs.mkdir(dstProcesses, { recursive: true });

  await copyDirRecursive(srcFunctions, dstFunctions);
  await copyDirRecursive(srcProcesses, dstProcesses);

  try {
    const st = await fs.stat(srcTemplate);
    if (st.isFile()) {
      const dstTemplate = path.join(repoRoot, ".a5c", "o.md");
      await fs.mkdir(path.dirname(dstTemplate), { recursive: true });
      await fs.copyFile(srcTemplate, dstTemplate);
    }
  } catch {
    // optional
  }
}

async function runGitClone(registryUrl: string, destDir: string): Promise<void> {
  await runGitCloneWithArgs(registryUrl, destDir, ["clone", "--depth", "1", registryUrl, destDir]);
}

async function runGitCloneWithArgs(registryUrl: string, destDir: string, gitArgs: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", gitArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const details = Buffer.concat(err).toString("utf8").trim() || Buffer.concat(out).toString("utf8").trim();
      reject(new Error(details || `git exited ${code ?? 1}`));
    });
  });
}

async function handleInit(args: CommandArgs, argv: string[]): Promise<number> {
  let registry = DEFAULT_REGISTRY;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--registry") {
      const v = argv[i + 1];
      if (!v || isFlag(v)) {
        args.io.writeLine(args.io.err, "o init: --registry requires a value");
        return 2;
      }
      registry = v;
      i++;
      continue;
    }
    if (a === "-h" || a === "--help") {
      usage(args);
      return 0;
    }
    args.io.writeLine(args.io.err, `o init: unknown arg '${a}'`);
    return 2;
  }

  const resolvedPath = path.isAbsolute(registry) ? registry : path.resolve(args.repoRoot, registry);
  try {
    const st = await fs.stat(resolvedPath);
    if (st.isDirectory()) {
      await copyManagedFromRegistry(resolvedPath, args.repoRoot);
      return 0;
    }
  } catch {
    // ignore
  }

  if (!isLikelyUrl(registry)) {
    args.io.writeLine(args.io.err, `o init: registry not found: ${registry}`);
    return 2;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "a5c-o-registry-"));
  try {
    // Prefer main branch (requested), but fall back to default branch.
    try {
      await runGitCloneWithArgs(registry, tmpDir, ["clone", "--depth", "1", "--branch", "main", "--single-branch", registry, tmpDir]);
    } catch (eMain: any) {
      try {
        await runGitClone(registry, tmpDir);
      } catch (e: any) {
        const msg = String(e?.message ?? eMain?.message ?? eMain ?? e);
        args.io.writeLine(args.io.err, `o init: failed to clone registry: ${msg}`);
        return 2;
      }
    }

    await copyManagedFromRegistry(tmpDir, args.repoRoot);
    return 0;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function runCommand(args: CommandArgs, command: string, stdinText: string): Promise<number> {
  return await new Promise((resolve) => {
    let resolved = false;
    const done = (code: number) => {
      if (resolved) return;
      resolved = true;
      resolve(code);
    };

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const child = spawn(command, {
      cwd: args.repoRoot,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: process.env
    });

    child.stdout.on("data", (d) => {
      const s = stdoutDecoder.write(d);
      if (s) args.io.out(s);
    });
    child.stderr.on("data", (d) => {
      const s = stderrDecoder.write(d);
      if (s) args.io.err(s);
    });
    child.on("error", (e: any) => {
      const sOut = stdoutDecoder.end();
      if (sOut) args.io.out(sOut);
      const sErr = stderrDecoder.end();
      if (sErr) args.io.err(sErr);
      args.io.writeLine(args.io.err, `o: failed to run A5C_CLI_COMMAND: ${String(e?.message ?? e)}`);
      done(1);
    });
    child.on("close", (code) => {
      const sOut = stdoutDecoder.end();
      if (sOut) args.io.out(sOut);
      const sErr = stderrDecoder.end();
      if (sErr) args.io.err(sErr);
      done(code == null ? 1 : code);
    });

    child.stdin.end(stdinText, "utf8");
  });
}

async function handleRequest(args: CommandArgs, argv: string[]): Promise<number> {
  const request = argv.join(" ").trim();
  if (!request) {
    usage(args);
    return 2;
  }

  const cliCommand = process.env.A5C_CLI_COMMAND;
  if (!cliCommand) {
    args.io.writeLine(args.io.err, 'o: A5C_CLI_COMMAND is not set (example: A5C_CLI_COMMAND="codex exec ...")');
    return 2;
  }

  const templatePath = path.join(args.repoRoot, ".a5c", "o.md");
  let template: string;
  try {
    template = await fs.readFile(templatePath, "utf8");
  } catch {
    args.io.writeLine(args.io.err, `o: missing template: ${templatePath} (run: git a5c o init ...)`);
    return 2;
  }

  const rendered = template.split("{{request}}").join(request);
  return await runCommand(args, cliCommand, rendered);
}

export async function handleO(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "o") return;
  const argv = args.positionals.slice(1);
  const sub = argv[0];

  try {
    if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
      usage(args);
      return sub ? 0 : 2;
    }

    if (sub === "init") {
      return await handleInit(args, argv.slice(1));
    }

    return await handleRequest(args, argv);
  } catch (e: any) {
    const exitCode = typeof e?.exitCode === "number" ? e.exitCode : 1;
    args.io.writeLine(args.io.err, `o: ${String(e?.message ?? e)}`);
    return exitCode === 2 ? 2 : 1;
  }
}
