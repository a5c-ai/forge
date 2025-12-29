#!/usr/bin/env node
process.stdin.resume();
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  // Minimal portable agent hook: always succeeds.
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
});

