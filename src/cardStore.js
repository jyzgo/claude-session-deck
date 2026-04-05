const vscode = require('vscode');
const { colorForSession } = require('./colorUtil');

const STORE_KEY = 'claude-session-manager.cardGroups';

class CardStore {
  constructor(globalState) {
    this._state = globalState;
  }

  _projectKey() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return '__default__';
    return folders[0].uri.fsPath;
  }

  _load() {
    const all = this._state.get(STORE_KEY, {});
    const key = this._projectKey();
    return all[key] || { cards: [] };
  }

  _save(data) {
    const all = this._state.get(STORE_KEY, {});
    const key = this._projectKey();
    all[key] = data;
    this._state.update(STORE_KEY, all);
  }

  getCards() {
    return this._load().cards;
  }

  getSessionIds() {
    return new Set(this._load().cards.map(c => c.sessionId));
  }

  addCard(sessionId) {
    const data = this._load();
    if (data.cards.some(c => c.sessionId === sessionId)) return;
    data.cards.push({
      sessionId,
      pinned: false,
      order: data.cards.length,
      label: '',
    });
    this._save(data);
  }

  removeCard(sessionId) {
    const data = this._load();
    data.cards = data.cards.filter(c => c.sessionId !== sessionId);
    this._reindex(data);
    this._save(data);
  }

  updateCard(sessionId, updates) {
    const data = this._load();
    const card = data.cards.find(c => c.sessionId === sessionId);
    if (card) {
      Object.assign(card, updates);
      this._save(data);
    }
  }

  reorderCards(orderedIds) {
    const data = this._load();
    const map = new Map(data.cards.map(c => [c.sessionId, c]));
    const reordered = [];
    for (const id of orderedIds) {
      const card = map.get(id);
      if (card) reordered.push(card);
    }
    for (const card of data.cards) {
      if (!orderedIds.includes(card.sessionId)) reordered.push(card);
    }
    data.cards = reordered;
    this._reindex(data);
    this._save(data);
  }

  _reindex(data) {
    data.cards.forEach((c, i) => { c.order = i; });
  }
}

module.exports = { CardStore };
