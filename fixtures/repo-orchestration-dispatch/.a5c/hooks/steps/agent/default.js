process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
});

