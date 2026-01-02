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

  const runId = process.env.A5C_RUN_ID || "run_unknown";
  const stepId = Number(process.env.A5C_STEP_ID || "0") || 0;
  const attempt = Number(process.env.A5C_ATTEMPT || "0") || 0;
  const profile = process.env.A5C_AGENT_PROFILE || "default";

  const footer = {
    schema: "a5cforge/v1",
    kind: "agent.output.footer",
    run_id: runId,
    step_id: stepId,
    attempt,
    profile,
    status: "ok",
    summary: "Echo agent completed.",
    changes: [],
    commands: [],
    artifacts: [],
    events_to_write: [],
  };

  const body = `# repo-dev-loop echo agent\n\n## Prompt\n\n${promptText}\n\n\n\`\`\`json\n${JSON.stringify(footer, null, 2)}\n\`\`\`\n`;

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
