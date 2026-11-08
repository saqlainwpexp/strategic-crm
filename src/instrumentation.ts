// Runs once when the Next.js server starts: starts the background email engine and the outreach-log follow-up ticker.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEmailWorker } = await import("./server/email/worker");
    startEmailWorker();
    const { startLogWorker } = await import("./server/outreach-log/worker");
    startLogWorker();
  }
}
