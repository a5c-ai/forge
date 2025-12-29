#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  // Intentionally omit reward_report.
  // hookExec will compute reward_report from evidence producers.
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
});

