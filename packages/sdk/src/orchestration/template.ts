import yaml from "js-yaml";
import type { Template } from "./types.js";
import { applyJsonMergePatch } from "./mergePatch.js";

export function parseTemplate(text: string, hintPath?: string): Template {
  const trimmed = text.trim();
  const isJson = hintPath?.toLowerCase().endsWith(".json") || trimmed.startsWith("{");
  const obj = isJson ? JSON.parse(text) : yaml.load(text);
  if (!obj || typeof obj !== "object") throw new Error("template must be an object");
  return obj as Template;
}

export function applyTemplatePatch(base: Template, patch: unknown): Template {
  return applyJsonMergePatch(base, patch);
}

