import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

type KindMap = {
  schema: string;
  map: Record<string, string>;
};

function repoRootFromHere(): string {
  // packages/spec-tests/test -> repo root
  return path.resolve(import.meta.dirname, "../../..");
}

async function readJson(filePath: string): Promise<any> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function parseFrontMatterMarkdown(md: string): { frontMatter: any; body: string } {
  // Very small frontmatter parser: expects `---\nYAML\n---\n` at start.
  const s = md.replace(/^\uFEFF/, ""); // tolerate UTF-8 BOM
  const nl = s.includes("\r\n") ? "\r\n" : "\n";
  const startFence = `---${nl}`;
  const endFence = `${nl}---${nl}`;

  if (!s.startsWith(startFence)) {
    throw new Error("markdown missing starting frontmatter fence '---'");
  }
  const endIdx = s.indexOf(endFence, startFence.length);
  if (endIdx === -1) {
    throw new Error("markdown missing closing frontmatter fence '---'");
  }
  const yamlText = s.slice(startFence.length, endIdx + nl.length); // include trailing newline
  const body = s.slice(endIdx + endFence.length);
  const frontMatter = yaml.load(yamlText);
  return { frontMatter, body };
}

function isCollabEventPath(p: string): boolean {
  // Conservative: only validate files under `.collab/**`.
  const normalized = p.split(path.sep).join("/");
  return normalized.includes("/.collab/");
}

function assertEventFilenameGrammar(filePath: string) {
  // Minimal Phase-1 grammar: filename begins with a numeric ms timestamp and contains kind suffix.
  // Example: `1734628200000_alice_0001.issue.event.created.json`
  const base = path.basename(filePath);
  const ok = /^\d{13}_[A-Za-z0-9._-]+_\d{4}\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*\.(json|md)$/.test(base);
  expect(ok, `Bad event filename grammar: ${base}`).toBe(true);
}

function assertEventPathGrammar(filePath: string) {
  const normalized = filePath.split(path.sep).join("/");
  // Minimal Phase 1 path grammar checks:
  // - must be under `.collab/**`
  // - issue events live under `.collab/issues/<id>/events/YYYY/MM/<filename>`
  // - PR events live under `.collab/prs/<id>/events/YYYY/MM/<filename>`
  // - agent global events live under `.collab/agents/events/YYYY/MM/<filename>`
  // - ops global events live under `.collab/ops/events/YYYY/MM/<filename>`
  const patterns = [
    /\/\.collab\/issues\/[^/]+\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md)$/,
    /\/\.collab\/prs\/[^/]+\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md)$/,
    /\/\.collab\/agents\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md)$/,
    /\/\.collab\/ops\/events\/\d{4}\/\d{2}\/[^/]+\.(json|md)$/
  ];
  const ok = patterns.some((re) => re.test(normalized));
  expect(ok, `Bad event path grammar: ${normalized}`).toBe(true);
}

describe("Phase 1 - fixture schema validation", () => {
  it("validates all fixture .collab event files against schemas", async () => {
    const root = repoRootFromHere();

    const schemaDir = path.join(root, "spec", "schemas");
    const kindMapPath = path.join(schemaDir, "kind-map.v1.json");
    const kindMap = (await readJson(kindMapPath)) as KindMap;
    expect(kindMap.schema).toBe("a5cforge/v1");

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

    const collabFiles = await fg(["fixtures/**/.collab/**/*.{json,md}"], {
      cwd: root,
      absolute: true,
      onlyFiles: true
    });

    expect(collabFiles.length).toBeGreaterThan(0);

    for (const filePath of collabFiles) {
      if (!isCollabEventPath(filePath)) continue;

      assertEventFilenameGrammar(filePath);
      assertEventPathGrammar(filePath);

      const ext = path.extname(filePath).toLowerCase();
      let event: any;

      if (ext === ".json") {
        event = await readJson(filePath);
      } else if (ext === ".md") {
        const md = await fs.readFile(filePath, "utf8");
        const { frontMatter } = parseFrontMatterMarkdown(md);
        event = frontMatter;
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


