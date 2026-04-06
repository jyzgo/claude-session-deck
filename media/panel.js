(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const isZh = (window.__LANG || '').startsWith('zh');
  const L = {
    align: isZh ? '对齐' : 'Align',
    color: isZh ? '颜色' : 'Color',
    even: isZh ? '等宽' : 'Even',
    open: isZh ? '打开' : 'Open',
    close: isZh ? '关闭窗口' : 'Close tab',
    del: isZh ? '删除会话' : 'Delete session',
    empty: isZh ? '当前项目还没有 Claude 会话' : 'No Claude sessions in this project',
    active: isZh ? '活跃' : 'Active',
    idle: isZh ? '空闲' : 'Idle',
    rounds: isZh ? '轮' : ' rounds',
  };

  let cards = [];
  let draggedId = null;
  let alignMode = false;

  // ── Elements ───────────────────────────────
  const cardsContainer = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const alignCheckbox = document.getElementById('chk-align');

  // ── Toolbar buttons ────────────────────────
  alignCheckbox.addEventListener('change', () => {
    alignMode = alignCheckbox.checked;
    vscode.postMessage({ type: 'toggle-align', value: alignMode });
  });

  const autoEvenCheckbox = document.getElementById('chk-auto-even');
  autoEvenCheckbox.addEventListener('change', () => {
    vscode.postMessage({ type: 'toggle-auto-even', value: autoEvenCheckbox.checked });
  });

  document.getElementById('btn-even').addEventListener('click', () => {
    vscode.postMessage({ type: 'even-widths' });
  });

  document.getElementById('btn-recolor').addEventListener('click', () => {
    vscode.postMessage({ type: 'recolor' });
  });

  document.getElementById('btn-patch').addEventListener('click', () => {
    vscode.postMessage({ type: 'patch-claude' });
  });

  // Prevent browser default drop behavior
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // ── Messages from extension ────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'update-cards':
        cards = msg.cards;
        renderCards();
        break;
      case 'set-align-mode':
        alignMode = msg.value;
        alignCheckbox.checked = msg.value;
        break;
      case 'set-auto-even':
        autoEvenCheckbox.checked = msg.value;
        break;
    }
  });

  // ── Helpers ────────────────────────────────
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function truncate(str, len) {
    if (!str) return '';
    const first = str.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('<')).find(l => l) || '';
    return first.length > len ? first.substring(0, len) + '...' : first;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Render cards ───────────────────────────
  function renderCards() {
    if (cards.length === 0) {
      cardsContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    cardsContainer.style.display = 'flex';
    emptyState.style.display = 'none';
    cardsContainer.innerHTML = '';

    for (const card of cards) {
      const el = createCardElement(card);
      cardsContainer.appendChild(el);
    }
  }

  function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card' + (card.isOpen ? '' : ' card-inactive');
    div.dataset.sessionId = card.sessionId;
    div.draggable = true;

    // Only show color border for open/active sessions
    if (card.color && card.isOpen) {
      div.style.setProperty('--card-color', card.color);
    }

    const title = card.label || card.displayTitle || card.aiTitle || truncate(card.firstPrompt, 80) || card.slug || card.sessionId.substring(0, 8);

    const snippetParts = [
      card.firstPrompt ? `<span class="snippet-user">🙋 ${escapeHtml(truncate(card.firstPrompt, 60))}</span>` : '',
      card.lastPrompt ? `<span class="snippet-user">🙋 ${escapeHtml(truncate(card.lastPrompt, 60))}</span>` : '',
      card.lastResponse ? `<span class="snippet-ai">🤖 ${escapeHtml(truncate(card.lastResponse, 60))}</span>` : '',
    ].filter(Boolean);
    const snippet = snippetParts.join('<br>');

    // Column badge for open sessions
    const colBadge = card.column ? `<span class="slot-badge slot-active">C${card.column}</span>` : '';

    div.innerHTML = `
      <div class="card-body">
        <div class="card-left-icons">
          ${colBadge}
          <button class="btn-icon btn-open" title="打开">&#9654;</button>
          <button class="btn-icon btn-close" title="关闭窗口">&#10005;</button>
        </div>
        <div class="card-content">
          <div class="card-title-row">
            <div class="card-title"><span class="card-title-text${card.isOpen ? ' title-open' : ''}" data-session-id="${card.sessionId}">${escapeHtml(title)}</span></div>
            <button class="btn-icon btn-delete" title="删除会话">&#128465;</button>
          </div>
          ${snippet ? `<div class="card-snippet">${snippet}</div>` : ''}
          <div class="card-meta">
            <span class="card-meta-item">${card.userTurns}${L.rounds}</span>
            <span class="card-meta-item">${formatSize(card.fileSize)}</span>
            ${card.gitBranch ? `<span class="card-meta-item">${escapeHtml(card.gitBranch)}</span>` : ''}
            <span class="card-meta-item ${card.isActive ? 'status-active' : 'status-inactive'}">
              ${card.isActive ? '● ' + L.active : '○ ' + L.idle}
            </span>
            <span class="card-meta-item">${formatTime(card.lastModified)}</span>
          </div>
        </div>
      </div>
    `;

    // ── Button handlers ──
    div.querySelector('.btn-open').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-session', sessionId: card.sessionId });
    });

    div.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'delete-session', sessionId: card.sessionId });
    });

    div.querySelector('.btn-close').addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'close-session-tab', sessionId: card.sessionId });
    });

    div.querySelector('.card-title-text').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startTitleEdit(e.target, card.sessionId, card.label || '');
    });

    // Double-click inactive card → open at rightmost position
    div.addEventListener('dblclick', (e) => {
      if (e.target.closest('.btn-icon, .btn, button, input, .card-title-text')) return;
      if (!card.isOpen) {
        vscode.postMessage({ type: 'open-session', sessionId: card.sessionId });
      }
    });

    // ── Drag & drop ──
    div.addEventListener('dragstart', (e) => {
      draggedId = card.sessionId;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.sessionId);
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      draggedId = null;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card.sessionId !== draggedId) div.classList.add('drag-over');
    });

    div.addEventListener('dragleave', () => { div.classList.remove('drag-over'); });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      if (draggedId && draggedId !== card.sessionId) {
        const orderedIds = cards.map(c => c.sessionId);
        const fromIdx = orderedIds.indexOf(draggedId);
        if (fromIdx !== -1) {
          orderedIds.splice(fromIdx, 1);
          const insertIdx = orderedIds.indexOf(card.sessionId);
          orderedIds.splice(insertIdx, 0, draggedId);
          vscode.postMessage({ type: 'reorder-cards', orderedIds });
        }
      }
    });

    return div;
  }

  // ── Title inline edit ──────────────────────
  function startTitleEdit(el, sessionId, currentLabel) {
    const current = el.textContent;
    const input = document.createElement('input');
    input.className = 'title-edit';
    input.value = currentLabel || current;
    input.placeholder = current;
    el.replaceWith(input);
    input.focus();
    input.select();

    function finish() {
      const val = input.value.trim();
      if (val !== currentLabel) {
        vscode.postMessage({ type: 'update-label', sessionId, label: val });
      } else {
        const newEl = document.createElement('span');
        newEl.className = 'card-title-text';
        newEl.dataset.sessionId = sessionId;
        newEl.textContent = current;
        newEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          startTitleEdit(newEl, sessionId, val);
        });
        input.replaceWith(newEl);
      }
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }
})();
