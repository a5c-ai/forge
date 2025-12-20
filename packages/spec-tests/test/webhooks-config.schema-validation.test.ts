import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020";
import { repoRootFromHere } from "../src/repo.js";

describe("Phase 8 - webhooks config schema", () => {
  it("validates a sample .collab/webhooks.json config against schema", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaPath = path.join(root, "spec", "schemas", "webhooks.config.schema.json");
    const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema(schema);

    const validate = ajv.getSchema(schema.$id);
    expect(validate).toBeTypeOf("function");

    const sample = {
      schema: "a5cforge/v1",
      endpoints: [
        { id: "local", url: "http://127.0.0.1:9999/recv", events: ["git.*", "comment.*"], enabled: true }
      ]
    };
    const ok = validate!(sample);
    expect(ok).toBe(true);
  });
});


