import { getIframeState, setIframeState } from './state.js';
import { debounce } from './util.js';

export async function initIframeControls() {
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

  function extractSrcFromInput(text) {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.toLowerCase().startsWith('<iframe')) {
      const m = trimmed.match(/src\s*=\s*"([^"]+)"/i) || trimmed.match(/src\s*=\s*'([^']+)'/i);
      if (m && m[1]) return m[1];
      return '';
    }
    return trimmed;
  }

  try {
    const state = await getIframeState();
    if (state) {
      if (state.html) input.value = state.html; else if (state.src) input.value = state.src;
      if (previewEl && state.src) previewEl.src = state.src; else if (previewEl && state.html) previewEl.srcdoc = state.html;
      const s = (typeof state.scale === 'number') ? state.scale : (state.scale ? Number(state.scale) : null);
      if (s && scaleEl) { scaleEl.value = s; scaleLabel.textContent = Math.round(s*100) + '%'; if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; }
    }
  } catch (e) {}

  if (previewBtn) previewBtn.addEventListener('click', () => {
    const val = input.value || '';
    const src = extractSrcFromInput(val);
    if (src) { previewEl.removeAttribute('srcdoc'); previewEl.src = src; } else { previewEl.src = 'about:blank'; previewEl.srcdoc = val; }
    try { const s = Number(scaleEl.value || 1); if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; } catch (e) {}
  });

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; status.textContent = 'Saving...';
    try {
      const val = input.value || ''; const src = extractSrcFromInput(val); const s = Number(scaleEl && scaleEl.value ? scaleEl.value : 1);
      let payload = { scale: s }; if (src) payload.src = src; else payload.html = val;
      const json = await setIframeState(payload);
      if (json && json.ok) {
        status.textContent = 'Saved.';
        // trigger server to fetch and persist teams (writes challonge_teams.json)
        try {
          const t = await fetch('/iframe/teams?useApi=1');
          const tj = await t.json().catch(()=>null);
          if (tj && tj.ok) {
            status.textContent = 'Saved. Teams updated.';
            try { document.dispatchEvent(new CustomEvent('teamsUpdated', { detail: tj })); } catch (e) {}
          }
          else status.textContent = 'Saved. Teams update failed.';
        } catch (e) {
          // non-fatal
          status.textContent = 'Saved. Teams update failed (network).';
        }
      } else {
        status.textContent = 'Error saving.';
      }
    } catch (e) { status.textContent = 'Network error.'; }
    finally { saveBtn.disabled = false; setTimeout(() => { status.textContent = ''; }, 2000); }
  });

  function setPreviewScale(v) { try { const s = Number(v || 1); if (previewWrapper) previewWrapper.style.transform = 'scale(' + s + ')'; if (scaleLabel) scaleLabel.textContent = Math.round(s*100) + '%'; } catch (e) {} }
  if (scaleEl) {
    const debouncedSendScale = debounce(async (v) => { try { await setIframeState({ scale: Number(v) }); } catch (e) {} }, 200);
    scaleEl.addEventListener('input', (e) => { const v = e.target.value; setPreviewScale(v); debouncedSendScale(v); });
  }
  if (scaleIn) scaleIn.addEventListener('click', () => { const v = Math.min(2, Number(scaleEl.value) + 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
  if (scaleOut) scaleOut.addEventListener('click', () => { const v = Math.max(0.5, Number(scaleEl.value) - 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
  if (scaleReset) scaleReset.addEventListener('click', () => { scaleEl.value = 1; setPreviewScale(1); try { setIframeState({ scale: 1 }); } catch (e) {} });
}
