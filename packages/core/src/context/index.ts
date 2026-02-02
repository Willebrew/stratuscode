/**
 * Context Management
 *
 * Context management is now provided by @sage/core's context engine.
 * The old ContextCompactor has been replaced by SAGE's manageContext()
 * with sliding window, LLM summarization, and working memory.
 *
 * This module is kept for backwards compatibility but the compactor
 * is deprecated in favor of @sage/core.
 */

export * from './compactor';
