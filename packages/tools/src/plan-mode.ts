/**
 * Plan Mode Tools
 *
 * Enter and exit plan mode for structured planning workflows.
 */

import { defineTool } from './sage-adapter';

export interface PlanEnterArgs extends Record<string, unknown> {
  reason?: string;
}

export interface PlanExitArgs extends Record<string, unknown> {
  summary?: string;
  ready?: boolean;
}

export const planEnterTool = defineTool<PlanEnterArgs>({
  name: 'plan_enter',
  description: `Enter plan mode to create a structured plan before implementation.

In plan mode, you should:
1. Research and explore the codebase to understand requirements
2. Ask clarifying questions using the question tool
3. Create todos using the todowrite tool
4. When ready, use plan_exit to propose switching to build mode

Use this when:
- Starting a complex multi-step task
- The user asks for a plan before implementation
- You need to clarify requirements before coding`,
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why entering plan mode',
      },
    },
    required: [],
  },

  async execute(args, context) {
    const { reason } = args;

    // Set session to plan mode (this will be handled by the session manager)
    return JSON.stringify({
      mode: 'plan',
      entered: true,
      reason,
      message: 'Entered plan mode. Research, ask questions, and create todos. Use plan_exit when ready to build.',
      instructions: [
        'Use todoread to check current plan',
        'Use todowrite to create/update the plan',
        'Use question to clarify requirements',
        'Use plan_exit when ready to propose building',
      ],
    });
  },
});

export const planExitTool = defineTool<PlanExitArgs>({
  name: 'plan_exit',
  description: `Exit plan mode and propose switching to build mode.

Use this when:
- You have a complete plan with todos
- All clarifying questions have been answered
- You're ready to start implementation

The user will be asked to confirm before switching to build mode.`,
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Summary of the plan for user approval',
      },
      ready: {
        type: 'boolean',
        description: 'Whether you believe the plan is ready for implementation',
      },
    },
    required: [],
  },

  async execute(args, context) {
    const { summary, ready = true } = args;

    if (!ready) {
      return JSON.stringify({
        mode: 'plan',
        exited: false,
        message: 'Plan not marked as ready. Continue planning or set ready=true when done.',
      });
    }

    // This will trigger a confirmation dialog in the TUI
    return JSON.stringify({
      mode: 'plan',
      proposingExit: true,
      summary,
      message: 'Proposing to exit plan mode and start building. Awaiting user confirmation.',
      nextSteps: [
        'User will review the plan',
        'If approved, switch to build mode',
        'If rejected, continue planning',
      ],
    });
  },
});
