import { sendCountdownCommand, sendLabel } from './state.js';

function debounce(fn, wait) {
  let t = null;
  return (...args) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function initCountdownControls() {
  function parseMMSS(text) {
    if (!text || typeof text !== 'string') return null;
    const parts = text.trim().split(':');
    if (parts.length === 1) {
      const s = Number(parts[0]); return Number.isFinite(s) ? s : null;
    }
    const mm = Number(parts[0]); const ss = Number(parts[1]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return Math.max(0, Math.floor(mm) * 60 + Math.floor(ss));
  }

  window.startCountdownFromInput = function() {
    const val = document.getElementById('countdownInput').value;
    const seconds = parseMMSS(val);
    if (seconds === null) return alert('Invalid time format. Use MM:SS');
    sendCountdownCommand('start', seconds);
  };

  window.stopCountdown = function() { sendCountdownCommand('stop'); };

  window.resetCountdownFromInput = function() {
    const val = document.getElementById('countdownInput').value;
    const seconds = parseMMSS(val);
    if (seconds === null) return alert('Invalid time format. Use MM:SS');
    sendCountdownCommand('reset', seconds);
  };

  const debouncedSendLabel = debounce((v) => sendLabel(v), 300);
  const labelInput = document.getElementById('countdownLabelInput');
  if (labelInput) labelInput.addEventListener('input', (e) => debouncedSendLabel(e.target.value));
}
