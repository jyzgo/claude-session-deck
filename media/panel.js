(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const COLORS = [
    '#4a9eff', '#a78bfa', '#f472b6', '#fb923c',
    '#facc15', '#4ade80', '#2dd4bf', '#64748b',
    '#ef4444', '#22d3ee', '#818cf8', '#e879f9',
  ];

  let cards = [];
  let draggedId = null;

  // ── Elements ───────────────────────────────
  const cardsContainer = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const importOverlay = document.getElementById('import-overlay');
  const importList = document.getElementById('import-list');
  const importEmpty = document.getElementById('import-empty');
  const colorPicker = document.getElementById('color-picker');

  // ── Toolbar buttons ────────────────────────
  document.getElementById('btn-import').addEventListener('click', () => {
    vscode.postMessage({ type: 'request-import' });
    importOverlay.style.display = 'flex';
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  document.getElementById('btn-close-import').addEventListener('click', () => {
    importOverlay.style.display = 'none';
  });

  importOverlay.addEventListener('click', (e) => {
    if (e.target === importOverlay) importOverlay.style.display = 'none';
  });

  // Close color picker on outside click
  document.addEventListener('click', (e) => {
    if (colorPicker.style.display !== 'none' && !colorPicker.contains(e.target) && !e.target.closest('.btn-color')) {
      colorPicker.style.display = 'none';
    }
  });

  // ── Messages from extension ────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'update-cards':
        cards = msg.cards;
        renderCards();
        break;
      case 'available-sessions':
        renderImportList(msg.sessions);
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
    // First line only, then truncate
    const first = str.split('\n')[0];
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

    for (const card of cards) {
      const el = createCardElement(card);
      cardsContainer.appendChild(el);
    }
  }

  function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.sessionId = card.sessionId;
    div.draggable = true;

    if (card.color) {
      div.style.setProperty('--card-color', card.color);
    }

    const title = card.label || truncate(card.firstPrompt, 80) || card.slug || card.sessionId.substring(0, 8);
    const pinIcon = card.pinned ? '<span class="pin-badge">PIN</span>' : '';

    div.innerHTML = `
      <div class="card-header">
        <div class="card-title">${pinIcon}${escapeHtml(title)}</div>
        <div class="card-header-actions">
          <button class="btn-icon btn-pin" title="${card.pinned ? '取消置顶' : '置顶'}">${card.pinned ? '&#9733;' : '&#9734;'}</button>
          <button class="btn-icon btn-color" title="颜色">&#9679;</button>
          <button class="btn-icon btn-remove" title="移除卡片 (不删除会话)">&#10005;</button>
        </div>
      </div>
      ${card.label ? '' : card.firstPrompt ? `<div class="card-label" data-session-id="${card.sessionId}">${escapeHtml(truncate(card.firstPrompt, 120))}</div>` : ''}
      ${card.label && card.firstPrompt ? `<div class="card-label">${escapeHtml(truncate(card.firstPrompt, 120))}</div>` : ''}
      <div class="card-meta">
        <span class="card-meta-item"><span class="meta-label">对话</span> ${card.userTurns} 轮</span>
        <span class="card-meta-item"><span class="meta-label">大小</span> ${formatSize(card.fileSize)}</span>
        ${card.gitBranch ? `<span class="card-meta-item"><span class="meta-label">分支</span> ${escapeHtml(card.gitBranch)}</span>` : ''}
        <span class="card-meta-item ${card.isActive ? 'status-active' : 'status-inactive'}">
          ${card.isActive ? '● 活跃' : '○ 空闲'}
        </span>
      </div>
      <div class="card-meta">
        <span class="card-meta-item"><span class="meta-label">开始</span> ${formatTime(card.startTime)}</span>
        <span class="card-meta-item"><span class="meta-label">更新</span> ${formatTime(card.lastModified)}</span>
        ${card.slug ? `<span class="card-meta-item"><span class="meta-label">slug</span> ${escapeHtml(card.slug)}</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-open">打开</button>
        <span class="spacer"></span>
        <button class="btn btn-danger btn-delete">删除会话</button>
      </div>
    `;

    // ── Button handlers ──
    div.querySelector('.btn-open').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-session', sessionId: card.sessionId });
    });

    div.querySelector('.btn-delete').addEventListener('click', () => {
      vscode.postMessage({ type: 'delete-session', sessionId: card.sessionId });
    });

    div.querySelector('.btn-remove').addEventListener('click', () => {
      vscode.postMessage({ type: 'remove-card', sessionId: card.sessionId });
    });

    div.querySelector('.btn-pin').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggle-pin', sessionId: card.sessionId, pinned: !card.pinned });
    });

    div.querySelector('.btn-color').addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPicker(e.target, card);
    });

    // ── Label editing ──
    const labelEl = div.querySelector('.card-label[data-session-id]');
    if (labelEl) {
      labelEl.addEventListener('dblclick', () => {
        startLabelEdit(labelEl, card.sessionId);
      });
    }

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
      if (card.sessionId !== draggedId) {
        div.classList.add('drag-over');
      }
    });

    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over');
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      if (draggedId && draggedId !== card.sessionId) {
        // Build new order: move draggedId before this card
        const orderedIds = cards.map(c => c.sessionId);
        const fromIdx = orderedIds.indexOf(draggedId);
        const toIdx = orderedIds.indexOf(card.sessionId);
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

  // ── Color picker ───────────────────────────
  function showColorPicker(anchor, card) {
    const rect = anchor.getBoundingClientRect();
    colorPicker.style.display = 'block';
    colorPicker.style.top = (rect.bottom + 4) + 'px';
    colorPicker.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';

    const optionsEl = colorPicker.querySelector('.color-options');
    optionsEl.innerHTML = '';

    for (const color of COLORS) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (card.color === color ? ' active' : '');
      swatch.style.background = color;
      swatch.addEventListener('click', () => {
        vscode.postMessage({ type: 'update-color', sessionId: card.sessionId, color });
        colorPicker.style.display = 'none';
      });
      optionsEl.appendChild(swatch);
    }

    const input = colorPicker.querySelector('.color-input');
    input.value = card.color || '';
    // Replace old listener
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = newInput.value.trim();
        if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
          vscode.postMessage({ type: 'update-color', sessionId: card.sessionId, color: val });
          colorPicker.style.display = 'none';
        }
      }
    });
  }

  // ── Label inline edit ──────────────────────
  function startLabelEdit(el, sessionId) {
    const current = el.textContent;
    const input = document.createElement('input');
    input.className = 'label-edit';
    input.value = current;
    el.replaceWith(input);
    input.focus();
    input.select();

    function finish() {
      const val = input.value.trim();
      if (val !== current) {
        vscode.postMessage({ type: 'update-label', sessionId, label: val });
      } else {
        // Restore
        const newEl = document.createElement('div');
        newEl.className = 'card-label';
        newEl.dataset.sessionId = sessionId;
        newEl.textContent = current;
        newEl.addEventListener('dblclick', () => startLabelEdit(newEl, sessionId));
        input.replaceWith(newEl);
      }
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = current;
        input.blur();
      }
    });
  }

  // ── Import list ────────────────────────────
  function renderImportList(sessions) {
    importList.innerHTML = '';

    if (sessions.length === 0) {
      importList.style.display = 'none';
      importEmpty.style.display = 'block';
      return;
    }

    importList.style.display = 'block';
    importEmpty.style.display = 'none';

    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = 'import-item';

      const title = truncate(s.firstPrompt, 80) || s.slug || s.sessionId.substring(0, 8);

      item.innerHTML = `
        <div class="import-item-info">
          <div class="import-item-title">${escapeHtml(title)}</div>
          <div class="import-item-meta">
            ${s.userTurns} 轮 | ${formatSize(s.fileSize)} | ${formatTime(s.lastModified)}
            ${s.slug ? ' | ' + escapeHtml(s.slug) : ''}
          </div>
        </div>
        <button class="btn btn-primary btn-add-card">添加</button>
      `;

      item.querySelector('.btn-add-card').addEventListener('click', () => {
        vscode.postMessage({ type: 'add-card', sessionId: s.sessionId });
      });

      importList.appendChild(item);
    }
  }
})();
