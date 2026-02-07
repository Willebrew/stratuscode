# StratusCode Cloud

A Next.js web application that deploys StratusCode as a cloud service on Vercel with GitHub OAuth, Vercel Sandbox for isolated code execution, streaming chat UI, and automatic PR creation.

## Features

- **GitHub OAuth** — Sign in with GitHub to access your repositories
- **Repository Selection** — Browse and select any repo you have access to
- **Isolated Sandboxes** — Each session runs in a Vercel Sandbox microVM with a cloned copy of your repo
- **Streaming Chat** — Real-time streaming responses with tool execution visualization
- **Auto PR Creation** — Push changes and create pull requests directly from the UI

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App (Vercel)                                   │
│                                                         │
│  ┌──────────────┐   ┌──────────────────────────────┐   │
│  │  Web UI       │   │  API Routes                   │   │
│  │  (React/TW)   │──▶│  /api/auth/*    (GitHub OAuth)│   │
│  │  Chat + Repo  │   │  /api/chat      (streaming)   │   │
│  │  Selector     │   │  /api/repos     (list repos)  │   │
│  └──────────────┘   │  /api/sessions  (CRUD)        │   │
│                      │  /api/pr        (create PR)   │   │
│                      └───────┬──────────────────────┘   │
│                              │                           │
│                      ┌───────▼──────────────────────┐   │
│                      │  Cloud ChatSession             │   │
│                      │  (adapted from TUI backend)    │   │
│                      │  ┌─────────┐ ┌──────────────┐ │   │
│                      │  │@sage/core│ │@stratuscode/*│ │   │
│                      │  └─────────┘ └──────────────┘ │   │
│                      └───────┬──────────────────────┘   │
│                              │                           │
│                      ┌───────▼──────────────────────┐   │
│                      │  Vercel Sandbox (microVM)      │   │
│                      │  Cloned repo, full filesystem  │   │
│                      └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# GitHub OAuth App credentials
# Create at: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# NextAuth configuration
NEXTAUTH_SECRET=your_random_secret  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# OpenAI API key
OPENAI_API_KEY=your_openai_key
```

### 2. Install Dependencies

```bash
# From monorepo root
bun install

# Or from packages/cloud
cd packages/cloud
bun install
```

### 3. Run Development Server

```bash
cd packages/cloud
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set root directory to `packages/cloud`
4. Add environment variables in Vercel dashboard
5. Deploy

The `vercel.json` is configured with `maxDuration: 300` for long agent runs.

## Project Structure

```
packages/cloud/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth handlers
│   │   ├── chat/                # Streaming chat endpoint
│   │   ├── repos/               # Repository listing
│   │   ├── sessions/            # Session management
│   │   └── pr/                  # PR creation
│   ├── chat/
│   │   ├── page.tsx             # Repo selector
│   │   └── new/                 # Chat interface
│   ├── login/                   # Login page
│   └── page.tsx                 # Landing page
├── components/
│   ├── chat-header.tsx
│   ├── chat-input.tsx
│   ├── message-bubble.tsx
│   ├── message-list.tsx
│   ├── pr-modal.tsx
│   ├── providers.tsx
│   └── repo-selector.tsx
├── hooks/
│   ├── use-chat-stream.ts       # SSE streaming hook
│   └── use-repos.ts             # Repository fetching
├── lib/
│   ├── auth.ts                  # NextAuth configuration
│   ├── cloud-session.ts         # Adapted ChatSession
│   ├── github-pr.ts             # PR creation
│   ├── sandbox.ts               # Vercel Sandbox management
│   ├── session-manager.ts       # Session lifecycle
│   └── storage-shim.ts          # In-memory storage
└── ...config files
```

## Key Differences from TUI

| TUI | Cloud |
|-----|-------|
| SQLite storage | In-memory storage (session-scoped) |
| Local filesystem | Vercel Sandbox microVM |
| `process.cwd()` | Sandbox `workDir` |
| EventEmitter | SSE streaming |
| Bun runtime | Node.js (Vercel) |

## License

MIT
