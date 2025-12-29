import yaml from "js-yaml";

export type HookMappingV1 = {
  schema: "a5cforge/v1";
  kind: "hook-mapping";
  version: "v1";
  step_hooks: {
    // Hook name templates (NOT file paths). These are resolved by the runner.
    // Example: "agent/[profile]".
    agent: string;

    // Example: "reward".
    reward: string;
  };
  evidence_hooks: {
    // Map producer `kind` -> hook name (NOT file path).
    // Example: "command".
    command: string;
  };
};

export type HookMapping = HookMappingV1;

export function parseHookMapping(text: string, hintPath?: string): HookMapping {
  const trimmed = text.trim();
  const isJson = hintPath?.toLowerCase().endsWith(".json") || trimmed.startsWith("{");
  const obj = isJson ? JSON.parse(text) : yaml.load(text);
  if (!obj || typeof obj !== "object") throw new Error("hook mapping must be an object");
  return obj as HookMapping;
}
