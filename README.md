# StratusCode

StratusCode is an AI coding agent built around the SAGE agentic framework. It provides both a terminal-first CLI and a Web UI, coordinates reasoning from a language model (OpenAI Responses API by default), and executes side-effecting tools (file edits, shell commands, searches, etc.) under SAGE’s orchestration.

This README documents the functionality and usage for both the CLI and Web UI, configuration options, development workflows, and contribution guidelines.

## Key features

- Agent orchestration powered by SAGE (planning, tool selection, retries, parallel execution, subagents)
- Streaming model integration (OpenAI Responses API / gpt-5-mini by default)
- CLI (TUI) for local, terminal-first workflows
- Web UI for browser-based sessions and collaboration
- Rich tool set: read, write, edit, multi_edit, bash, grep, glob, ls, task, and MCP-wrapped remote tools
- Context management and summarization (sliding window summarization)
- Edit verification and linting for code edits
- Local persistence using SQLite and file-backed storage
- Extensible tool registry and MCP client for remote tool integration

---

## Quick start — CLI (local TUI)

1. Install dependencies

```bash
bun install
```

2. Set your API key

```bash
export OPENAI_API_KEY=sk-...
```

3. Launch the TUI

```bash
bun run stratuscode
```

4. Non-interactive usage (single prompt)

```bash
bun run stratuscode -p "What files are in this project?"
```

Notes
- The CLI is the terminal-first experience; it supports switching between the `build` (full access) and `plan` (read-only) agents with Tab.
- The CLI binary/launcher is provided in `bin/stratuscode` (and a Rust wrapper crate is available under `crates/stratuscode-cli`).

Files to inspect
- CLI launcher: crates/stratuscode-cli/src/main.rs
- TUI package: packages/tui

---

## Quick start — Web UI (Cloud)

The Web UI provides a browser-based interface, session management, and optional cloud features.

1. Prepare environment

- Create a `.env` or set environment variables used by `packages/cloud` (see `packages/cloud/.env.example`).
- Set `OPENAI_API_KEY` or set a backend that proxies model requests.

2. Run the web app (development)

```bash
# from the repo root
bun --version # ensure bun is installed
bun run dev --filter packages/cloud
```

3. Use the Web UI

- Create projects, start chat sessions, and run agent tasks from the browser.
- The Web UI discovers and displays available sessions and recent activity.

Files to inspect
- Web app package: packages/cloud
- Convex integration and agent state: packages/cloud/convex

---

## Agents and behavior

- build — Default development agent with full tool access (can edit files, run shell commands, install dependencies when permitted).
- plan — Read-only agent intended for analysis and exploration without side effects.

SAGE responsibility
- SAGE implements the agent loop, provider integration, context management, tool orchestration, and subagent execution (packages/core).
- Tools implement side-effecting primitives (packages/tools) and may be local or exposed via MCP (remote tool servers). SAGE mediates all tool calls.

---

## Tools (selected)

The agent exposes a set of tools that the LLM can call. Tools are registered in the tool registry and validated/executed via the executor.

Common tools (see `packages/tools` for full list):
- read — Read file contents with line numbers
- write — Create files
- edit / multi_edit — Surgical replacements in files
- bash — Execute shell commands (be careful with destructive commands)
- grep — Search for patterns in files
- glob — Find files by pattern
- ls — List directory contents
- task — Execute a subagent task (runs a subagent under SAGE)

MCP tools
- Remote tool servers can be connected via MCP. The MCP client (packages/core/src/mcp/client.ts) discovers remote tools and the bridge (packages/core/src/mcp/tool-bridge.ts) exposes them in the registry as `mcp:<server>:<tool>`.

---

## Configuration

Project-level configuration may be placed in `stratuscode.json` at the repository root. Example:

```json
{
  "model": "gpt-5-mini",
  "temperature": 0.7,
  "agent": {
    "maxDepth": 30,
    "toolTimeout": 60000
  }
}
```

Global config can be set in `~/.stratuscode/config.json`.

Environment variables
- OPENAI_API_KEY — OpenAI API key (or other provider credential if using a proxy)
- STRATUSCODE_API_KEY — Optional alternative key used by some deployments
- STRATUSCODE_BASE_URL — Custom backend URL to proxy or host services

Provider selection and the SAGE provider config are built from this configuration (see `packages/core/src/agent/loop.ts`, function `buildProviderConfig`).

---

## Development

Build all packages

```bash
bun run build
```

Run development watchers

```bash
bun run dev
```

Type checking

```bash
bun run typecheck
```

Run tests (per-package)

```bash
# example for packages/core
bun test packages/core
```

Important locations
- Agent core: packages/core/src/agent/loop.ts, packages/core/src/tools/
- Tools: packages/tools/src
- Storage: packages/storage/src
- Web UI: packages/cloud
- CLI: crates/stratuscode-cli

---

## Contributing

- Use the issue tracker for feature requests and bug reports.
- Follow the code style and run tests before opening a PR.
- Keep changes scoped and add tests for new behavior.

Suggested workflow
1. Fork the repository and create a feature branch.
2. Run the existing test and lint suite.
3. Open a pull request with a clear description of the change and any migration notes.

---

## Security and safety

- The `bash` tool and other side-effecting tools can modify the filesystem and run commands. When running on remote or shared systems, ensure you trust the model and restrict agent capabilities appropriately.
- The agent enforces permission checks and supports hooks to block or modify tool calls (`beforeToolExecution`, etc.).

---

## License

MIT

