import { describe, expect, it } from "vitest";
import { AUTOMATION_TEMPLATES, templateGraph } from "./automation-templates";
import { automationProblem } from "./automations";

describe("automation templates", () => {
  it.each(AUTOMATION_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s is a valid flow with every email written",
    (_name, template) => {
      const { graph, emails } = templateGraph(template);
      expect(automationProblem(template.trigger, graph)).toBeNull();
      const emailSteps = graph.nodes.filter((n) => n.type === "email");
      expect(emailSteps.length).toBeGreaterThan(0);
      for (const step of emailSteps) {
        expect(emails[step.id]?.html).toMatch(/^<html>/);
        expect(emails[step.id]?.subject).toBeTruthy();
      }
      // Every condition has both of its paths
      for (const c of graph.nodes.filter((n) => n.type === "condition")) {
        const handles = graph.edges.filter((e) => e.source === c.id).map((e) => e.sourceHandle);
        expect(handles.sort()).toEqual(["no", "yes"]);
      }
    },
  );

  it("has the five ready-made flows", () => {
    expect(AUTOMATION_TEMPLATES.map((t) => t.id)).toEqual([
      "welcome",
      "affiliate-bridge",
      "abandoned-cart",
      "post-purchase",
      "lead-nurture",
    ]);
  });
});
