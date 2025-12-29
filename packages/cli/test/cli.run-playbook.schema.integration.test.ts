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

describe("CLI run playbook output validates against schema", () => {
  it(
    "run playbook --json returns a schema-valid result",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      let out = "";
      expect(
        await runCli(["run", "playbook", "--repo", repo, "--json", "--playbook", "playbooks/web_feature.yaml@v1", "--run-id", "run_901"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);

      const obj = JSON.parse(out);

      const schemaDir = path.resolve(import.meta.dirname, "../../../spec/schemas");
      const ajv = await createAjvForSchemas(schemaDir);
      const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.playbook.result.schema.json";
      const validate = ajv.getSchema(schemaId);
      expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

      const ok = validate!(obj);
      if (!ok) {
        const errs = (validate!.errors ?? []).slice(0, 5);
        throw new Error(`result schema validation failed: ${JSON.stringify(errs, null, 2)}`);
      }
    },
    60000
  );
});

