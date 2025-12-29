#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  // repo-min example: this producer is a no-op.
  process.stdout.write(JSON.stringify({ ok: true, evidence: [] }) + "\n");
});

