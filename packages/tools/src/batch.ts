/**
 * Batch Tool
 *
 * Execute multiple tools in parallel for efficiency.
 */

import { defineTool } from './sage-adapter';

export interface BatchCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface BatchArgs extends Record<string, unknown> {
  calls: BatchCall[];
}

const DISALLOWED_TOOLS = new Set([
  'batch', // Prevent recursive batch calls
  'question', // Interactive tools shouldn't be batched
  'plan_enter',
  'plan_exit',
]);

const MAX_BATCH_SIZE = 25;

export const batchTool = defineTool<BatchArgs>({
  name: 'batch',
  description: `Execute multiple tools in parallel for efficiency.

Use this when you need to:
- Read multiple files at once
- Run multiple grep searches simultaneously
- Perform multiple independent operations

Limitations:
- Maximum ${MAX_BATCH_SIZE} tool calls per batch
- Cannot batch: batch, question, plan_enter, plan_exit
- All calls execute in parallel - order is not guaranteed

Returns results for each call, including any errors.`,
  parameters: {
    type: 'object',
    properties: {
      calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'Name of the tool to call',
            },
            args: {
              type: 'object',
              description: 'Arguments to pass to the tool',
            },
          },
          required: ['tool', 'args'],
        },
        description: `List of tool calls to execute in parallel (max ${MAX_BATCH_SIZE})`,
      },
    },
    required: ['calls'],
  },
  timeout: 120000, // 2 minutes for batch operations

  async execute(args, context) {
    const { calls } = args;

    // Validate batch size
    if (calls.length > MAX_BATCH_SIZE) {
      return JSON.stringify({
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}`,
        requested: calls.length,
      });
    }

    if (calls.length === 0) {
      return JSON.stringify({
        error: 'No tool calls provided',
      });
    }

    // Filter out disallowed tools
    const validCalls: BatchCall[] = [];
    const rejected: { tool: string; reason: string }[] = [];

    for (const call of calls) {
      if (DISALLOWED_TOOLS.has(call.tool)) {
        rejected.push({
          tool: call.tool,
          reason: `Tool '${call.tool}' cannot be batched`,
        });
      } else {
        validCalls.push(call);
      }
    }

    if (validCalls.length === 0) {
      return JSON.stringify({
        error: 'No valid tool calls after filtering',
        rejected,
      });
    }

    // Batch execution is handled by the agent loop
    // This tool returns the validated calls for the loop to execute
    return JSON.stringify({
      status: 'batch_request',
      calls: validCalls,
      rejected: rejected.length > 0 ? rejected : undefined,
      message: `Batch of ${validCalls.length} tool calls ready for execution`,
    });
  },
});
