"use node";
import { Sandbox } from "@vercel/sandbox";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function getSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId || !teamId) {
    throw new Error("Missing VERCEL_TOKEN, VERCEL_PROJECT_ID, or VERCEL_TEAM_ID");
  }
  return { token, projectId, teamId };
}

/**
 * Delete a session and all associated data (messages, events, todos, attachments, streaming state, agent state).
 * Also stops any running sandbox and cleans up snapshots.
 * Called from the frontend sidebar delete button.
 */
export const deleteSession = action({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    // Fetch session to get sandbox/snapshot IDs before purging
    const session = await ctx.runQuery(internal.sessions.getInternal, { id: args.id });

    // Stop running sandbox if one exists
    if (session?.sandboxId) {
      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId: session.sandboxId });
        if (sandbox.status === "running") {
          await sandbox.stop();
          console.log(`[deleteSession] Stopped sandbox ${session.sandboxId}`);
        }
      } catch (e) {
        // Sandbox may already be gone — that's fine
        console.log(`[deleteSession] Sandbox ${session.sandboxId} already stopped or expired`);
      }
    }

    // Purge all DB records
    await ctx.runMutation(internal.sessions.purgeSessionData, { id: args.id });
  },
});
