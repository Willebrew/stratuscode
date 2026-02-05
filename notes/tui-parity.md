# Ink → Ratatui Parity Matrix

This checklist maps the current Ink TUI features to Ratatui equivalents.

## Core Screens
- Splash screen (`packages/tui/src/components/SplashScreen.tsx`)
- Main chat timeline (`packages/tui/src/components/Chat.tsx`)
- Unified input box (`packages/tui/src/components/UnifiedInput.tsx`)
- Status bar + telemetry (`packages/tui/src/components/InputBar.tsx`, `StatusBar.tsx`)
- Keyboard shortcuts panel (`packages/tui/src/app.tsx`)

## Timeline Elements
- Assistant text + streaming cursor (`Chat.tsx`, `MarkdownText.tsx`)
- Reasoning blocks (`ReasoningBlock.tsx`)
- Tool calls + diffs (`ToolCall.tsx`, `RichDiff.tsx`)
- Status events (`Chat.tsx`)

## Overlays
- Command palette (`CommandPalette.tsx`)
- File mention palette (`FileMentionPalette.tsx`)
- Model picker inline (`ModelPickerInline.tsx`)
- Session history inline (`SessionHistoryInline.tsx`)
- Question prompt inline (`QuestionPromptInline.tsx`)

## Sidebars & Panels
- Todos sidebar (`TodoSidebar.tsx`)
- Plan actions (`PlanActions.tsx`)
- Shortcuts panel (built in `app.tsx`)

## Input & Clipboard
- Bracketed paste handling (`hooks/usePaste.ts`)
- Clipboard image attachment (`util/clipboard.ts`)
- Marker collapsing for paste and image placeholders (`UnifiedInput.tsx`)

## Keybindings / Commands
- Keybindings map (`keybindings.ts`)
- Slash commands (`commands/registry.ts`)
- Global shortcuts (Ctrl+C, Ctrl+N, Ctrl+R, Tab, Esc) (`app.tsx`)

## Non-Interactive Mode
- Single-prompt execution (`non-interactive.ts`)
- Tool call logging + token report

## Storage / Session Behavior
- Timeline persistence (`storage/messages.ts`)
- Session list/load/delete (`storage/sessions.ts`)
- Todos + questions polling (`hooks/useTodos.ts`, `hooks/useQuestions.ts`)

