const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getAllSessions, deleteSession } = require('./sessionReader');
const { CardStore } = require('./cardStore');
const { colorForSession, PALETTE } = require('./colorUtil');

function patchClaudeExtension() {
  try {
    const { execSync } = require('child_process');
    const patchScript = path.join(__dirname, '..', 'patch-claude.js');
    const output = execSync(`node "${patchScript}"`, { encoding: 'utf-8' });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, error: e.stderr || e.message };
  }
}

// Helper: find a Claude Code tab matching a session
function findClaudeTab(session) {
  if (!session) return null;
  const candidates = [session.customTitle, session.aiTitle, session.firstPrompt?.substring(0, 40)].filter(Boolean);
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!tab.input || !String(tab.input.viewType || '').includes('claudeVSCodePanel')) continue;
      for (const candidate of candidates) {
        const short = candidate.substring(0, 15);
        if (tab.label && (tab.label.includes(short) || short.includes(tab.label.substring(0, 15)))) {
          return { tab, group };
        }
      }
    }
  }
  return null;
}

class SessionManagerPanel {
  static currentPanel = undefined;

  static createOrShow(context) {
    const column = vscode.ViewColumn.One;

    if (SessionManagerPanel.currentPanel) {
      SessionManagerPanel.currentPanel._panel.reveal(column);
      SessionManagerPanel.currentPanel._refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeSessionManager',
      'Claude Sessions',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media')),
        ],
      },
    );

    SessionManagerPanel.currentPanel = new SessionManagerPanel(panel, context);

    setTimeout(() => {
      vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    }, 500);
  }

  constructor(panel, context) {
    this._panel = panel;
    this._context = context;
    this._store = new CardStore(context.globalState);
    this._maxGroups = context.globalState.get('claude-session-manager.maxGroups', 5);
    this._alignMode = context.globalState.get('claude-session-manager.alignMode', false);

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      SessionManagerPanel.currentPanel = undefined;
      context.globalState.update('claude-session-manager.panelOpen', false);
    }, null, context.subscriptions);

    this._panel.onDidChangeViewState(() => {
      if (this._panel.visible) this._refresh();
    }, null, context.subscriptions);

    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      null,
      context.subscriptions,
    );

    this._refresh();
  }

  _refresh() {
    const allSessions = getAllSessions();

    const existingIds = this._store.getSessionIds();
    for (const session of allSessions) {
      if (!existingIds.has(session.sessionId)) {
        this._store.addCard(session.sessionId);
      }
    }

    const cards = this._store.getCards();

    // Detect open Claude Code tabs and their positions
    const openTitles = new Set();
    const titleToColumn = new Map(); // tab label → viewColumn
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel')) {
          openTitles.add(tab.label);
          titleToColumn.set(tab.label, group.viewColumn);
        }
      }
    }

    const mergedCards = [];
    for (const card of cards) {
      const session = allSessions.find(s => s.sessionId === card.sessionId);
      if (session) {
        const titles = [session.customTitle, session.aiTitle, session.firstPrompt?.substring(0, 30)].filter(Boolean);
        let isOpen = false;
        let column = 0;
        for (const t of titles) {
          for (const [label, col] of titleToColumn) {
            if (label.includes(t.substring(0, 15)) || t.includes(label.substring(0, 15))) {
              isOpen = true;
              column = col;
              break;
            }
          }
          if (isOpen) break;
        }
        mergedCards.push({ ...session, ...card, color: colorForSession(card.sessionId), isOpen, column });
      }
    }

    // Sort by order (no more pinned-first, order is the source of truth)
    mergedCards.sort((a, b) => a.order - b.order);

    this._panel.webview.postMessage({ type: 'update-cards', cards: mergedCards });
    this._panel.webview.postMessage({ type: 'set-max-groups', value: this._maxGroups });
    this._panel.webview.postMessage({ type: 'set-align-mode', value: this._alignMode });
  }

  // Close all Claude Code tabs, then open top N cards in order
  async _alignSessions(force) {
    if (!this._alignMode && !force) return;

    const cards = this._store.getCards();
    cards.sort((a, b) => a.order - b.order);
    const topN = cards.slice(0, this._maxGroups);

    // Step 1: Close ALL Claude Code tabs one by one (re-query after each)
    let closed = 0;
    while (closed < 30) {
      let found = null;
      for (const group of vscode.window.tabGroups.all) {
        if (group.viewColumn === vscode.ViewColumn.One) continue;
        for (const tab of group.tabs) {
          if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel')) {
            found = tab;
            break;
          }
        }
        if (found) break;
      }
      if (!found) break;
      try { await vscode.window.tabGroups.close(found); } catch { break; }
      closed++;
    }
    await new Promise(r => setTimeout(r, 200));

    // Step 2: Open each session at its target column
    for (let i = 0; i < topN.length; i++) {
      const col = i + 2;
      if (col > 8) break;
      await vscode.commands.executeCommand('claude-vscode.editor.open', topN[i].sessionId, undefined, col);
      await new Promise(r => setTimeout(r, 250));
    }

    await vscode.commands.executeCommand('workbench.action.evenEditorWidths');
    this._panel.reveal(vscode.ViewColumn.One);
    this._refresh();
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'open-session': {
        // Count current Claude Code tabs
        const claudeTabs = [];
        for (const g of vscode.window.tabGroups.all) {
          for (const tab of g.tabs) {
            if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel')) {
              claudeTabs.push({ tab, group: g });
            }
          }
        }

        if (claudeTabs.length >= this._maxGroups) {
          const toClose = claudeTabs[claudeTabs.length - 1];
          await vscode.window.tabGroups.close(toClose.tab);
        }

        const usedColumns = new Set();
        for (const g of vscode.window.tabGroups.all) {
          if (g.viewColumn !== undefined) usedColumns.add(g.viewColumn);
        }
        let col = vscode.ViewColumn.Beside;
        for (let c = vscode.ViewColumn.One; c <= vscode.ViewColumn.Nine; c++) {
          if (!usedColumns.has(c)) { col = c; break; }
        }

        const allSessions3 = getAllSessions();
        const session3 = allSessions3.find(s => s.sessionId === msg.sessionId);
        const title = session3 ? (session3.displayTitle || session3.firstPrompt?.substring(0, 30)) : msg.sessionId.substring(0, 8);
        const color = colorForSession(msg.sessionId);

        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId, undefined, col);
        await vscode.commands.executeCommand('workbench.action.evenEditorWidths');

        const indicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
        indicator.text = `$(arrow-right) ${title}`;
        indicator.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        indicator.color = color;
        indicator.show();
        setTimeout(() => indicator.dispose(), 3000);
        break;
      }

      case 'move-to-top': {
        this._store.moveToTop(msg.sessionId);
        this._refresh();
        if (this._alignMode) {
          await this._alignSessions();
        }
        break;
      }

      case 'close-session-tab': {
        // Use Claude Code's own command to find and focus the tab, then close it
        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId);
        await new Promise(r => setTimeout(r, 300));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // Move this card after the top N slots, so cards below shift up
        this._store.moveToPosition(msg.sessionId, this._maxGroups);
        await new Promise(r => setTimeout(r, 200));

        if (this._alignMode) await this._alignSessions(true);
        this._refresh();
        break;
      }

      case 'delete-session': {
        const answer = await vscode.window.showWarningMessage(
          `确定要删除这个 Claude 会话吗？\n这将同时删除对话记录，无法恢复。`,
          { modal: true },
          '删除',
        );
        if (answer === '删除') {
          this._store.removeCard(msg.sessionId);
          deleteSession(msg.sessionId);
          this._refresh();
        }
        break;
      }

      case 'update-label':
        this._store.updateCard(msg.sessionId, { label: msg.label });
        this._refresh();
        break;

      case 'reorder-cards':
        this._store.reorderCards(msg.orderedIds);
        this._refresh();
        if (this._alignMode) {
          await this._alignSessions();
        }
        break;

      case 'set-max-groups':
        this._maxGroups = Math.max(1, Math.min(9, msg.value || 5));
        this._context.globalState.update('claude-session-manager.maxGroups', this._maxGroups);
        if (this._alignMode) await this._alignSessions();
        break;

      case 'toggle-align':
        this._alignMode = msg.value;
        this._context.globalState.update('claude-session-manager.alignMode', this._alignMode);
        if (this._alignMode) await this._alignSessions();
        this._refresh();
        break;

      case 'refresh':
        await this._alignSessions(true);
        break;

      case 'patch-claude': {
        const result = patchClaudeExtension(this._context);
        if (result.ok) {
          vscode.window.showInformationMessage('颜色配置成功！请重启 VS Code 生效。', '重启').then(choice => {
            if (choice === '重启') vscode.commands.executeCommand('workbench.action.reloadWindow');
          });
        } else {
          vscode.window.showErrorMessage(`配置失败: ${result.error}`);
        }
        break;
      }
    }
  }

  _getHtml() {
    const webview = this._panel.webview;
    const mediaPath = path.join(this._context.extensionPath, 'media');
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'panel.css')));
    const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'panel.js')));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>Claude Sessions</title>
</head>
<body>
  <div class="toolbar">
    <h2 class="toolbar-title">Claude Sessions</h2>
    <div class="toolbar-actions">
      <label class="align-toggle" title="对齐模式：按卡片顺序排列窗口">
        <input id="chk-align" type="checkbox"> 对齐
      </label>
      <label class="max-groups-label">上限 <input id="input-max-groups" type="number" min="1" max="9" value="5" class="max-groups-input"></label>
      <button id="btn-patch" class="btn">颜色</button>
      <button id="btn-refresh" class="btn">刷新</button>
    </div>
  </div>

  <div id="cards-container" class="cards-container"></div>

  <div id="empty-state" class="empty-state" style="display:none;">
    <p>当前项目还没有 Claude 会话</p>
  </div>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

module.exports = { SessionManagerPanel };
