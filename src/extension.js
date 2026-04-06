const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SessionManagerPanel } = require('./panelProvider');

const PANEL_OPEN_KEY = 'claude-session-manager.panelOpen';

function checkColorPatch() {
  try {
    const extBase = path.join(os.homedir(), '.vscode', 'extensions');
    const dirs = fs.readdirSync(extBase).filter(d => d.startsWith('anthropic.claude-code-'));
    if (dirs.length === 0) return;
    const wvFile = path.join(extBase, dirs[dirs.length - 1], 'webview', 'index.js');
    const content = fs.readFileSync(wvFile, 'utf-8');
    if (!content.includes('__SESSION_COLOR_PATCH__')) {
      const isZh = vscode.env.language.startsWith('zh');
      vscode.window.showInformationMessage(
        isZh ? 'Session Deck: Claude Code 颜色边框未配置，是否现在配置？' : 'Session Deck: Claude Code color borders not configured. Configure now?',
        isZh ? '配置' : 'Configure',
      ).then(choice => {
        if (choice) {
          vscode.commands.executeCommand('claude-session-manager.open');
          // Trigger patch after panel is ready
          setTimeout(() => {
            if (SessionManagerPanel.currentPanel) {
              SessionManagerPanel.currentPanel._panel.webview.postMessage({ type: 'trigger-patch' });
            }
          }, 1000);
        }
      });
    }
  } catch {}
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-session-manager.open', () => {
      SessionManagerPanel.createOrShow(context);
      context.globalState.update(PANEL_OPEN_KEY, true);
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(comment-discussion) Claude';
  statusBar.tooltip = 'Claude Session Manager';
  statusBar.command = 'claude-session-manager.open';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Auto-restore panel if it was open last time
  if (context.globalState.get(PANEL_OPEN_KEY)) {
    SessionManagerPanel.createOrShow(context);
  }

  // Check if color patch is applied
  checkColorPatch();
}

function deactivate() {}

module.exports = { activate, deactivate };
