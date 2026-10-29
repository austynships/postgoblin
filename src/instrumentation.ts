export async function register() {
  // On Vercel, /api/cron/publish drives publishing; locally, poll in-process.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startLocalScheduler } = await import("./lib/scheduler");
    startLocalScheduler();
  }
}
