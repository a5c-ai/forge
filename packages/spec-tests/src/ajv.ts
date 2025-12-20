import path from "node:path";
import fg from "fast-glob";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readJson } from "./repo.js";

export type KindMap = {
  schema: string;
  map: Record<string, string>;
};

export async function loadKindMap(schemaDir: string): Promise<KindMap> {
  return (await readJson(path.join(schemaDir, "kind-map.v1.json"))) as KindMap;
}

export async function createAjvForSchemas(schemaDir: string) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    loadSchema: async (uri: string) => {
      // Support relative `$ref` like "./event.base.schema.json"
      if (uri.startsWith("https://a5cforge.dev/schemas/a5cforge-v1/")) {
        const filename = uri.split("/").pop()!;
        return await readJson(path.join(schemaDir, filename));
      }
      if (uri.startsWith("./")) {
        return await readJson(path.join(schemaDir, uri));
      }
      return await readJson(path.join(schemaDir, uri));
    }
  });
  addFormats(ajv);

  // Preload all schema files so refs work.
  const schemaFiles = await fg(["*.schema.json"], { cwd: schemaDir, absolute: true });
  for (const s of schemaFiles) {
    ajv.addSchema(await readJson(s));
  }
  return ajv;
}


