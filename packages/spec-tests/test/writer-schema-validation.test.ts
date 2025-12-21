import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import fg from "fast-glob";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { HlcClock, writeIssueCreated, writeCommentCreated, writePrRequest } from "@a5c-ai/sdk";

type KindMap = {
  schema: string;
  map: Record<string, string>;
};

async function readJson(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

describe("Phase 3 - emitted events validate against schemas", () => {
  it("writer-emitted JSON events validate via kind-map", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const schemaDir = path.join(repoRoot, "spec", "schemas");
    const kindMap = (await readJson(path.join(schemaDir, "kind-map.v1.json"))) as KindMap;
    expect(kindMap.schema).toBe("a5cforge/v1");

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const schemaFiles = await fg(["*.schema.json"], { cwd: schemaDir, absolute: true });
    for (const s of schemaFiles) ajv.addSchema(await readJson(s));

    // IMPORTANT: use forward slashes for repoRoot to avoid Windows path separator leaks into glob patterns.
    const tmpFs = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-writer-schema-"));
    const tmp = tmpFs.split(path.sep).join("/");
    let nonce = 0;
    const ctx = { repoRoot: tmp, actor: "alice", clock: new HlcClock(), nextNonce: () => String(++nonce).padStart(4, "0") };

    await writeIssueCreated(ctx, { issueId: "issue-1", title: "T", body: "B", time: "2025-12-19T10:00:00Z" });
    await writeCommentCreated(ctx, { entity: { type: "issue", id: "issue-1" }, commentId: "c1", body: "hi", time: "2025-12-19T10:01:00Z" });
    await writePrRequest(ctx, { prKey: "pr-1", baseRef: "refs/heads/main", title: "R", body: "b", time: "2025-12-19T10:02:00Z" });

    const files = await fg([".collab/**/*.json"], { cwd: tmp, absolute: true, onlyFiles: true });
    expect(files.length).toBeGreaterThan(0);

    for (const filePath of files) {
      const ev = await readJson(filePath);
      const kind = ev.kind as string;
      const schemaFile = kindMap.map[kind];
      expect(schemaFile, `No schema mapping for kind=${kind}`).toBeTruthy();
      const schemaId = `https://a5cforge.dev/schemas/a5cforge-v1/${schemaFile}`;
      const validate = ajv.getSchema(schemaId);
      expect(validate).toBeTypeOf("function");
      const ok = validate!(ev);
      if (!ok) {
        throw new Error(
          `schema validation failed for ${path.relative(tmp, filePath)} (${kind}): ${JSON.stringify(validate!.errors, null, 2)}`
        );
      }
    }
  });
});


