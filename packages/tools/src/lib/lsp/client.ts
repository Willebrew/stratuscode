/**
 * LSP Client
 *
 * Manages Language Server Protocol connections for code intelligence.
 */

import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';

// ============================================
// Types
// ============================================

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Information, Hint
  source?: string;
  code?: string | number;
}

export interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface HoverResult {
  contents: string | { language: string; value: string }[];
  range?: Range;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
}

// ============================================
// LSP Client
// ============================================

export interface LspClientOptions {
  rootUri: string;
  languageId: string;
}

export class LspClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private initialized = false;
  private rootUri: string;
  private languageId: string;

  constructor(options: LspClientOptions) {
    this.rootUri = options.rootUri;
    this.languageId = options.languageId;
  }

  /**
   * Start the language server
   */
  async start(command: string, args: string[] = []): Promise<void> {
    if (this.process) {
      throw new Error('LSP client already started');
    }

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleMessage(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[LSP stderr]', data.toString());
    });

    this.process.on('close', (code) => {
      console.log(`[LSP] Process exited with code ${code}`);
      this.process = null;
      this.initialized = false;
    });

    // Initialize the server
    await this.initialize();
  }

  /**
   * Stop the language server
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }

  /**
   * Initialize the language server
   */
  private async initialize(): Promise<void> {
    const result = await this.request('initialize', {
      processId: process.pid,
      rootUri: `file://${this.rootUri}`,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false },
          completion: { dynamicRegistration: false },
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
        },
        workspace: {
          symbol: { dynamicRegistration: false },
        },
      },
    });

    this.notify('initialized', {});
    this.initialized = true;
  }

  /**
   * Go to definition
   */
  async definition(uri: string, position: Position): Promise<Location | Location[] | null> {
    return this.request('textDocument/definition', {
      textDocument: { uri: `file://${uri}` },
      position,
    }) as Promise<Location | Location[] | null>;
  }

  /**
   * Find references
   */
  async references(uri: string, position: Position, includeDeclaration = true): Promise<Location[]> {
    return this.request('textDocument/references', {
      textDocument: { uri: `file://${uri}` },
      position,
      context: { includeDeclaration },
    }) as Promise<Location[]>;
  }

  /**
   * Get hover information
   */
  async hover(uri: string, position: Position): Promise<HoverResult | null> {
    return this.request('textDocument/hover', {
      textDocument: { uri: `file://${uri}` },
      position,
    }) as Promise<HoverResult | null>;
  }

  /**
   * Get document symbols
   */
  async documentSymbols(uri: string): Promise<SymbolInformation[]> {
    return this.request('textDocument/documentSymbol', {
      textDocument: { uri: `file://${uri}` },
    }) as Promise<SymbolInformation[]>;
  }

  /**
   * Search workspace symbols
   */
  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    return this.request('workspace/symbol', {
      query,
    }) as Promise<SymbolInformation[]>;
  }

  /**
   * Get completions
   */
  async completion(uri: string, position: Position): Promise<CompletionItem[]> {
    const result = await this.request('textDocument/completion', {
      textDocument: { uri: `file://${uri}` },
      position,
    });
    
    if (Array.isArray(result)) {
      return result;
    }
    if (result && typeof result === 'object' && 'items' in result) {
      return (result as { items: CompletionItem[] }).items;
    }
    return [];
  }

  /**
   * Prepare rename
   */
  async prepareRename(uri: string, position: Position): Promise<Range | null> {
    return this.request('textDocument/prepareRename', {
      textDocument: { uri: `file://${uri}` },
      position,
    }) as Promise<Range | null>;
  }

  /**
   * Rename symbol
   */
  async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    return this.request('textDocument/rename', {
      textDocument: { uri: `file://${uri}` },
      position,
      newName,
    }) as Promise<WorkspaceEdit | null>;
  }

  /**
   * Open a document
   */
  didOpen(uri: string, content: string): void {
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: `file://${uri}`,
        languageId: this.languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Close a document
   */
  didClose(uri: string): void {
    this.notify('textDocument/didClose', {
      textDocument: { uri: `file://${uri}` },
    });
  }

  // ============================================
  // Protocol helpers
  // ============================================

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP client not started'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
      this.process.stdin.write(content);
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      return;
    }

    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });

    const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
    this.process.stdin.write(content);
  }

  private handleMessage(data: string): void {
    // Parse LSP message (simplified - doesn't handle partial messages)
    const match = data.match(/Content-Length: (\d+)\r\n\r\n(.*)/s);
    if (!match) return;

    try {
      const body = JSON.parse(match[2]!);
      
      if ('id' in body && this.pendingRequests.has(body.id)) {
        const pending = this.pendingRequests.get(body.id)!;
        this.pendingRequests.delete(body.id);

        if ('error' in body) {
          pending.reject(new Error(body.error.message));
        } else {
          pending.resolve(body.result);
        }
      }
    } catch (error) {
      console.error('[LSP] Failed to parse message:', error);
    }
  }
}
