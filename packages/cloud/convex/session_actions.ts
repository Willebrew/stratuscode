import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Delete a session and all associated data (messages, events, todos, attachments, streaming state, agent state).
 * Called from the frontend sidebar delete button.
 */
export const deleteSession = action({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sessions.purgeSessionData, { id: args.id });
  },
});
