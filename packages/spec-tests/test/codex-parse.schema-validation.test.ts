import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { createAjvForSchemas } from "../src/ajv.js";
import { repoRootFromHere } from "../src/repo.js";

describe("Codex stdout parse event schema validation", () => {
  it("validates fixture codex-stdout-sample.parsed.jsonl", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaDir = path.join(root, "spec", "schemas");
    const ajv = await createAjvForSchemas(schemaDir);

    const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/codex.stdout.event.schema.json";
    const validate = await ajv.getSchema(schemaId);
    expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

    const parsedPath = path.join(root, "fixtures", "codex-stdout-sample.parsed.jsonl");
    const text = await fs.readFile(parsedPath, "utf8");
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      const obj = JSON.parse(line);
      const ok = validate!(obj);
      if (!ok) {
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(
          [
            `Codex parse schema validation failed:`,
            `- file: fixtures/codex-stdout-sample.parsed.jsonl`,
            `- line: ${line.slice(0, 120)}`,
            `- errors: ${JSON.stringify(errs, null, 2)}`
          ].join("\n")
        );
      }
    }
  });
});

