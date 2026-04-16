let previousState = {
  leftName: "PLAYER 1",
  rightName: "PLAYER 2",
  leftScore: 0,
  rightScore: 0,
  roundText: "POOLS",
  footerText: "TWITCH.TV/YOURCHANNEL"
};

function flashIfChanged(el, oldValue, newValue) {
  if (String(oldValue) !== String(newValue)) {
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }
}

async function fetchState() {
  try {
    const response = await fetch("/state", { cache: "no-store" });
    const state = await response.json();

    const leftNameEl = document.getElementById("leftName");
    const rightNameEl = document.getElementById("rightName");
    const leftScoreEl = document.getElementById("leftScore");
    const rightScoreEl = document.getElementById("rightScore");
    const roundTextEl = document.getElementById("roundText");
    const footerLeftEl = document.getElementById("footerTextLeft");
    const footerRightEl = document.getElementById("footerTextRight");

    leftNameEl.textContent = state.leftName;
    rightNameEl.textContent = state.rightName;
    leftScoreEl.textContent = state.leftScore;
    rightScoreEl.textContent = state.rightScore;
    roundTextEl.textContent = state.roundText;

    // Support split footerText using `|` delimiter, or single string uses both sides
    if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
      const [left, right] = state.footerText.split('|').map(s => s.trim());
      footerLeftEl.textContent = left || "";
      footerRightEl.textContent = right || "";
    } else {
      footerLeftEl.textContent = state.footerText || "";
      footerRightEl.textContent = state.footerText || "";
    }

    flashIfChanged(leftScoreEl, previousState.leftScore, state.leftScore);
    flashIfChanged(rightScoreEl, previousState.rightScore, state.rightScore);

    previousState = state;
  } catch (err) {
    console.error("Failed to fetch scoreboard state:", err);
  }
}

function applyState(state) {
  const leftNameEl = document.getElementById("leftName");
  const rightNameEl = document.getElementById("rightName");
  const leftScoreEl = document.getElementById("leftScore");
  const rightScoreEl = document.getElementById("rightScore");
  const roundTextEl = document.getElementById("roundText");
  const footerLeftEl = document.getElementById("footerTextLeft");
  const footerRightEl = document.getElementById("footerTextRight");

  leftNameEl.textContent = state.leftName;
  rightNameEl.textContent = state.rightName;
  leftScoreEl.textContent = state.leftScore;
  rightScoreEl.textContent = state.rightScore;
  roundTextEl.textContent = state.roundText;

  if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
    const [left, right] = state.footerText.split('|').map(s => s.trim());
    footerLeftEl.textContent = left || "";
    footerRightEl.textContent = right || "";
  } else {
    footerLeftEl.textContent = state.footerText || "";
    footerRightEl.textContent = state.footerText || "";
  }

  flashIfChanged(leftScoreEl, previousState.leftScore, state.leftScore);
  flashIfChanged(rightScoreEl, previousState.rightScore, state.rightScore);

  previousState = state;
}

// WebSocket with reconnection and polling fallback
const POLL_INTERVAL = 200;
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  fetchState();
  pollTimer = setInterval(fetchState, POLL_INTERVAL);
  console.log('Overlay: polling started');
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  console.log('Overlay: polling stopped');
}

let ws = null;
let reconnectDelay = 500; // ms
const MAX_RECONNECT = 10000;

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;
  console.log('Overlay: connecting to', url);

  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.warn('WebSocket constructor failed, starting polling', e);
    startPolling();
    return;
  }

  const openTimeout = setTimeout(() => {
    // if still not open after 3s, ensure polling covers us
    if (!ws || ws.readyState !== WebSocket.OPEN) startPolling();
  }, 3000);

  ws.addEventListener('open', () => {
    clearTimeout(openTimeout);
    console.log('Overlay WS connected');
    stopPolling();
    reconnectDelay = 500; // reset
  });

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.type === 'state') applyState(msg.state);
      if (msg.type === 'reload') location.reload();
    } catch (e) {
      console.error('Invalid WS message', e);
    }
  });

  ws.addEventListener('error', (err) => {
    console.warn('Overlay WS error', err);
  });

  ws.addEventListener('close', (ev) => {
    console.warn('Overlay WS closed', ev.code, ev.reason);
    ws = null;
    startPolling();
    setTimeout(() => {
      reconnectDelay = Math.min(MAX_RECONNECT, reconnectDelay * 1.5);
      connectWS();
    }, reconnectDelay);
  });
}

connectWS();
