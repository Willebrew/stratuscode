#!/usr/bin/env bun
/**
 * Backend JSON-RPC Server
 *
 * Wraps ChatSession (SAGE) behind stdio JSON-RPC for the Rust TUI.
 */

import * as readline from 'readline';
import * as path from 'path';
import { ChatSession } from './chat-session';
import { loadConfig, hasApiKey, initDatabase } from '@stratuscode/storage';
import { listSessions, deleteSession, getMessages } from '@stratuscode/storage';
import { Question, Todo } from '@stratuscode/tools';
import { discoverOllamaModels } from '@stratuscode/shared';
import { buildModelEntries } from './model_entries';
import { registerContextWindow } from '@sage/core';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

let session: ChatSession | null = null;
let currentConfig: any | null = null;
let cachedOllamaModels: any[] | null = null;

function send(obj: any): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function respond(id: string | number | null, result?: any, error?: RpcResponse['error']) {
  const resp: RpcResponse = { jsonrpc: '2.0', id, ...(error ? { error } : { result }) };
  send(resp);
}

function notify(method: string, params?: any): void {
  send({ jsonrpc: '2.0', method, params });
}

function attachSessionEvents(s: ChatSession): void {
  s.on('timeline_event', (event) => notify('timeline_event', event));
  s.on('tokens_update', (payload) => notify('tokens_update', payload));
  s.on('context_status', (status) => notify('context_status', status));
  s.on('plan_exit_proposed', (flag) => notify('plan_exit_proposed', flag));
  s.on('session_changed', (id) => notify('session_changed', id));
  s.on('state', (state) => notify('state', state));
  s.on('error', (message) => notify('error', message));
}

async function handleRequest(req: RpcRequest): Promise<void> {
  const id = req.id ?? null;
  const params = req.params ?? {};

  try {
    switch (req.method) {
      case 'initialize': {
        const projectDir = path.resolve(params.projectDir || process.cwd());
        const { config } = loadConfig(projectDir);
        if (!hasApiKey(config)) {
          respond(id, undefined, { code: 401, message: 'No API key configured' });
          return;
        }
        initDatabase();

        if (params.model) {
          config.model = params.model;
        }

        if (params.provider && (config as any).providers?.[params.provider]) {
          const p = (config as any).providers[params.provider];
          config.provider = {
            apiKey: p.apiKey ?? config.provider.apiKey,
            baseUrl: p.baseUrl ?? config.provider.baseUrl,
            ...p,
          };
        }

        currentConfig = config;
        session = new ChatSession({
          projectDir,
          config,
          agent: params.agent || 'build',
          modelOverride: params.modelOverride,
          providerOverride: params.providerOverride,
          reasoningEffortOverride: params.reasoningEffortOverride,
        });
        attachSessionEvents(session);
        respond(id, { ok: true, state: session.getState(), baseModel: config.model });
        return;
      }
      case 'get_state': {
        if (!session) {
          respond(id, undefined, { code: 400, message: 'Not initialized' });
          return;
        }
        respond(id, session.getState());
        return;
      }
      case 'send_message': {
        if (!session) {
          respond(id, undefined, { code: 400, message: 'Not initialized' });
          return;
        }
        await session.sendMessage(params.content || '', params.agentOverride, params.options, params.attachments);
        respond(id, { ok: true });
        return;
      }
      case 'execute_tool': {
        if (!session) {
          respond(id, undefined, { code: 400, message: 'Not initialized' });
          return;
        }
        const result = await session.executeTool(params.name, params.args || {});
        respond(id, { result });
        return;
      }
      case 'load_session': {
        if (!session) {
          respond(id, undefined, { code: 400, message: 'Not initialized' });
          return;
        }
        await session.loadSession(params.sessionId);
        respond(id, { ok: true });
        return;
      }
      case 'abort': {
        session?.abort();
        respond(id, { ok: true });
        return;
      }
      case 'clear': {
        session?.clear();
        respond(id, { ok: true });
        return;
      }
      case 'reset_plan_exit': {
        session?.resetPlanExit();
        respond(id, { ok: true });
        return;
      }
      case 'set_agent': {
        session?.setAgent(params.agent);
        respond(id, { ok: true });
        return;
      }
      case 'set_model': {
        session?.setModelOverride(params.model);
        respond(id, { ok: true });
        return;
      }
      case 'set_provider': {
        session?.setProviderOverride(params.provider);
        respond(id, { ok: true });
        return;
      }
      case 'set_reasoning_effort': {
        session?.setReasoningEffortOverride(params.reasoningEffort);
        respond(id, { ok: true });
        return;
      }
      case 'list_sessions': {
        const sessions = listSessions(params.projectDir, params.limit ?? 20);
        let currentId = params.currentSessionId as string | undefined;
        if (!currentId && session) {
          currentId = session.getState().sessionId;
        }
        if (!currentId && session) {
          currentId = session.ensureSessionId();
        }
        const withMessages = sessions
          .filter(s => s.id !== currentId)
          .map(s => {
            const msgs = getMessages(s.id);
            return { session: s, messages: msgs };
          })
          .filter(({ messages }) => messages.length > 0)
          .map(({ session, messages }) => {
            const firstUser = messages.find(m => m.role === 'user');
            const firstMessage = typeof firstUser?.content === 'string'
              ? firstUser.content.slice(0, 50)
              : undefined;
            return {
              id: session.id,
              title: session.title,
              messageCount: messages.length,
              firstMessage,
            };
          });

        const output = [...withMessages];
        if (currentId) {
          const currentSession = sessions.find(s => s.id === currentId);
          const currentMessages = getMessages(currentId);
          const firstUser = currentMessages.find(m => m.role === 'user');
          const firstMessage = typeof firstUser?.content === 'string'
            ? firstUser.content.slice(0, 50)
            : undefined;
          output.unshift({
            id: currentId,
            title: currentSession?.title ?? 'Current session',
            messageCount: currentMessages.length,
            firstMessage,
          });
        }

        respond(id, output);
        return;
      }
      case 'delete_session': {
        if (!params.sessionId) {
          respond(id, undefined, { code: 400, message: 'Missing sessionId' });
          return;
        }
        if (session && session.getState().sessionId === params.sessionId) {
          session.clear();
          session.resetPlanExit();
          session.ensureSessionId();
        }
        deleteSession(params.sessionId);
        respond(id, { ok: true });
        return;
      }
      case 'get_pending_question': {
        if (!params.sessionId) {
          respond(id, undefined, { code: 400, message: 'Missing sessionId' });
          return;
        }
        const pending = Question.getPending(params.sessionId) || [];
        respond(id, pending);
        return;
      }
      case 'answer_question': {
        if (!params.id) {
          respond(id, undefined, { code: 400, message: 'Missing question id' });
          return;
        }
        Question.answer(params.id, params.answers || []);
        respond(id, { ok: true });
        return;
      }
      case 'skip_question': {
        if (!params.id) {
          respond(id, undefined, { code: 400, message: 'Missing question id' });
          return;
        }
        Question.skip(params.id);
        respond(id, { ok: true });
        return;
      }
      case 'list_todos': {
        if (!params.sessionId) {
          respond(id, undefined, { code: 400, message: 'Missing sessionId' });
          return;
        }
        const list = Todo.list(params.sessionId) || [];
        const counts = Todo.counts(params.sessionId);
        respond(id, { list, counts });
        return;
      }
      case 'list_models': {
        if (!session) {
          respond(id, undefined, { code: 400, message: 'Not initialized' });
          return;
        }
        if (cachedOllamaModels === null) {
          try {
            cachedOllamaModels = await discoverOllamaModels();
          } catch {
            cachedOllamaModels = null;
          }
        }
        if (cachedOllamaModels && cachedOllamaModels.length > 0) {
          for (const model of cachedOllamaModels) {
            if (model?.contextWindow) {
              registerContextWindow(model.id, model.contextWindow);
              const bare = model.id.replace(/:latest$/, '');
              if (bare !== model.id) {
                registerContextWindow(bare, model.contextWindow);
              }
            }
          }
          if (currentConfig && !currentConfig.providers?.ollama) {
            (currentConfig as any).providers = {
              ...currentConfig.providers,
              ollama: {
                baseUrl: 'http://localhost:11434/v1',
                type: 'chat-completions' as const,
              },
            };
          }
        }
        const entries = buildModelEntries(currentConfig ?? loadConfig(process.cwd()).config, cachedOllamaModels ?? undefined);
        respond(id, { entries });
        return;
      }
      default:
        respond(id, undefined, { code: 404, message: `Unknown method: ${req.method}` });
        return;
    }
  } catch (err) {
    respond(id, undefined, { code: 500, message: String(err) });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: RpcRequest | null = null;
  try {
    req = JSON.parse(trimmed) as RpcRequest;
  } catch (err) {
    respond(null, undefined, { code: 400, message: 'Invalid JSON' });
    return;
  }
  void handleRequest(req);
});
