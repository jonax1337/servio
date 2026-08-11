// Next.js runs `register()` once when a server instance boots (before it serves
// requests). We use it to start the in-process scheduler (inbound mail poll, and
// later the sync runner). Node runtime only — the Edge runtime has no sockets.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./lib/scheduler");
  await startScheduler();
}
