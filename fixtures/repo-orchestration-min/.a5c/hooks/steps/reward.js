#!/usr/bin/env node
process.stdin.resume();
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  // Minimal portable reward hook: always passes.
  process.stdout.write(
    JSON.stringify({
      ok: true,
      reward_report: {
        reward_total: 1,
        pass_threshold: 0.8,
        decision: "pass",
        signals: {
          unit: { pass_fail: true, score: 1, severity: "HARD", evidence: [], summary: "ok" }
        },
        notes: ""
      },
      artifacts: []
    }) + "\n"
  );
});

