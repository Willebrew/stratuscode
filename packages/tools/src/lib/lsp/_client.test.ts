import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'events';

// Use query-string cache-busting to bypass mock.module contamination from _manager.test.ts
const { LspClient } = await import('./client?real=1');

// ============================================
// Mock ChildProcess with stdio streams
// ============================================

function createMockProcess() {
  const stdin = {
    write: (data: string) => { mockProcess._stdinData.push(data); },
  };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const processEmitter = new EventEmitter();

  const mockProcess = {
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    kill: () => { mockProcess.exitCode = -1; },
    on: (event: string, handler: (...args: any[]) => void) => {
      processEmitter.on(event, handler);
      return mockProcess;
    },
    _stdinData: [] as string[],
    _processEmitter: processEmitter,
    // Helper: send a JSON-RPC response via stdout
    sendResponse(id: number, result: unknown) {
      const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
      const content = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
      stdout.emit('data', Buffer.from(content));
    },
    sendError(id: number, message: string) {
      const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32600, message } });
      const content = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
      stdout.emit('data', Buffer.from(content));
    },
    sendNotification(method: string, params: unknown) {
      const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
      const content = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
      stdout.emit('data', Buffer.from(content));
    },
    sendServerRequest(id: number, method: string, params: unknown) {
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const content = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
      stdout.emit('data', Buffer.from(content));
    },
  };

  return mockProcess;
}

function autoRespond(mockProcess: ReturnType<typeof createMockProcess>) {
  // Watch stdin for requests and auto-respond
  const originalWrite = mockProcess.stdin.write;
  mockProcess.stdin.write = (data: string) => {
    originalWrite.call(mockProcess.stdin, data);
    // Parse the request
    const match = data.match(/\r\n\r\n(.+)/s);
    if (match) {
      try {
        const req = JSON.parse(match[1]!);
        if (req.id !== undefined) {
          // Auto-respond based on method
          setTimeout(() => {
            if (req.method === 'initialize') {
              mockProcess.sendResponse(req.id, { capabilities: {} });
            } else if (req.method === 'textDocument/hover') {
              mockProcess.sendResponse(req.id, { contents: 'type info' });
            } else if (req.method === 'textDocument/definition') {
              mockProcess.sendResponse(req.id, [{ uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]);
            } else if (req.method === 'textDocument/references') {
              mockProcess.sendResponse(req.id, []);
            } else if (req.method === 'textDocument/documentSymbol') {
              mockProcess.sendResponse(req.id, [{ name: 'x', kind: 13 }]);
            } else if (req.method === 'workspace/symbol') {
              mockProcess.sendResponse(req.id, []);
            } else if (req.method === 'textDocument/completion') {
              mockProcess.sendResponse(req.id, { items: [{ label: 'console' }] });
            } else if (req.method === 'textDocument/prepareRename') {
              mockProcess.sendResponse(req.id, { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } });
            } else if (req.method === 'textDocument/rename') {
              mockProcess.sendResponse(req.id, { changes: {} });
            } else if (req.method === 'textDocument/implementation') {
              mockProcess.sendResponse(req.id, []);
            } else if (req.method === 'textDocument/prepareCallHierarchy') {
              mockProcess.sendResponse(req.id, [{ name: 'fn', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]);
            } else if (req.method === 'callHierarchy/incomingCalls') {
              mockProcess.sendResponse(req.id, []);
            } else if (req.method === 'callHierarchy/outgoingCalls') {
              mockProcess.sendResponse(req.id, []);
            } else {
              mockProcess.sendResponse(req.id, null);
            }
          }, 0);
        }
      } catch {}
    }
  };
}

// ============================================
// Tests
// ============================================

describe('LspClient', () => {
  test('constructor sets rootUri and languageId', () => {
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    expect(client).toBeDefined();
  });

  test('isAlive returns false before connect', () => {
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    expect(client.isAlive()).toBe(false);
  });

  test('connect initializes the LSP session', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    expect(client.isAlive()).toBe(true);
  });

  test('connect throws when already connected', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    await expect(client.connect(mockProc as any)).rejects.toThrow('already connected');
  });

  test('stop kills process and rejects pending requests', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    client.stop();
    expect(client.isAlive()).toBe(false);
  });

  test('didOpen sends textDocument/didOpen notification', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    client.didOpen('/project/test.ts', 'const x = 1;');

    // Check that didOpen was sent to stdin
    const messages = mockProc._stdinData.filter(d => d.includes('didOpen'));
    expect(messages.length).toBe(1);
  });

  test('didOpen sends didChange for already-open files', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    client.didOpen('/project/test.ts', 'const x = 1;');
    client.didOpen('/project/test.ts', 'const x = 2;');

    const changeMessages = mockProc._stdinData.filter(d => d.includes('didChange'));
    expect(changeMessages.length).toBe(1);
  });

  test('didClose sends textDocument/didClose notification', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    client.didOpen('/project/test.ts', 'const x = 1;');
    client.didClose('/project/test.ts');

    const messages = mockProc._stdinData.filter(d => d.includes('didClose'));
    expect(messages.length).toBe(1);
  });

  test('hover returns result', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.hover('/project/test.ts', { line: 0, character: 0 });
    expect(result).toEqual({ contents: 'type info' });
  });

  test('definition returns locations', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.definition('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeArray();
  });

  test('references returns array', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.references('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeArray();
  });

  test('documentSymbols returns symbols', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.documentSymbols('/project/test.ts');
    expect(result[0]!.name).toBe('x');
  });

  test('workspaceSymbols returns array', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.workspaceSymbols('test');
    expect(result).toBeArray();
  });

  test('completion returns items from completion list', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.completion('/project/test.ts', { line: 0, character: 0 });
    expect(result[0]!.label).toBe('console');
  });

  test('completion handles array response', async () => {
    const mockProc = createMockProcess();
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    // Override autoRespond for this test
    mockProc.stdin.write = (data: string) => {
      mockProc._stdinData.push(data);
      const match = data.match(/\r\n\r\n(.+)/s);
      if (match) {
        const req = JSON.parse(match[1]!);
        if (req.id !== undefined) {
          setTimeout(() => {
            if (req.method === 'initialize') {
              mockProc.sendResponse(req.id, { capabilities: {} });
            } else if (req.method === 'textDocument/completion') {
              mockProc.sendResponse(req.id, [{ label: 'direct' }]);
            } else {
              mockProc.sendResponse(req.id, null);
            }
          }, 0);
        }
      }
    };
    await client.connect(mockProc as any);

    const result = await client.completion('/project/test.ts', { line: 0, character: 0 });
    expect(result[0]!.label).toBe('direct');
  });

  test('prepareRename returns range', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.prepareRename('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeDefined();
  });

  test('rename returns workspace edit', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.rename('/project/test.ts', { line: 0, character: 0 }, 'newName');
    expect(result).toEqual({ changes: {} });
  });

  test('goToImplementation returns locations', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.goToImplementation('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeArray();
  });

  test('prepareCallHierarchy returns items', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.prepareCallHierarchy('/project/test.ts', { line: 0, character: 0 });
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('fn');
  });

  test('incomingCalls returns array', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.incomingCalls({ name: 'fn', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } });
    expect(result).toBeArray();
  });

  test('outgoingCalls returns array', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    const result = await client.outgoingCalls({ name: 'fn', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } });
    expect(result).toBeArray();
  });

  test('getDiagnostics returns stored diagnostics', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    // Send a diagnostics notification
    const fileUrl = new URL('file:///project/test.ts').href;
    mockProc.sendNotification('textDocument/publishDiagnostics', {
      uri: fileUrl,
      diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, message: 'error', severity: 1 }],
    });

    // Wait for event processing
    await new Promise(r => setTimeout(r, 10));

    const diags = client.getDiagnostics('/project/test.ts');
    expect(diags.length).toBe(1);
    expect(diags[0]!.message).toBe('error');
  });

  test('getDiagnostics returns empty for unknown file', () => {
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    expect(client.getDiagnostics('/unknown.ts')).toEqual([]);
  });

  test('handles server error response', async () => {
    const mockProc = createMockProcess();
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    mockProc.stdin.write = (data: string) => {
      mockProc._stdinData.push(data);
      const match = data.match(/\r\n\r\n(.+)/s);
      if (match) {
        const req = JSON.parse(match[1]!);
        if (req.id !== undefined) {
          setTimeout(() => {
            if (req.method === 'initialize') {
              mockProc.sendResponse(req.id, { capabilities: {} });
            } else {
              mockProc.sendError(req.id, 'method not supported');
            }
          }, 0);
        }
      }
    };
    await client.connect(mockProc as any);

    await expect(client.hover('/project/test.ts', { line: 0, character: 0 })).rejects.toThrow('method not supported');
  });

  test('handles server request (responds with null)', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    // Server sends a request to the client
    mockProc.sendServerRequest(999, 'workspace/configuration', {});

    // Wait for processing
    await new Promise(r => setTimeout(r, 10));

    // Client should have sent a response
    const responses = mockProc._stdinData.filter(d => d.includes('"id":999'));
    expect(responses.length).toBe(1);
  });

  test('handles malformed header in data', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    // Send malformed data without Content-Length
    (mockProc.stdout as EventEmitter).emit('data', Buffer.from('Bad-Header: xyz\r\n\r\n'));

    // Should not crash — hover still works
    const result = await client.hover('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeDefined();
  });

  test('handles malformed JSON in message', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);

    // Send valid header but invalid JSON body
    const badBody = '{not valid json}';
    const content = `Content-Length: ${Buffer.byteLength(badBody)}\r\n\r\n${badBody}`;
    (mockProc.stdout as EventEmitter).emit('data', Buffer.from(content));

    // Should not crash
    const result = await client.hover('/project/test.ts', { line: 0, character: 0 });
    expect(result).toBeDefined();
  });

  test('notify is no-op when process not started', () => {
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    // Should not throw
    client.didOpen('/test.ts', 'content');
  });

  test('process close resets state', async () => {
    const mockProc = createMockProcess();
    autoRespond(mockProc);
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });
    await client.connect(mockProc as any);
    expect(client.isAlive()).toBe(true);

    // Simulate process close
    mockProc._processEmitter.emit('close');
    expect(client.isAlive()).toBe(false);
  });

  test('handles chunked data across multiple events', async () => {
    const mockProc = createMockProcess();
    const client = new LspClient({ rootUri: '/project', languageId: 'typescript' });

    // Manually handle initialize
    mockProc.stdin.write = (data: string) => {
      mockProc._stdinData.push(data);
      const match = data.match(/\r\n\r\n(.+)/s);
      if (match) {
        const req = JSON.parse(match[1]!);
        if (req.method === 'initialize') {
          // Send response in two chunks
          const msg = JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { capabilities: {} } });
          const full = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
          const mid = Math.floor(full.length / 2);
          setTimeout(() => {
            (mockProc.stdout as EventEmitter).emit('data', Buffer.from(full.slice(0, mid)));
            setTimeout(() => {
              (mockProc.stdout as EventEmitter).emit('data', Buffer.from(full.slice(mid)));
            }, 5);
          }, 0);
        }
      }
    };

    await client.connect(mockProc as any);
    expect(client.isAlive()).toBe(true);
  });
});
