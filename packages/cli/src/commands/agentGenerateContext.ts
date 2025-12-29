import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minimatch } from "minimatch";
import { stringify as yamlStringify } from "yaml";
import { createLogger, parseLogLevel } from "@a5c-ai/sdk";
import { git } from "../git.js";
import { DEFAULT_MASK, redactObject } from "../util/redact.js";
import type { CommandArgs } from "./types.js";
import { fetchGithubFileContents, listGithubFilesRecursive } from "../util/githubContents.js";

export interface GenerateContextOptions {
  in?: string;
  template?: string;
  out?: string;
  vars?: Record<string, string>;
  token?: string;
  repoRoot?: string;
}

export async function handleAgentGenerateContext(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "agent") return;
  if (args.positionals[1] !== "generate-context") return;

  const vars = args.flags.vars || {};
  const res = await handleGenerateContext({
    in: args.flags.in,
    template: args.flags.template,
    out: args.flags.out,
    vars,
    token: args.flags.token,
    repoRoot: args.repoRoot
  });

  if (res.output && args.flags.out) {
    const outPath = path.isAbsolute(args.flags.out) ? args.flags.out : path.resolve(args.repoRoot, args.flags.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, res.output, "utf8");
  }
  if (res.output && !args.flags.out) args.io.writeLine(args.io.out, res.output);
  if (res.errorMessage) args.io.writeLine(args.io.err, res.errorMessage);
  return res.code;
}

export async function handleGenerateContext(
  opts: GenerateContextOptions,
): Promise<{
  code: number;
  output?: string;
  errorMessage?: string;
}> {
  try {
    const repoRoot = opts.repoRoot ?? process.cwd();
    const input = await readInput(opts.in, repoRoot);
    const token =
      opts.token ||
      process.env.A5C_AGENT_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN;
    const rootUri = opts.template || ".a5c/main.md";
    const originalEvent = input.original_event || {};
    const new_input = { ...input, ...originalEvent };
    const eventForTpl = sanitizeEventForTemplate(new_input);
    dbg("generate:begin", {
      in: opts.in || "stdin",
      template: rootUri,
      token_present: !!token,
    });
    const rendered = await renderTemplate(
      expandDollarExpressions(rootUri, {
        event: eventForTpl,
        env: process.env,
        vars: opts.vars || {},
        token,
        repoRoot,
      }),
      {
        event: eventForTpl,
        env: process.env,
        vars: opts.vars || {},
        token,
        repoRoot,
      },
    );
    dbg("generate:done", { bytes: rendered?.length || 0 });
    return { code: 0, output: rendered };
  } catch (e: any) {
    return { code: 1, errorMessage: String(e?.message || e) };
  }
}

async function readInput(inPath: string | undefined, repoRoot: string): Promise<any> {
  if (inPath) {
    const abs = path.isAbsolute(inPath) ? inPath : path.resolve(repoRoot, inPath);
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  }
  const raw = fs.readFileSync(0, "utf8");
  return JSON.parse(raw);
}

type Context = {
  event: any;
  env: NodeJS.ProcessEnv;
  vars: Record<string, any>;
  token?: string;
  repoRoot: string;
};

const logger = createLogger({ base: { component: "cli.generateContext" }, level: parseLogLevel(process.env.A5C_LOG_LEVEL ?? "silent") });
const dbg = (msg: string, ctx?: Record<string, unknown>) => logger.debug(msg, ctx);

async function renderTemplate(
  uri: string,
  ctx: Context,
  base?: string,
): Promise<string> {
  dbg("renderTemplate", { uri, base });
  const content = await fetchResource(uri, ctx, base);
  return await renderString(content, ctx, uri);
}

async function renderString(
  tpl: string,
  ctx: Context,
  currentUri: string,
): Promise<string> {
  // Includes: legacy {{> uri }} or {{> uri key=value }}
  // Support quoted URIs and inline expressions inside the URI (both ${{ }} and {{ }})
  let out = tpl;
  // Expand all ${{ }} first to avoid tokenizer conflicts inside include URIs
  try {
    out = expandDollarExpressions(out, ctx);
  } catch {}
  const includeRe = /\{\{>\s*(?:"([^"]+)"|'([^']+)'|([^}]+?))(\s+[^}]*)?\}\}/g;
  out = await replaceAsync(
    out,
    includeRe,
    async (_m, g1: string, g2: string, g3: string, args: string) => {
      const rawUri = g1 || g2 || g3 || "";
      const argVars = parseArgs(args || "");
      const merged: Context = {
        ...ctx,
        vars: { ...ctx.vars, ...argVars },
      };
      const afterDollar = expandDollarExpressions(rawUri, merged);
      const afterCurly = expandCurlyExpressionsForUri(
        afterDollar,
        merged,
        currentUri,
      );
      const finalUri = unescapeGlobMeta(afterCurly).trim();
      dbg("include:legacy", {
        raw: rawUri,
        afterDollar,
        dynUri: afterCurly,
        finalUri,
        base: currentUri,
      });
      try {
        const included = await renderTemplate(finalUri, merged, currentUri);
        return included;
      } catch {        
        // Graceful on missing file(s)
        return "";
      }
    },
  );

  // Includes: new {{#include uri [key=value] }} with quoted URIs and inline expressions
  const includeHashRe =
    /\{\{#include\s*(?:"([^"]+)"|'([^']+)'|([^}]+?))(\s+[^}]*)?\}\}/g;
  out = await replaceAsync(
    out,
    includeHashRe,
    async (_m, g1: string, g2: string, g3: string, args: string) => {
      const rawUri = g1 || g2 || g3 || "";
      const argVars = parseArgs(args || "");
      const merged: Context = {
        ...ctx,
        vars: { ...ctx.vars, ...argVars },
      };
      const afterDollar = expandDollarExpressions(rawUri, merged);
      const afterCurly = expandCurlyExpressionsForUri(
        afterDollar,
        merged,
        currentUri,
      );
      const finalUri = unescapeGlobMeta(afterCurly).trim();
      dbg("include:hash", {
        raw: rawUri,
        afterDollar,
        dynUri: afterCurly,
        finalUri,
        base: currentUri,
      });
      try {
        const included = await renderTemplate(finalUri, merged, currentUri);
        return included;
      } catch {
        // Graceful on missing file(s)
        return "";
      }
    },
  );

  // Printers: single-tag {{#printYAML expr}} and {{#printJSON expr}}
  const printYamlRe = /\{\{#printYAML\s+([^}]+)\}\}/g;
  out = await replaceAsync(out, printYamlRe, async (_m, expr: string) => {
    try {
      const val = evalExpr(expr, ctx, currentUri);
      const resolved = isThenable(val) ? await val : val;
      return printYAML(resolved);
    } catch {
      return "";
    }
  });
  const printJsonRe = /\{\{#printJSON\s+([^}]+)\}\}/g;
  out = await replaceAsync(out, printJsonRe, async (_m, expr: string) => {
    try {
      const val = evalExpr(expr, ctx, currentUri);
      const resolved = isThenable(val) ? await val : val;
      return printJSON(resolved);
    } catch {
      return "";
    }
  });
  const printXmlRe = /\{\{#printXML\s+([^}]+)\}\}/g;
  out = await replaceAsync(out, printXmlRe, async (_m, expr: string) => {
    try {
      const val = evalExpr(expr, ctx, currentUri);
      const resolved = isThenable(val) ? await val : val;
      return printXML(resolved);
    } catch {
      return "";
    }
  });
  const printRe = /\{\{#print\s+([^}]+)\}\}/g;
  out = await replaceAsync(out, printRe, async (_m, expr: string) => {
    try {
      const val = evalExpr(expr, ctx, currentUri);
      const resolved = isThenable(val) ? await val : val;
      return resolved == null ? "" : String(resolved);
    } catch {
      return "";
    }
  });

  // Sections: {{#if expr}}...{{/if}}
  out = await replaceSections(
    out,
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    async (expr, body) => {
      const ok = !!evalExpr(expr, ctx, currentUri);
      return ok ? await renderString(body, ctx, currentUri) : "";
    },
  );
  // Each: {{#each expr}}...{{/each}}
  out = await replaceSections(
    out,
    /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    async (expr, body) => {
      const arr = toArray(evalExpr(expr, ctx, currentUri));
      const parts: string[] = [];
      for (const item of arr) {
        const child: Context = { ...ctx, vars: { ...ctx.vars, this: item } };
        parts.push(await renderString(body, child, currentUri));
      }
      return parts.join("");
    },
  );

  // Variables: {{ expr }}
  const varRe = /\{\{\s*([^}]+)\s*\}\}/g;
  out = await replaceAsync(out, varRe, async (_m, expr: string) => {
    try {
      const val = evalExpr(expr, ctx, currentUri);
      const resolved = isThenable(val) ? await val : val;
      return resolved == null ? "" : String(resolved);
    } catch {
      return "";
    }
  });
  return out;
}

function toArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function parseArgs(s: string): Record<string, any> {
  const out: Record<string, any> = {};
  const parts = String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k) continue;
    out[k] = v ?? true;
  }
  return out;
}

async function replaceSections(
  s: string,
  re: RegExp,
  fn: (expr: string, body: string) => Promise<string>,
): Promise<string> {
  const chunks: string[] = [];
  let lastIndex = 0;
  for (;;) {
    const m = re.exec(s);
    if (!m) break;
    chunks.push(s.slice(lastIndex, m.index));
    lastIndex = m.index + m[0].length;
    chunks.push(await fn(m[1], m[2]));
  }
  chunks.push(s.slice(lastIndex));
  return chunks.join("");
}

async function replaceAsync(
  s: string,
  re: RegExp,
  fn: (...m: any[]) => Promise<string>,
): Promise<string> {
  const chunks: string[] = [];
  let lastIndex = 0;
  for (;;) {
    const m = re.exec(s);
    if (!m) break;
    chunks.push(s.slice(lastIndex, m.index));
    lastIndex = m.index + m[0].length;
    chunks.push(await fn(...m));
  }
  chunks.push(s.slice(lastIndex));
  return chunks.join("");
}

function resolveUri(
  raw: string,
  base?: string,
): { scheme: string; path: string } {
  // Support protocol-relative: //path -> inherit scheme from base
  if (raw.startsWith("//") && base) {
    const b = new URL(base, "file://");
    return { scheme: b.protocol.replace(":", ""), path: raw.slice(2) };
  }
  const m = /^(\w+):\/\/(.+)$/.exec(raw);
  if (m) return { scheme: m[1], path: m[2] };
  // relative path
  return { scheme: "file", path: raw };
}

async function fetchResource(
  rawUri: string,
  ctx: Context,
  base?: string,
): Promise<string> {
  // Expand ${{ ... }} inside URI before resolution
  const expanded = expandDollarExpressions(rawUri, ctx);
  const { scheme, path: p } = resolveUri(expanded, base);
  dbg("fetchResource", { rawUri, expanded, base, scheme, p });
  // If relative include and base is a GitHub URI, resolve against the GitHub file's directory
  if (scheme === "file" && base && /^github:\/\//i.test(base)) {
    // Try typed base first: github://owner/repo/(branch|ref|version)/<ref-raw>/<path>
      const typedBase =
        /^github:\/\/([^/]+)\/([^/]+)\/(?:branch|ref|version)\/([^/]+)\/(.+)$/i.exec(
          base,
        );
    if (typedBase) {
      const owner = typedBase[1];
      const repo = typedBase[2];
      const ref = decodeURIComponent(typedBase[3]);
      const basePath = decodeURIComponent(typedBase[4]);
      const dir = basePath.endsWith("/")
        ? basePath.replace(/\/+$/, "")
        : path.posix.dirname(basePath);
      // Resolve relative segments against GitHub base directory
      const joined = path.posix.normalize(path.posix.join(dir, p || ""));
      const filePath = joined.startsWith("./") ? joined.slice(2) : joined;
      dbg("github:typed:resolve", { owner, repo, ref, dir, filePath });
      if (hasGlob(filePath)) {
        const files = await listGithubFiles(owner, repo, ref, dir, ctx.token);
        dbg("github:typed:list", {
          owner,
          repo,
          ref,
          dir,
          listed: files.length,
          pattern: filePath,
        });
        const matches = files.filter((f) =>
          matchGithubGlobAbsoluteOrRelative(f, filePath, dir),
        );
        dbg("github:typed:matches", { count: matches.length });
        const parts: string[] = [];
        for (const m of matches) {
          try {
            const fileUri = `github://${owner}/${repo}/branch/${encodeURIComponent(
              ref,
            )}/${m}`;
            dbg("github:typed:renderEach", { fileUri });
            parts.push(await renderTemplate(fileUri, ctx, fileUri));
          } catch (e) {
            const fileUri = `github://${owner}/${repo}/branch/${encodeURIComponent(
              ref,
            )}/${m}`;
            dbg("github:typed:renderEach:error", { fileUri, e });
          }
        }
        return parts.join("");
      }
      dbg("github:typed:fetch", { path: filePath });
      return await fetchGithubFile(owner, repo, ref, filePath, ctx.token);
    }
    // Fallback: generic github://owner/repo/<ref+path>
    const genericBase = /^github:\/\/([^/]+)\/([^/]+)\/(.+)$/i.exec(base);
    if (genericBase) {
      const owner = genericBase[1];
      const repo = genericBase[2];
      const restRaw = genericBase[3];
      const restDecoded = decodeURIComponent(restRaw);
      const baseDirFull = restDecoded.endsWith("/")
        ? restDecoded.replace(/\/+$/, "")
        : path.posix.dirname(restDecoded);
      const joined = path.posix.normalize(path.posix.join(baseDirFull, p || ""));
      const combined = joined.startsWith("./") ? joined.slice(2) : joined;
      dbg("github:generic:resolve", {
        owner,
        repo,
        restDecoded,
        baseDirFull,
        combined,
      });
      if (hasGlob(combined)) {
        // Best-effort: list from baseDirFull and filter
        const firstSeg = restDecoded.split("/")[0] || "";
        const remaining = restDecoded.slice(firstSeg.length + 1);
        const refGuess = firstSeg;
        const listDir = remaining ? path.posix.dirname(remaining) : "";
        const files = await listGithubFiles(owner, repo, refGuess, listDir, ctx.token);
        dbg("github:generic:list", {
          owner,
          repo,
          ref: refGuess,
          dir: listDir,
          listed: files.length,
          pattern: combined,
        });
        const matches = files
          .map((f) => `${refGuess}/${f}`)
          .filter((f) =>
            matchGithubGlobAbsoluteOrRelativeWithRef(
              f,
              combined,
              refGuess,
              listDir,
            ),
          );
        dbg("github:generic:matches", { count: matches.length });
        const parts: string[] = [];
        for (const m of matches) {
          const segs = m.split("/");
          const refCand = segs[0];
          const fileCand = segs.slice(1).join("/");
          try {
            const fileUri = `github://${owner}/${repo}/branch/${encodeURIComponent(
              refCand,
            )}/${fileCand}`;
            dbg("github:generic:renderEach", { fileUri });
            parts.push(await renderTemplate(fileUri, ctx, fileUri));
          } catch {}
        }
        return parts.join("");
      }
      // Longest-first split to determine ref vs file path
      const parts = combined.split("/");
      let lastErr: any = null;
      for (let i = parts.length - 1; i >= 1; i--) {
        const refCandidateRaw = parts.slice(0, i).join("/");
        const filePathCandidate = parts.slice(i).join("/");
        const refCandidate = await resolveGithubRef(
          owner,
          repo,
          refCandidateRaw,
          ctx.token,
        );
        try {
          dbg("github:generic:fetchTry", {
            ref: refCandidate,
            path: filePathCandidate,
          });
          const content = await fetchGithubFile(
            owner,
            repo,
            refCandidate,
            filePathCandidate,
            ctx.token,
          );
          return content;
        } catch (e: any) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("Failed to fetch GitHub file: unknown error");
    }
  }
    if (scheme === "file") {
      // Resolve relative includes against base file (either file:// URI or local path)
      let resolved: string;
      if (base && base.startsWith("file://")) {
        resolved = path.resolve(path.dirname(fileURLToPath(new URL(base))), p);
      } else if (base && !/^[a-zA-Z]+:\/\//.test(base)) {
        resolved = path.resolve(path.dirname(base), p);
    } else {
      resolved = path.isAbsolute(p) ? p : path.resolve(ctx.repoRoot, p);
    }
      dbg("file:resolve", { p, resolved });
      if (hasGlob(resolved)) {
      const dir =
        fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
          ? resolved
          : path.dirname(resolved);
      const all = listLocalFilesRecursive(dir);
      const matches = all
        .filter((f) => matchLocalGlob(f, resolved))
        .sort((a, b) => a.localeCompare(b));
      dbg("file:glob", { dir, listed: all.length, pattern: resolved, matches: matches.length });
      const parts: string[] = [];
      for (const m of matches) {
        // try {
          parts.push(fs.readFileSync(m, "utf8"));
        // } catch {}
      }
      return parts.join("");
    }
    return fs.readFileSync(resolved, "utf8");
  }
  if (scheme === "github") {
    // Two supported shapes:
    // 1) owner/repo/(branch|ref|version)/<ref-with-optional-%2F>/file-path
    // 2) owner/repo/<ref-with-optional-slashes>/file-path
    // Try typed form first for compatibility with reactor.ts
    const typed =
      /^([^/]+)\/([^/]+)\/(?:branch|ref|version)\/([^/]+)\/(.+)$/.exec(p);
    if (typed) {
      const owner = typed[1];
      const repo = typed[2];
      const refRaw = typed[3];
      const filePathRaw = typed[4];
      const ref = await resolveGithubRef(
        owner,
        repo,
        decodeURIComponent(refRaw),
        ctx.token,
      );
      const filePath = decodeURIComponent(filePathRaw);
      dbg("github:direct:typed", { owner, repo, ref, filePath });
      if (hasGlob(filePath)) {
        const baseDir = findGlobBaseDir(filePath);
        const files = await listGithubFiles(owner, repo, ref, baseDir, ctx.token);
        dbg("github:direct:list", { owner, repo, ref, dir: baseDir, listed: files.length, pattern: filePath });
        const matches = files.filter((f) =>
          matchGithubGlobAbsoluteOrRelative(f, filePath, baseDir),
        );
        dbg("github:direct:matches", { count: matches.length });
        const parts: string[] = [];
        for (const m of matches) {
          // try {
            const fileUri = `github://${owner}/${repo}/branch/${encodeURIComponent(
              ref,
            )}/${m}`;
            dbg("github:direct:renderEach", { fileUri });
            parts.push(await renderTemplate(fileUri, ctx, fileUri));
          // } catch {}
        }
        return parts.join("");
      }
      dbg("github:direct:fetch", { path: filePath });
      return await fetchGithubFile(owner, repo, ref, filePath, ctx.token);
    }

    // Fallback: longest-first split of rest = refParts + fileParts
    // Shape: owner/repo/<ref-with-optional-slashes>/<file-path>
    const [owner, repo, ...rest] = p.split("/");
    if (!owner || !repo || rest.length === 0)
      throw new Error(
        `Invalid github URI: expected github://owner/repo/ref/path, got '${rawUri}'`,
      );

    let lastErr: any = null;
    for (let i = rest.length - 1; i >= 1; i--) {
      const refCandidateRaw = rest.slice(0, i).join("/");
      const filePathCandidateRaw = rest.slice(i).join("/");
      const decodedRefCandidateRaw = decodeURIComponent(refCandidateRaw);
      const decodedFilePathCandidate = decodeURIComponent(filePathCandidateRaw);
      const refCandidate = await resolveGithubRef(
        owner,
        repo,
        decodedRefCandidateRaw,
        ctx.token,
      );
      try {
        dbg("github:direct:fetchTry", { ref: refCandidate, path: decodedFilePathCandidate });
        const content = await fetchGithubFile(
          owner,
          repo,
          refCandidate,
          decodedFilePathCandidate,
          ctx.token,
        );
        return content;
      } catch (e: any) {
        lastErr = e;
        // continue trying shorter ref
      }
    }
    throw lastErr || new Error("Failed to fetch GitHub file: unknown error");
  }

  if (scheme === "git") {
    // git://<ref>/<path> with longest-first ref splitting.
    // Supports relative includes when base is also a git:// URI.
    const combined = resolveGitRelative(base, p);
    const parts = combined.split("/").filter(Boolean);
    if (parts.length < 2) throw new Error(`Invalid git URI: expected git://ref/path, got '${rawUri}'`);

    let lastErr: any = null;
    for (let i = parts.length - 1; i >= 1; i--) {
      const refCandidate = parts.slice(0, i).join("/");
      const filePathCandidate = parts.slice(i).join("/");
      try {
        if (!(await isValidGitRef(ctx.repoRoot, refCandidate))) {
          lastErr = new Error(`Invalid git ref: ${refCandidate}`);
          continue;
        }
        if (hasGlob(filePathCandidate)) {
          const baseDir = findGlobBaseDir(filePathCandidate);
          const files = await listGitFiles(ctx.repoRoot, refCandidate, baseDir);
          const matches = files.filter((f) => matchGithubGlobAbsoluteOrRelative(f, filePathCandidate, baseDir));
          const chunks: string[] = [];
          for (const m of matches) {
            try {
              chunks.push(await fetchGitFile(ctx.repoRoot, refCandidate, m));
            } catch {}
          }
          return chunks.join("");
        }
        return await fetchGitFile(ctx.repoRoot, refCandidate, filePathCandidate);
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch git file: unknown error");
  }
  // Default: treat as file path (with glob support)
  const absolute = path.isAbsolute(p) ? p : path.resolve(ctx.repoRoot, p);
  if (hasGlob(absolute)) {
    const dir =
      fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
        ? absolute
        : path.dirname(absolute);
    const all = listLocalFilesRecursive(dir);
    const matches = all
      .filter((f) => matchLocalGlob(f, absolute))
      .sort((a, b) => a.localeCompare(b));
    dbg("file:glob:absolute", { dir, listed: all.length, pattern: absolute, matches: matches.length });
    const parts: string[] = [];
    for (const m of matches) {
      // try {
        parts.push(fs.readFileSync(m, "utf8"));
      // } catch {}
    }
    return parts.join("");
  }
  return fs.readFileSync(absolute, "utf8");
}

function resolveGitRelative(base: string | undefined, p: string): string {
  const raw = decodeURIComponent(String(p || ""));
  if (!base || !/^git:\/\//i.test(base) || raw.startsWith("/")) return raw;
  const basePath = decodeURIComponent(base.replace(/^git:\/\//i, ""));
  const dir = basePath.endsWith("/") ? basePath.replace(/\/+$/, "") : path.posix.dirname(basePath);
  return path.posix.normalize(path.posix.join(dir, raw));
}

async function fetchGitFile(repoRoot: string, ref: string, filePath: string): Promise<string> {
  const spec = `${ref}:${filePath}`;
  return (await git(["show", spec], repoRoot)).toString();
}

async function listGitFiles(repoRoot: string, ref: string, dir: string): Promise<string[]> {
  try {
    const out = await git(["ls-tree", "-r", "--name-only", ref, "--", dir || "."], repoRoot);
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function isValidGitRef(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", ref], repoRoot);
    return true;
  } catch {
    return false;
  }
}

async function resolveGithubRef(
  owner: string,
  repo: string,
  refOrVersion: string,
  _token?: string,
): Promise<string> {
  if (!refOrVersion) return "main";
  if (/^v?\d+\.\d+\.\d+/.test(refOrVersion)) {
    // semver tag or version: v1.2.3 → prefer tag, else resolve to release/*
    return refOrVersion.startsWith("v") ? refOrVersion : `v${refOrVersion}`;
  }
  return refOrVersion;
}

async function fetchGithubFile(
  owner: string,
  repo: string,
  ref: string,
  filePath: string,
  _token?: string,
): Promise<string> {
  return await fetchGithubFileContents({ owner, repo, ref, filePath, token: _token });
}

function hasGlob(p: string): boolean {
  return /[\*\?\[\]\{\}]/.test(p);
}

function normalizeForGlob(p: string): string {
  // minimatch treats backslashes as escapes unless special options are used.
  // Normalizing to POSIX-style paths keeps glob matching consistent.
  return String(p).replace(/\\/g, "/");
}

function matchLocalGlob(filePath: string, pattern: string): boolean {
  return minimatch(normalizeForGlob(filePath), normalizeForGlob(pattern), { dot: true });
}

function listLocalFilesRecursive(root: string): string[] {
  const out: string[] = [];
  try {
    const st = fs.statSync(root);
    if (st.isFile()) return [path.resolve(root)];
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }
  const stack: string[] = [path.resolve(root)];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(cur, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) stack.push(full);
        else if (st.isFile()) out.push(full);
      } catch {}
    }
  }
  return out;
}

function findGlobBaseDir(p: string): string {
  const segs = p.split("/");
  const out: string[] = [];
  for (const s of segs) {
    if (hasGlob(s)) break;
    out.push(s);
  }
  return out.join("/");
}

function unescapeGlobMeta(p: string): string {
  // Allow Markdown-escaped glob metacharacters like \* to act as * in paths/URIs
  try {
    return String(p)
      .replace(/\\\*/g, "*")
      .replace(/\\\?/g, "?")
      .replace(/\\\[/g, "[")
      .replace(/\\\]/g, "]")
      .replace(/\\\{/g, "{")
      .replace(/\\\}/g, "}");
  } catch {
    return String(p);
  }
}

// Match files returned from GitHub API against a glob pattern that may be relative
// to a base directory. We normalize both sides and enable dot-file matching.
function matchGithubGlobAbsoluteOrRelative(
  filePath: string,
  pattern: string,
  baseDir: string,
): boolean {
  const normalizedFile = path.posix.normalize(filePath);
  const normalizedBase = path.posix.normalize(baseDir || "");
  const normalizedPattern = path.posix.normalize(pattern);
  // Try as-is
  if (minimatch(normalizedFile, normalizedPattern, { dot: true })) return true;
  // Try relative to baseDir
  const relPattern = path.posix.normalize(
    path.posix.join(normalizedBase, normalizedPattern),
  );
  if (minimatch(normalizedFile, relPattern, { dot: true })) return true;
  return false;
}

function matchGithubGlobAbsoluteOrRelativeWithRef(
  filePathWithRef: string,
  combinedPattern: string,
  refGuess: string,
  _baseDirFull: string,
): boolean {
  const normalizedFile = path.posix.normalize(filePathWithRef);
  const normalizedPattern = path.posix.normalize(combinedPattern);
  // Direct match (pattern already includes ref segment)
  if (minimatch(normalizedFile, normalizedPattern, { dot: true })) return true;
  // Try comparing without ref prefix (pattern might not include ref)
  const withoutRef = normalizedFile.startsWith(refGuess + "/")
    ? normalizedFile.slice(refGuess.length + 1)
    : normalizedFile;
  if (minimatch(withoutRef, normalizedPattern, { dot: true })) return true;
  return false;
}

async function listGithubFiles(
  owner: string,
  repo: string,
  ref: string | undefined,
  dir: string,
  tokenFromCtx?: string,
): Promise<string[]> {
  const token = tokenFromCtx || process.env.A5C_AGENT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  try {
    return await listGithubFilesRecursive({ owner, repo, ref: ref || undefined, dir, token });
  } catch {
    return [];
  }
}

function evalExpr(expr: string, ctx: Context, currentUri: string): any {
  // Provide helpers: event, env, vars, include(uri). Ensure template-level `this`
  // resolves to the current item for {{#each}} blocks via explicit `thisArg`.
  // Additionally, evaluate in strict mode to avoid global-object fallback.
  const compiled = preprocess(expr);
  const fn = new Function(
    "event",
    "github",
    "env",
    "vars",
    "include",
    "printJSON",
    "printYAML",
    "printXML",
    "toJSON",
    "toYAML",
    "toXML",
    "select",
    "thisArg",
    // Evaluate inside a function so `this` can point to current item
    "return (function(){ 'use strict'; return (" +
      compiled +
      "); }).call(thisArg);",
  );
  const include = (u: string) => renderTemplate(u, ctx, currentUri);
  const thisArg =
    ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, "this")
      ? ctx.vars.this
      : undefined;
  return fn(
    ctx.event,
    ctx.event,
    ctx.env,
    ctx.vars,
    include,
    printJSON,
    printYAML,
    printXML,
    toJSON,
    toYAML,
    toXML,
    select,
    thisArg,
  );
}

function preprocess(expr: string): string {
  // Support pipeline syntax: a | fn(b, c) | g() => g(fn((a), b, c))
  const piped = transformPipes(expr);
  // Map leading `this` to explicit `thisArg` to avoid relying on JS `this` binding.
  // Handles: `this`, `this.something`, `this["key"]` with possible leading spaces.
  // Intentionally minimal to cover template use-cases; avoids altering strings.
  const replaced = piped.replace(/^\s*this(?=(?:\s*$|[\.\[]))/, (m) =>
    m.replace(/this$/, "thisArg"),
  );
  return replaced;
}

function expandDollarExpressions(s: string, ctx: Context): string {
  return String(s).replace(/\$\{\{\s*([^}]+)\s*\}\}/g, (_m, expr) => {
    try {
      const val = evalExpr(String(expr), ctx, "file:///");
      return val == null ? "" : String(val);
    } catch {
      return "";
    }
  });
}

// Expand {{ expr }} occurrences inside a URI string context without rendering full template,
// so we can build dynamic include URIs from event/env/vars.
function expandCurlyExpressionsForUri(
  uriTpl: string,
  ctx: Context,
  currentUri: string,
): string {
  try {
    return String(uriTpl).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, expr) => {
      try {
        const val = evalExpr(String(expr), ctx, currentUri);
        return val == null ? "" : String(val);
      } catch {
        return "";
      }
    });
  } catch {
    return String(uriTpl);
  }
}

// Helpers
function isThenable(v: any): v is Promise<any> {
  return !!v && typeof v === "object" && typeof (v as any).then === "function";
}

function printJSON(value: any): string {
  try {
    const safe = sanitizeForPrint(value);
    return JSON.stringify(safe, null, 2);
  } catch {
    return "";
  }
}

function printYAML(value: any): string {
  try {
    const safe = sanitizeForPrint(value);
    return yamlStringify(safe);
  } catch {
    return "";
  }
}

function toJSON(value: any, indent?: number): string {
  try {
    const safe = sanitizeForPrint(value);
    return JSON.stringify(
      safe,
      null,
      typeof indent === "number" ? indent : 2,
    );
  } catch {
    return "";
  }
}

function toYAML(value: any): string {
  try {
    const safe = sanitizeForPrint(value);
    return yamlStringify(safe);
  } catch {
    return "";
  }
}

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function valueToXML(key: string, value: any): string {
  const tag = key || "item";
  if (value == null) return `<${tag}/>\n`;
  if (Array.isArray(value)) {
    return value.map((v) => valueToXML(tag, v)).join("");
  }
  if (typeof value === "object") {
    const inner = Object.entries(value)
      .map(([k, v]) => valueToXML(k, v))
      .join("");
    return `<${tag}>\n${inner}</${tag}>\n`;
  }
  return `<${tag}>${xmlEscape(String(value))}</${tag}>\n`;
}

function toXML(value: any, rootName?: string): string {
  const root = rootName || "root";
  const safe = sanitizeForPrint(value);
  return valueToXML(root, safe);
}

function printXML(value: any): string {
  try {
    return toXML(value);
  } catch {
    return "";
  }
}

function select<T, R = any>(value: T, selector?: any): R {
  try {
    if (typeof selector === "function") return selector(value);
    if (typeof selector === "string") {
      return getByPath(value as any, selector);
    }
    return value as unknown as R;
  } catch {
    return undefined as unknown as R;
  }
}

function getByPath(obj: any, pathStr: string): any {
  const parts = String(pathStr)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function transformPipes(expr: string): string {
  // Split by '|' that are not inside strings/parens and not part of '||' or '|='
  const tokens: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    const prev = i > 0 ? expr[i - 1] : "";
    const next = i + 1 < expr.length ? expr[i + 1] : "";
    if (quote) {
      buf += ch;
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }
    if (
      ch === "|" &&
      depth === 0 &&
      prev !== "|" &&
      next !== "|" &&
      next !== "="
    ) {
      tokens.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  if (tokens.length <= 1) return expr;
  let acc = `(${tokens[0]})`;
  for (let i = 1; i < tokens.length; i++) {
    const seg = tokens[i];
    const m = /^([a-zA-Z_$][\w$]*)\s*(?:\((.*)\))?$/.exec(seg);
    if (m) {
      const name = m[1];
      const args = (m[2] || "").trim();
      acc = args ? `${name}(${acc}, ${args})` : `${name}(${acc})`;
    } else {
      // If not a simple identifier or call, leave as-is by concatenation
      acc = `${seg}(${acc})`;
    }
  }
  return acc;
}

function sanitizeForPrint<T = any>(value: T): T {
  const masked = redactEnvFields(value, DEFAULT_MASK);
  return redactObject(masked) as T;
}

function redactEnvFields(value: any, mask: string): any {
  if (Array.isArray(value)) return value.map((v) => redactEnvFields(v, mask));
  if (value && typeof value === "object") {
    const out: Record<string, any> = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase() === "env") {
        out[k] = mask;
      } else {
        out[k] = redactEnvFields(v, mask);
      }
    }
    return out;
  }
  return value;
}

function sanitizeEventForTemplate(ev: any): any {
  try {
    if (!ev || typeof ev !== "object") return ev;
    const out: Record<string, any> = { ...ev };
    delete out.script;
    delete out.event_type;
    delete out.original_event;
    delete out.client_payload;
    return out;
  } catch {
    return ev;
  }
}
