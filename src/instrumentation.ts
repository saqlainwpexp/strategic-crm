// Runs once when the Next.js server starts: starts the background email engine.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEmailWorker } = await import("./server/email/worker");
    startEmailWorker();
  }
}
