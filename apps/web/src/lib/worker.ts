import "server-only";

/**
 * Nudges the GPU worker to start a job now. Fire-and-forget on purpose: the worker also sweeps
 * the queue on a schedule, so a failed nudge delays a job by a couple of minutes rather than
 * stranding it — and the user's request must never wait on this call.
 */
export async function notifyWorker(coverId: string): Promise<void> {
  const url = process.env.WORKER_ENQUEUE_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!url || !secret) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverId, secret }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // The sweeper is the backstop; nothing here is worth failing the user's request over.
  }
}
