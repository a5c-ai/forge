import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import { repoRootFromHere, readJson } from "../src/repo.js";
import { parseFrontMatterMarkdown } from "../src/markdown.js";
import { assertEventFilenameGrammar, assertEventPathGrammar, isCollabConfigPath, isCollabEventPath } from "../src/grammar.js";
import { createAjvForSchemas, loadKindMap } from "../src/ajv.js";

describe("Phase 1 - fixture schema validation", () => {
  it("validates all fixture .collab event files against schemas", async () => {
    const root = repoRootFromHere(import.meta.dirname);

    const schemaDir = path.join(root, "spec", "schemas");
    const kindMapPath = path.join(schemaDir, "kind-map.v1.json");
    const kindMap = await loadKindMap(schemaDir);
    expect(kindMap.schema).toBe("a5cforge/v1");

    const ajv = await createAjvForSchemas(schemaDir);

    const collabFiles = await fg(["fixtures/**/.collab/**/*.{json,md,ndjson}"], {
      cwd: root,
      absolute: true,
      onlyFiles: true
    });

    expect(collabFiles.length).toBeGreaterThan(0);

    for (const filePath of collabFiles) {
      if (!isCollabEventPath(filePath)) continue;
      if (isCollabConfigPath(filePath)) continue;

      assertEventFilenameGrammar(filePath);
      assertEventPathGrammar(filePath);

      const ext = path.extname(filePath).toLowerCase();
      let event: any;

      if (ext === ".json") {
        event = await readJson(filePath);
        // fallthrough to validate
      } else if (ext === ".md") {
        const md = await fs.readFile(filePath, "utf8");
        const { frontMatter } = parseFrontMatterMarkdown(md);
        event = frontMatter;
      } else if (ext === ".ndjson") {
        const raw = await fs.readFile(filePath, "utf8");
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const ev = JSON.parse(line);
          const kind: string | undefined = ev?.kind;
          expect(kind, `missing kind in ${filePath}`).toBeTypeOf("string");
          const schemaFile = kindMap.map[kind!];
          expect(schemaFile, `No schema mapping for kind='${kind}' (${filePath})`).toBeTypeOf("string");
          const schemaId = `https://a5cforge.dev/schemas/a5cforge-v1/${schemaFile}`;
          const validate = await ajv.getSchema(schemaId);
          expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");
          const ok = validate!(ev);
          if (!ok) {
            const errs = (validate!.errors ?? []).slice(0, 5);
            throw new Error(
              [
                `Schema validation failed (ndjson line):`,
                `- file: ${path.relative(root, filePath)}`,
                `- kind: ${kind}`,
                `- schema: ${schemaFile}`,
                `- errors: ${JSON.stringify(errs, null, 2)}`
              ].join("\n")
            );
          }
        }
        continue;
      } else {
        throw new Error(`unexpected extension: ${ext}`);
      }

      const kind: string | undefined = event?.kind;
      expect(kind, `missing kind in ${filePath}`).toBeTypeOf("string");

      const schemaFile = kindMap.map[kind!];
      expect(schemaFile, `No schema mapping for kind='${kind}' (${filePath})`).toBeTypeOf("string");

      const schemaId = `https://a5cforge.dev/schemas/a5cforge-v1/${schemaFile}`;
      const validate = await ajv.getSchema(schemaId);
      expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

      const ok = validate!(event);
      if (!ok) {
        // Include only the first few errors for signal.
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(
          [
            `Schema validation failed:`,
            `- file: ${path.relative(root, filePath)}`,
            `- kind: ${kind}`,
            `- schema: ${schemaFile}`,
            `- errors: ${JSON.stringify(errs, null, 2)}`
          ].join("\n")
        );
      }
    }
  });
});


