#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--out") out.out = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt || !args.out) {
    process.stderr.write("usage: echo-agent --prompt <path> --out <path>\n");
    process.exit(2);
  }

  const promptText = fs.readFileSync(args.prompt, "utf8");
  const body = `# repo-min echo agent\n\n## Prompt\n\n${promptText}\n`;

  // Emit a small Codex-style stdout log so `git a5c parse --type codex`
  // can be used to structure logs downstream.
  const ts = new Date().toISOString().slice(0, 19);
  process.stdout.write(`[${ts}] thinking\n`);
  process.stdout.write("generating response\n");
  process.stdout.write(`[${ts}] codex\n`);
  process.stdout.write("wrote agent-output.md\n");
  process.stdout.write(`[${ts}] tokens used: 42\n`);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, body, "utf8");
}

main();
