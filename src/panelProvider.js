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

    // Lock the editor group so it doesn't resize when other groups open/close
    setTimeout(() => {
      vscode.commands.executeCommand('workbench.action.lockEditorGroup');
    }, 500);
  }

  constructor(panel, context) {
    this._panel = panel;
    this._context = context;
    this._store = new CardStore(context.globalState);

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      SessionManagerPanel.currentPanel = undefined;
      context.globalState.update('claude-session-manager.panelOpen', false);
    }, null, context.subscriptions);

    this._panel.onDidChangeViewState(() => {
      if (this._panel.visible) {
        this._refresh();
      }
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

    // Detect which sessions have open Claude Code tabs
    const openTitles = new Set();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel')) {
          openTitles.add(tab.label);
        }
      }
    }

    const mergedCards = [];
    for (const card of cards) {
      const session = allSessions.find(s => s.sessionId === card.sessionId);
      if (session) {
        const title = session.aiTitle || session.firstPrompt.substring(0, 30);
        mergedCards.push({
          ...session,
          ...card,
          color: colorForSession(card.sessionId),
          isOpen: openTitles.has(title) || [...openTitles].some(t => t.includes(title.substring(0, 20))),
        });
      }
    }

    mergedCards.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.order - b.order;
    });

    this._panel.webview.postMessage({ type: 'update-cards', cards: mergedCards });
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'open-session': {
        const usedColumns = new Set();
        for (const g of vscode.window.tabGroups.all) {
          if (g.viewColumn !== undefined) usedColumns.add(g.viewColumn);
        }
        let col = vscode.ViewColumn.Beside;
        for (let c = vscode.ViewColumn.One; c <= vscode.ViewColumn.Nine; c++) {
          if (!usedColumns.has(c)) { col = c; break; }
        }
        const color = colorForSession(msg.sessionId);
        const allSessions = getAllSessions();
        const session = allSessions.find(s => s.sessionId === msg.sessionId);
        const title = session ? (session.aiTitle || session.firstPrompt.substring(0, 30)) : msg.sessionId.substring(0, 8);

        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId, undefined, col);
        await vscode.commands.executeCommand('workbench.action.evenEditorWidths');

        // Flash a colored status bar indicator for 3 seconds
        const indicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
        indicator.text = `$(arrow-right) ${title}`;
        indicator.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        indicator.color = color;
        indicator.show();
        setTimeout(() => indicator.dispose(), 3000);
        break;
      }

      case 'close-session-tab': {
        // Find the matching Claude Code tab by title and close it
        const allSessions2 = getAllSessions();
        const sess = allSessions2.find(s => s.sessionId === msg.sessionId);
        const sessTitle = sess ? sess.aiTitle : '';

        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            // Only match claudeVSCodePanel (not our own claudeSessionManager)
            if (tab.input && String(tab.input.viewType || '').includes('claudeVSCodePanel') &&
                sessTitle && tab.label && tab.label.includes(sessTitle.substring(0, 15))) {
              await vscode.window.tabGroups.close(tab);
              this._refresh();
              return;
            }
          }
        }
        vscode.window.showInformationMessage('没有找到对应的 Claude Code 窗口');
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

      case 'toggle-pin':
        this._store.updateCard(msg.sessionId, { pinned: msg.pinned });
        this._refresh();
        break;

      case 'update-label':
        this._store.updateCard(msg.sessionId, { label: msg.label });
        this._refresh();
        break;

      case 'reorder-cards':
        this._store.reorderCards(msg.orderedIds);
        this._refresh();
        break;

      case 'refresh':
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
      <button id="btn-patch" class="btn">配置颜色</button>
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
