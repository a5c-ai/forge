import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function isExternalLink(href) {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("data:") ||
    href.startsWith("#")
  );
}

function normalizeAnchorSlug(s) {
  // Approximate GitHub slugification:
  // - trim
  // - lowercase
  // - remove punctuation (keep spaces, word chars, -)
  // - spaces -> -
  // - collapse -
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function listMarkdownFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // Ignore generated workplan split.
        if (p.replaceAll("\\", "/").includes("/docs/workplan/")) continue;
        stack.push(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        if (p.replaceAll("\\", "/").endsWith("/docs/workplan.md")) continue;
        out.push(p);
      }
    }
  }
  return out;
}

async function readHeadingsByFile(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  const headings = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    headings.add(normalizeAnchorSlug(m[2]));
  }
  return headings;
}

function extractLinks(md) {
  // Very small parser: capture inline markdown links [text](href).
  // Skip images ![alt](href) by negative lookbehind approximation (check preceding char).
  const links = [];
  const re = /\[[^\]]*?\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md))) {
    const href = (m[1] ?? "").trim();
    const start = m.index;
    const isImage = start > 0 && md[start - 1] === "!";
    if (isImage) continue;
    if (!href) continue;
    // Strip surrounding <>
    const cleaned = href.startsWith("<") && href.endsWith(">") ? href.slice(1, -1) : href;
    // Strip optional title: (path "title")
    const parts = cleaned.split(/\s+/);
    links.push(parts[0]);
  }
  return links;
}

async function main() {
  const docsDir = path.join(repoRoot, "docs");
  const specDir = path.join(repoRoot, "spec");
  const files = [...(await listMarkdownFiles(docsDir)), ...(await listMarkdownFiles(specDir))];

  const headingCache = new Map();
  const errors = [];

  for (const file of files) {
    const md = await fs.readFile(file, "utf8");
    const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
    const links = extractLinks(md);

    for (const href of links) {
      if (isExternalLink(href)) continue;

      const [targetRaw, anchorRaw] = href.split("#");
      const targetPathRaw = (targetRaw ?? "").trim();
      const anchor = (anchorRaw ?? "").trim();

      // Same-file anchor.
      const targetAbs =
        targetPathRaw.length === 0 ? file : path.resolve(path.dirname(file), targetPathRaw);

      // Only validate links that point inside the repo.
      if (!path.resolve(targetAbs).startsWith(repoRoot)) continue;

      try {
        const stat = await fs.stat(targetAbs);
        if (!stat.isFile()) {
          errors.push(`${rel}: link target is not a file: ${href}`);
          continue;
        }
      } catch {
        errors.push(`${rel}: missing link target: ${href}`);
        continue;
      }

      if (anchor) {
        const key = targetAbs;
        let headings = headingCache.get(key);
        if (!headings) {
          headings = await readHeadingsByFile(targetAbs);
          headingCache.set(key, headings);
        }
        const want = normalizeAnchorSlug(anchor.replaceAll("%20", " "));
        if (want && !headings.has(want)) {
          errors.push(`${rel}: missing anchor '#${anchor}' in ${path.relative(repoRoot, targetAbs).replaceAll("\\", "/")}`);
        }
      }
    }
  }

  if (errors.length) {
    // Print all for local dev; CI will surface the first chunk.
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`docs-links-check: OK (${files.length} files)`);
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exit(1);
});


