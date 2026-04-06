(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  let cards = [];
  let draggedId = null;
  let alignMode = false;

  // ── Elements ───────────────────────────────
  const cardsContainer = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const maxGroupsInput = document.getElementById('input-max-groups');
  const alignCheckbox = document.getElementById('chk-align');

  // ── Toolbar buttons ────────────────────────
  document.getElementById('btn-refresh').addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  maxGroupsInput.addEventListener('change', () => {
    vscode.postMessage({ type: 'set-max-groups', value: parseInt(maxGroupsInput.value) || 5 });
  });

  alignCheckbox.addEventListener('change', () => {
    alignMode = alignCheckbox.checked;
    vscode.postMessage({ type: 'toggle-align', value: alignMode });
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
      case 'set-max-groups':
        maxGroupsInput.value = msg.value;
        break;
      case 'set-align-mode':
        alignMode = msg.value;
        alignCheckbox.checked = msg.value;
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

    cardsContainer.style.display = 'grid';
    emptyState.style.display = 'none';
    cardsContainer.innerHTML = '';

    const maxN = parseInt(maxGroupsInput.value) || 5;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const slotNum = i < maxN ? (i + 1) : null; // 1-based slot number if in top N
      const el = createCardElement(card, slotNum);
      cardsContainer.appendChild(el);
    }
  }

  function createCardElement(card, slotNum) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.sessionId = card.sessionId;
    div.draggable = true;

    if (card.color) {
      div.style.setProperty('--card-color', card.color);
    }

    const title = card.label || card.displayTitle || card.aiTitle || truncate(card.firstPrompt, 80) || card.slug || card.sessionId.substring(0, 8);

    const snippetLines = [
      card.firstPrompt ? '🙋 ' + truncate(card.firstPrompt, 60) : '',
      card.lastPrompt ? '🙋 ' + truncate(card.lastPrompt, 60) : '',
      card.lastResponse ? '🤖 ' + truncate(card.lastResponse, 60) : '',
    ].filter(Boolean);
    const snippet = snippetLines.map(l => escapeHtml(l)).join('<br>');

    // Slot badge: show actual column position if open, or expected slot number
    const colLabel = card.column ? `C${card.column}` : (slotNum ? slotNum : '');
    const slotBadge = colLabel ? `<span class="slot-badge${card.column ? ' slot-active' : ''}">${colLabel}</span>` : '';

    div.innerHTML = `
      <div class="card-body">
        <div class="card-left-icons">
          ${slotBadge}
          <button class="btn-icon btn-open" title="打开">&#9654;</button>
          <button class="btn-icon btn-top" title="置顶（移到第一位）">&#8679;</button>
          <button class="btn-icon btn-close" title="关闭窗口">&#10005;</button>
        </div>
        <div class="card-content">
          <div class="card-title-row">
            <div class="card-title"><span class="card-title-text${card.isOpen ? ' title-open' : ''}" data-session-id="${card.sessionId}">${escapeHtml(title)}</span></div>
            <button class="btn-icon btn-delete" title="删除会话">&#128465;</button>
          </div>
          ${snippet ? `<div class="card-snippet">${snippet}</div>` : ''}
          <div class="card-meta">
            <span class="card-meta-item">${card.userTurns}轮</span>
            <span class="card-meta-item">${formatSize(card.fileSize)}</span>
            ${card.gitBranch ? `<span class="card-meta-item">${escapeHtml(card.gitBranch)}</span>` : ''}
            <span class="card-meta-item ${card.isActive ? 'status-active' : 'status-inactive'}">
              ${card.isActive ? '● 活跃' : '○ 空闲'}
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

    div.querySelector('.btn-top').addEventListener('click', () => {
      vscode.postMessage({ type: 'move-to-top', sessionId: card.sessionId });
    });

    div.querySelector('.card-title-text').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startTitleEdit(e.target, card.sessionId, card.label || '');
    });

    div.addEventListener('dblclick', (e) => {
      if (e.target.closest('.btn-icon, .btn, button, input, .card-title-text')) return;
      vscode.postMessage({ type: 'open-session', sessionId: card.sessionId });
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
