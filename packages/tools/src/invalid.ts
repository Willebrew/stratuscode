/**
 * Invalid Tool
 *
 * Placeholder tool for handling invalid tool calls gracefully.
 * When a tool call has malformed arguments, this tool is called instead
 * to provide a helpful error message without crashing.
 */

import { defineTool } from './sage-adapter';

export interface InvalidArgs extends Record<string, unknown> {
  tool: string;
  error: string;
}

export const invalidTool = defineTool<InvalidArgs>({
  name: 'invalid',
  description: 'Do not use - internal tool for handling invalid tool calls',
  parameters: {
    type: 'object',
    properties: {
      tool: {
        type: 'string',
        description: 'The name of the tool that was called',
      },
      error: {
        type: 'string',
        description: 'The error message describing what went wrong',
      },
    },
    required: ['tool', 'error'],
  },

  async execute(args) {
    const { tool, error } = args;
    
    return JSON.stringify({
      title: 'Invalid Tool Call',
      error: true,
      message: `The arguments provided to "${tool}" are invalid: ${error}`,
      suggestion: 'Please check the tool parameters and try again with valid arguments.',
    });
  },
});
