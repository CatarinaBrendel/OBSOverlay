// Countdown overlay script
let countdownTimer = null;
let remaining = 0; // seconds

function formatTime(s) {
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function render() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = formatTime(Math.max(0, Math.ceil(remaining)));
}

function tick() {
  remaining -= 0.1;
  if (remaining <= 0) {
    remaining = 0;
    render();
    stopCountdown();
    onFinished();
    return;
  }
  render();
}

function startCountdown(seconds) {
  if (typeof seconds === 'number') remaining = seconds;
  if (countdownTimer) clearInterval(countdownTimer);
  render();
  countdownTimer = setInterval(tick, 100);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function resetCountdown(seconds) {
  stopCountdown();
  remaining = typeof seconds === 'number' ? seconds : 0;
  render();
}

function onFinished() {
  const label = document.getElementById('label');
  if (label) {
    label.textContent = 'GO!';
    setTimeout(() => { label.textContent = ''; }, 2500);
  }
}

function parseQuery() {
  try {
    const q = new URLSearchParams(location.search);
    const s = q.get('s') || q.get('seconds') || q.get('duration');
    return s ? Number(s) : null;
  } catch (e) { return null; }
}

// WebSocket integration: react to messages of type {type: 'countdown', action, duration}
let ws = null;
function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    return;
  }

  console.log('Countdown overlay: connecting WS to', url);

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      console.log('Countdown overlay: WS message', msg);
      if (msg.type === 'countdown') {
        const action = msg.action;
        const dur = typeof msg.duration === 'number' ? msg.duration : null;
        if (action === 'start') startCountdown(dur ?? remaining);
        if (action === 'stop') stopCountdown();
        if (action === 'reset') resetCountdown(dur ?? 0);
        if (action === 'label') {
          const labelEl = document.getElementById('label');
          if (labelEl) labelEl.textContent = typeof msg.label === 'string' ? msg.label : '';
        }
      }
      if (msg.type === 'reload') location.reload();
    } catch (e) {
      console.error('Invalid WS message', e);
    }
  });

  ws.addEventListener('close', () => { ws = null; setTimeout(connectWS, 1500); });
}

// Auto-start if query param present
window.addEventListener('load', () => {
  const qSeconds = parseQuery();
  if (qSeconds && Number.isFinite(qSeconds) && qSeconds > 0) {
    startCountdown(qSeconds);
  } else {
    render();
  }
  connectWS();
});
