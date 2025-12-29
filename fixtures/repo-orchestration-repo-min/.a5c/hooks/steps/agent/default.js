#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function buildA5cCli() {
  const configured = process.env.A5C_CLI;
  if (configured) {
    if (configured.toLowerCase().endsWith(".js")) {
      return { cmd: process.execPath, argv: [configured] };
    }
    return { cmd: configured, argv: [] };
  }
  return { cmd: "git-a5c", argv: [] };
}

process.stdin.resume();
process.stdin.setEncoding("utf8");

let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(buf.trim() || "{}");
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: "invalid_json" }) + "\n");
    return;
  }

  const runId = String(input.run_id || "");
  const stepId = Number(input.step_id || 0);
  const attempt = Number(input.attempt || 0);
  const profile = String(input?.agent?.profile || "default");

  const artifactDir = path.resolve(
    process.cwd(),
    "artifacts",
    "runs",
    runId || "run",
    `step_${Number.isFinite(stepId) ? stepId : 0}`,
    `attempt_${Number.isFinite(attempt) ? attempt : 0}`,
  );
  fs.mkdirSync(artifactDir, { recursive: true });

  const eventPath = path.join(artifactDir, "hook-input.json");
  const promptPath = path.join(artifactDir, "prompt.md");
  const agentOutPath = path.join(artifactDir, "agent-output.md");
  const agentStdoutPath = path.join(artifactDir, "agent-stdout.log");
  const agentStderrPath = path.join(artifactDir, "agent-stderr.log");
  const codexEventsPath = path.join(artifactDir, "codex-events.jsonl");

  fs.writeFileSync(eventPath, JSON.stringify(input, null, 2), "utf8");

  const a5cCli = buildA5cCli();
  const gen = spawnSync(
    a5cCli.cmd,
    [
      ...a5cCli.argv,
      "agent",
      "generate-context",
      "--in",
      eventPath,
      "--template",
      path.resolve(process.cwd(), ".a5c", "main.md"),
      "--var",
      `profile=${profile}`,
      "--out",
      promptPath,
    ],
    { encoding: "utf8" },
  );
  if (gen.status !== 0) {
    const msg = String(gen.stderr || gen.stdout || "agent generate-context failed").slice(0, 2000);
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
    return;
  }

  const run = spawnSync(
    a5cCli.cmd,
    [
      ...a5cCli.argv,
      "agent",
      "run",
      "--profile",
      profile,
      "--in",
      promptPath,
      "--out",
      agentOutPath,
      "--stdout",
      agentStdoutPath,
      "--stderr",
      agentStderrPath,
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    const msg = String(run.stderr || run.stdout || "agent run failed").slice(0, 2000);
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
    return;
  }

  const parse = spawnSync(
    a5cCli.cmd,
    [
      ...a5cCli.argv,
      "parse",
      "--type",
      "codex",
      "--out",
      codexEventsPath,
    ],
    { input: fs.readFileSync(agentStdoutPath, "utf8"), stdio: ["pipe", "ignore", "pipe"], encoding: "utf8" },
  );
  if (parse.status !== 0) {
    const msg = String(parse.stderr || "parse failed").slice(0, 2000);
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
    return;
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      artifacts: [eventPath, promptPath, agentOutPath, agentStdoutPath, agentStderrPath, codexEventsPath],
      links: {
        prompt_path: promptPath,
        agent_output_path: agentOutPath,
        agent_stdout_path: agentStdoutPath,
        codex_events_path: codexEventsPath,
      },
    }) + "\n",
  );
});
