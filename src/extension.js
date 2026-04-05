const vscode = require('vscode');
const { SessionManagerPanel } = require('./panelProvider');

const PANEL_OPEN_KEY = 'claude-session-manager.panelOpen';

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
}

function deactivate() {}

module.exports = { activate, deactivate };
