const DEFAULT_STATE = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "POOLS",
    footerText: "#StillFantastic"
  };

  async function getState() {
    const response = await fetch("/state", { cache: "no-store" });
    return await response.json();
  }

  // Lobby ID controls
  async function sendLobbyId(id) {
    try {
      const payload = { id: id };
      const res = await fetch('/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.error('Lobby send error', e);
      throw e;
    }
  }

  const lobbySendBtn = document.getElementById('lobbySend');
  const lobbyClearBtn = document.getElementById('lobbyClear');
  const lobbyInput = document.getElementById('lobbyInput');
  const lobbyStatus = document.getElementById('lobbyStatus');

  if (lobbySendBtn && lobbyInput) {
    lobbySendBtn.addEventListener('click', async () => {
      const val = (lobbyInput.value || '').trim();
      if (!val) { lobbyStatus.textContent = 'Enter a Lobby ID.'; return; }
      lobbySendBtn.disabled = true;
      lobbyStatus.textContent = 'Sending...';
      try {
        const payload = val; // send the full input including the "Lobby ID: " prefix
        const json = await sendLobbyId(payload);
        if (json && json.ok) lobbyStatus.textContent = 'Lobby sent.';
        else lobbyStatus.textContent = 'Error sending lobby.';
      } catch (e) {
        lobbyStatus.textContent = 'Network error.';
      } finally {
        lobbySendBtn.disabled = false;
        setTimeout(() => { if (lobbyStatus) lobbyStatus.textContent = ''; }, 2000);
      }
    });
  }

  if (lobbyClearBtn) {
    lobbyClearBtn.addEventListener('click', async () => {
      try {
        lobbyInput.value = 'Lobby ID: ';
        await sendLobbyId('');
        if (lobbyStatus) lobbyStatus.textContent = 'Cleared.';
        setTimeout(() => { if (lobbyStatus) lobbyStatus.textContent = ''; }, 1500);
      } catch (e) { if (lobbyStatus) lobbyStatus.textContent = 'Network error.'; }
    });
  }

  // focus behavior: place caret at end when focusing default prefix
  if (lobbyInput) {
    lobbyInput.addEventListener('focus', (e) => {
      const el = e.target;
      if (el.value === 'Lobby ID: ') {
        // move caret to end
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  async function setState(state) {
    await fetch("/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });

    await refreshForm();
  }

  async function refreshForm() {
    const state = await getState();

    const leftNameInput = document.getElementById("leftName");
    const rightNameInput = document.getElementById("rightName");
    const roundTextInput = document.getElementById("roundText");
    const footerLeftInput = document.getElementById("footerLeft");
    const footerRightInput = document.getElementById("footerRight");

    if (document.activeElement !== leftNameInput) leftNameInput.value = state.leftName;
    if (document.activeElement !== rightNameInput) rightNameInput.value = state.rightName;
    if (document.activeElement !== roundTextInput) roundTextInput.value = state.roundText;

    // populate split footer fields: "Left text | Right text"
    if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
      const [left, right] = state.footerText.split('|').map(s => s.trim());
      if (document.activeElement !== footerLeftInput) footerLeftInput.value = left;
      if (document.activeElement !== footerRightInput) footerRightInput.value = right;
    } else {
      if (document.activeElement !== footerLeftInput) footerLeftInput.value = state.footerText || "";
      if (document.activeElement !== footerRightInput) footerRightInput.value = state.footerText || "";
    }

    document.getElementById("leftScoreDisplay").textContent = state.leftScore;
    document.getElementById("rightScoreDisplay").textContent = state.rightScore;
    // If the announcement editor is empty, pre-populate with the lobby template
    try {
      const left = state.leftName || '';
      const right = state.rightName || '';
      const templateText = `Up next:\n${left} x ${right}`;
      if (typeof quill !== 'undefined' && quill) {
        const existing = (quill.getText && quill.getText().trim()) || '';
        if (!existing) {
          try {
            quill.setText(templateText);
            // persist and update preview
            try { localStorage.setItem(ANNOUNCE_KEY, quill.root.innerHTML); } catch (e) {}
            try { updatePreview(); } catch (e) {}
          } catch (e) { /* ignore setText errors */ }
        }
      }
    } catch (e) {}
  }

  function bindTextInput(id) {
    const input = document.getElementById(id);
    input.addEventListener("input", async (e) => {
      const state = await getState();
      state[id] = e.target.value;
      await setState(state);
    });
  }

  function bindFooterInputs(leftId, rightId) {
    const left = document.getElementById(leftId);
    const right = document.getElementById(rightId);

    const handler = async () => {
      const state = await getState();
      state.footerText = `${left.value} | ${right.value}`;
      await setState(state);
    };

    left.addEventListener('input', handler);
    right.addEventListener('input', handler);
  }

  async function changeScore(side, delta) {
    const state = await getState();
    const key = side === "left" ? "leftScore" : "rightScore";
    state[key] = Math.max(0, Number(state[key] || 0) + delta);
    await setState(state);
  }

  async function resetScores() {
    const state = await getState();
    state.leftScore = 0;
    state.rightScore = 0;
    await setState(state);
  }

  async function swapPlayers() {
    const state = await getState();

    [state.leftName, state.rightName] = [state.rightName, state.leftName];
    [state.leftScore, state.rightScore] = [state.rightScore, state.leftScore];

    await setState(state);
  }

  async function resetAll() {
    await fetch("/reset", { method: "POST" });
    await refreshForm();
  }

  bindTextInput("leftName");
  bindTextInput("rightName");
  bindTextInput("roundText");
  bindFooterInputs("footerLeft", "footerRight");

  // Countdown controls
  function parseMMSS(text) {
    if (!text || typeof text !== 'string') return null;
    const parts = text.trim().split(':');
    if (parts.length === 1) {
      const s = Number(parts[0]);
      return Number.isFinite(s) ? s : null;
    }
    const mm = Number(parts[0]);
    const ss = Number(parts[1]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return Math.max(0, Math.floor(mm) * 60 + Math.floor(ss));
  }

  async function sendCountdownCommand(action, duration) {
    try {
      const res = await fetch('/countdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, duration })
      });
      if (!res.ok) console.warn('Countdown command failed', await res.text());
    } catch (e) {
      console.error('Countdown command error', e);
    }
  }

  window.startCountdownFromInput = function() {
    const val = document.getElementById('countdownInput').value;
    const seconds = parseMMSS(val);
    if (seconds === null) return alert('Invalid time format. Use MM:SS');
    sendCountdownCommand('start', seconds);
  };

  window.stopCountdown = function() {
    sendCountdownCommand('stop');
  };

  window.resetCountdownFromInput = function() {
    const val = document.getElementById('countdownInput').value;
    const seconds = parseMMSS(val);
    if (seconds === null) return alert('Invalid time format. Use MM:SS');
    sendCountdownCommand('reset', seconds);
  };

  // Label input: send updates (debounced) to server to broadcast to overlays
  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  async function sendLabel(label) {
    try {
      const res = await fetch('/countdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'label', label })
      });
      if (!res.ok) console.warn('Label update failed', await res.text());
      else console.log('Label sent', label);
    } catch (e) {
      console.error('Label send error', e);
    }
  }

  const debouncedSendLabel = debounce((v) => sendLabel(v), 300);

  const labelInput = document.getElementById('countdownLabelInput');
  if (labelInput) {
    labelInput.addEventListener('input', (e) => {
      debouncedSendLabel(e.target.value);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    const key = event.key.toLowerCase();

    if (key === "a") changeScore("left", 1);
    if (key === "l") changeScore("right", 1);
    if (key === "r") resetScores();
    if (key === "s") swapPlayers();
  });

  refreshForm();

  // Button press visual feedback: add/remove `.pressed` class on pointer and keyboard events
  function addButtonPressEffects() {
    // Pointer interactions
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      btn.classList.remove('pressed');
      // force reflow for restart
      void btn.offsetWidth;
      btn.classList.add('pressed');
    });

    ['pointerup', 'pointercancel', 'pointerout', 'pointerleave'].forEach((ev) => {
      document.addEventListener(ev, (e) => {
        const btn = e.target.closest && e.target.closest('button');
        if (btn) btn.classList.remove('pressed');
      });
    });

    // Keyboard interactions (Space / Enter)
    document.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const el = document.activeElement;
      if (el && el.tagName === 'BUTTON') el.classList.add('pressed');
    });
    document.addEventListener('keyup', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const el = document.activeElement;
      if (el && el.tagName === 'BUTTON') el.classList.remove('pressed');
    });
  }

  addButtonPressEffects();

  // ---- Iframe (Challonge) controls ----
  async function getIframeState() {
    try {
      const res = await fetch('/iframe', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  async function setIframeState(payload) {
    try {
      const res = await fetch('/iframe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) { return null; }
  }

  function extractSrcFromInput(text) {
    if (!text) return '';
    const trimmed = text.trim();
    // If user pasted a full iframe tag, try to extract src attribute
    if (trimmed.toLowerCase().startsWith('<iframe')) {
      const m = trimmed.match(/src\s*=\s*"([^"]+)"/i) || trimmed.match(/src\s*=\s*'([^']+)'/i);
      if (m && m[1]) return m[1];
      return '';
    }
    return trimmed;
  }

  async function initIframeControls() {
    const input = document.getElementById('iframeInput');
    const saveBtn = document.getElementById('iframeSaveBtn');
    const previewBtn = document.getElementById('iframePreviewBtn');
    const status = document.getElementById('iframeStatus');
    const previewEl = document.getElementById('iframePreview');
    const previewWrapper = document.getElementById('previewWrapper');
    const scaleEl = document.getElementById('iframeScale');
    const scaleLabel = document.getElementById('iframeScaleLabel');
    const scaleIn = document.getElementById('iframeScaleIn');
    const scaleOut = document.getElementById('iframeScaleOut');
    const scaleReset = document.getElementById('iframeScaleReset');

    try {
      const state = await getIframeState();
      if (state) {
        if (state.html) input.value = state.html;
        else if (state.src) input.value = state.src;
        if (previewEl && state.src) previewEl.src = state.src;
        else if (previewEl && state.html) previewEl.srcdoc = state.html;
        // scale
        const s = (typeof state.scale === 'number') ? state.scale : (state.scale ? Number(state.scale) : null);
        if (s && scaleEl) { scaleEl.value = s; scaleLabel.textContent = Math.round(s*100) + '%'; if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; }
      }
    } catch (e) { /* ignore */ }

    if (previewBtn) previewBtn.addEventListener('click', () => {
      const val = input.value || '';
      const src = extractSrcFromInput(val);
      if (src) {
        previewEl.removeAttribute('srcdoc');
        previewEl.src = src;
      } else {
        // if it's probably an iframe tag, set as srcdoc
        previewEl.src = 'about:blank';
        previewEl.srcdoc = val;
      }
      // apply current scale to preview
      try { const s = Number(scaleEl.value || 1); if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; } catch (e) {}
    });

    if (saveBtn) saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; status.textContent = 'Saving...';
      try {
        const val = input.value || '';
        const src = extractSrcFromInput(val);
        const s = Number(scaleEl && scaleEl.value ? scaleEl.value : 1);
        let payload = { scale: s };
        if (src) payload.src = src;
        else payload.html = val;
        const json = await setIframeState(payload);
        if (json && json.ok) {
          status.textContent = 'Saved.';
        } else {
          status.textContent = 'Error saving.';
        }
      } catch (e) { status.textContent = 'Network error.'; }
      finally { saveBtn.disabled = false; setTimeout(() => { status.textContent = ''; }, 2000); }
    });

    // scale controls
    function setPreviewScale(v) { try { const s = Number(v || 1); if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; if (scaleLabel) scaleLabel.textContent = Math.round(s*100) + '%'; } catch (e) {} }
    if (scaleEl) {
      // send scale to server (debounced) so remote page updates live
      const debouncedSendScale = debounce(async (v) => {
        try { await setIframeState({ scale: Number(v) }); } catch (e) {}
      }, 200);

      scaleEl.addEventListener('input', (e) => {
        const v = e.target.value;
        setPreviewScale(v);
        debouncedSendScale(v);
      });
    }
    if (scaleIn) scaleIn.addEventListener('click', () => { const v = Math.min(2, Number(scaleEl.value) + 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
    if (scaleOut) scaleOut.addEventListener('click', () => { const v = Math.max(0.5, Number(scaleEl.value) - 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
    if (scaleReset) scaleReset.addEventListener('click', () => { scaleEl.value = 1; setPreviewScale(1); try { setIframeState({ scale: 1 }); } catch (e) {} });
  }

  // initialize iframe controls after page load
  try { initIframeControls(); } catch (e) { /* ignore init errors */ }

  // Announcements: send from control UI to server (HTML + align)
  async function sendAnnouncement(html, align) {
    try {
      const payload = {};
      if (typeof html === 'string' && html.trim()) payload.html = html;
      else payload.text = '';
      if (align) payload.align = align;
      const url = (window.location && window.location.origin ? window.location.origin : '') + '/announce';
      console.log('sending announce to', url, 'payload:', payload);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.error('Announcement send error', e);
      throw e;
    }
  }

  const announceSendBtn = document.getElementById('announceSend');
  const announceClearBtn = document.getElementById('announceClear');
  const announceStatus = document.getElementById('announceStatus');

  // Quill setup
  const ANNOUNCE_KEY = 'scoreboard.announcementHtml';
  const ANNOUNCE_ALIGN_KEY = 'scoreboard.announcementAlign';
  let quill = null;
  let currentAlign = 'center';
  try {
    try { const savedAlign = localStorage.getItem(ANNOUNCE_ALIGN_KEY); if (savedAlign) currentAlign = savedAlign; } catch (e) {}
    // register size as an inline style so Quill outputs `style="font-size:..."`
    try {
      const Parchment = Quill.import('parchment');
      const SizeStyle = new Parchment.Attributor.Style('size', 'font-size', { scope: Parchment.Scope.INLINE });
      Quill.register(SizeStyle, true);
    } catch (e) { /* ignore if register fails */ }
    quill = new Quill('#announcementEditor', { modules: { toolbar: '#quillToolbar' }, theme: 'snow' });
    try { const saved = localStorage.getItem(ANNOUNCE_KEY); if (saved) quill.root.innerHTML = saved; } catch (e) {}
    quill.on('text-change', () => { try { localStorage.setItem(ANNOUNCE_KEY, quill.root.innerHTML); } catch (e) {} });
  } catch (e) { console.warn('Quill init failed', e); }

  // Ensure the toolbar size select explicitly applies the size format (fallback)
  try {
    const sizeSelect = document.querySelector('.ql-size');
    if (sizeSelect) sizeSelect.addEventListener('change', (ev) => {
      try { if (quill) quill.format('size', ev.target.value); } catch (e) { /* ignore */ }
    });
  } catch (e) {}

  // derive alignment from first block
  function updateCurrentAlign() {
    try {
      if (!quill) return;
      const [line] = quill.getLines(0, 1) || [];
      const formats = line ? line.formats() : {};
      // Quill represents left alignment as either undefined or an empty string.
      // Treat empty/undefined as 'left' instead of falling back to 'center'.
      let a = (formats && typeof formats.align !== 'undefined') ? formats.align : null;
      if (!a || a === '') a = 'left';
      currentAlign = a;
      try { localStorage.setItem(ANNOUNCE_ALIGN_KEY, currentAlign); } catch (e) {}
    } catch (e) {}
  }
  try { updateCurrentAlign(); } catch (e) {}
  if (quill) { quill.on('text-change', updateCurrentAlign); quill.on('selection-change', updateCurrentAlign); }

  // live preview element
  const announcePreviewEl = document.getElementById('announcementPreview');

  // updatePreview: normalize sizes, sanitize, and render into local preview
  function updatePreview() {
    if (!announcePreviewEl || !quill) return;
    try {
      const raw = quill.root.innerHTML;
      const normalized = normalizeSizeClasses(raw);
      const safe = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(normalized, { ALLOWED_ATTR: ['style', 'class'] }) : normalized;
      announcePreviewEl.innerHTML = safe;
      try { announcePreviewEl.style.textAlign = currentAlign || 'center'; } catch (e) {}
    } catch (e) { /* ignore preview errors */ }
  }
  // wire preview updates
  if (quill) {
    quill.on('text-change', updatePreview);
    quill.on('selection-change', updatePreview);
  }

  // ensure size select applies format and updates preview immediately
  try {
    const sizeSelect = document.querySelector('.ql-size');
    if (sizeSelect) sizeSelect.addEventListener('change', (ev) => {
      try { if (quill) quill.format('size', ev.target.value); } catch (e) { /* ignore */ }
      try { updatePreview(); } catch (e) {}
    });
  } catch (e) {}

  // initial preview render
  try { updatePreview(); } catch (e) {}

  if (announceSendBtn) {
    announceSendBtn.addEventListener('click', async () => {
      console.log('announceSend clicked');
      const plain = quill ? quill.getText().trim() : '';
      console.log('quill present:', !!quill, 'plain length:', (plain && plain.length) || 0);
      if (!plain) { announceStatus.textContent = 'Enter a message first.'; return; }
      announceSendBtn.disabled = true;
      announceStatus.textContent = 'Sending...';
      try {
        // Ensure selection's size format is applied as an explicit value if it's a keyword
        try {
          const range = quill.getSelection && quill.getSelection();
          const sizeMapEm = { small: '2.25em', medium: '1em', large: '3.75em', huge: '7.5em' };
          let currentSize = null;
          try {
            currentSize = range ? quill.getFormat(range).size : quill.getFormat().size;
          } catch (e) { try { currentSize = quill.getFormat().size; } catch (e2) { currentSize = null; } }
          if (currentSize && sizeMapEm[currentSize]) {
            try {
              // apply as explicit em value so it serializes correctly
              if (range && range.length > 0) {
                quill.formatText(range.index, range.length, 'size', sizeMapEm[currentSize]);
              } else {
                quill.format('size', sizeMapEm[currentSize]);
              }
            } catch (e) { /* ignore formatting errors */ }
          }
        } catch (e) {}

        // Simple HTML escaper for inserted text
        function escapeHtml(str) {
          if (typeof str !== 'string') return '';
          return str.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
        }

        // Build HTML from Quill Delta to reliably capture formats (size, bold, italic)
        function deltaToHtml(delta) {
          if (!delta || !delta.ops) return '';
          const sizeMapEm = { small: '2.25em', medium: '1em', large: '3.75em', huge: '7.5em' };
          const paragraphs = [];
          let current = '';

          function wrapWithAttrs(text, attrs) {
            let out = text;
            if (!attrs) return out;
            if (attrs.bold) out = `<strong>${out}</strong>`;
            if (attrs.italic) out = `<em>${out}</em>`;
            if (attrs.size) {
              const v = attrs.size;
              const sizeVal = sizeMapEm[v] || v;
              out = `<span style="font-size: ${sizeVal};">${out}</span>`;
            }
            return out;
          }

          delta.ops.forEach(op => {
            if (typeof op.insert === 'string') {
              const parts = op.insert.split('\n');
              parts.forEach((part, idx) => {
                if (part.length) current += wrapWithAttrs(escapeHtml(part), op.attributes);
                if (idx < parts.length - 1) {
                  // newline -> paragraph break
                  paragraphs.push(`<p>${current}</p>`);
                  current = '';
                }
              });
            } else {
              // non-string inserts (embeds) - ignore or handle as needed
            }
          });
          if (current) paragraphs.push(`<p>${current}</p>`);
          return paragraphs.join('');
        }

        const rawHtml = quill ? deltaToHtml(quill.getContents()) : '';
        // convert Quill size classes (ql-size-*) to inline font-size styles so they survive sanitization
        function normalizeSizeClasses(html) {

          if (!html) return html;
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;

          // Helper: measure computed font-size for a class or keyword by inserting a temp element
          function measureFontSizeForClassOrKeyword(options) {
            const { cls, keyword, baseEl } = options || {};
            const temp = document.createElement('span');
            if (cls) temp.className = cls;
            if (keyword) temp.style.fontSize = keyword;
            // keep out of flow and invisible
            temp.style.position = 'absolute';
            temp.style.visibility = 'hidden';
            (baseEl || document.body).appendChild(temp);
            const val = window.getComputedStyle(temp).fontSize;
            temp.parentNode.removeChild(temp);
            return val;
          }

          // Replace elements that use Quill size classes (ql-size-*) or keyword font-size
          // with inline em font-size values so they scale relative to overlay base size.
          const sizeMapEm = {
            'ql-size-small': '0.85em',
            'ql-size-large': '2.5em',
            'ql-size-huge': '3.5em',
            'small': '0.855em',
            'medium': '1em',
            'large': '2.5em',
            'huge': '3.5em'
          };

          const all = wrapper.querySelectorAll('*');
          all.forEach(n => {
            try {
              // handle class-based sizes
              const clsList = Array.from(n.classList || []).filter(c => c && c.startsWith('ql-size'));
              if (clsList.length) {
                const cls = clsList[0];
                const em = sizeMapEm[cls] || null;
                if (em) {
                  const prev = n.getAttribute('style') || '';
                  n.setAttribute('style', `font-size: ${em}; ${prev}`);
                }
                clsList.forEach(c => n.classList.remove(c));
                return;
              }
              // handle inline keyword values like 'small'/'large'
              const inlineFs = (n.style && n.style.getPropertyValue('font-size')) || '';
              const key = inlineFs && inlineFs.trim().toLowerCase();
              if (key && sizeMapEm[key]) {
                n.style.fontSize = sizeMapEm[key];
              }
            } catch (e) { /* ignore per-node errors */ }
          });

          return wrapper.innerHTML;
        }

        const normalized = normalizeSizeClasses(rawHtml);
        // debug: log output so we can inspect what HTML is being sent
        try { console.log('Announcement raw HTML:', rawHtml); console.log('Announcement normalized HTML:', normalized); } catch (e) {}
        const safe = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(normalized) : normalized;
        console.log('announce payload', { html: safe, align: currentAlign });
        const json = await sendAnnouncement(safe, currentAlign);
        if (json && json.ok) announceStatus.textContent = 'Announcement sent.';
        else announceStatus.textContent = 'Error: ' + (json && json.error ? json.error : 'unknown');
      } catch (e) {
        console.error('Send handler error', e);
        announceStatus.textContent = 'Network error: ' + (e && e.message ? e.message : 'unknown');
      } finally {
        announceSendBtn.disabled = false;
        setTimeout(() => { announceStatus.textContent = ''; }, 3000);
      }
    });
  }

  if (announceClearBtn) {
    announceClearBtn.addEventListener('click', async () => {
      if (quill) quill.setContents([]);
      announceStatus.textContent = '';
      try { localStorage.removeItem(ANNOUNCE_KEY); } catch (e) {}
      try {
        await fetch('/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) });
      } catch (e) { /* ignore */ }
    });
  }

  // Update the "Player 1 x Player 2" line in the announcement to match left/right name inputs
  const announceUpdateBtn = document.getElementById('announceUpdateNames');
  if (announceUpdateBtn) {
    announceUpdateBtn.addEventListener('click', () => {
      try {
        if (!quill) return;
        const left = (document.getElementById('leftName') && document.getElementById('leftName').value) || '';
        const right = (document.getElementById('rightName') && document.getElementById('rightName').value) || '';
        // get current plain text (trim trailing newline)
        const raw = (quill.getText && quill.getText()) || '';
        const text = raw.replace(/\n$/, '');
        const lines = text.split('\n');
        // Ensure first line is the header and second line is the players
        const header = 'Up next:';
        const players = `${left} x ${right}`;
        if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
          // empty editor -> set header + players
          quill.setText(header + '\n' + players);
        } else {
          // make sure at least two lines exist
          lines[0] = header;
          if (lines.length >= 2) lines[1] = players;
          else lines.push(players);
          // preserve any additional lines after line 2
          quill.setText(lines.join('\n'));
        }
        try { localStorage.setItem(ANNOUNCE_KEY, quill.root.innerHTML); } catch (e) {}
        try { updatePreview(); } catch (e) {}
      } catch (e) {
        console.error('Update names error', e);
      }
    });
  }