/**
 * Storage Shim for Cloud
 *
 * Provides in-memory implementations of storage functions that
 * @stratuscode/storage provides via SQLite. These are session-scoped
 * and don't persist across serverless invocations.
 */

import type {
  Message,
  TimelineEvent,
  TimelineEventKind,
  TokenUsage,
  Session,
  SessionStatus,
  ToolCall,
} from '@stratuscode/shared';

// In-memory storage maps
const sessions = new Map<string, Session>();
const messages = new Map<string, Message[]>();
const timelineEvents = new Map<string, TimelineEvent[]>();
const toolCalls = new Map<string, ToolCall[]>();
const todos = new Map<string, { id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }[]>();
const questions = new Map<string, { id: string; question: string; options?: string[]; answer?: string }[]>();

let eventCounter = 0;
let messageCounter = 0;
let todoCounter = 0;
let questionCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Session Management
// ============================================

export function createSession(projectDir: string): Session {
  const id = generateId('session');
  const session: Session = {
    id,
    slug: id.slice(0, 8),
    title: 'New Session',
    projectDir,
    status: 'pending',
    toolLoopDepth: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.set(id, session);
  messages.set(id, []);
  timelineEvents.set(id, []);
  toolCalls.set(id, []);
  todos.set(id, []);
  questions.set(id, []);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, updates: Partial<Session>): void {
  const session = sessions.get(id);
  if (session) {
    Object.assign(session, updates, { updatedAt: Date.now() });
  }
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
  messages.delete(id);
  timelineEvents.delete(id);
  toolCalls.delete(id);
  todos.delete(id);
  questions.delete(id);
}

// ============================================
// Message Management
// ============================================

export function createMessage(
  sessionId: string,
  role: Message['role'],
  content: string,
  tokenUsage?: TokenUsage
): string {
  const id = generateId('msg');
  const message: Message = {
    role,
    content,
    tokenUsage,
  };

  const sessionMessages = messages.get(sessionId) || [];
  sessionMessages.push(message);
  messages.set(sessionId, sessionMessages);

  messageCounter++;
  return id;
}

export function getMessages(sessionId: string): Message[] {
  return messages.get(sessionId) || [];
}

export function updateMessage(
  messageId: string,
  content: string,
  tokenUsage?: TokenUsage
): void {
  // In the in-memory version, we don't track by message ID
  // This is a simplified implementation
}

export function appendMessageContent(sessionId: string, content: string): void {
  const sessionMessages = messages.get(sessionId) || [];
  const lastMessage = sessionMessages[sessionMessages.length - 1];
  if (lastMessage && lastMessage.role === 'assistant') {
    if (typeof lastMessage.content === 'string') {
      lastMessage.content += content;
    }
  }
}

// ============================================
// Timeline Events
// ============================================

export function createTimelineEvent(
  sessionId: string,
  kind: TimelineEventKind,
  content: string,
  metadata: {
    toolCallId?: string;
    toolName?: string;
    status?: ToolCall['status'];
    streaming?: boolean;
    attachments?: any[];
  } = {},
  messageId?: string
): TimelineEvent {
  const id = generateId('evt');
  eventCounter++;

  const baseEvent = {
    id,
    sessionId,
    createdAt: Date.now(),
    kind,
    content,
    streaming: metadata.streaming,
    attachments: metadata.attachments,
  };

  let event: TimelineEvent;

  if (kind === 'tool_call' || kind === 'tool_result') {
    event = {
      ...baseEvent,
      kind,
      toolCallId: metadata.toolCallId || '',
      toolName: metadata.toolName,
      status: metadata.status,
    };
  } else {
    event = {
      ...baseEvent,
      kind,
    } as TimelineEvent;
  }

  const sessionEvents = timelineEvents.get(sessionId) || [];
  sessionEvents.push(event);
  timelineEvents.set(sessionId, sessionEvents);

  return event;
}

export function listTimelineEvents(sessionId: string): TimelineEvent[] {
  return timelineEvents.get(sessionId) || [];
}

export function updateTimelineEvent(
  eventId: string,
  sessionId: string,
  updates: Partial<TimelineEvent>
): void {
  const sessionEvents = timelineEvents.get(sessionId) || [];
  const idx = sessionEvents.findIndex((e) => e.id === eventId);
  if (idx !== -1) {
    sessionEvents[idx] = { ...sessionEvents[idx]!, ...updates } as TimelineEvent;
  }
}

// ============================================
// Tool Calls
// ============================================

export function createToolCall(
  messageId: string,
  sessionId: string,
  toolCall: ToolCall
): void {
  const sessionToolCalls = toolCalls.get(sessionId) || [];
  sessionToolCalls.push(toolCall);
  toolCalls.set(sessionId, sessionToolCalls);
}

export function updateToolCallResult(
  toolCallId: string,
  result: string,
  status: ToolCall['status']
): void {
  // Find and update across all sessions
  for (const [, sessionToolCalls] of toolCalls) {
    const tc = sessionToolCalls.find((t) => t.id === toolCallId);
    if (tc) {
      tc.result = result;
      tc.status = status;
      break;
    }
  }
}

// ============================================
// Token Tracking
// ============================================

export function getSessionTokenTotals(sessionId: string): TokenUsage {
  const sessionMessages = messages.get(sessionId) || [];
  let input = 0;
  let output = 0;

  for (const msg of sessionMessages) {
    if (msg.tokenUsage) {
      input += msg.tokenUsage.input || 0;
      output += msg.tokenUsage.output || 0;
    }
  }

  return { input, output };
}

// ============================================
// Todos (in-memory)
// ============================================

export type Todo = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
};

export function createTodo(
  sessionId: string,
  content: string,
  options?: { status?: Todo['status']; priority?: Todo['priority'] }
): Todo {
  const id = generateId('todo');
  const todo: Todo = {
    id,
    content,
    status: options?.status || 'pending',
    priority: options?.priority,
  };
  const sessionTodos = todos.get(sessionId) || [];
  sessionTodos.push(todo);
  todos.set(sessionId, sessionTodos);
  todoCounter++;
  return todo;
}

export function listTodos(sessionId: string): Todo[] {
  return (todos.get(sessionId) || []) as Todo[];
}

export function getTodos(sessionId: string): Todo[] {
  return listTodos(sessionId);
}

export function updateTodo(
  todoId: string,
  updates: { content?: string; status?: Todo['status']; priority?: Todo['priority'] }
): Todo | undefined {
  // Find todo across all sessions
  for (const [, sessionTodos] of todos) {
    const todo = sessionTodos.find((t) => t.id === todoId) as Todo | undefined;
    if (todo) {
      Object.assign(todo, updates);
      return todo;
    }
  }
  return undefined;
}

export function deleteTodo(todoId: string): void {
  // Find and delete across all sessions
  for (const [sessionId, sessionTodos] of todos) {
    const idx = sessionTodos.findIndex((t) => t.id === todoId);
    if (idx !== -1) {
      sessionTodos.splice(idx, 1);
      todos.set(sessionId, sessionTodos);
      break;
    }
  }
}

export function replaceTodos(
  sessionId: string,
  newTodos: Array<{ content: string; status?: Todo['status']; priority?: Todo['priority'] }>
): Todo[] {
  const replacedTodos: Todo[] = newTodos.map((t) => ({
    id: generateId('todo'),
    content: t.content,
    status: t.status || 'pending',
    priority: t.priority,
  }));
  todos.set(sessionId, replacedTodos);
  return replacedTodos;
}

export function getTodosCount(sessionId: string): {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
} {
  const sessionTodos = listTodos(sessionId);
  return {
    total: sessionTodos.length,
    pending: sessionTodos.filter((t) => t.status === 'pending').length,
    in_progress: sessionTodos.filter((t) => t.status === 'in_progress').length,
    completed: sessionTodos.filter((t) => t.status === 'completed').length,
  };
}

// ============================================
// Questions (in-memory)
// ============================================

export type Question = {
  id: string;
  question: string;
  options?: string[];
  answer?: string;
};

export type PendingQuestion = {
  id: string;
  sessionId: string;
  messageId?: string;
  question: string;
  options?: string[];
  allowMultiple?: boolean;
};

export function createQuestion(
  sessionId: string,
  question: string,
  options?: string[]
): string {
  const id = generateId('q');
  const sessionQuestions = questions.get(sessionId) || [];
  sessionQuestions.push({ id, question, options });
  questions.set(sessionId, sessionQuestions);
  questionCounter++;
  return id;
}

export function createPendingQuestion(
  sessionId: string,
  messageId: string | undefined,
  question: string,
  options?: string[],
  allowMultiple?: boolean
): PendingQuestion {
  const id = generateId('pq');
  const pendingQ: PendingQuestion = {
    id,
    sessionId,
    messageId,
    question,
    options,
    allowMultiple,
  };
  const sessionQuestions = questions.get(sessionId) || [];
  sessionQuestions.push(pendingQ as any);
  questions.set(sessionId, sessionQuestions);
  questionCounter++;
  return pendingQ;
}

export function getQuestion(sessionId: string, questionId: string) {
  const sessionQuestions = questions.get(sessionId) || [];
  return sessionQuestions.find((q) => q.id === questionId);
}

export function getPendingQuestions(sessionId: string): PendingQuestion[] {
  const sessionQuestions = questions.get(sessionId) || [];
  return sessionQuestions.filter((q: any) => !q.answer) as PendingQuestion[];
}

export function getPendingQuestion(sessionId: string): PendingQuestion | undefined {
  const sessionQuestions = questions.get(sessionId) || [];
  return sessionQuestions.find((q: any) => !q.answer) as PendingQuestion | undefined;
}

export function getFirstPendingQuestion(sessionId: string): PendingQuestion | undefined {
  return getPendingQuestion(sessionId);
}

export function answerQuestion(
  questionId: string,
  answers: string[][]
): boolean {
  // Find question across all sessions
  for (const [, sessionQuestions] of questions) {
    const question = sessionQuestions.find((q) => q.id === questionId);
    if (question) {
      (question as any).answer = answers;
      return true;
    }
  }
  return false;
}

export function skipQuestion(questionId: string): boolean {
  // Mark as answered with empty array
  return answerQuestion(questionId, []);
}

// ============================================
// Error Memory Store (no-op for cloud)
// ============================================

export class InMemoryErrorStore {
  private errors: Map<string, { pattern: string; solution: string; count: number }> = new Map();

  async recordError(pattern: string, solution: string): Promise<void> {
    const existing = this.errors.get(pattern);
    if (existing) {
      existing.count++;
      existing.solution = solution;
    } else {
      this.errors.set(pattern, { pattern, solution, count: 1 });
    }
  }

  async findSimilarErrors(pattern: string): Promise<{ pattern: string; solution: string }[]> {
    const results: { pattern: string; solution: string }[] = [];
    for (const [key, value] of this.errors) {
      if (key.includes(pattern) || pattern.includes(key)) {
        results.push({ pattern: value.pattern, solution: value.solution });
      }
    }
    return results;
  }
}

// ============================================
// Clear all storage (for testing)
// ============================================

export function clearAllStorage(): void {
  sessions.clear();
  messages.clear();
  timelineEvents.clear();
  toolCalls.clear();
  todos.clear();
  questions.clear();
  eventCounter = 0;
  messageCounter = 0;
  todoCounter = 0;
  questionCounter = 0;
}
