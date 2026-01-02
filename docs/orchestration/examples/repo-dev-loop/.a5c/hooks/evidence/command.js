#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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

  const cmd = String(input?.producer_args?.cmd || "").trim();
  const artifactRoot = String(input?.artifact_root || "").trim();
  if (!cmd) {
    process.stdout.write(JSON.stringify({ ok: true, evidence: [{ evidence_id: "ci_report", kind: "report", metrics: { failed: 1 }, summary: "missing cmd" }] }) + "\n");
    return;
  }

  const absDir = artifactRoot ? path.resolve(process.cwd(), artifactRoot) : process.cwd();
  fs.mkdirSync(absDir, { recursive: true });
  const outRel = artifactRoot ? path.join(artifactRoot, "command.stdout.log") : "command.stdout.log";
  const errRel = artifactRoot ? path.join(artifactRoot, "command.stderr.log") : "command.stderr.log";
  const outPath = path.resolve(process.cwd(), outRel);
  const errPath = path.resolve(process.cwd(), errRel);

  const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
  fs.writeFileSync(outPath, String(res.stdout || ""), "utf8");
  fs.writeFileSync(errPath, String(res.stderr || ""), "utf8");

  const exitCode = typeof res.status === "number" ? res.status : 1;
  const failed = exitCode === 0 ? 0 : 1;

  process.stdout.write(
    JSON.stringify({
      ok: true,
      evidence: [
        {
          evidence_id: "ci_report",
          kind: "report",
          paths: [outRel, errRel],
          summary: `cmd='${cmd}' exit=${exitCode}`,
          metrics: { failed, exit_code: exitCode },
        },
      ],
    }) + "\n",
  );
});
