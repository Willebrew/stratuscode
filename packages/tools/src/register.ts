/**
 * Tool Registration Helper
 *
 * Registers all built-in tools with a tool registry.
 */

import type { ToolRegistry } from './sage-adapter';
import { readTool } from './read';
import { writeTool } from './write';
import { editTool } from './edit';
import { bashTool } from './bash';
import { grepTool } from './grep';
import { globTool } from './glob';
import { lsTool } from './ls';
import { multiEditTool } from './multi-edit';
import { taskTool } from './task';
import { applyPatchTool } from './apply-patch';
import { websearchTool } from './websearch';
import { webfetchTool } from './webfetch';
import { todoReadTool } from './todo-read';
import { todoWriteTool } from './todo-write';
import { questionTool } from './question';
import { planEnterTool, planExitTool } from './plan-mode';
import { batchTool } from './batch';
import { lspTool } from './lsp';
import { codesearchTool } from './codesearch';

/**
 * Register all built-in tools
 */
export function registerBuiltInTools(registry: ToolRegistry): void {
  registry.register(readTool);
  registry.register(writeTool);
  registry.register(editTool);
  registry.register(bashTool);
  registry.register(grepTool);
  registry.register(globTool);
  registry.register(lsTool);
  registry.register(multiEditTool);
  registry.register(taskTool);
  registry.register(applyPatchTool);
  registry.register(websearchTool);
  registry.register(webfetchTool);
  registry.register(todoReadTool);
  registry.register(todoWriteTool);
  registry.register(questionTool);
  registry.register(planEnterTool);
  registry.register(planExitTool);
  registry.register(batchTool);
  registry.register(lspTool);
  registry.register(codesearchTool);
}

/**
 * Get list of all built-in tool names
 */
export function getBuiltInToolNames(): string[] {
  return [
    'read',
    'write',
    'edit',
    'bash',
    'grep',
    'glob',
    'ls',
    'multi_edit',
    'task',
    'apply_patch',
    'websearch',
    'webfetch',
    'todoread',
    'todowrite',
    'question',
    'plan_enter',
    'plan_exit',
    'batch',
    'lsp',
    'codesearch',
  ];
}
