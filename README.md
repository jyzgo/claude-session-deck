# Session Deck for Claude Code

A VS Code extension that provides a card-based session manager for [Claude Code](https://claude.ai/claude-code) conversations.

![Session Deck](https://img.shields.io/badge/VS%20Code-Extension-blue)

## Features

- **Card-based session view** — All Claude Code sessions displayed as compact cards with title, conversation snippets, and metadata
- **Align mode** — Cards auto-sync with editor group layout every 3 seconds. Reorder editor groups and cards follow
- **Color-coded sessions** — Each session gets a deterministic color (hash-based, 24-color palette). Optional border injection into Claude Code panels
- **Open state detection** — Cards show which sessions are currently open with green titles and column badges (C2, C3...)
- **Close/Delete from cards** — Close a session's tab or permanently delete the session file
- **Drag & drop reorder** — Rearrange card order by dragging
- **Double-click to open** — Double-click an inactive card to open its session in a new editor group
- **Even widths** — One-click button to equalize all editor group widths
- **Auto-import** — New sessions are automatically detected and added as cards
- **Persisted state** — Panel open state, align mode, and card order survive VS Code restarts
- **Status bar icon** — Quick access via the status bar

## Installation

### From .vsix file

```bash
code --install-extension claude-session-deck-0.1.0.vsix
```

Or in VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX...`

### From source

```bash
git clone https://github.com/jyzgo/claude-session-deck.git
cd claude-session-deck
npx @vscode/vsce package
code --install-extension claude-session-deck-*.vsix
```

## Usage

1. Open VS Code with a project that has Claude Code sessions
2. Press `Ctrl+Shift+Alt+C` or click the `Claude` status bar icon
3. The Session Deck panel opens on the left with all your sessions as cards

### Toolbar

| Button | Function |
|--------|----------|
| **Align** checkbox | Sync card order with editor group positions (polls every 3s) |
| **Even** | Equalize all editor group widths |
| **Color** | Patch Claude Code to show colored borders on session panels |

### Card Controls

| Icon | Function |
|------|----------|
| ▶ | Open session in a new editor group |
| ✕ | Close the session's editor tab |
| 🗑 | Delete the session permanently |
| Double-click title | Edit card label |
| Double-click card | Open inactive session |
| Drag & drop | Reorder cards |

### Color Borders on Claude Code Panels

Click the **Color** button to patch the Claude Code extension. This adds colored top/bottom borders to each Claude Code panel, making it easy to identify sessions visually. Requires a VS Code restart after patching.

> Note: Claude Code extension updates will overwrite the patch. Just click **Color** again after updates.

## How it works

- Reads session data from `~/.claude/projects/<project>/` JSONL files
- Detects open Claude Code tabs via `vscode.window.tabGroups` API
- Matches sessions to tabs using title/prompt text comparison
- Stores card configuration (order, labels) in VS Code's `globalState`

## Requirements

- VS Code 1.85+
- [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension installed

## License

MIT
