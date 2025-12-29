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
  const body = `# fixture echo agent\n\n## Prompt\n\n${promptText}\n`;

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, body, "utf8");
}

main();

