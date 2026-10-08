import { describe, expect, it } from "vitest";
import {
  type AutomationGraph,
  type AutomationNode,
  type AutomationTrigger,
  automationProblem,
  nextNodeId,
  starterGraph,
} from "./automations";

const at = { x: 0, y: 0 };
const trigger: AutomationTrigger = { type: "joined_list", listId: "list-1" };
const email = (id: string, ready = true): AutomationNode => ({
  id,
  type: "email",
  position: at,
  data: { campaignId: ready ? `c-${id}` : null, name: id, subject: ready ? "Hi" : "" },
});
const graph = (nodes: AutomationNode[], edges: [string, string, ("yes" | "no")?][]) =>
  ({
    nodes: [{ id: "trigger", type: "trigger", position: at, data: {} }, ...nodes],
    edges: edges.map(([source, target, sourceHandle], i) => ({
      id: `e${i}`,
      source,
      target,
      sourceHandle,
    })),
  }) as AutomationGraph;

describe("automationProblem", () => {
  it("accepts the starter as a draft, and asks for its email before going live", () => {
    expect(automationProblem(null, starterGraph())).toBeNull();
    expect(automationProblem(trigger, starterGraph(), { activating: true })).toBe(
      "Give “Email 1” a subject line.",
    );
  });

  it("accepts a complete flow with a wait and a condition", () => {
    const g = graph(
      [
        email("welcome"),
        { id: "wait", type: "wait", position: at, data: { amount: 2, unit: "days" } },
        {
          id: "check",
          type: "condition",
          position: at,
          data: { kind: "activity", event: "clicked", nodeId: "welcome" },
        },
        email("nudge"),
        { id: "tag", type: "action", position: at, data: { type: "add_tag", tagId: "t1" } },
      ],
      [
        ["trigger", "welcome"],
        ["welcome", "wait"],
        ["wait", "check"],
        ["check", "tag", "yes"],
        ["check", "nudge", "no"],
      ],
    );
    expect(automationProblem(trigger, g, { activating: true })).toBeNull();
    expect(nextNodeId(g, "check", "no")).toBe("nudge");
    expect(nextNodeId(g, "welcome")).toBe("wait");
    expect(nextNodeId(g, "tag")).toBeNull();
  });

  it("refuses loops, branches without a condition, and edges into the trigger", () => {
    expect(
      automationProblem(
        trigger,
        graph(
          [email("a"), email("b")],
          [
            ["trigger", "a"],
            ["a", "b"],
            ["b", "a"],
          ],
        ),
      ),
    ).toMatch(/loop/);
    expect(
      automationProblem(
        trigger,
        graph(
          [email("a"), email("b")],
          [
            ["trigger", "a"],
            ["trigger", "b"],
          ],
        ),
      ),
    ).toMatch(/use a condition to branch/);
    expect(automationProblem(trigger, graph([email("a")], [["a", "trigger"]]))).toMatch(/trigger/);
  });

  it("checks steps and the trigger before going live", () => {
    const live = (nodes: AutomationNode[], t: AutomationTrigger = trigger) =>
      automationProblem(
        t,
        graph(
          nodes,
          nodes.map((n, i) => [i ? nodes[i - 1]!.id : "trigger", n.id]),
        ),
        {
          activating: true,
        },
      );
    expect(
      live([{ id: "w", type: "wait", position: at, data: { amount: 0, unit: "days" } }]),
    ).toMatch(/1 minute to 365 days/);
    expect(
      live([{ id: "x", type: "action", position: at, data: { type: "webhook", url: "http://x" } }]),
    ).toMatch(/https/);
    expect(live([email("a")], { type: "api_event", event: "bad event!" })).toMatch(
      /Name the event/,
    );
    expect(live([email("a", false)])).toMatch(/subject/);
    // A step nothing leads to
    expect(
      automationProblem(trigger, graph([email("a"), email("lost")], [["trigger", "a"]]), {
        activating: true,
      }),
    ).toMatch(/aren't connected/);
  });

  it("needs both paths of a condition to go live", () => {
    const g = graph(
      [
        { id: "c", type: "condition", position: at, data: { kind: "segment", segmentId: "s" } },
        email("a"),
      ],
      [
        ["trigger", "c"],
        ["c", "a", "yes"],
      ],
    );
    expect(automationProblem(trigger, g)).toBeNull();
    expect(automationProblem(trigger, g, { activating: true })).toMatch(/both paths/);
  });
});
