import fs from "node:fs";
import path from "node:path";
import { git } from "../git.js";
import { fetchGithubFileContents } from "./githubContents.js";

export type ParsedUri = { scheme: string; path: string };

export function resolveUri(raw: string, base?: string): ParsedUri {
  // Support protocol-relative: //path -> inherit scheme from base
  if (raw.startsWith("//") && base) {
    const b = new URL(base, "file://");
    return { scheme: b.protocol.replace(":", ""), path: raw.slice(2) };
  }
  const m = /^(\w+):\/\/(.+)$/.exec(raw);
  if (m) return { scheme: m[1]!, path: m[2]! };
  return { scheme: "file", path: raw };
}

export async function readTextFromUri(opts: {
  repoRoot: string;
  uriOrPath: string;
  base?: string;
  token?: string;
}): Promise<string> {
  const { scheme, path: p } = resolveUri(opts.uriOrPath, opts.base);
  if (scheme === "file") {
    const resolved = path.isAbsolute(p) ? p : path.resolve(opts.repoRoot, p);
    return fs.readFileSync(resolved, "utf8");
  }

  if (scheme === "github") {
    const [owner, repo, ...rest] = p.split("/");
    if (!owner || !repo || rest.length === 0) {
      throw new Error(`Invalid github URI: expected github://owner/repo/ref/path, got '${opts.uriOrPath}'`);
    }

    let lastErr: any = null;
    for (let i = rest.length - 1; i >= 1; i--) {
      const refCandidate = rest.slice(0, i).join("/");
      const filePathCandidate = rest.slice(i).join("/");
      try {
        return await fetchGithubFileContents({ owner, repo, ref: decodeURIComponent(refCandidate), filePath: decodeURIComponent(filePathCandidate), token: opts.token });
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch GitHub file: unknown error");
  }

  if (scheme === "git") {
    // git://<ref>/<path> (ref may contain slashes; split longest-first)
    const decoded = decodeURIComponent(p);
    const parts = decoded.split("/").filter(Boolean);
    if (parts.length < 2) throw new Error(`Invalid git URI: expected git://ref/path, got '${opts.uriOrPath}'`);
    let lastErr: any = null;
    for (let i = parts.length - 1; i >= 1; i--) {
      const ref = parts.slice(0, i).join("/");
      const filePath = parts.slice(i).join("/");
      try {
        return await git(["show", `${ref}:${filePath}`], opts.repoRoot);
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch git file: unknown error");
  }

  throw new Error(`Unsupported URI scheme '${scheme}'`);
}

