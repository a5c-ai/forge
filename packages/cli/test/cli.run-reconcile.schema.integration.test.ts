import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

async function createAjvForSchemas(schemaDir: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const files = await fs.readdir(schemaDir);
  for (const f of files) {
    if (!f.endsWith(".schema.json")) continue;
    const raw = await fs.readFile(path.join(schemaDir, f), "utf8");
    ajv.addSchema(JSON.parse(raw));
  }
  return ajv;
}

describe("CLI run reconcile output validates against schema", () => {
  it(
    "reconcile --json returns a schema-valid plan envelope",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      let out = "";
      expect(
        await runCli(["run", "reconcile", "--repo", repo, "--json", "--run-id", "run_001"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);

      const obj = JSON.parse(out);

      const schemaDir = path.resolve(import.meta.dirname, "../../../spec/schemas");
      const ajv = await createAjvForSchemas(schemaDir);
      const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.reconcile.plan.schema.json";
      const validate = ajv.getSchema(schemaId);
      expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

      const ok = validate!(obj);
      if (!ok) {
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(`plan schema validation failed: ${JSON.stringify(errs, null, 2)}`);
      }
    },
    30000
  );
});

