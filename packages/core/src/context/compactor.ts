/**
 * Context Compactor
 *
 * Summarizes old messages when context exceeds threshold.
 */

import type { Message } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface CompactionConfig {
  maxMessages: number;
  keepRecentMessages: number;
  maxToolResultLength: number;
}

export interface CompactionResult {
  messages: Message[];
  wasCompacted: boolean;
  removedCount: number;
  summaryAdded: boolean;
}

// ============================================
// Default Config
// ============================================

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxMessages: 50,
  keepRecentMessages: 10,
  maxToolResultLength: 5000,
};

// ============================================
// Context Compactor
// ============================================

export class ContextCompactor {
  private config: CompactionConfig;

  constructor(config: Partial<CompactionConfig> = {}) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * Compact messages if they exceed the threshold
   */
  compact(messages: Message[]): CompactionResult {
    if (messages.length <= this.config.maxMessages) {
      return {
        messages,
        wasCompacted: false,
        removedCount: 0,
        summaryAdded: false,
      };
    }

    // Keep recent messages intact
    const keepCount = this.config.keepRecentMessages;
    const recentMessages = messages.slice(-keepCount);
    const oldMessages = messages.slice(0, -keepCount);

    // Create a summary of old messages
    const summary = this.summarizeMessages(oldMessages);

    // Build compacted message list
    const compactedMessages: Message[] = [
      {
        role: 'system',
        content: `[Context Summary - ${oldMessages.length} messages compacted]\n\n${summary}`,
      },
      ...recentMessages,
    ];

    return {
      messages: compactedMessages,
      wasCompacted: true,
      removedCount: oldMessages.length,
      summaryAdded: true,
    };
  }

  /**
   * Truncate long tool results in messages
   */
  truncateToolResults(messages: Message[]): Message[] {
    return messages.map(msg => {
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        if (msg.content.length > this.config.maxToolResultLength) {
          return {
            ...msg,
            content: msg.content.slice(0, this.config.maxToolResultLength) +
              `\n\n... [truncated ${msg.content.length - this.config.maxToolResultLength} characters]`,
          };
        }
      }
      return msg;
    });
  }

  /**
   * Create a summary of messages
   */
  private summarizeMessages(messages: Message[]): string {
    const parts: string[] = [];

    // Group by conversation turns
    let currentUserMessage = '';
    const toolsUsed = new Set<string>();
    const filesModified = new Set<string>();
    const decisions: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          currentUserMessage = msg.content.slice(0, 200);
          if (msg.content.length > 200) {
            currentUserMessage += '...';
          }
        }
      } else if (msg.role === 'assistant') {
        // Extract tool calls
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            toolsUsed.add(tc.function.name);

            // Extract file paths from common tools
            try {
              const args = JSON.parse(tc.function.arguments);
              if (args.file_path) {
                filesModified.add(args.file_path);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Extract key decisions from content
        if (typeof msg.content === 'string' && msg.content.length > 0) {
          const firstSentence = msg.content.split(/[.!?]/)[0];
          if (firstSentence && firstSentence.length < 200) {
            decisions.push(firstSentence.trim());
          }
        }
      }
    }

    // Build summary
    if (currentUserMessage) {
      parts.push(`**Last compacted request**: ${currentUserMessage}`);
    }

    if (toolsUsed.size > 0) {
      parts.push(`**Tools used**: ${Array.from(toolsUsed).join(', ')}`);
    }

    if (filesModified.size > 0) {
      const files = Array.from(filesModified).slice(0, 10);
      parts.push(`**Files touched**: ${files.join(', ')}${filesModified.size > 10 ? ` (+${filesModified.size - 10} more)` : ''}`);
    }

    if (decisions.length > 0) {
      const topDecisions = decisions.slice(-5);
      parts.push(`**Key points**:\n${topDecisions.map(d => `- ${d}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }
}

/**
 * Create a new context compactor
 */
export function createContextCompactor(config?: Partial<CompactionConfig>): ContextCompactor {
  return new ContextCompactor(config);
}
