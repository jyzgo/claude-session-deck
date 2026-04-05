const vscode = require('vscode');
const path = require('path');
const { getAllSessions, deleteSession } = require('./sessionReader');
const { CardStore } = require('./cardStore');

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
  }

  constructor(panel, context) {
    this._panel = panel;
    this._context = context;
    this._store = new CardStore(context.globalState);

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => { SessionManagerPanel.currentPanel = undefined; }, null, context.subscriptions);

    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      null,
      context.subscriptions,
    );

    // Initial data push
    this._refresh();
  }

  _refresh() {
    const allSessions = getAllSessions();
    const cards = this._store.getCards();
    const cardIds = new Set(cards.map(c => c.sessionId));

    // Merge session data with card config; pinned first, then by order
    const mergedCards = [];
    for (const card of cards) {
      const session = allSessions.find(s => s.sessionId === card.sessionId);
      if (session) {
        mergedCards.push({ ...session, ...card });
      }
    }

    // Sort: pinned first, then by order
    mergedCards.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.order - b.order;
    });

    this._panel.webview.postMessage({ type: 'update-cards', cards: mergedCards });
  }

  _sendAvailableSessions() {
    const allSessions = getAllSessions();
    const cardIds = this._store.getSessionIds();
    const available = allSessions.filter(s => !cardIds.has(s.sessionId));
    this._panel.webview.postMessage({ type: 'available-sessions', sessions: available });
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'open-session':
        await vscode.commands.executeCommand('claude-vscode.editor.open', msg.sessionId);
        break;

      case 'remove-card':
        this._store.removeCard(msg.sessionId);
        this._refresh();
        break;

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

      case 'request-import':
        this._sendAvailableSessions();
        break;

      case 'add-card':
        this._store.addCard(msg.sessionId);
        this._refresh();
        this._sendAvailableSessions();
        break;

      case 'update-color':
        this._store.updateCard(msg.sessionId, { color: msg.color });
        this._refresh();
        break;

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
      <button id="btn-import" class="btn btn-primary">+ 导入会话</button>
      <button id="btn-refresh" class="btn">刷新</button>
    </div>
  </div>

  <div id="cards-container" class="cards-container"></div>

  <div id="empty-state" class="empty-state" style="display:none;">
    <p>还没有会话卡片</p>
    <p>点击「导入会话」添加当前项目的 Claude 会话</p>
  </div>

  <!-- Import dialog -->
  <div id="import-overlay" class="overlay" style="display:none;">
    <div class="modal">
      <div class="modal-header">
        <h3>导入会话</h3>
        <button id="btn-close-import" class="btn-icon">X</button>
      </div>
      <div id="import-list" class="import-list"></div>
      <div id="import-empty" class="import-empty" style="display:none;">
        所有会话都已在卡片组中
      </div>
    </div>
  </div>

  <!-- Color picker popup -->
  <div id="color-picker" class="color-picker" style="display:none;">
    <div class="color-options"></div>
    <input type="text" class="color-input" placeholder="#hex" maxlength="7">
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
