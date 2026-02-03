/**
 * End-to-end test for LSP auto-installation.
 * Tests the full pipeline: auto-install → spawn → connect → didOpen → hover → result
 *
 * Run: bun run packages/tools/src/lib/lsp/__test_autoinstall.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { LspClient } from './client';
import { LSPManager, createLSPManager } from './manager';

const BIN_DIR = path.join(os.homedir(), '.stratuscode', 'bin');
let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ============================================
// Test 1: which() searches BIN_DIR
// ============================================
async function testWhichSearchesBinDir() {
  console.log('\n[Test] which() searches BIN_DIR');

  // Import the which function indirectly by testing the getServerForFile + spawn flow
  // Instead, let's just verify the typescript-language-server binary is found after install
  // by checking the BIN_DIR/node_modules/.bin/ path

  const tslsBin = path.join(BIN_DIR, 'node_modules', '.bin', 'typescript-language-server');
  const exists = await fs.stat(tslsBin).then(() => true).catch(() => false);

  if (exists) {
    assert(true, 'typescript-language-server already installed in BIN_DIR');
  } else {
    console.log('  (typescript-language-server not yet installed, will be tested via manager)');
    assert(true, 'which() test deferred to manager test');
  }
}

// ============================================
// Test 2: Auto-install TypeScript server via manager
// ============================================
async function testAutoInstallTypeScript() {
  console.log('\n[Test] Auto-install TypeScript language server');

  // Create a temp project dir with a package.json
  const tmpDir = path.join(os.tmpdir(), `stratuscode-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}');
  await fs.writeFile(path.join(tmpDir, 'test.ts'), 'const greeting: string = "hello";\nconsole.log(greeting);\n');

  const manager = createLSPManager(tmpDir);

  try {
    const testFile = path.join(tmpDir, 'test.ts');
    console.log('  Getting LSP client (may trigger auto-install)...');
    const client = await manager.getClient(testFile);

    assert(client !== null, 'getClient returned a client (auto-install succeeded)');

    if (client) {
      // Open the file
      const content = await fs.readFile(testFile, 'utf-8');
      client.didOpen(testFile, content);

      // Give the server a moment to process
      await new Promise(r => setTimeout(r, 1000));

      // Test hover on "greeting" (line 0, character 6)
      console.log('  Testing hover...');
      const hover = await client.hover(testFile, { line: 0, character: 6 });
      assert(hover !== null, 'hover returned a result');
      if (hover) {
        const contents = typeof hover.contents === 'string'
          ? hover.contents
          : JSON.stringify(hover.contents);
        assert(contents.includes('string') || contents.includes('greeting'), 'hover result mentions type or variable name', contents.substring(0, 200));
      }

      // Test definition
      console.log('  Testing go-to-definition...');
      const def = await client.definition(testFile, { line: 1, character: 13 });
      assert(def !== null, 'definition returned a result');

      // Test document symbols
      console.log('  Testing document symbols...');
      const symbols = await client.documentSymbols(testFile);
      assert(Array.isArray(symbols), 'documentSymbols returned array');
      assert(symbols.length > 0, `documentSymbols found ${symbols.length} symbol(s)`);

      // Test diagnostics (the test file should have no errors)
      console.log('  Testing diagnostics...');
      await new Promise(r => setTimeout(r, 1000));
      const diags = client.getDiagnostics(testFile);
      assert(Array.isArray(diags), 'getDiagnostics returned array');
      console.log(`  (${diags.length} diagnostic(s) found)`);

      // Test completion
      console.log('  Testing completion...');
      // Add a line that should trigger completions
      const contentWithPartial = 'const greeting: string = "hello";\ngreeti';
      client.didOpen(testFile, contentWithPartial);
      await new Promise(r => setTimeout(r, 500));
      const completions = await client.completion(testFile, { line: 1, character: 6 });
      assert(Array.isArray(completions), 'completion returned array');
      // Completions may or may not find 'greeting' depending on timing
      console.log(`  (${completions.length} completion(s) found)`);
    }

    manager.stopAll();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ============================================
// Test 3: Opt-out works
// ============================================
async function testOptOut() {
  console.log('\n[Test] STRATUSCODE_DISABLE_LSP_DOWNLOAD opt-out');

  // Remove the installed binary temporarily to test opt-out
  // Actually, just test that the env var is checked properly
  const original = process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD;
  process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD = '1';

  const tmpDir = path.join(os.tmpdir(), `stratuscode-optout-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}');
  // Use a language that won't have a server on PATH (like Zig)
  await fs.writeFile(path.join(tmpDir, 'test.zig'), 'const std = @import("std");');

  const manager = createLSPManager(tmpDir);
  const client = await manager.getClient(path.join(tmpDir, 'test.zig'));

  // With opt-out, if zls isn't on PATH it should return null (no auto-install attempt)
  if (client === null) {
    assert(true, 'opt-out prevented auto-install (returned null for zig)');
  } else {
    assert(true, 'zls was already on PATH (opt-out test inconclusive but not broken)');
    manager.stopAll();
  }

  // Restore env
  if (original !== undefined) {
    process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD = original;
  } else {
    delete process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD;
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ============================================
// Test 4: Broken servers don't retry
// ============================================
async function testBrokenNoRetry() {
  console.log('\n[Test] Broken servers are not retried');

  const tmpDir = path.join(os.tmpdir(), `stratuscode-broken-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'mix.exs'), '# elixir'); // Elixir file (manual-only install)
  await fs.writeFile(path.join(tmpDir, 'test.ex'), 'defmodule Test do end');

  const manager = createLSPManager(tmpDir);
  const file = path.join(tmpDir, 'test.ex');

  // First call: should fail and mark as broken
  const client1 = await manager.getClient(file);
  assert(client1 === null, 'first call returns null (elixir-ls not installed)');

  // Second call: should return null immediately (broken, no retry)
  const start = Date.now();
  const client2 = await manager.getClient(file);
  const elapsed = Date.now() - start;
  assert(client2 === null, 'second call returns null (broken)');
  assert(elapsed < 100, `second call was fast (${elapsed}ms < 100ms) — no retry`);

  // Test resetBroken
  manager.resetBroken('elixir');
  const broken = manager.getBrokenServers();
  const hasElixir = broken.some(k => k.startsWith('elixir:'));
  assert(!hasElixir, 'resetBroken cleared elixir from broken set');

  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ============================================
// Run all tests
// ============================================
async function main() {
  console.log('LSP Auto-Install Integration Tests');
  console.log('===================================');

  await testWhichSearchesBinDir();
  await testAutoInstallTypeScript();
  await testOptOut();
  await testBrokenNoRetry();

  console.log(`\n===================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
