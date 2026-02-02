/**
 * useQuestions Hook
 *
 * Polls for pending questions and handles answering them.
 */

import { useState, useEffect, useCallback } from 'react';
import { Question } from '@stratuscode/tools';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface PendingQuestion {
  id: string;
  sessionId: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface UseQuestionsOptions {
  sessionId?: string;
  pollInterval?: number;
}

export interface UseQuestionsResult {
  pendingQuestion: PendingQuestion | null;
  answer: (selectedOptions: string[]) => void;
  skip: () => void;
}

export function useQuestions(options: UseQuestionsOptions): UseQuestionsResult {
  const { sessionId, pollInterval = 500 } = options;
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);

  // Poll for pending questions
  useEffect(() => {
    if (!sessionId) return;

    const checkPending = () => {
      try {
        // getPending returns an array of pending questions
        const pendingList = Question.getPending(sessionId);
        if (pendingList && pendingList.length > 0) {
          const pending = pendingList[0]!;
          if (pending.questions && pending.questions.length > 0) {
            const q = pending.questions[0]!;
            setPendingQuestion({
              id: pending.id,
              sessionId: pending.sessionId,
              question: q.question,
              header: q.header,
              options: q.options || [],
              allowMultiple: q.allowMultiple,
              allowCustom: q.allowCustom,
            });
            return;
          }
        }
        setPendingQuestion(null);
      } catch (err) {
        // Ignore errors during polling
        console.error('Question polling error:', err);
      }
    };

    // Check immediately
    checkPending();

    // Then poll
    const interval = setInterval(checkPending, pollInterval);
    return () => clearInterval(interval);
  }, [sessionId, pollInterval]);

  const answer = useCallback((selectedOptions: string[]) => {
    if (!pendingQuestion) return;
    
    try {
      Question.answer(pendingQuestion.id, [selectedOptions]);
      setPendingQuestion(null);
    } catch (error) {
      console.error('Failed to answer question:', error);
    }
  }, [pendingQuestion]);

  const skip = useCallback(() => {
    if (!pendingQuestion) return;
    
    try {
      Question.skip(pendingQuestion.id);
      setPendingQuestion(null);
    } catch (error) {
      console.error('Failed to skip question:', error);
    }
  }, [pendingQuestion]);

  return {
    pendingQuestion,
    answer,
    skip,
  };
}
