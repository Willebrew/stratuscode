/**
 * Task Tool
 *
 * Delegates work to a subagent for complex or exploratory tasks.
 */

import { defineTool } from './sage-adapter';

export interface TaskArgs extends Record<string, unknown> {
  description: string;
  agent?: 'explore' | 'general';
  context?: string;
}

export const taskTool = defineTool<TaskArgs>({
  name: 'task',
  description: `Delegate a task to a subagent.

Use this tool to:
- Explore the codebase without cluttering the main conversation
- Perform complex multi-step research tasks
- Run parallel investigations

Available subagents:
- explore: Fast codebase exploration (read-only). Good for finding files, searching code, understanding structure.
- general: General-purpose agent for complex tasks. Can make changes if needed.

The subagent will execute the task and return a summarized result.`,
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'What the subagent should do. Be specific and clear.',
      },
      agent: {
        type: 'string',
        enum: ['explore', 'general'],
        description: 'Which subagent to use. Default: explore.',
      },
      context: {
        type: 'string',
        description: 'Optional additional context to pass to the subagent.',
      },
    },
    required: ['description'],
  },
  timeout: 120000, // 2 minutes for subagent tasks

  async execute(args, context) {
    const { description, agent = 'explore', context: additionalContext } = args;

    // For now, return a placeholder since full subagent implementation
    // requires integration with the session manager
    // This will be connected in the agent loop

    return JSON.stringify({
      status: 'delegated',
      agent,
      description,
      context: additionalContext,
      message: `Task delegated to ${agent} subagent: ${description}`,
      // The actual result will be populated by the agent loop
      // when it processes this tool call and invokes the subagent
    });
  },
});
