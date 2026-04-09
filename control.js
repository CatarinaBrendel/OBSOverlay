const DEFAULT_STATE = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "POOLS",
    footerText: "TWITCH.TV/YOURCHANNEL"
  };

  async function getState() {
    const response = await fetch("/state", { cache: "no-store" });
    return await response.json();
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