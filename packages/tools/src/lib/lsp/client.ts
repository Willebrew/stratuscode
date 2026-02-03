/**
 * LSP Client
 *
 * Manages Language Server Protocol connections for code intelligence.
 * Uses proper buffered message parsing for reliable JSON-RPC communication.
 */

import { pathToFileURL } from 'url';
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

export interface CallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: Range;
  selectionRange: Range;
  detail?: string;
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem;
  fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem;
  fromRanges: Range[];
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
  private buffer = Buffer.alloc(0);
  private diagnostics = new Map<string, Diagnostic[]>();
  private openedFiles = new Set<string>();
  private fileVersions = new Map<string, number>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();

  constructor(options: LspClientOptions) {
    this.rootUri = options.rootUri;
    this.languageId = options.languageId;

    // Register notification handlers
    this.notificationHandlers.set('textDocument/publishDiagnostics', (params: unknown) => {
      const p = params as { uri: string; diagnostics?: Diagnostic[] };
      this.diagnostics.set(p.uri, p.diagnostics || []);
    });
    // No-op handlers for common notifications to avoid unhandled warnings
    this.notificationHandlers.set('window/logMessage', () => {});
    this.notificationHandlers.set('window/showMessage', () => {});
    this.notificationHandlers.set('$/progress', () => {});
  }

  /**
   * Connect to an existing language server process (used by manager)
   */
  async connect(childProcess: ChildProcess): Promise<void> {
    if (this.process) {
      throw new Error('LSP client already connected');
    }
    this.process = childProcess;
    this.setupProcessHandlers();
    await this.initialize();
  }

  /**
   * Start the language server by spawning a new process
   */
  async start(command: string, args: string[] = []): Promise<void> {
    if (this.process) {
      throw new Error('LSP client already started');
    }

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupProcessHandlers();
    await this.initialize();
  }

  /**
   * Stop the language server
   */
  stop(): void {
    if (this.process) {
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('LSP client stopped'));
      }
      this.pendingRequests.clear();
      this.process.kill();
      this.process = null;
      this.initialized = false;
      this.openedFiles.clear();
      this.fileVersions.clear();
      this.diagnostics.clear();
      this.buffer = Buffer.alloc(0);
    }
  }

  /**
   * Check if the client is connected and alive
   */
  isAlive(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  // ============================================
  // Document management
  // ============================================

  /**
   * Open a document (sends didOpen notification)
   */
  didOpen(filePath: string, content: string): void {
    const uri = pathToFileURL(filePath).href;
    if (this.openedFiles.has(uri)) {
      // Already open — send didChange instead
      const version = (this.fileVersions.get(uri) || 1) + 1;
      this.fileVersions.set(uri, version);
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
      return;
    }

    this.openedFiles.add(uri);
    this.fileVersions.set(uri, 1);
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Close a document
   */
  didClose(filePath: string): void {
    const uri = pathToFileURL(filePath).href;
    this.openedFiles.delete(uri);
    this.fileVersions.delete(uri);
    this.notify('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  // ============================================
  // LSP operations
  // ============================================

  async definition(filePath: string, position: Position): Promise<Location | Location[] | null> {
    return this.request('textDocument/definition', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
    }) as Promise<Location | Location[] | null>;
  }

  async references(filePath: string, position: Position, includeDeclaration = true): Promise<Location[]> {
    return this.request('textDocument/references', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
      context: { includeDeclaration },
    }) as Promise<Location[]>;
  }

  async hover(filePath: string, position: Position): Promise<HoverResult | null> {
    return this.request('textDocument/hover', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
    }) as Promise<HoverResult | null>;
  }

  async documentSymbols(filePath: string): Promise<SymbolInformation[]> {
    return this.request('textDocument/documentSymbol', {
      textDocument: { uri: pathToFileURL(filePath).href },
    }) as Promise<SymbolInformation[]>;
  }

  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    return this.request('workspace/symbol', {
      query,
    }) as Promise<SymbolInformation[]>;
  }

  async completion(filePath: string, position: Position): Promise<CompletionItem[]> {
    const result = await this.request('textDocument/completion', {
      textDocument: { uri: pathToFileURL(filePath).href },
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

  async prepareRename(filePath: string, position: Position): Promise<Range | null> {
    return this.request('textDocument/prepareRename', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
    }) as Promise<Range | null>;
  }

  async rename(filePath: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    return this.request('textDocument/rename', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
      newName,
    }) as Promise<WorkspaceEdit | null>;
  }

  async goToImplementation(filePath: string, position: Position): Promise<Location | Location[] | null> {
    return this.request('textDocument/implementation', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
    }) as Promise<Location | Location[] | null>;
  }

  async prepareCallHierarchy(filePath: string, position: Position): Promise<CallHierarchyItem[]> {
    const result = await this.request('textDocument/prepareCallHierarchy', {
      textDocument: { uri: pathToFileURL(filePath).href },
      position,
    });
    return (result as CallHierarchyItem[]) || [];
  }

  async incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]> {
    const result = await this.request('callHierarchy/incomingCalls', { item });
    return (result as CallHierarchyIncomingCall[]) || [];
  }

  async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
    const result = await this.request('callHierarchy/outgoingCalls', { item });
    return (result as CallHierarchyOutgoingCall[]) || [];
  }

  /**
   * Get stored diagnostics for a file
   */
  getDiagnostics(filePath: string): Diagnostic[] {
    const uri = pathToFileURL(filePath).href;
    return this.diagnostics.get(uri) || [];
  }

  // ============================================
  // Protocol helpers
  // ============================================

  private setupProcessHandlers(): void {
    this.process!.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    this.process!.stderr?.on('data', (_data: Buffer) => {
      // Stderr from LSP servers is informational, don't crash
    });

    this.process!.on('close', () => {
      this.process = null;
      this.initialized = false;
    });
  }

  private async initialize(): Promise<void> {
    const result = await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.rootUri).href,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            didSave: true,
          },
          completion: { dynamicRegistration: false },
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          implementation: { dynamicRegistration: false },
          callHierarchy: { dynamicRegistration: false },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
        workspace: {
          symbol: { dynamicRegistration: false },
        },
      },
    }, 45000); // Longer timeout for initialize

    this.notify('initialized', {});
    this.initialized = true;
  }

  private request(method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP client not started'));
        return;
      }

      const id = ++this.requestId;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });

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

  /**
   * Buffered data handler — accumulates chunks and extracts complete messages
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Malformed header — skip past it
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1]!, 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) break; // Wait for more data

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);
      this.handleMessage(body);
    }
  }

  /**
   * Handle a single complete JSON-RPC message
   */
  private handleMessage(json: string): void {
    try {
      const msg = JSON.parse(json);

      if ('id' in msg && this.pendingRequests.has(msg.id)) {
        // Response to our request
        const pending = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if ('error' in msg) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      } else if ('method' in msg && !('id' in msg)) {
        // Server notification
        this.handleNotification(msg.method, msg.params);
      } else if ('method' in msg && 'id' in msg) {
        // Server request — respond with empty result
        this.sendResponse(msg.id, null);
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  private handleNotification(method: string, params: unknown): void {
    const handler = this.notificationHandlers.get(method);
    if (handler) handler(params);
  }

  private sendResponse(id: number | string, result: unknown): void {
    if (!this.process?.stdin) return;

    const message = JSON.stringify({
      jsonrpc: '2.0',
      id,
      result,
    });

    const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
    this.process.stdin.write(content);
  }
}
