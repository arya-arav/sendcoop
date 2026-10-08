// Browser-safe. An automation: what starts it (the trigger) and the steps a
// subscriber goes through (a graph, as React Flow draws it). The builder
// (D62) edits these; the engine (D63) walks them.

import type { SegmentRules } from "./segments";

export const TRIGGER_TYPES = [
  "joined_list",
  "tag_added",
  "date_field",
  "api_event",
  "converted",
  "clicked_no_conversion",
  "lead_status",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type AutomationTrigger =
  | { type: "joined_list"; listId: string }
  | { type: "tag_added"; tagId: string }
  /**
   * On a date in a custom date field, offset by days (negative: before). Yearly
   * matches the day and month (birthdays, anniversaries); otherwise the exact date.
   */
  | { type: "date_field"; field: string; offsetDays: number; yearly?: boolean }
  /** An event sent through the API, by name. */
  | { type: "api_event"; event: string }
  /** A conversion credited to the subscriber; optionally only above a value. */
  | { type: "converted"; minValue: number | null }
  /** Clicked a campaign's email but didn't convert within N hours. */
  | { type: "clicked_no_conversion"; campaignId: string | null; hours: number }
  /** A lead moved to this stage. */
  | { type: "lead_status"; stage: "new" | "qualified" | "sold" | "lost" };

export type WaitUnit = "minutes" | "hours" | "days";

export type EmailStep = {
  /** The campaign row (kind "automation") holding this email's content; made on first save. */
  campaignId: string | null;
  name: string;
  subject: string;
};
export type WaitStep = { amount: number; unit: WaitUnit };
export type ConditionStep =
  /** Did the subscriber open/click an email of this run (one step's, or any), or convert since the run began? */
  | { kind: "activity"; event: "opened" | "clicked" | "converted"; nodeId: string | null }
  /** Matches segment rules (fields, lists, tags, conversion fields) right now. */
  | { kind: "rules"; rules: SegmentRules }
  /** Is in a segment right now. */
  | { kind: "segment"; segmentId: string };
export type ActionStep =
  | { type: "add_tag" | "remove_tag"; tagId: string }
  | { type: "add_to_list" | "remove_from_list"; listId: string }
  | { type: "move_list"; fromListId: string; toListId: string }
  | { type: "update_field"; field: string; value: string }
  | { type: "webhook"; url: string };

export type AutomationNode =
  | { id: string; type: "trigger"; position: Point; data: Record<string, never> }
  | { id: string; type: "email"; position: Point; data: EmailStep }
  | { id: string; type: "wait"; position: Point; data: WaitStep }
  | { id: string; type: "condition"; position: Point; data: ConditionStep }
  | { id: string; type: "action"; position: Point; data: ActionStep }
  | { id: string; type: "exit"; position: Point; data: Record<string, never> };
export type NodeType = AutomationNode["type"];
type Point = { x: number; y: number };

export type AutomationEdge = {
  id: string;
  source: string;
  target: string;
  /** From a condition: which branch. */
  sourceHandle?: "yes" | "no" | null;
};

export type AutomationGraph = { nodes: AutomationNode[]; edges: AutomationEdge[] };

export const MAX_AUTOMATION_NODES = 100;
const UNIT_MS: Record<WaitUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
const MAX_WAIT_MS = 365 * 86_400_000;

export const waitMs = (step: WaitStep) => step.amount * UNIT_MS[step.unit];

/** A new automation: the trigger, one email, the end. */
export function starterGraph(): AutomationGraph {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      {
        id: "email-1",
        type: "email",
        position: { x: 0, y: 140 },
        data: { campaignId: null, name: "Email 1", subject: "" },
      },
      { id: "exit", type: "exit", position: { x: 0, y: 280 }, data: {} },
    ],
    edges: [
      { id: "e-trigger-email-1", source: "trigger", target: "email-1" },
      { id: "e-email-1-exit", source: "email-1", target: "exit" },
    ],
  };
}

/** Where a run goes after a step (a condition's branch picks the edge). */
export function nextNodeId(
  graph: AutomationGraph,
  nodeId: string,
  branch: "yes" | "no" | null = null,
): string | null {
  const out = graph.edges.filter((e) => e.source === nodeId);
  const edge = branch ? out.find((e) => e.sourceHandle === branch) : out[0];
  return edge?.target ?? null;
}

/**
 * What's wrong with an automation, or null. Drafts may be unfinished
 * (`activating` false): only the shape is checked. To go live, every step
 * must be complete: emails written, waits and conditions filled in.
 */
export function automationProblem(
  trigger: AutomationTrigger | null,
  graph: AutomationGraph,
  { activating = false }: { activating?: boolean } = {},
): string | null {
  const { nodes, edges } = graph;
  if (nodes.length > MAX_AUTOMATION_NODES) return `Use at most ${MAX_AUTOMATION_NODES} steps.`;
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return "Two steps have the same id.";
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) return "An automation has exactly one trigger.";
  const start = triggers[0]!.id;

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) return "A connection points to a missing step.";
    if (e.target === start) return "Nothing can lead back to the trigger.";
    if (e.source === e.target) return "A step can't lead to itself.";
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    const out = edges.filter((e) => e.source === node.id);
    if (node.type === "exit" && out.length > 0) return "Nothing comes after an exit.";
    if (node.type === "condition") {
      const yes = out.filter((e) => e.sourceHandle === "yes").length;
      const no = out.filter((e) => e.sourceHandle === "no").length;
      if (yes > 1 || no > 1 || out.length !== yes + no) {
        return "A condition has one Yes and one No path.";
      }
      if (activating && (yes === 0 || no === 0)) return "Connect both paths of every condition.";
    } else if (out.length > 1) {
      return `“${label(node)}” leads to two steps; use a condition to branch.`;
    }
  }

  // No loops: a run must always end.
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    if (state.get(id) === "visiting") return false;
    if (state.get(id) === "done") return true;
    state.set(id, "visiting");
    for (const e of edges.filter((x) => x.source === id)) if (!visit(e.target)) return false;
    state.set(id, "done");
    return true;
  };
  if (!visit(start)) return "The steps loop back on themselves; a run must always end.";

  if (!activating) return null;
  if (!trigger) return "Choose what starts the automation.";
  const triggerProblem = triggerIssue(trigger);
  if (triggerProblem) return triggerProblem;
  if (nodes.some((n) => !state.has(n.id))) return "Some steps aren't connected to the trigger.";
  if (!edges.some((e) => e.source === start)) return "Add a step after the trigger.";
  for (const node of nodes) {
    const issue = stepIssue(node, byId);
    if (issue) return issue;
  }
  return null;
}

function label(node: AutomationNode) {
  if (node.type === "email") return node.data.name || "Email";
  return {
    trigger: "Trigger",
    wait: "Wait",
    condition: "Condition",
    action: "Action",
    exit: "Exit",
  }[node.type];
}

function triggerIssue(t: AutomationTrigger): string | null {
  switch (t.type) {
    case "joined_list":
      return t.listId ? null : "Choose the list that starts the automation.";
    case "tag_added":
      return t.tagId ? null : "Choose the tag that starts the automation.";
    case "date_field":
      return t.field && Number.isInteger(t.offsetDays) && Math.abs(t.offsetDays) <= 365
        ? null
        : "Choose a date field, and an offset of up to 365 days.";
    case "api_event":
      return /^[\w.:-]{1,64}$/.test(t.event)
        ? null
        : "Name the event with letters, numbers, dots, dashes or underscores.";
    case "converted":
      return t.minValue === null || t.minValue >= 0 ? null : "The minimum value can't be negative.";
    case "clicked_no_conversion":
      return Number.isInteger(t.hours) && t.hours >= 1 && t.hours <= 24 * 90
        ? null
        : "Wait between 1 hour and 90 days for a conversion.";
    case "lead_status":
      return ["new", "qualified", "sold", "lost"].includes(t.stage) ? null : "Choose a lead stage.";
  }
}

function stepIssue(node: AutomationNode, byId: Map<string, AutomationNode>): string | null {
  switch (node.type) {
    case "email":
      if (!node.data.subject.trim()) return `Give “${label(node)}” a subject line.`;
      if (!node.data.campaignId) return `Write the content of “${label(node)}”.`;
      return null;
    case "wait": {
      const ms = Number.isFinite(node.data.amount) ? waitMs(node.data) : NaN;
      return ms >= 60_000 && ms <= MAX_WAIT_MS ? null : "Waits are from 1 minute to 365 days.";
    }
    case "condition": {
      const c = node.data;
      if (c.kind === "activity" && c.nodeId && byId.get(c.nodeId)?.type !== "email") {
        return "A condition checks an email step that no longer exists.";
      }
      if (c.kind === "rules" && c.rules.conditions.length === 0) return "Fill in every condition.";
      if (c.kind === "segment" && !c.segmentId) return "Choose the segment a condition checks.";
      return null;
    }
    case "action": {
      const a = node.data;
      if ((a.type === "add_tag" || a.type === "remove_tag") && !a.tagId) return "Choose a tag.";
      if ((a.type === "add_to_list" || a.type === "remove_from_list") && !a.listId) {
        return "Choose a list.";
      }
      if (a.type === "move_list" && (!a.fromListId || !a.toListId || a.fromListId === a.toListId)) {
        return "Choose two different lists to move between.";
      }
      if (a.type === "update_field" && !a.field) return "Choose the field to update.";
      if (a.type === "webhook" && !/^https:\/\/[^\s]+$/i.test(a.url)) {
        return "Webhooks go to an https:// address.";
      }
      return null;
    }
    default:
      return null;
  }
}
