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

// Get ordered list of Claude Code tabs (by viewColumn)
function getClaudeTabs() {
  const tabs = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel')) {
        tabs.push({ tab, label: tab.label, column: group.viewColumn });
      }
    }
  }
  tabs.sort((a, b) => a.column - b.column);
  return tabs;
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
    this._alignMode = context.globalState.get('claude-session-manager.alignMode', false);
    this._syncTimer = null;

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      SessionManagerPanel.currentPanel = undefined;
      context.globalState.update('claude-session-manager.panelOpen', false);
      if (this._syncTimer) clearInterval(this._syncTimer);
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
    this._startSyncIfNeeded();
  }

  _startSyncIfNeeded() {
    if (this._syncTimer) clearInterval(this._syncTimer);
    // Always refresh card states (open/column) every 3s
    // Align mode additionally reorders cards to match editor groups
    this._syncTimer = setInterval(() => {
      if (this._alignMode) this._syncFromEditorGroups();
      this._refresh();
    }, 3000);
  }

  // Sync card order FROM the actual editor group layout
  _syncFromEditorGroups() {
    const claudeTabs = getClaudeTabs();
    if (claudeTabs.length === 0) return;

    const allSessions = getAllSessions();
    const cards = this._store.getCards();

    // Build tab label → sessionId mapping
    const tabSessionIds = [];
    for (const ct of claudeTabs) {
      let matched = null;
      for (const sess of allSessions) {
        const candidates = [sess.customTitle, sess.aiTitle, sess.lastPrompt, sess.firstPrompt].filter(Boolean);
        for (const t of candidates) {
          const tShort = t.substring(0, 12);
          if (ct.label && tShort.length >= 5 && (ct.label.includes(tShort) || t.includes(ct.label.substring(0, 12)))) {
            matched = sess.sessionId;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) tabSessionIds.push(matched);
    }

    if (tabSessionIds.length === 0) return;

    // Reorder: open tabs first (in editor group order), then remaining cards
    const openSet = new Set(tabSessionIds);
    const remaining = cards.filter(c => !openSet.has(c.sessionId)).map(c => c.sessionId);
    const newOrder = [...tabSessionIds, ...remaining];

    // Only update if order actually changed
    const currentOrder = cards.map(c => c.sessionId);
    if (JSON.stringify(newOrder) !== JSON.stringify(currentOrder)) {
      this._store.reorderCards(newOrder);
      this._refresh();
    }
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
    const claudeTabs = getClaudeTabs();
    const labelToColumn = new Map();
    for (const ct of claudeTabs) labelToColumn.set(ct.label, ct.column);

    const mergedCards = [];
    for (const card of cards) {
      const session = allSessions.find(s => s.sessionId === card.sessionId);
      if (session) {
        let isOpen = false;
        let column = 0;
        const candidates = [session.customTitle, session.aiTitle, session.lastPrompt, session.firstPrompt].filter(Boolean);
        for (const t of candidates) {
          const tShort = t.substring(0, 12);
          for (const [label, col] of labelToColumn) {
            if (tShort.length >= 5 && (label.includes(tShort) || t.includes(label.substring(0, 12)))) {
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

    mergedCards.sort((a, b) => a.order - b.order);

    try {
      this._panel.webview.postMessage({ type: 'update-cards', cards: mergedCards });
      this._panel.webview.postMessage({ type: 'set-align-mode', value: this._alignMode });
    } catch {}
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'open-session': {
        // Append to the right side (next available column)
        const usedColumns = new Set();
        for (const g of vscode.window.tabGroups.all) {
          if (g.viewColumn !== undefined) usedColumns.add(g.viewColumn);
        }
        let col = vscode.ViewColumn.Beside;
        for (let c = vscode.ViewColumn.One; c <= vscode.ViewColumn.Nine; c++) {
          if (!usedColumns.has(c)) { col = c; break; }
        }

        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId, undefined, col);
        await vscode.commands.executeCommand('workbench.action.evenEditorWidths');
        // Refresh immediately + after delay (tab may not be ready yet)
        this._refresh();
        setTimeout(() => this._refresh(), 800);
        break;
      }

      case 'close-session-tab': {
        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId);
        await new Promise(r => setTimeout(r, 300));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await new Promise(r => setTimeout(r, 200));
        this._refresh();
        break;
      }

      case 'delete-session': {
        const isZhMsg = vscode.env.language.startsWith('zh');
        const confirmLabel = isZhMsg ? '删除' : 'Delete';
        const answer = await vscode.window.showWarningMessage(
          isZhMsg
            ? '确定要删除这个 Claude 会话吗？\n这将同时删除对话记录，无法恢复。'
            : 'Delete this Claude session?\nThis will permanently remove the conversation history.',
          { modal: true },
          confirmLabel,
        );
        if (answer === confirmLabel) {
          // Close the tab first (if open), then delete
          try {
            await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId);
            await new Promise(r => setTimeout(r, 300));
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await new Promise(r => setTimeout(r, 300));
          } catch {}
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
        break;

      case 'even-widths':
        await vscode.commands.executeCommand('workbench.action.evenEditorWidths');
        break;

      case 'toggle-align':
        this._alignMode = msg.value;
        this._context.globalState.update('claude-session-manager.alignMode', this._alignMode);
        this._startSyncIfNeeded();
        if (this._alignMode) this._syncFromEditorGroups();
        this._refresh();
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
    const isZh = vscode.env.language.startsWith('zh');

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
      <label class="align-toggle" title="${isZh ? '对齐模式：卡片顺序跟随 editor group' : 'Align: sync card order with editor groups'}">
        <input id="chk-align" type="checkbox"> ${isZh ? '对齐' : 'Align'}
      </label>
      <button id="btn-even" class="btn">${isZh ? '等宽' : 'Even'}</button>
      <button id="btn-patch" class="btn">${isZh ? '颜色' : 'Color'}</button>
    </div>
  </div>

  <div id="cards-container" class="cards-container"></div>

  <div id="empty-state" class="empty-state" style="display:none;">
    <p>${isZh ? '当前项目还没有 Claude 会话' : 'No Claude sessions in this project'}</p>
  </div>

  <script nonce="${nonce}">window.__LANG = "${vscode.env.language}";</script>
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
