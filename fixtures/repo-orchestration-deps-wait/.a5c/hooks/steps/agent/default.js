process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const input = JSON.parse(buf || "{}");
  const templateId = String(input.template?.template_id || "");
  const stepId = Number(input.step_id || 0);

  if (templateId === "deps_parent" && stepId === 1) {
    process.stdout.write(JSON.stringify({ ok: true, spawn: [{ playbook: "playbooks/child.yaml@v1" }] }) + "\n");
    return;
  }

  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
});

