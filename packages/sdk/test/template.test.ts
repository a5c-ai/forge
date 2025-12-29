import { describe, expect, it } from "vitest";
import { applyTemplatePatch, parseTemplate } from "../src/orchestration/template.js";

describe("template", () => {
  it("parses YAML templates", () => {
    const t = parseTemplate(
      [
        "template_id: t",
        "version: v1",
        "steps:",
        "  - step_id: 1",
        "    type: agent",
        "    breakpoint:",
        "      enabled: false"
      ].join("\n"),
      "playbooks/x.yaml"
    );
    expect(t.template_id).toBe("t");
    expect(t.steps[0]?.step_id).toBe(1);
  });

  it("parses JSON templates", () => {
    const t = parseTemplate(JSON.stringify({ template_id: "t", version: "v1", steps: [{ step_id: 1, type: "agent" }] }), "t.json");
    expect(t.version).toBe("v1");
  });

  it("applies merge patches", () => {
    const base = parseTemplate(JSON.stringify({ template_id: "t", version: "v1", steps: [{ step_id: 1, type: "agent" }] }));
    const patched = applyTemplatePatch(base, { version: "v2" });
    expect(patched.version).toBe("v2");
  });
});

