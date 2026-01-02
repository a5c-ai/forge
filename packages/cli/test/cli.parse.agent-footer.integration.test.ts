import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

function runBin(binPath: string, args: string[], cwd: string, stdinText?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    if (stdinText != null) child.stdin.write(stdinText, "utf8");
    child.stdin.end();
    child.on("close", (code) => resolve({ code: code ?? 0, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

async function createAjvForSchemas(schemaDir: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const entries = await fs.readdir(schemaDir);
  for (const f of entries) {
    if (!f.endsWith(".schema.json")) continue;
    const raw = await fs.readFile(path.join(schemaDir, f), "utf8");
    ajv.addSchema(JSON.parse(raw));
  }
  return ajv;
}

describe("CLI parse --type agent-footer", () => {
  it(
    "extracts the JSON footer and validates it against schema",
    async () => {
      const root = path.resolve(import.meta.dirname, "../../..");
      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const md = [
        "Hello",
        "",
        "```json",
        JSON.stringify(
          {
            schema: "a5cforge/v1",
            kind: "agent.output.footer",
            run_id: "run_1",
            step_id: 1,
            attempt: 1,
            profile: "default",
            status: "ok",
            summary: "done",
            changes: [],
            commands: [],
            artifacts: [],
            events_to_write: []
          },
          null,
          2
        ),
        "```",
        ""
      ].join("\n");

      const res = await runBin(binPath, ["parse", "--type", "agent-footer"], root, md);
      expect(res.code).toBe(0);
      const evt = JSON.parse(res.stdout.trim());
      expect(evt.type).toBe("agent_output_footer");

      const schemaDir = path.join(root, "spec", "schemas");
      const ajv = await createAjvForSchemas(schemaDir);
      const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/agent.output.footer.schema.json";
      const validate = ajv.getSchema(schemaId);
      expect(validate).toBeTypeOf("function");
      const ok = validate!(evt.fields);
      if (!ok) throw new Error(JSON.stringify(validate!.errors?.slice(0, 5) ?? [], null, 2));
    },
    30000
  );
});

