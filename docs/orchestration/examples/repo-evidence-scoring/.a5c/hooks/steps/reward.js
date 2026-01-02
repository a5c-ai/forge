process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  // Intentionally does not emit reward_report; hook exec should compute it from evidence.
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
});

