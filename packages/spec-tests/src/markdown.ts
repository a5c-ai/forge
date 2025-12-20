import yaml from "js-yaml";

export function parseFrontMatterMarkdown(md: string): { frontMatter: any; body: string } {
  // Very small frontmatter parser: expects `---\nYAML\n---\n` at start.
  const s = md.replace(/^\uFEFF/, ""); // tolerate UTF-8 BOM
  const nl = s.includes("\r\n") ? "\r\n" : "\n";
  const startFence = `---${nl}`;
  const endFence = `${nl}---${nl}`;

  if (!s.startsWith(startFence)) {
    throw new Error("markdown missing starting frontmatter fence '---'");
  }
  const endIdx = s.indexOf(endFence, startFence.length);
  if (endIdx === -1) {
    throw new Error("markdown missing closing frontmatter fence '---'");
  }
  const yamlText = s.slice(startFence.length, endIdx + nl.length); // include trailing newline
  const body = s.slice(endIdx + endFence.length);
  const frontMatter = yaml.load(yamlText);
  return { frontMatter, body };
}


