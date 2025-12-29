process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const input = JSON.parse(buf || "{}");
  const signalId = String(input.signal_id || "");
  if (signalId === "unit") {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        evidence: [{ evidence_id: "unit_report", kind: "report", metrics: { failed: 0 } }]
      }) + "\n"
    );
    return;
  }

  const ratio = process.env.A5C_TEST_DIFF_RATIO ? Number(process.env.A5C_TEST_DIFF_RATIO) : 0.5;
  process.stdout.write(
    JSON.stringify({
      ok: true,
      evidence: [{ evidence_id: "visual_report", kind: "diff", metrics: { diff_ratio: ratio } }]
    }) + "\n"
  );
});

