/**
 * Question System
 *
 * Manages interactive questions that block tool execution until answered.
 */

import {
  createPendingQuestion,
  getPendingQuestions,
  getPendingQuestion,
  answerQuestion,
  skipQuestion,
  getFirstPendingQuestion,
  type Question as StorageQuestion,
  type PendingQuestion as StoragePendingQuestion,
} from '@stratuscode/storage';

// ============================================
// Types
// ============================================

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionInfo {
  id: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface PendingQuestionInfo {
  id: string;
  sessionId: string;
  messageId?: string;
  toolCallId?: string;
  questions: QuestionInfo[];
  answers?: string[][];
  status: 'pending' | 'answered' | 'skipped';
}

// ============================================
// Error Types
// ============================================

export class QuestionRejectedError extends Error {
  constructor(message = 'User rejected the question') {
    super(message);
    this.name = 'QuestionRejectedError';
  }
}

export class QuestionSkippedError extends Error {
  constructor(message = 'User skipped the question') {
    super(message);
    this.name = 'QuestionSkippedError';
  }
}

// ============================================
// Question Resolution
// ============================================

type QuestionResolver = {
  resolve: (answers: string[][]) => void;
  reject: (error: Error) => void;
};

const pendingResolvers = new Map<string, QuestionResolver>();

// ============================================
// Question Operations
// ============================================

export namespace Question {
  export const Info = {
    id: '' as string,
    question: '' as string,
    header: undefined as string | undefined,
    options: [] as QuestionOption[],
    allowMultiple: undefined as boolean | undefined,
    allowCustom: undefined as boolean | undefined,
  };

  export type Answer = string[];

  export const RejectedError = QuestionRejectedError;
  export const SkippedError = QuestionSkippedError;

  /**
   * Ask questions and wait for answers (blocks until answered)
   */
  export async function ask(params: {
    sessionId: string;
    questions: Omit<QuestionInfo, 'id'>[];
    tool?: { messageId: string; callId: string };
  }): Promise<string[][]> {
    const { sessionId, questions, tool } = params;

    // Create pending question in database
    const pending = createPendingQuestion(
      sessionId,
      questions.map((q, i) => ({
        id: `q-${i}`,
        ...q,
      })),
      tool ? { messageId: tool.messageId, toolCallId: tool.callId } : undefined
    );

    // Return a promise that will be resolved when the TUI provides answers
    return new Promise<string[][]>((resolve, reject) => {
      pendingResolvers.set(pending.id, { resolve, reject });
    });
  }

  /**
   * Get pending questions for a session
   */
  export function getPending(sessionId: string): PendingQuestionInfo[] {
    return getPendingQuestions(sessionId).map(p => ({
      id: p.id,
      sessionId: p.sessionId,
      messageId: p.messageId,
      toolCallId: p.toolCallId,
      questions: p.questions,
      answers: p.answers,
      status: p.status,
    }));
  }

  /**
   * Get the first pending question (for TUI display)
   */
  export function getFirst(sessionId: string): PendingQuestionInfo | undefined {
    const p = getFirstPendingQuestion(sessionId);
    if (!p) return undefined;
    return {
      id: p.id,
      sessionId: p.sessionId,
      messageId: p.messageId,
      toolCallId: p.toolCallId,
      questions: p.questions,
      answers: p.answers,
      status: p.status,
    };
  }

  /**
   * Answer a pending question (called by TUI)
   */
  export function answer(questionId: string, answers: string[][]): void {
    const result = answerQuestion(questionId, answers);
    if (!result) return;

    // Resolve the pending promise
    const resolver = pendingResolvers.get(questionId);
    if (resolver) {
      resolver.resolve(answers);
      pendingResolvers.delete(questionId);
    }
  }

  /**
   * Skip/reject a pending question (called by TUI)
   */
  export function skip(questionId: string): void {
    const result = skipQuestion(questionId);
    if (!result) return;

    // Reject the pending promise
    const resolver = pendingResolvers.get(questionId);
    if (resolver) {
      resolver.reject(new QuestionSkippedError());
      pendingResolvers.delete(questionId);
    }
  }

  /**
   * Reject a pending question with custom error
   */
  export function reject(questionId: string, error?: Error): void {
    const resolver = pendingResolvers.get(questionId);
    if (resolver) {
      resolver.reject(error || new QuestionRejectedError());
      pendingResolvers.delete(questionId);
    }
  }

  /**
   * Check if there are pending questions for a session
   */
  export function hasPending(sessionId: string): boolean {
    return getPending(sessionId).length > 0;
  }
}
