import {
  advanceAutomationRun,
  dueAutomationRuns,
  processAutomationEvents,
  pruneAutomationEvents,
  startDateTriggeredRuns,
} from "@sendcoop/db";
import { enqueueAutomationRun, enqueueSendBatches } from "@sendcoop/queue";

/**
 * Moves a run along (D63): every step that can go now, an email handed to
 * the send queue as it comes, until the run waits or ends. A wait queues
 * the next go for when it's over.
 */
export async function processAutomationRun(
  runId: string,
  {
    now = () => new Date(),
    send = enqueueSendBatches,
  }: { now?: () => Date; send?: typeof enqueueSendBatches } = {},
) {
  const sent: string[] = [];
  for (let i = 0; i < 50; i++) {
    const step = await advanceAutomationRun(runId, now());
    if (step.state === "email") {
      await send([
        {
          campaignId: step.campaignId,
          workspaceId: step.workspaceId,
          messageIds: [step.messageId],
        },
      ]);
      sent.push(step.messageId);
      continue;
    }
    if (step.state === "webhook") {
      // Calling webhooks arrives with the other actions (D67).
      continue;
    }
    if (step.state === "waiting") {
      await enqueueAutomationRun(runId, { at: step.until, key: `wait-${step.until.getTime()}` });
    }
    return { ...step, sent };
  }
  return { state: "idle" as const, sent };
}

/** The sweeper: runs due now that no job is carrying. */
export async function sweepAutomationRuns() {
  const due = await dueAutomationRuns();
  // A key per minute: an earlier job for the same run doesn't swallow this one.
  const minute = Math.floor(Date.now() / 60_000);
  for (const run of due) await enqueueAutomationRun(run.id, { key: `sweep-${minute}` });
  return due.length;
}

/** New events: start what they trigger, and move the new runs along. */
export async function startTriggeredRuns() {
  let total = 0;
  for (let round = 0; round < 10; round++) {
    const started = await processAutomationEvents(500);
    for (const runId of started) await enqueueAutomationRun(runId);
    total += started.length;
    if (started.length === 0) break;
  }
  return total;
}

/** Hourly: date triggers, and old events cleared away. */
export async function startDateRuns() {
  const started = await startDateTriggeredRuns();
  for (const runId of started) await enqueueAutomationRun(runId);
  await pruneAutomationEvents();
  return started.length;
}
