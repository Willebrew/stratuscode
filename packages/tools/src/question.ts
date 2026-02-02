/**
 * Question Tool
 *
 * Ask the user interactive questions with multiple choice options.
 * Blocks execution until answered in the TUI.
 */

import { defineTool } from './sage-adapter';
import { Question } from './lib/question';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  header?: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface QuestionArgs extends Record<string, unknown> {
  questions: QuestionItem[];
}

export const questionTool = defineTool<QuestionArgs>({
  name: 'question',
  description: `Ask the user interactive questions with multiple choice options.

This tool blocks execution until the user answers in the TUI. Use it to:
- Clarify requirements before proceeding
- Get user preferences on implementation choices
- Confirm before making significant changes

Each question has:
- question: The question text
- header: Optional header/context for the question
- options: Array of {label, description?} choices
- allowMultiple: If true, user can select multiple options
- allowCustom: If true, user can provide a custom text answer

Returns the user's selected options for each question.

IMPORTANT GUIDELINES:
- If you recommend a specific option, make that the FIRST option in the list and add "(Recommended)" to its label.
- When allowCustom is enabled, a "Type your own answer" option is added automatically — do NOT include an "Other" option yourself.
- Keep option labels concise (under 60 characters). Use the description field for longer explanations or trade-off details.`,
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask',
            },
            header: {
              type: 'string',
              description: 'Optional header/context',
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Option label',
                  },
                  description: {
                    type: 'string',
                    description: 'Optional description',
                  },
                },
                required: ['label'],
              },
              description: 'Available options',
            },
            allowMultiple: {
              type: 'boolean',
              description: 'Allow selecting multiple options',
            },
            allowCustom: {
              type: 'boolean',
              description: 'Allow custom text input',
            },
          },
          required: ['question', 'options'],
        },
        description: 'Questions to ask',
      },
    },
    required: ['questions'],
  },
  timeout: 300000, // 5 minutes to answer questions

  async execute(args, context) {
    const sessionId = context.sessionId;
    if (!sessionId) {
      return JSON.stringify({ error: 'No active session' });
    }

    const { questions } = args;

    try {
      // This blocks until the user answers in the TUI
      const answers = await Question.ask({
        sessionId,
        questions: questions.map(q => ({
          question: q.question,
          header: q.header,
          options: q.options,
          allowMultiple: q.allowMultiple,
          allowCustom: q.allowCustom,
        })),
      });

      return JSON.stringify({
        success: true,
        answers: questions.map((q, i) => ({
          question: q.question,
          selectedOptions: answers[i],
        })),
      });
    } catch (error) {
      if (error instanceof Question.SkippedError) {
        return JSON.stringify({
          skipped: true,
          message: 'User skipped the question',
        });
      }
      if (error instanceof Question.RejectedError) {
        return JSON.stringify({
          rejected: true,
          message: 'User rejected the question',
        });
      }
      throw error;
    }
  },
});
