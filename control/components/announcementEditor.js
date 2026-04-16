import { sendAnnouncement } from './state.js';

export function initAnnouncementEditor() {
  const ANNOUNCE_KEY = 'scoreboard.announcementHtml';
  const ANNOUNCE_ALIGN_KEY = 'scoreboard.announcementAlign';
  let quill = null;
  let currentAlign = 'center';

  try {
    try { const savedAlign = localStorage.getItem(ANNOUNCE_ALIGN_KEY); if (savedAlign) currentAlign = savedAlign; } catch (e) {}
    try {
      const Parchment = Quill.import('parchment');
      const SizeStyle = new Parchment.Attributor.Style('size', 'font-size', { scope: Parchment.Scope.INLINE });
      Quill.register(SizeStyle, true);
    } catch (e) {}
    quill = new Quill('#announcementEditor', { modules: { toolbar: '#quillToolbar' }, theme: 'snow' });
    try { const saved = localStorage.getItem(ANNOUNCE_KEY); if (saved) quill.root.innerHTML = saved; } catch (e) {}
    quill.on('text-change', () => { try { localStorage.setItem(ANNOUNCE_KEY, quill.root.innerHTML); } catch (e) {} });
  } catch (e) { console.warn('Quill init failed', e); }

  function updateCurrentAlign() {
    try {
      if (!quill) return;
      const [line] = quill.getLines(0, 1) || [];
      const formats = line ? line.formats() : {};
      let a = (formats && typeof formats.align !== 'undefined') ? formats.align : null;
      if (!a || a === '') a = 'left'; currentAlign = a; try { localStorage.setItem(ANNOUNCE_ALIGN_KEY, currentAlign); } catch (e) {}
    } catch (e) {}
  }
  try { updateCurrentAlign(); } catch (e) {}
  if (quill) { quill.on('text-change', updateCurrentAlign); quill.on('selection-change', updateCurrentAlign); }

  const announcePreviewEl = document.getElementById('announcementPreview');

  function normalizeSizeClasses(html) {
    if (!html) return html;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    const sizeMapEm = { 'ql-size-small': '0.85em', 'ql-size-large': '2.5em', 'ql-size-huge': '3.5em', 'small': '0.855em', 'medium': '1em', 'large': '2.5em', 'huge': '3.5em' };
    const all = wrapper.querySelectorAll('*');
    all.forEach(n => {
      try {
        const clsList = Array.from(n.classList || []).filter(c => c && c.startsWith('ql-size'));
        if (clsList.length) {
          const cls = clsList[0]; const em = sizeMapEm[cls] || null; if (em) { const prev = n.getAttribute('style') || ''; n.setAttribute('style', `font-size: ${em}; ${prev}`); }
          clsList.forEach(c => n.classList.remove(c)); return;
        }
        const inlineFs = (n.style && n.style.getPropertyValue('font-size')) || ''; const key = inlineFs && inlineFs.trim().toLowerCase(); if (key && sizeMapEm[key]) n.style.fontSize = sizeMapEm[key];
      } catch (e) {}
    });
    return wrapper.innerHTML;
  }

  function updatePreview() {
    if (!announcePreviewEl || !quill) return;
    try {
      const raw = quill.root.innerHTML; const normalized = normalizeSizeClasses(raw);
      const safe = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(normalized, { ALLOWED_ATTR: ['style', 'class'] }) : normalized;
      announcePreviewEl.innerHTML = safe; try { announcePreviewEl.style.textAlign = currentAlign || 'center'; } catch (e) {}
    } catch (e) {}
  }
  if (quill) { quill.on('text-change', updatePreview); quill.on('selection-change', updatePreview); }
  try { updatePreview(); } catch (e) {}

  const announceSendBtn = document.getElementById('announceSend');
  const announceClearBtn = document.getElementById('announceClear');
  const announceStatus = document.getElementById('announceStatus');

  if (announceSendBtn) {
    announceSendBtn.addEventListener('click', async () => {
      const plain = quill ? quill.getText().trim() : '';
      if (!plain) { announceStatus.textContent = 'Enter a message first.'; return; }
      announceSendBtn.disabled = true; announceStatus.textContent = 'Sending...';
      try {
        const rawHtml = quill ? quill.root.innerHTML : '';
        const normalized = normalizeSizeClasses(rawHtml);
        const safe = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(normalized) : normalized;
        const json = await sendAnnouncement({ html: safe, align: currentAlign });
        announceStatus.textContent = (json && json.ok) ? 'Announcement sent.' : 'Error: ' + (json && json.error ? json.error : 'unknown');
      } catch (e) { announceStatus.textContent = 'Network error: ' + (e && e.message ? e.message : 'unknown'); }
      finally { announceSendBtn.disabled = false; setTimeout(() => { announceStatus.textContent = ''; }, 3000); }
    });
  }

  if (announceClearBtn) {
    announceClearBtn.addEventListener('click', async () => { if (quill) quill.setContents([]); announceStatus.textContent = ''; try { localStorage.removeItem(ANNOUNCE_KEY); } catch (e) {} try { await fetch('/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) }); } catch (e) {} });
  }

  const announceUpdateBtn = document.getElementById('announceUpdateNames');
  if (announceUpdateBtn) {
    announceUpdateBtn.addEventListener('click', () => {
      try {
        if (!quill) return;
        const left = (document.getElementById('leftName') && document.getElementById('leftName').value) || '';
        const right = (document.getElementById('rightName') && document.getElementById('rightName').value) || '';
        const raw = (quill.getText && quill.getText()) || '';
        const text = raw.replace(/\n$/, ''); const lines = text.split('\n'); const header = 'Up next:'; const players = `${left} x ${right}`;
        if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) { quill.setText(header + '\n' + players); }
        else { lines[0] = header; if (lines.length >= 2) lines[1] = players; else lines.push(players); quill.setText(lines.join('\n')); }
        try { localStorage.setItem(ANNOUNCE_KEY, quill.root.innerHTML); } catch (e) {} try { updatePreview(); } catch (e) {}
      } catch (e) { console.error('Update names error', e); }
    });
  }

  // expose preview updater for main.js to call after state refresh
  return { updatePreview };
}
