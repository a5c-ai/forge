#!/usr/bin/env node
process.stdin.resume();
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const rewardTotal = Number(process.env.A5C_TEST_REWARD_TOTAL ?? "0.5");
  const total = Number.isFinite(rewardTotal) ? rewardTotal : 0.5;
  process.stdout.write(
    JSON.stringify({
      ok: true,
      reward_report: {
        reward_total: total,
        pass_threshold: 0.8,
        decision: total >= 0.8 ? "pass" : "redo",
        signals: {
          unit: { pass_fail: total >= 0.8, score: total >= 0.8 ? 1 : 0, severity: "HARD", evidence: [], summary: "" }
        },
        notes: ""
      },
      artifacts: []
    }) + "\n"
  );
});

