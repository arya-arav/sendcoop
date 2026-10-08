"use client";

import {
  type ActionStep,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
  type AutomationTrigger,
  automationProblem,
  type ConditionStep,
  type NodeType,
  type WaitStep,
} from "@sendcoop/db/automations";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Clock,
  GitBranch,
  Mail,
  Pause,
  Play,
  Save,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  activateAutomationAction,
  editAutomationEmailAction,
  pauseAutomationAction,
  saveAutomationAction,
} from "../actions";

type Option = { id: string; name: string };
export type BuilderContext = {
  lists: Option[];
  tags: Option[];
  segments: Option[];
  campaigns: Option[];
  /** Custom fields: date ones for date triggers, all for "update field". */
  fields: { key: string; label: string; type: string }[];
};

/** Node data on the canvas: the step's own data, plus its summary line. */
type StepData = Record<string, unknown> & { summary?: string; label?: string };
type FlowNode = Node<StepData, NodeType>;

const ICONS: Record<NodeType, typeof Mail> = {
  trigger: Zap,
  email: Mail,
  wait: Clock,
  condition: GitBranch,
  action: Play,
  exit: Square,
};
const TITLES: Record<NodeType, string> = {
  trigger: "Trigger",
  email: "Email",
  wait: "Wait",
  condition: "Condition",
  action: "Action",
  exit: "Exit",
};

const nameOf = (options: Option[], id: string | null | undefined) =>
  options.find((o) => o.id === id)?.name ?? "…";

function describeTrigger(t: AutomationTrigger, c: BuilderContext) {
  switch (t.type) {
    case "joined_list":
      return t.listId ? `Joins ${nameOf(c.lists, t.listId)}` : "Choose what starts it";
    case "tag_added":
      return `Tagged ${nameOf(c.tags, t.tagId)}`;
    case "date_field":
      return `${t.offsetDays === 0 ? "On" : `${Math.abs(t.offsetDays)} days ${t.offsetDays < 0 ? "before" : "after"}`} ${c.fields.find((f) => f.key === t.field)?.label ?? "a date"}`;
    case "api_event":
      return `API event “${t.event}”`;
    case "converted":
      return t.minValue ? `Converts (${t.minValue}+)` : "Converts";
    case "clicked_no_conversion":
      return `Clicks ${t.campaignId ? nameOf(c.campaigns, t.campaignId) : "a campaign"}, no sale in ${t.hours} h`;
    case "lead_status":
      return `Lead becomes ${t.stage}`;
  }
}

function describe(node: AutomationNode, nodes: AutomationNode[], c: BuilderContext): string {
  switch (node.type) {
    case "email":
      return node.data.subject || "No subject yet";
    case "wait":
      return `${node.data.amount} ${node.data.amount === 1 ? node.data.unit.replace(/s$/, "") : node.data.unit}`;
    case "condition": {
      const d = node.data;
      if (d.kind === "segment") return `In segment ${nameOf(c.segments, d.segmentId)}?`;
      if (d.kind === "activity") {
        const target = nodes.find((n) => n.id === d.nodeId);
        const what = target?.type === "email" ? `“${target.data.name}”` : "any email";
        return d.event === "converted"
          ? "Converted since it began?"
          : `${d.event === "opened" ? "Opened" : "Clicked"} ${what}?`;
      }
      return "Matches the rules?";
    }
    case "action": {
      const a = node.data;
      if (a.type === "add_tag") return `Add tag ${nameOf(c.tags, a.tagId)}`;
      if (a.type === "remove_tag") return `Remove tag ${nameOf(c.tags, a.tagId)}`;
      if (a.type === "add_to_list") return `Add to ${nameOf(c.lists, a.listId)}`;
      if (a.type === "remove_from_list") return `Remove from ${nameOf(c.lists, a.listId)}`;
      if (a.type === "move_list") return `Move to ${nameOf(c.lists, a.toListId)}`;
      if (a.type === "update_field") return `Set ${a.field || "a field"}`;
      return "Call a webhook";
    }
    case "exit":
      return "The end";
    default:
      return "";
  }
}

function StepNode({ data, type, selected }: NodeProps<FlowNode>) {
  const Icon = ICONS[type];
  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-sm",
        selected && "ring-2 ring-ring",
      )}
    >
      {type !== "trigger" && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {type === "email" ? (data as { name?: string }).name || "Email" : TITLES[type]}
      </div>
      <p className="truncate text-sm font-medium">{data.summary}</p>
      {type === "condition" ? (
        <>
          <Handle type="source" id="yes" position={Position.Bottom} style={{ left: "30%" }} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: "70%" }} />
          <div className="mt-1 flex justify-between px-6 text-[10px] text-muted-foreground">
            <span>Yes</span>
            <span>No</span>
          </div>
        </>
      ) : (
        type !== "exit" && <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const nodeTypes = {
  trigger: StepNode,
  email: StepNode,
  wait: StepNode,
  condition: StepNode,
  action: StepNode,
  exit: StepNode,
};

function toFlow(graph: AutomationGraph): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as StepData,
      deletable: n.type !== "trigger",
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      label: e.sourceHandle ? (e.sourceHandle === "yes" ? "Yes" : "No") : undefined,
    })),
  };
}

function toGraph(nodes: FlowNode[], edges: Edge[]): AutomationGraph {
  return {
    nodes: nodes.map(({ id, type, position, data }) => {
      const rest: Record<string, unknown> = { ...data };
      delete rest.summary;
      delete rest.label;
      return {
        id,
        type: type!,
        position: { x: Math.round(position.x), y: Math.round(position.y) },
        data: rest,
      } as AutomationNode;
    }),
    edges: edges.map((e): AutomationEdge => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle as "yes" | "no" | null | undefined) ?? null,
    })),
  };
}

/** A step id unique within the automation. */
const newStepId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 10)}`;

const DEFAULTS: Record<Exclude<NodeType, "trigger">, () => AutomationNode["data"]> = {
  email: () => ({ campaignId: null, name: "Email", subject: "" }),
  wait: () => ({ amount: 1, unit: "days" }) satisfies WaitStep,
  condition: () => ({ kind: "activity", event: "clicked", nodeId: null }) satisfies ConditionStep,
  action: () => ({ type: "add_tag", tagId: "" }) satisfies ActionStep,
  exit: () => ({}),
};

export function FlowBuilder({
  slug,
  automationId,
  initialName,
  initialTrigger,
  initialGraph,
  status,
  context,
}: {
  slug: string;
  automationId: string;
  initialName: string;
  initialTrigger: AutomationTrigger;
  initialGraph: AutomationGraph;
  status: "draft" | "active" | "paused";
  context: BuilderContext;
}) {
  const start = useMemo(() => toFlow(initialGraph), [initialGraph]);
  const [name, setName] = useState(initialName);
  const [trigger, setTrigger] = useState(initialTrigger);
  const [nodes, setNodes] = useState<FlowNode[]>(start.nodes);
  const [edges, setEdges] = useState<Edge[]>(start.edges);
  const [selectedId, setSelectedId] = useState<string | null>("trigger");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = status === "active";

  const graph = toGraph(nodes, edges);
  const shown: FlowNode[] = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      summary:
        n.type === "trigger"
          ? describeTrigger(trigger, context)
          : describe(
              graph.nodes.find((g) => g.id === n.id)!,
              graph.nodes,
              context,
            ),
    },
    ariaLabel: `${TITLES[n.type!]} step`,
  }));
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const readiness = automationProblem(trigger, graph, { activating: true });

  function changed() {
    setDirty(true);
    setMessage(null);
  }
  function updateData(id: string, data: AutomationNode["data"]) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: data as StepData } : n)));
    changed();
  }
  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    const kept = changes.filter((c) => !(c.type === "remove" && c.id === "trigger"));
    setNodes((ns) => applyNodeChanges(kept, ns));
    if (kept.some((c) => c.type !== "select" && c.type !== "dimensions")) changed();
  }
  function onEdgesChange(changes: EdgeChange[]) {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type !== "select")) changed();
  }
  function onConnect(connection: Connection) {
    setEdges((es) =>
      addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.sourceHandle ?? "next"}-${connection.target}`,
          label: connection.sourceHandle
            ? connection.sourceHandle === "yes"
              ? "Yes"
              : "No"
            : undefined,
        },
        // A step (or a condition's branch) leads to one step: reconnecting replaces it.
        es.filter(
          (e) =>
            !(
              e.source === connection.source &&
              (e.sourceHandle ?? null) === (connection.sourceHandle ?? null)
            ),
        ),
      ),
    );
    changed();
  }

  /**
   * Adds a step after the selected one. Between a step and the next, it's
   * inserted (A → new → B, the steps below moving down); from a condition,
   * it takes the first free branch; otherwise it stands alone, to connect.
   */
  function addStep(type: Exclude<NodeType, "trigger">) {
    const from = graph.nodes.find((n) => n.id === selectedId) ?? graph.nodes.at(-1)!;
    const fromNode = nodes.find((n) => n.id === from.id)!;
    const count = nodes.filter((n) => n.type === type).length + 1;
    const id = newStepId(type);
    const data = DEFAULTS[type]();
    if (type === "email") (data as { name: string }).name = `Email ${count}`;
    const out = edges.filter((e) => e.source === from.id);
    const handle =
      from.type === "condition"
        ? (["yes", "no"] as const).find((h) => !out.some((e) => e.sourceHandle === h))
        : from.type === "exit"
          ? undefined
          : null;
    // The step that followed, when inserting in between (not after an exit step).
    const following = handle === null && out.length === 1 && type !== "exit" ? out[0]! : null;
    const below = fromNode.position.y;

    setNodes((ns) => [
      ...ns.map((n) => ({
        ...n,
        selected: false,
        position:
          following && n.position.y > below ? { ...n.position, y: n.position.y + 140 } : n.position,
      })),
      {
        id,
        type,
        // A condition's branches go to either side, clear of the path below it.
        position: {
          x: fromNode.position.x + (handle === "no" ? 280 : handle === "yes" ? -280 : 0),
          y: below + 140,
        },
        data: data as StepData,
        deletable: true,
        selected: true,
      },
    ]);
    if (handle !== undefined && (handle !== null || out.length === 0 || following)) {
      setEdges((es) => [
        ...es.filter((e) => e !== following),
        {
          id: `e-${from.id}-${handle ?? "next"}-${id}`,
          source: from.id,
          target: id,
          sourceHandle: handle,
          label: handle ? (handle === "yes" ? "Yes" : "No") : undefined,
        },
        ...(following
          ? [
              {
                // A condition carries on along its Yes path.
                id: `e-${id}-${type === "condition" ? "yes" : "next"}-${following.target}`,
                source: id,
                target: following.target,
                sourceHandle: type === "condition" ? ("yes" as const) : null,
                label: type === "condition" ? "Yes" : undefined,
              },
            ]
          : []),
      ]);
    }
    setSelectedId(id);
    changed();
  }

  function removeSelected() {
    if (!selectedId || selectedId === "trigger") return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId("trigger");
    changed();
  }

  function save(then?: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      const result = await saveAutomationAction(slug, automationId, { name, trigger, graph });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      setMessage("Saved.");
      if (then) {
        const next = (await then()) as { ok: false; error: string } | undefined;
        if (next && !next.ok) setError(next.error);
      }
    });
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[600px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/w/${slug}/automations`}
          aria-label="Back to automations"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft />
        </Link>
        <Input
          aria-label="Automation name"
          value={name}
          maxLength={100}
          disabled={locked}
          className="max-w-xs font-medium"
          onChange={(e) => {
            setName(e.target.value);
            changed();
          }}
        />
        <span className="text-sm text-muted-foreground capitalize">{status}</span>
        <p role="status" className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : message}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm text-muted-foreground">Add</span>
          {(["email", "wait", "condition", "action", "exit"] as const).map((type) => {
            const Icon = ICONS[type];
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => addStep(type)}
                aria-label={`Add ${TITLES[type].toLowerCase()} step`}
              >
                <Icon />
                {TITLES[type]}
              </Button>
            );
          })}
          <Button
            variant="outline"
            disabled={pending || locked}
            onClick={() => save()}
            className="ml-2"
          >
            <Save />
            {pending ? "Saving…" : "Save"}
          </Button>
          {locked ? (
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await pauseAutomationAction(slug, automationId);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              <Pause />
              Pause
            </Button>
          ) : (
            <Button
              disabled={pending || readiness !== null}
              title={readiness ?? undefined}
              onClick={() => save(() => activateAutomationAction(slug, automationId))}
            >
              <Play />
              {status === "paused" ? "Resume" : "Go live"}
            </Button>
          )}
        </div>
      </div>
      {locked && (
        <p className="text-sm text-muted-foreground">
          This automation is live. Pause it to change its steps.
        </p>
      )}
      <FormError message={error} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="min-h-80 overflow-hidden rounded-lg border">
          <ReactFlow
            nodes={shown}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={locked ? undefined : onNodesChange}
            onEdgesChange={locked ? undefined : onEdgesChange}
            onConnect={locked ? undefined : onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="grid content-start gap-4 overflow-y-auto">
          <nav aria-label="Steps" className="grid gap-1">
            <h2 className="text-sm font-medium">Steps</h2>
            <ol className="grid gap-1">
              {graph.nodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    aria-current={n.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(n.id)}
                    className={cn(
                      "w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-muted",
                      n.id === selectedId && "bg-muted font-medium",
                    )}
                  >
                    {n.type === "email" ? n.data.name || "Email" : TITLES[n.type]}:{" "}
                    {n.type === "trigger"
                      ? describeTrigger(trigger, context)
                      : describe(n, graph.nodes, context)}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {selected && (
            <section aria-label="Selected step" className="grid gap-3 rounded-lg border p-3">
              <h2 className="text-sm font-medium">
                {selected.type === "trigger" ? "What starts it" : TITLES[selected.type]}
              </h2>
              <fieldset disabled={locked} className="grid gap-3">
                {selected.type === "trigger" && (
                  <TriggerForm
                    trigger={trigger}
                    context={context}
                    onChange={(t) => {
                      setTrigger(t);
                      changed();
                    }}
                  />
                )}
                {selected.type === "email" && (
                  <>
                    <Field label="Step name">
                      <Input
                        id="step-name"
                        value={selected.data.name}
                        maxLength={80}
                        onChange={(e) =>
                          updateData(selected.id, { ...selected.data, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Subject line">
                      <Input
                        id="step-subject"
                        value={selected.data.subject}
                        maxLength={200}
                        onChange={(e) =>
                          updateData(selected.id, { ...selected.data, subject: e.target.value })
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        save(() => editAutomationEmailAction(slug, automationId, selected.id))
                      }
                    >
                      <Mail />
                      {selected.data.campaignId ? "Edit the email" : "Write the email"}
                    </Button>
                    {!selected.data.campaignId && (
                      <p className="text-xs text-muted-foreground">
                        Saves the automation, then opens the email editor.
                      </p>
                    )}
                  </>
                )}
                {selected.type === "wait" && (
                  <div className="flex gap-2">
                    <Field label="Wait for">
                      <Input
                        id="wait-amount"
                        type="number"
                        min={1}
                        max={525600}
                        value={selected.data.amount}
                        onChange={(e) =>
                          updateData(selected.id, {
                            ...selected.data,
                            amount: Math.max(0, Math.trunc(Number(e.target.value))),
                          })
                        }
                      />
                    </Field>
                    <Field label="Unit">
                      <NativeSelect
                        id="wait-unit"
                        value={selected.data.unit}
                        onChange={(e) =>
                          updateData(selected.id, {
                            ...selected.data,
                            unit: e.target.value as WaitStep["unit"],
                          })
                        }
                      >
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </NativeSelect>
                    </Field>
                  </div>
                )}
                {selected.type === "condition" && (
                  <ConditionForm
                    step={selected.data}
                    emails={graph.nodes.flatMap((n) =>
                      n.type === "email" ? [{ id: n.id, name: n.data.name }] : [],
                    )}
                    context={context}
                    onChange={(data) => updateData(selected.id, data)}
                  />
                )}
                {selected.type === "action" && (
                  <ActionForm
                    step={selected.data}
                    context={context}
                    onChange={(data) => updateData(selected.id, data)}
                  />
                )}
                {selected.type === "exit" && (
                  <p className="text-sm text-muted-foreground">The run ends here.</p>
                )}
              </fieldset>
              {selected.type !== "trigger" && !locked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={removeSelected}
                >
                  <Trash2 />
                  Remove step
                </Button>
              )}
            </section>
          )}

          <p className="text-xs text-muted-foreground" role="note">
            {readiness ? `Before it can go live: ${readiness}` : "Ready to go live."}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{ id?: string }>;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={children.props.id}>{label}</Label>
      {children}
    </div>
  );
}

function OptionSelect({
  id,
  options,
  value,
  onChange,
  empty,
}: {
  id: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  empty: string;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </NativeSelect>
  );
}

const TRIGGER_LABELS: Record<AutomationTrigger["type"], string> = {
  joined_list: "Joins a list",
  tag_added: "Gets a tag",
  date_field: "A date in their profile",
  api_event: "An event from the API",
  converted: "Buys or converts",
  clicked_no_conversion: "Clicks but doesn't buy",
  lead_status: "A lead's stage changes",
};

function TriggerForm({
  trigger,
  context,
  onChange,
}: {
  trigger: AutomationTrigger;
  context: BuilderContext;
  onChange: (t: AutomationTrigger) => void;
}) {
  function pick(type: AutomationTrigger["type"]) {
    const fresh: Record<AutomationTrigger["type"], AutomationTrigger> = {
      joined_list: { type: "joined_list", listId: "" },
      tag_added: { type: "tag_added", tagId: "" },
      date_field: { type: "date_field", field: "", offsetDays: 0 },
      api_event: { type: "api_event", event: "" },
      converted: { type: "converted", minValue: null },
      clicked_no_conversion: { type: "clicked_no_conversion", campaignId: null, hours: 48 },
      lead_status: { type: "lead_status", stage: "qualified" },
    };
    onChange(fresh[type]);
  }
  return (
    <>
      <Field label="Starts when someone">
        <NativeSelect
          id="trigger-type"
          value={trigger.type}
          onChange={(e) => pick(e.target.value as AutomationTrigger["type"])}
        >
          {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {trigger.type === "joined_list" && (
        <Field label="List">
          <OptionSelect
            id="trigger-list"
            options={context.lists}
            value={trigger.listId}
            empty="Choose a list"
            onChange={(listId) => onChange({ ...trigger, listId })}
          />
        </Field>
      )}
      {trigger.type === "tag_added" && (
        <Field label="Tag">
          <OptionSelect
            id="trigger-tag"
            options={context.tags}
            value={trigger.tagId}
            empty="Choose a tag"
            onChange={(tagId) => onChange({ ...trigger, tagId })}
          />
        </Field>
      )}
      {trigger.type === "date_field" && (
        <>
          <Field label="Date field">
            <OptionSelect
              id="trigger-field"
              options={context.fields
                .filter((f) => f.type === "date")
                .map((f) => ({ id: f.key, name: f.label }))}
              value={trigger.field}
              empty="Choose a date field"
              onChange={(field) => onChange({ ...trigger, field })}
            />
          </Field>
          <Field label="Days after (negative: before)">
            <Input
              id="trigger-offset"
              type="number"
              min={-365}
              max={365}
              value={trigger.offsetDays}
              onChange={(e) =>
                onChange({ ...trigger, offsetDays: Math.trunc(Number(e.target.value)) })
              }
            />
          </Field>
        </>
      )}
      {trigger.type === "api_event" && (
        <Field label="Event name">
          <Input
            id="trigger-event"
            value={trigger.event}
            maxLength={64}
            placeholder="e.g. trial_started"
            onChange={(e) => onChange({ ...trigger, event: e.target.value.trim() })}
          />
        </Field>
      )}
      {trigger.type === "converted" && (
        <Field label="Only from this value (optional)">
          <Input
            id="trigger-min"
            type="number"
            min={0}
            value={trigger.minValue ?? ""}
            onChange={(e) =>
              onChange({
                ...trigger,
                minValue: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
      )}
      {trigger.type === "clicked_no_conversion" && (
        <>
          <Field label="Campaign">
            <OptionSelect
              id="trigger-campaign"
              options={context.campaigns}
              value={trigger.campaignId ?? ""}
              empty="Any campaign"
              onChange={(campaignId) => onChange({ ...trigger, campaignId: campaignId || null })}
            />
          </Field>
          <Field label="No sale within (hours)">
            <Input
              id="trigger-hours"
              type="number"
              min={1}
              max={2160}
              value={trigger.hours}
              onChange={(e) => onChange({ ...trigger, hours: Math.trunc(Number(e.target.value)) })}
            />
          </Field>
        </>
      )}
      {trigger.type === "lead_status" && (
        <Field label="Stage">
          <NativeSelect
            id="trigger-stage"
            value={trigger.stage}
            onChange={(e) =>
              onChange({
                ...trigger,
                stage: e.target.value as "new" | "qualified" | "sold" | "lost",
              })
            }
          >
            <option value="new">New</option>
            <option value="qualified">Qualified</option>
            <option value="sold">Sold</option>
            <option value="lost">Lost</option>
          </NativeSelect>
        </Field>
      )}
    </>
  );
}

function ConditionForm({
  step,
  emails,
  context,
  onChange,
}: {
  step: ConditionStep;
  emails: Option[];
  context: BuilderContext;
  onChange: (data: ConditionStep) => void;
}) {
  return (
    <>
      <Field label="Check">
        <NativeSelect
          id="condition-kind"
          value={step.kind === "activity" ? step.event : step.kind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "segment") onChange({ kind: "segment", segmentId: "" });
            else
              onChange({
                kind: "activity",
                event: v as "opened" | "clicked" | "converted",
                nodeId: null,
              });
          }}
        >
          <option value="opened">Opened an email</option>
          <option value="clicked">Clicked in an email</option>
          <option value="converted">Bought or converted</option>
          <option value="segment">Is in a segment</option>
        </NativeSelect>
      </Field>
      {step.kind === "activity" && step.event !== "converted" && (
        <Field label="Which email">
          <OptionSelect
            id="condition-email"
            options={emails}
            value={step.nodeId ?? ""}
            empty="Any email in this automation"
            onChange={(nodeId) => onChange({ ...step, nodeId: nodeId || null })}
          />
        </Field>
      )}
      {step.kind === "segment" && (
        <Field label="Segment">
          <OptionSelect
            id="condition-segment"
            options={context.segments}
            value={step.segmentId}
            empty="Choose a segment"
            onChange={(segmentId) => onChange({ kind: "segment", segmentId })}
          />
        </Field>
      )}
      <p className="text-xs text-muted-foreground">Yes and No each lead to their own step.</p>
    </>
  );
}

const ACTION_LABELS: Record<ActionStep["type"], string> = {
  add_tag: "Add a tag",
  remove_tag: "Remove a tag",
  add_to_list: "Add to a list",
  remove_from_list: "Remove from a list",
  move_list: "Move to another list",
  update_field: "Update a field",
  webhook: "Call a webhook",
};

function ActionForm({
  step,
  context,
  onChange,
}: {
  step: ActionStep;
  context: BuilderContext;
  onChange: (data: ActionStep) => void;
}) {
  function pick(type: ActionStep["type"]) {
    if (type === "add_tag" || type === "remove_tag") onChange({ type, tagId: "" });
    else if (type === "add_to_list" || type === "remove_from_list") onChange({ type, listId: "" });
    else if (type === "move_list") onChange({ type, fromListId: "", toListId: "" });
    else if (type === "update_field") onChange({ type, field: "", value: "" });
    else onChange({ type: "webhook", url: "https://" });
  }
  return (
    <>
      <Field label="Do">
        <NativeSelect
          id="action-type"
          value={step.type}
          onChange={(e) => pick(e.target.value as ActionStep["type"])}
        >
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {(step.type === "add_tag" || step.type === "remove_tag") && (
        <Field label="Tag">
          <OptionSelect
            id="action-tag"
            options={context.tags}
            value={step.tagId}
            empty="Choose a tag"
            onChange={(tagId) => onChange({ ...step, tagId })}
          />
        </Field>
      )}
      {(step.type === "add_to_list" || step.type === "remove_from_list") && (
        <Field label="List">
          <OptionSelect
            id="action-list"
            options={context.lists}
            value={step.listId}
            empty="Choose a list"
            onChange={(listId) => onChange({ ...step, listId })}
          />
        </Field>
      )}
      {step.type === "move_list" && (
        <>
          <Field label="From list">
            <OptionSelect
              id="action-from"
              options={context.lists}
              value={step.fromListId}
              empty="Choose a list"
              onChange={(fromListId) => onChange({ ...step, fromListId })}
            />
          </Field>
          <Field label="To list">
            <OptionSelect
              id="action-to"
              options={context.lists}
              value={step.toListId}
              empty="Choose a list"
              onChange={(toListId) => onChange({ ...step, toListId })}
            />
          </Field>
        </>
      )}
      {step.type === "update_field" && (
        <>
          <Field label="Field">
            <OptionSelect
              id="action-field"
              options={context.fields.map((f) => ({ id: f.key, name: f.label }))}
              value={step.field}
              empty="Choose a field"
              onChange={(field) => onChange({ ...step, field })}
            />
          </Field>
          <Field label="New value">
            <Input
              id="action-value"
              value={step.value}
              maxLength={500}
              onChange={(e) => onChange({ ...step, value: e.target.value })}
            />
          </Field>
        </>
      )}
      {step.type === "webhook" && (
        <Field label="Webhook URL">
          <Input
            id="action-url"
            type="url"
            value={step.url}
            maxLength={2000}
            onChange={(e) => onChange({ ...step, url: e.target.value.trim() })}
          />
        </Field>
      )}
    </>
  );
}
