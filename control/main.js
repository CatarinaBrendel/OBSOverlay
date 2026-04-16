import { getState, resetAll as resetAllState } from './components/state.js';
import { initScoreboard } from './components/scoreboard.js';
import { initCountdownControls } from './components/countdownControls.js';
import { initLobbyControls } from './components/lobbyControls.js';
import { initAnnouncementEditor } from './components/announcementEditor.js';
import { initIframeControls } from './components/iframeControls.js';

const ANNOUNCE_KEY = 'scoreboard.announcementHtml';

function addButtonPressEffects() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest && e.target.closest('button');
    if (!btn) return;
    btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed');
  });
  ['pointerup', 'pointercancel', 'pointerout', 'pointerleave'].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      const btn = e.target.closest && e.target.closest('button'); if (btn) btn.classList.remove('pressed');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return; const el = document.activeElement; if (el && el.tagName === 'BUTTON') el.classList.add('pressed');
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return; const el = document.activeElement; if (el && el.tagName === 'BUTTON') el.classList.remove('pressed');
  });
}

function attachHotkeys() {
  window.addEventListener('keydown', (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === 'a') window.changeScore && window.changeScore('left', 1);
    if (key === 'l') window.changeScore && window.changeScore('right', 1);
    if (key === 'r') window.resetScores && window.resetScores();
    if (key === 's') window.swapPlayers && window.swapPlayers();
  });
}

async function refreshForm() {
  try {
    const state = await getState();
    if (!state) return;
    const leftNameInput = document.getElementById('leftName');
    const rightNameInput = document.getElementById('rightName');
    const roundTextInput = document.getElementById('roundText');
    const footerLeftInput = document.getElementById('footerLeft');
    const footerRightInput = document.getElementById('footerRight');

    if (leftNameInput && document.activeElement !== leftNameInput) leftNameInput.value = state.leftName || '';
    if (rightNameInput && document.activeElement !== rightNameInput) rightNameInput.value = state.rightName || '';
    if (roundTextInput && document.activeElement !== roundTextInput) roundTextInput.value = state.roundText || '';

    if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
      const [left, right] = state.footerText.split('|').map(s => s.trim());
      if (footerLeftInput && document.activeElement !== footerLeftInput) footerLeftInput.value = left;
      if (footerRightInput && document.activeElement !== footerRightInput) footerRightInput.value = right;
    } else {
      if (footerLeftInput && document.activeElement !== footerLeftInput) footerLeftInput.value = state.footerText || '';
      if (footerRightInput && document.activeElement !== footerRightInput) footerRightInput.value = state.footerText || '';
    }

    const leftScoreEl = document.getElementById('leftScoreDisplay');
    const rightScoreEl = document.getElementById('rightScoreDisplay');
    if (leftScoreEl) leftScoreEl.textContent = String(state.leftScore || 0);
    if (rightScoreEl) rightScoreEl.textContent = String(state.rightScore || 0);

    // If announcement editor has no saved HTML, pre-populate with template
    try {
      const saved = localStorage.getItem(ANNOUNCE_KEY);
      if (!saved) {
        const left = state.leftName || '';
        const right = state.rightName || '';
        const templateText = `Up next:\n${left} x ${right}`;
        localStorage.setItem(ANNOUNCE_KEY, templateText);
      }
    } catch (e) {}
  } catch (e) { console.warn('refreshForm failed', e); }
}

document.addEventListener('DOMContentLoaded', async () => {
  addButtonPressEffects();
  attachHotkeys();

  // initialize components
  try { initScoreboard(); } catch (e) { console.warn('initScoreboard failed', e); }
  try { initCountdownControls(); } catch (e) { console.warn('initCountdownControls failed', e); }
  try { initLobbyControls(); } catch (e) { console.warn('initLobbyControls failed', e); }
  let announceApi = null;
  try { announceApi = initAnnouncementEditor(); } catch (e) { console.warn('initAnnouncementEditor failed', e); }
  try { await initIframeControls(); } catch (e) { console.warn('initIframeControls failed', e); }

  // refresh form values from server
  await refreshForm();

  // expose resetAll to match legacy behavior
  window.resetAll = async function() { try { await resetAllState(); await refreshForm(); } catch (e) { console.warn('resetAll failed', e); } };

  // ensure announcement preview updated after refresh
  try { if (announceApi && announceApi.updatePreview) announceApi.updatePreview(); } catch (e) {}
});
