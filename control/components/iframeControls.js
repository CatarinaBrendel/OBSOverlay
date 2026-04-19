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
      // Prefer showing a simple src URL in the input when possible.
      if (state.html) {
        const maybeSrc = extractSrcFromInput(state.html);
        input.value = maybeSrc || state.html;
      } else if (state.src) {
        input.value = state.src;
      }

      // For preview, prefer using the extracted src when available to avoid showing raw HTML
      if (previewEl) {
        if (state.src) {
          previewEl.removeAttribute('srcdoc'); previewEl.src = state.src;
        } else if (state.html) {
          const maybeSrc = extractSrcFromInput(state.html);
          if (maybeSrc) { previewEl.removeAttribute('srcdoc'); previewEl.src = maybeSrc; }
          else { previewEl.src = 'about:blank'; previewEl.srcdoc = state.html; }
        }
      }

      const s = (typeof state.scale === 'number') ? state.scale : (state.scale ? Number(state.scale) : null);
      if (s && scaleEl) { scaleEl.value = s; scaleLabel.textContent = Math.round(s*100) + '%'; if (previewWrapper) setPreviewScale(s); }

      // initialize preview button label based on container visibility
      try {
        const previewContainer = document.getElementById('iframePreviewContainer');
        if (previewBtn) previewBtn.textContent = (previewContainer && (previewContainer.style.display === 'none')) ? 'Show Preview' : 'Hide Preview';
      } catch (e) {}
    }
  } catch (e) {}

  if (previewBtn) previewBtn.addEventListener('click', () => {
    const previewContainer = document.getElementById('iframePreviewContainer');
    const val = input.value || '';
    const src = extractSrcFromInput(val);

    // Toggle visibility
    if (previewContainer) {
      const isHidden = previewContainer.style.display === 'none';
      if (!isHidden) {
        previewContainer.style.display = 'none';
        previewBtn.textContent = 'Show Preview';
        return;
      } else {
        previewContainer.style.display = '';
        previewBtn.textContent = 'Hide Preview';
      }
    }

    // Set preview content and scale
    if (src) { previewEl.removeAttribute('srcdoc'); previewEl.src = src; } else { previewEl.src = 'about:blank'; previewEl.srcdoc = val; }
    try { const s = Number(scaleEl.value || 1); if (previewWrapper) setPreviewScale(s); } catch (e) {}

    // Broadcast preview to overlays (do not persist) so the display page shows the same preview.
    try {
      const s = Number(scaleEl.value || 1);
      const payload = { scale: s };
      if (src) payload.src = src; else payload.html = val;
      fetch('/iframe?preview=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
    } catch (e) {}
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

  function setPreviewScale(v) {
    try {
      const s = Number(v || 1);
      if (!previewWrapper) return;
      // When scaling down/up, increase the wrapper's width so the scaled iframe fits
      // This prevents clipping inside the overflow:hidden container.
      // The iframe stays 100% width of the wrapper and is scaled via transform.
      const wrapperEl = previewWrapper;
      const iframeEl = previewEl;
      // set transform origin to top center for nicer centering
      wrapperEl.style.transformOrigin = 'top center';
      // set wrapper width to compensate scaling (100% / scale)
      wrapperEl.style.width = (100 / s) + '%';
      // set wrapper height so visual preview height remains constant
      const nativeHeight = iframeEl && iframeEl.offsetHeight ? iframeEl.offsetHeight : 220;
      wrapperEl.style.height = (nativeHeight / s) + 'px';
      // apply scale on the wrapper
      wrapperEl.style.transform = 'scale(' + s + ')';
      if (scaleLabel) scaleLabel.textContent = Math.round(s * 100) + '%';
    } catch (e) {}
  }
  if (scaleEl) {
    const debouncedSendScale = debounce(async (v) => { try { await setIframeState({ scale: Number(v) }); } catch (e) {} }, 200);
    scaleEl.addEventListener('input', (e) => { const v = e.target.value; setPreviewScale(v); debouncedSendScale(v); });
  }
  if (scaleIn) scaleIn.addEventListener('click', () => { const v = Math.min(2, Number(scaleEl.value) + 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
  if (scaleOut) scaleOut.addEventListener('click', () => { const v = Math.max(0.5, Number(scaleEl.value) - 0.05); scaleEl.value = v; setPreviewScale(v); try { setIframeState({ scale: Number(v) }); } catch (e) {} });
  if (scaleReset) scaleReset.addEventListener('click', () => { scaleEl.value = 1; setPreviewScale(1); try { setIframeState({ scale: 1 }); } catch (e) {} });
}
