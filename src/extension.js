const vscode = require('vscode');
const { SessionManagerPanel } = require('./panelProvider');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-session-manager.open', () => {
      SessionManagerPanel.createOrShow(context);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
