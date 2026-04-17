import { getState, setState, resetAll as resetAllState } from './components/state.js';
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

async function loadTeams() {
  try {
    let res = await fetch('/iframe/teams?useApi=1');
    let j = await res.json().catch(()=>null);
    if (!j || !j.ok) {
      res = await fetch('/iframe/teams');
      j = await res.json().catch(()=>null);
    }
    const names = (j && j.ok && j.teams && Array.isArray(j.teams.names)) ? j.teams.names : [];
    const leftSel = document.getElementById('leftTeamSelect');
    const rightSel = document.getElementById('rightTeamSelect');
    if (!leftSel || !rightSel) return;
    if (!names.length) { leftSel.style.display = 'none'; rightSel.style.display = 'none'; return; }
    leftSel.style.display = '';
    rightSel.style.display = '';
    // populate
    leftSel.innerHTML = '<option value="">Select team...</option>' + names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    rightSel.innerHTML = '<option value="">Select team...</option>' + names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

    // try to set current selection based on server state
    try {
      const st = await getState();
      if (st && st.leftName && names.includes(st.leftName)) leftSel.value = st.leftName;
      if (st && st.rightName && names.includes(st.rightName)) rightSel.value = st.rightName;
    } catch (e) { /* ignore */ }

    // keep selects in sync when user types into the text inputs
    const leftInput = document.getElementById('leftName');
    const rightInput = document.getElementById('rightName');
    if (leftInput) {
      leftInput.addEventListener('input', (e) => {
        const v = String(e.target.value || '');
        if (names.includes(v)) leftSel.value = v; else leftSel.value = '';
      });
    }
    if (rightInput) {
      rightInput.addEventListener('input', (e) => {
        const v = String(e.target.value || '');
        if (names.includes(v)) rightSel.value = v; else rightSel.value = '';
      });
    }

    leftSel.addEventListener('change', async (e) => {
      const v = e.target.value; if (!v) return;
      const leftNameInput = document.getElementById('leftName'); if (leftNameInput) leftNameInput.value = v;
      try { await setState({ leftName: v }); } catch (e) {}
    });
    rightSel.addEventListener('change', async (e) => {
      const v = e.target.value; if (!v) return;
      const rightNameInput = document.getElementById('rightName'); if (rightNameInput) rightNameInput.value = v;
      try { await setState({ rightName: v }); } catch (e) {}
    });
  } catch (e) { console.warn('loadTeams failed', e); }
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

  // listen for teams update events (dispatched after saving iframe config)
  document.addEventListener('teamsUpdated', async (ev) => {
    try { await loadTeams(); await refreshForm(); } catch (e) { console.warn('teamsUpdated handler failed', e); }
  });

  // load teams for selects
  try { await loadTeams(); } catch (e) { console.warn('loadTeams failed', e); }

  // refresh form values from server
  await refreshForm();

  // expose resetAll to match legacy behavior
  window.resetAll = async function() { try { await resetAllState(); await refreshForm(); } catch (e) { console.warn('resetAll failed', e); } };

  // ensure announcement preview updated after refresh
  try { if (announceApi && announceApi.updatePreview) announceApi.updatePreview(); } catch (e) {}
});
