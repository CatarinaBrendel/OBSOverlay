const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static(__dirname));

// parse JSON bodies for POST requests
app.use(express.json());

// Simple permissive CORS to allow control UI served from other origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging for debugging control UI network issues
app.use((req, res, next) => {
  try {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} origin=${req.headers.origin || '-'} ua=${(req.headers['user-agent']||'').slice(0,60)}`);
  } catch (e) {}
  next();
});

let scoreboardState = {
  leftName: "PLAYER 1",
  rightName: "PLAYER 2",
  leftScore: 0,
  rightScore: 0,
  roundText: "POOLS",
  footerText: "TWITCH.TV/YOURCHANNEL"
};

// Keep a simple in-memory countdown state so overlays can sync on connect
let countdownState = {
  action: null, // 'start'|'stop'|'reset'|'label'|'sync'
  duration: null,
  label: ''
};

app.get("/state", (req, res) => {
  res.json(scoreboardState);
});


// Serve control UI at root and index.html
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "control.html"));
});

// Convenience route to open the overlay directly
app.get(["/overlay", "/overlay.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "overlay.html"));
});

// Countdown overlay
app.get(["/countdown", "/countdown.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "countdown.html"));
});

// Announcement overlay (output-only) for OBS
app.get(["/announcement", "/announcement.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "announcement.html"));
});

const port = process.env.PORT || 3000;

// create HTTP server and attach WebSocket server so WS uses same port
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcastState() {
  const msg = JSON.stringify({ type: "state", state: scoreboardState });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// broadcast updates when state changes via HTTP endpoints

// Attach WebSocket connection handler
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: "state", state: scoreboardState }));
  // send current countdown state so newly connected overlays get the latest label/duration
  try {
    ws.send(JSON.stringify({ type: 'countdown', ...countdownState }));
  } catch (e) {
    console.warn('Failed to send countdown sync to client', e);
  }
});

// Overwrite the POST handlers to broadcast after updating state
// (simple approach: wrap the handlers by re-defining endpoints)
app.post('/state', (req, res) => {
  scoreboardState = { ...scoreboardState, ...req.body };
  broadcastState();
  res.json({ ok: true, state: scoreboardState });
});

// Accept countdown commands from control UI and broadcast to overlay via WebSocket
app.post('/countdown', (req, res) => {
  const { action, duration, label } = req.body || {};
  console.log('POST /countdown', { action, duration, label });

  // validate action
  if (!action || !['start','stop','reset','label'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'invalid action' });
  }

  // update in-memory countdownState
  countdownState.action = action;
  if (typeof duration === 'number') countdownState.duration = duration;
  if (typeof label === 'string') countdownState.label = label;

  const payload = { type: 'countdown', action };
  if (typeof countdownState.duration === 'number') payload.duration = countdownState.duration;
  if (typeof countdownState.label === 'string') payload.label = countdownState.label;

  const msg = JSON.stringify(payload);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); sent++; } catch (e) { console.warn('Failed sending to client', e); }
    }
  });
  console.log(`Broadcasted countdown (${action}) to ${sent} clients`);

  res.json({ ok: true });
});

// Accept announcements from control UI and broadcast to overlay via WebSocket
app.post('/announce', (req, res) => {
  const { text, action } = req.body || {};
  console.log('POST /announce', { text: typeof text === 'string' ? text.slice(0,200) : text, action, origin: req.headers.origin });

  let payload;
  if (action === 'clear') {
    // broadcast an empty announcement to instruct overlays to hide
    payload = { type: 'announcement', text: '' };
  } else {
    // prefer HTML payload when provided
    const html = req.body && req.body.html;
    if (typeof html === 'string' && html.trim()) {
      payload = { type: 'announcement', html: html };
    } else {
      if (typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ ok: false, error: 'invalid text' });
      }
      payload = { type: 'announcement', text: text.trim() };
    }
    // forward optional alignment if provided (left/center/right)
    const align = req.body && req.body.align;
    if (typeof align === 'string' && ['left','center','right'].includes(align)) payload.align = align;
  }
  const msg = JSON.stringify(payload);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); sent++; } catch (e) { console.warn('Failed sending announcement to client', e); }
    }
  });
  console.log(`Broadcasted announcement to ${sent} clients`);

  res.json({ ok: true });
});

app.post('/reset', (req, res) => {
  scoreboardState = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "BRACKETS",
    footerText: "TWITCH.TV/YOURCHANNEL"
  };
  broadcastState();
  res.json({ ok: true, state: scoreboardState });
});

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});