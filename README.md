# Session Deck for Claude Code

[English](#english) | [中文](#中文)

![Session Deck](https://img.shields.io/badge/VS%20Code-Extension-blue)

---

<a id="english"></a>

## English

A VS Code extension that provides a card-based session manager for [Claude Code](https://claude.ai/claude-code) conversations.

### Features

- **Card-based session view** — All Claude Code sessions displayed as compact cards with title, conversation snippets, and metadata
- **Align mode** — Cards auto-sync with editor group layout every 3 seconds. Reorder editor groups and cards follow
- **Color-coded sessions** — Each session gets a deterministic color (hash-based, 24-color palette). Optional border injection into Claude Code panels
- **Open state detection** — Cards show which sessions are currently open with green titles and column badges (C2, C3...)
- **Close / Delete from cards** — Close a session's tab or permanently delete the session file
- **Drag & drop reorder** — Rearrange card order by dragging
- **Double-click to open** — Double-click an inactive card to open its session in a new editor group
- **Even widths** — One-click button to equalize all editor group widths
- **Auto-import** — New sessions are automatically detected and added as cards
- **Persisted state** — Panel open state, align mode, and card order survive VS Code restarts
- **Status bar icon** — Quick access via the status bar
- **i18n** — Auto-detects VS Code language (Chinese / English)

### Installation

#### From .vsix file

```bash
code --install-extension claude-session-deck-0.2.0.vsix
```

Or in VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX...`

#### From source

```bash
git clone https://github.com/jyzgo/claude-session-deck.git
cd claude-session-deck
npx @vscode/vsce package
code --install-extension claude-session-deck-*.vsix
```

### Usage

1. Open VS Code with a project that has Claude Code sessions
2. Press `Ctrl+Shift+Alt+C` or click the `Claude` status bar icon
3. The Session Deck panel opens on the left with all your sessions as cards

#### Toolbar

| Button | Function |
|--------|----------|
| **Align** toggle | Sync card order with editor group positions (polls every 3s) |
| **Tidy** toggle | Auto-equalize widths on open/close/delete |
| ☰ | Equalize all editor group widths |
| ↻ | Recolor: close all sessions and reopen (refreshes color borders) |
| 🎨 | Patch Claude Code to show colored borders (restart required) |

#### Card Controls

| Icon | Function |
|------|----------|
| ▶ | Open session in a new editor group |
| ✕ | Close the session's editor tab |
| 🗑 | Delete the session permanently |
| Double-click title | Edit card label |
| Double-click card | Open inactive session |
| Drag & drop | Reorder cards |

#### Color Borders on Claude Code Panels

Click the **Color** button to patch the Claude Code extension. This adds colored top/bottom borders to each Claude Code panel, making it easy to identify sessions visually. Requires a VS Code restart after patching.

> Note: Claude Code extension updates will overwrite the patch. Just click **Color** again after updates.

### How It Works

- Reads session data from `~/.claude/projects/<project>/` JSONL files
- Detects open Claude Code tabs via `vscode.window.tabGroups` API
- Matches sessions to tabs using title/prompt text comparison
- Stores card configuration (order, labels) in VS Code's `globalState`

### Requirements

- VS Code 1.85+
- [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension installed

---

<a id="中文"></a>

## 中文

一个 VS Code 扩展，为 [Claude Code](https://claude.ai/claude-code) 对话提供卡片式会话管理器。

### 功能特性

- **卡片式会话视图** — 所有 Claude Code 会话以紧凑卡片形式展示，包含标题、对话摘要和元数据
- **对齐模式** — 卡片每 3 秒自动与 editor group 布局同步，调整编辑器组顺序后卡片跟随变化
- **颜色编码** — 每个会话根据 hash 算法自动分配颜色（24 色色板），可选注入彩色边框到 Claude Code 面板
- **打开状态检测** — 已打开的会话卡片标题变绿，显示列号徽章（C2、C3...）
- **关闭 / 删除** — 直接从卡片关闭会话窗口，或永久删除会话文件
- **拖拽排序** — 拖动卡片调整顺序
- **双击打开** — 双击未激活的卡片，在最右边新建 editor group 打开会话
- **等宽** — 一键均分所有 editor group 宽度
- **自动导入** — 新会话自动检测并添加为卡片
- **状态持久化** — 面板开关状态、对齐模式、卡片顺序在 VS Code 重启后保留
- **状态栏图标** — 通过状态栏快速打开面板
- **多语言** — 自动检测 VS Code 语言（中文 / 英文）

### 安装

#### 从 .vsix 文件安装

```bash
code --install-extension claude-session-deck-0.2.0.vsix
```

或在 VS Code 中：`Ctrl+Shift+P` → `Extensions: Install from VSIX...`

#### 从源码构建

```bash
git clone https://github.com/jyzgo/claude-session-deck.git
cd claude-session-deck
npx @vscode/vsce package
code --install-extension claude-session-deck-*.vsix
```

### 使用方法

1. 用 VS Code 打开一个有 Claude Code 会话的项目
2. 按 `Ctrl+Shift+Alt+C` 或点击状态栏的 `Claude` 图标
3. 左侧打开 Session Deck 面板，所有会话以卡片形式展示

#### 工具栏

| 按钮 | 功能 |
|------|------|
| **对齐** 开关 | 卡片顺序跟随 editor group 位置同步（每 3 秒轮询） |
| **整理** 开关 | 打开/关闭/删除时自动均分宽度 |
| ☰ | 均分所有 editor group 宽度 |
| ↻ | 刷色：关闭所有对话并重新打开（刷新颜色边框） |
| 🎨 | 配置 Claude Code 颜色边框（需重启） |

#### 卡片操作

| 图标 | 功能 |
|------|------|
| ▶ | 在新 editor group 中打开会话 |
| ✕ | 关闭对应的会话窗口 |
| 🗑 | 永久删除会话 |
| 双击标题 | 编辑卡片标签 |
| 双击卡片 | 打开未激活的会话 |
| 拖拽 | 调整卡片顺序 |

#### Claude Code 面板彩色边框

点击 **颜色** 按钮会修补 Claude Code 扩展，为每个对话面板添加颜色上下边框，方便视觉区分不同会话。修补后需要重启 VS Code 生效。

> 注意：Claude Code 扩展更新后会覆盖修补，再点一次「颜色」即可。

### 工作原理

- 读取 `~/.claude/projects/<项目>/` 目录下的 JSONL 会话文件
- 通过 `vscode.window.tabGroups` API 检测已打开的 Claude Code 标签页
- 使用标题/提问文本比较匹配会话和标签页
- 卡片配置（顺序、标签）存储在 VS Code 的 `globalState` 中

### 系统要求

- VS Code 1.85+
- 已安装 [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) 扩展

## License

MIT
