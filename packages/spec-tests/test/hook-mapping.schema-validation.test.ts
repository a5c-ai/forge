import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import yaml from "js-yaml";
import { createAjvForSchemas } from "../src/ajv.js";
import { repoRootFromHere } from "../src/repo.js";

describe("Hook mapping schema validation", () => {
  it("validates fixture hook mappings", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaDir = path.join(root, "spec", "schemas");
    const ajv = await createAjvForSchemas(schemaDir);

    const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/hook.mapping.schema.json";
    const validate = await ajv.getSchema(schemaId);
    expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

    const files = await fg(["fixtures/**/.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml"], {
      cwd: root,
      absolute: true,
      onlyFiles: true
    });
    expect(files.length).toBeGreaterThan(0);

    for (const filePath of files) {
      const raw = await fs.readFile(filePath, "utf8");
      const obj = yaml.load(raw);
      const ok = validate!(obj);
      if (!ok) {
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(
          [
            `Hook mapping schema validation failed:`,
            `- file: ${path.relative(root, filePath)}`,
            `- errors: ${JSON.stringify(errs, null, 2)}`
          ].join("\n")
        );
      }
    }
  });
});

