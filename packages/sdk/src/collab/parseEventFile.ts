import yaml from "js-yaml";
import type { A5cEventBase } from "./eventTypes.js";

function parseFrontMatterMarkdown(md: string): { event: A5cEventBase; body: string } {
  const s = md.replace(/^\uFEFF/, "");
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
  const yamlText = s.slice(startFence.length, endIdx + nl.length);
  const body = s.slice(endIdx + endFence.length);
  const fm = yaml.load(yamlText);
  if (typeof fm !== "object" || fm === null) {
    throw new Error("markdown frontmatter is not an object");
  }
  return { event: fm as any, body };
}

export function parseEventFileBytes(filePath: string, bytes: Buffer): A5cEventBase {
  if (filePath.endsWith(".json")) {
    const raw = bytes.toString("utf8");
    return JSON.parse(raw);
  }
  if (filePath.endsWith(".md")) {
    const { event, body } = parseFrontMatterMarkdown(bytes.toString("utf8"));
    // Convenience: if markdown event didn't include payload.body, inject the markdown body.
    if (event && typeof event === "object") {
      const payload: any = (event as any).payload;
      if (payload && typeof payload === "object" && payload.body === undefined) {
        payload.body = body.trimEnd();
      }
    }
    return event;
  }
  throw new Error(`Unsupported event file extension: ${filePath}`);
}


