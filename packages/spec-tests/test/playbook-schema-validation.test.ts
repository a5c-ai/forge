import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import yaml from "js-yaml";
import { createAjvForSchemas } from "../src/ajv.js";
import { repoRootFromHere } from "../src/repo.js";

describe("Playbook schema validation", () => {
  it("validates fixture playbooks against template.playbook schema", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaDir = path.join(root, "spec", "schemas");
    const ajv = await createAjvForSchemas(schemaDir);

    const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/template.playbook.schema.json";
    const validate = await ajv.getSchema(schemaId);
    expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

    const playbooks = await fg(["fixtures/**/playbooks/**/*.{yaml,yml,json}"], {
      cwd: root,
      absolute: true,
      onlyFiles: true
    });
    expect(playbooks.length).toBeGreaterThan(0);

    for (const filePath of playbooks) {
      const ext = path.extname(filePath).toLowerCase();
      const raw = await fs.readFile(filePath, "utf8");
      const obj = ext === ".json" ? JSON.parse(raw) : yaml.load(raw);
      const ok = validate!(obj);
      if (!ok) {
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(
          [
            `Playbook schema validation failed:`,
            `- file: ${path.relative(root, filePath)}`,
            `- errors: ${JSON.stringify(errs, null, 2)}`
          ].join("\n")
        );
      }
    }
  });
});

