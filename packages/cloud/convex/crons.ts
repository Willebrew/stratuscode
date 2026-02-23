import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Recover sessions stuck in "running" due to transient action failures.
// Runs every 2 minutes, uses the by_status index to find only running
// sessions, and checks the streaming_state heartbeat before resetting.
// Cost: one mutation invocation every 2 minutes (no-op when nothing is stuck).
crons.interval(
  "sweep stale sessions",
  { minutes: 2 },
  internal.sessions.sweepStaleSessions,
);

export default crons;
