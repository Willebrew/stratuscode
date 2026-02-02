/**
 * LSP Tool
 *
 * Language Server Protocol operations for code intelligence.
 */

import { defineTool } from './sage-adapter';
import { createLSPManager, type LSPManager } from './lib/lsp/manager';
import * as path from 'path';

// Cache LSP managers per project
const managers = new Map<string, LSPManager>();

function getManager(projectDir: string): LSPManager {
  let manager = managers.get(projectDir);
  if (!manager) {
    manager = createLSPManager(projectDir);
    managers.set(projectDir, manager);
  }
  return manager;
}

export type LspOperation = 
  | 'definition'
  | 'references'
  | 'hover'
  | 'diagnostics'
  | 'documentSymbols'
  | 'workspaceSymbols'
  | 'completion'
  | 'rename';

export interface LspArgs extends Record<string, unknown> {
  operation: LspOperation;
  filePath?: string;
  line?: number;
  character?: number;
  query?: string;
  newName?: string;
}

export const lspTool = defineTool<LspArgs>({
  name: 'lsp',
  description: `Perform Language Server Protocol operations for code intelligence.

Operations:
- definition: Go to definition of symbol at position
- references: Find all references to symbol at position
- hover: Get hover information (type, docs) for symbol
- diagnostics: Get all diagnostics (errors, warnings) for a file
- documentSymbols: Get all symbols in a document
- workspaceSymbols: Search for symbols across the workspace
- completion: Get completion suggestions at position
- rename: Preview rename of symbol (does not apply changes)

Requires filePath and position (line, character) for most operations.
Position is 0-indexed (first line is 0, first character is 0).`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['definition', 'references', 'hover', 'diagnostics', 'documentSymbols', 'workspaceSymbols', 'completion', 'rename'],
        description: 'The LSP operation to perform',
      },
      filePath: {
        type: 'string',
        description: 'Path to the file (required for most operations)',
      },
      line: {
        type: 'number',
        description: '0-indexed line number',
      },
      character: {
        type: 'number',
        description: '0-indexed character position',
      },
      query: {
        type: 'string',
        description: 'Search query for workspaceSymbols',
      },
      newName: {
        type: 'string',
        description: 'New name for rename operation',
      },
    },
    required: ['operation'],
  },
  timeout: 30000, // 30 seconds for LSP operations

  async execute(args, context) {
    const { operation, filePath, line, character, query, newName } = args;

    // Validate required parameters
    const needsFile = ['definition', 'references', 'hover', 'diagnostics', 'documentSymbols', 'completion', 'rename'];
    const needsPosition = ['definition', 'references', 'hover', 'completion', 'rename'];

    if (needsFile.includes(operation) && !filePath) {
      return JSON.stringify({
        error: `Operation '${operation}' requires filePath`,
      });
    }

    if (needsPosition.includes(operation) && (line === undefined || character === undefined)) {
      return JSON.stringify({
        error: `Operation '${operation}' requires line and character position`,
      });
    }

    if (operation === 'workspaceSymbols' && !query) {
      return JSON.stringify({
        error: 'workspaceSymbols requires a query',
      });
    }

    if (operation === 'rename' && !newName) {
      return JSON.stringify({
        error: 'rename requires newName',
      });
    }

    // Get LSP manager and client
    const manager = getManager(context.projectDir);
    const absolutePath = filePath ? path.resolve(context.projectDir, filePath) : undefined;
    
    if (absolutePath) {
      const client = await manager.getClient(absolutePath);
      if (!client) {
        return JSON.stringify({
          error: 'No LSP server available for this file type',
          filePath,
          hint: 'Ensure the appropriate language server is installed (e.g., typescript-language-server, pyright)',
        });
      }

      try {
        switch (operation) {
          case 'hover': {
            const result = await client.hover(absolutePath, { line: line!, character: character! });
            return JSON.stringify({ operation, result });
          }
          case 'definition': {
            const result = await client.definition(absolutePath, { line: line!, character: character! });
            return JSON.stringify({ operation, result });
          }
          case 'references': {
            const result = await client.references(absolutePath, { line: line!, character: character! });
            return JSON.stringify({ operation, result });
          }
          case 'diagnostics': {
            // Diagnostics are typically pushed from the server, not requested
            return JSON.stringify({ 
              operation, 
              result: [],
              note: 'Diagnostics are received via notifications. Use hover or documentSymbols for code info.',
            });
          }
          case 'documentSymbols': {
            const result = await client.documentSymbols(absolutePath);
            return JSON.stringify({ operation, result });
          }
          case 'workspaceSymbols': {
            const result = await client.workspaceSymbols(query!);
            return JSON.stringify({ operation, result });
          }
          case 'completion': {
            const result = await client.completion(absolutePath, { line: line!, character: character! });
            return JSON.stringify({ operation, result });
          }
          case 'rename': {
            // First prepare rename to check if it's valid
            const prepareResult = await client.prepareRename(absolutePath, { line: line!, character: character! });
            if (!prepareResult) {
              return JSON.stringify({ operation, error: 'Cannot rename at this position' });
            }
            // Then do the actual rename
            const result = await client.rename(absolutePath, { line: line!, character: character! }, newName!);
            return JSON.stringify({ operation, result });
          }
          default:
            return JSON.stringify({ error: `Unknown operation: ${operation}` });
        }
      } catch (err) {
        return JSON.stringify({
          error: 'LSP operation failed',
          message: err instanceof Error ? err.message : String(err),
          operation,
        });
      }
    }

    return JSON.stringify({
      error: 'File path required for this operation',
      operation,
    });
  },
});
