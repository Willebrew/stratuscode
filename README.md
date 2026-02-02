# StratusCode

A terminal-first AI coding agent powered by SAGE, using OpenAI Responses API exclusively with `gpt-5-mini`.

## Features

- **Terminal UI** - Rich TUI built with Ink/React
- **OpenAI Responses API** - Direct streaming without SDK abstraction
- **Parallel Tool Execution** - Independent tools run simultaneously
- **Multiple Agents** - `build` (full access) and `plan` (read-only)
- **Local Storage** - SQLite + file-based persistence

## Quick Start

```bash
# Install dependencies
bun install

# Set your API key
export OPENAI_API_KEY=sk-...

# Run
bun run stratuscode

# Or with a prompt (non-interactive)
bun run stratuscode -p "What files are in this project?"
```

## Project Structure

```
packages/
├── shared/     # Types and utilities
├── core/       # Agent engine with Responses API
├── tools/      # File and execution tools (read, edit, bash, grep, etc.)
├── storage/    # SQLite + file persistence
└── tui/        # Terminal UI (Ink/React)
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents with line numbers |
| `write` | Create new files |
| `edit` | Surgical string replacements |
| `bash` | Execute shell commands |
| `grep` | Search for patterns in files |
| `glob` | Find files by pattern |
| `ls` | List directory contents |

## Agents

- **build** - Default agent with full access for development work
- **plan** - Read-only agent for analysis and exploration

Switch agents with `Tab` in the TUI.

## Configuration

Create `stratuscode.json` in your project:

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

Or set globally in `~/.stratuscode/config.json`.

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key
- `STRATUSCODE_API_KEY` - Alternative API key
- `STRATUSCODE_BASE_URL` - Custom API base URL

## Development

```bash
# Build all packages
bun run build

# Development mode (watch)
bun run dev

# Type check
bun run typecheck
```

## License

MIT
