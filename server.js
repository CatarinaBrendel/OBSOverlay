const express = require("express");
const path = require("path");
const fs = require('fs');
const http = require("http");
const WebSocket = require("ws");

const app = express();
// serve static files from repo root, but expose organized folders `control/` and `overlays/`
app.use(express.static(__dirname));

// Load environment variables from .env if present (try dotenv, fallback to simple parser)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      require('dotenv').config({ path: envPath });
      console.log('Loaded .env via dotenv');
    } catch (e) {
      // fallback: simple manual parser
      const raw = fs.readFileSync(envPath, 'utf8');
      raw.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) return;
        let val = m[2] || '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        process.env[m[1]] = val;
      });
      console.log('Loaded .env via manual parser');
    }
  }
} catch (e) { console.warn('Failed to load .env', e); }

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
  roundText: "BRACKETS",
  footerText: "#StillFantastic"
};

// iframe state persisted to file so control UI can update the embed
const iframeStateFile = path.join(__dirname, 'iframe.json');
let iframeState = { src: 'https://challonge.com/de/2XKOvsSFAPAC2/module', html: null, scale: 1 };
try {
  if (fs.existsSync(iframeStateFile)) {
    const raw = fs.readFileSync(iframeStateFile, 'utf8');
    try { const parsed = JSON.parse(raw); iframeState = Object.assign(iframeState, parsed); } catch (e) { /* ignore parse errors */ }
  }
} catch (e) {}

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
  // prefer new control folder if present
  const controlPath = path.join(__dirname, 'control', 'control.html');
  if (fs.existsSync(controlPath)) return res.sendFile(controlPath);
  return res.sendFile(path.join(__dirname, "control.html"));
});

// Convenience route to open the overlay directly
app.get(["/overlay", "/overlay.html"], (req, res) => {
  const overlayPath = path.join(__dirname, 'overlays', 'overlay.html');
  if (fs.existsSync(overlayPath)) return res.sendFile(overlayPath);
  return res.sendFile(path.join(__dirname, "overlay.html"));
});

// Countdown overlay
app.get(["/countdown", "/countdown.html"], (req, res) => {
  const p = path.join(__dirname, 'overlays', 'countdown.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.sendFile(path.join(__dirname, "countdown.html"));
});

// Lobby overlay (shows a single Lobby ID)
app.get(["/lobby", "/lobby.html"], (req, res) => {
  const p = path.join(__dirname, 'overlays', 'lobby.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.sendFile(path.join(__dirname, "lobby.html"));
});

// Announcement overlay (output-only) for OBS
app.get(["/announcement", "/announcement.html"], (req, res) => {
  const p = path.join(__dirname, 'overlays', 'announcement.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.sendFile(path.join(__dirname, "announcement.html"));
});

const port = process.env.PORT || 3000;

// create HTTP server and attach WebSocket server so WS uses same port
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// helper to fetch remote URL (http/https)
const fetchUrl = (url) => new Promise((resolve, reject) => {
  try {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const opts = { headers: { 'User-Agent': 'ScoreboardBot/1.0 (+https://example)' } };
    lib.get(u, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk.toString());
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
      res.on('error', (e) => reject(e));
    }).on('error', reject);
  } catch (e) { reject(e); }
});

// Extract team/player names from HTML using heuristic regexes
function extractNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const names = new Set();

  // 1) anchors that look like participant links or contain a short text
  const aRe = /<a[^>]*>([^<]{2,60}?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    const t = m[1].trim();
    if (t && /[A-Za-z0-9]/.test(t) && t.length <= 60) names.add(t);
  }

  // 2) elements with class names containing player/participant/name
  const clsRe = /<[^>]+class=["']([^"']*)["'][^>]*>([^<]{2,80})<\/[^>]+>/gi;
  while ((m = clsRe.exec(html)) !== null) {
    const classes = (m[1] || '').toLowerCase();
    const text = (m[2] || '').trim();
    if (/(player|participant|entrant|name)/.test(classes) && text && text.length <= 80) names.add(text);
  }

  // 3) fallback: plain text lines that look like names (one or two words, capitalized)
  const textOnly = html.replace(/<[^>]+>/g, '\n');
  const lines = textOnly.split(/\n+/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 3 || line.length > 60) continue;
    // simple name heuristic: contains letters and spaces, not too many punctuation marks
    if (/^[A-Za-z0-9 \-'.]{2,60}$/.test(line) && /[A-Za-z]/.test(line)) names.add(line);
  }

  return Array.from(names).slice(0, 200);
}

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
  // send current iframe state so clients can load dynamic embed
  try {
    ws.send(JSON.stringify({ type: 'iframe', iframe: iframeState }));
  } catch (e) {}
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

// GET/POST for iframe embed configuration
app.get('/iframe', (req, res) => {
  res.json(iframeState);
});

app.post('/iframe', (req, res) => {
  const { src, html } = req.body || {};
  const { scale } = req.body || {};
  if (!src && !html && typeof scale !== 'number' && typeof scale !== 'string') return res.status(400).json({ ok: false, error: 'missing src/html/scale' });

  // prefer explicit html if provided, otherwise set src; also accept scale
  if (typeof src === 'string') iframeState.src = src;
  if (typeof html === 'string') iframeState.html = html;
  if (typeof scale === 'number' || (typeof scale === 'string' && !isNaN(Number(scale)))) iframeState.scale = Number(scale);

  try { fs.writeFileSync(iframeStateFile, JSON.stringify(iframeState, null, 2)); } catch (e) { console.warn('Failed to persist iframe state', e); }

  // broadcast via websocket so open overlays can update immediately
  const msg = JSON.stringify({ type: 'iframe', iframe: iframeState });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) { console.warn('Failed sending iframe to client', e); }
    }
  });

  res.json({ ok: true, iframe: iframeState });
});

// Fetch and extract participant/team names from the configured iframe (challonge)
app.get('/iframe/teams', async (req, res) => {
  try {
    const useApi = req.query.useApi === '1' || req.query.useApi === 'true' || req.query.useapi === '1' || req.query.useapi === 'true';
    const apiKey = (req.query.api_key || req.query.apikey || (req.body && req.body.api_key) || process.env.CHALLONGE_API_KEY || process.env.CHALLONGE_API || process.env.CHALLONGE_KEY) || null;

    // If user requested API approach, use Challonge API (requires apiKey)
    if (useApi) {
      if (!apiKey) return res.status(400).json({ ok: false, error: 'missing_api_key', hint: 'set CHALLONGE_API_KEY or provide api_key' });
      if (!iframeState.src) return res.status(400).json({ ok: false, error: 'no_iframe_src' });

      // extract slug from iframe URL (take segment before 'module' or last segment)
      let slug = null;
      try {
        const p = new URL(iframeState.src).pathname.split('/').filter(Boolean);
        const mi = p.indexOf('module');
        if (mi > 0) slug = p[mi - 1];
        else slug = p[p.length - 1] || null;
      } catch (e) { /* fallthrough */ }
      if (!slug) return res.status(400).json({ ok: false, error: 'could_not_parse_slug' });

      const apiUrl = `https://api.challonge.com/v1/tournaments/${encodeURIComponent(slug)}/participants.json?api_key=${encodeURIComponent(apiKey)}`;
      const fetched = await fetchUrl(apiUrl).catch(err => ({ status: 0, error: String(err) }));
      if (!fetched || !fetched.status || fetched.status < 200 || fetched.status >= 400) return res.status(502).json({ ok: false, error: 'api_fetch_failed', status: fetched && fetched.status, info: fetched && fetched.error });

      let parsed = null;
      try { parsed = JSON.parse(fetched.body); } catch (e) { return res.status(502).json({ ok: false, error: 'invalid_api_response' }); }
      // parsed is expected to be array of { participant: { name, display_name, ... } }
      const names = (Array.isArray(parsed) ? parsed.map(p => (p && p.participant && (p.participant.display_name || p.participant.name)) || null).filter(Boolean) : []);
      const out = { source: iframeState.src, method: 'api', slug, count: names.length, names, raw: parsed, ts: new Date().toISOString() };
      try { fs.writeFileSync(path.join(__dirname, 'challonge_teams.json'), JSON.stringify(out, null, 2)); } catch (e) { console.warn('write teams file failed', e); }
      return res.json({ ok: true, teams: out });
    }

    // fallback: fetch raw HTML and heuristically extract names
    let html = null;
    if (iframeState.html) {
      html = iframeState.html;
    } else if (iframeState.src) {
      const fetched = await fetchUrl(iframeState.src);
      if (fetched && fetched.status && fetched.status >= 200 && fetched.status < 400) html = fetched.body;
      else return res.status(502).json({ ok: false, error: 'failed_fetch', status: fetched && fetched.status });
    } else {
      return res.status(400).json({ ok: false, error: 'no_iframe_configured' });
    }

    const names = extractNamesFromHtml(html);
    const out = { source: iframeState.src || null, method: 'html', count: names.length, names, ts: new Date().toISOString() };
    try { fs.writeFileSync(path.join(__dirname, 'challonge_teams.json'), JSON.stringify(out, null, 2)); } catch (e) { console.warn('write teams file failed', e); }
    return res.json({ ok: true, teams: out });
  } catch (e) {
    console.error('Error extracting teams', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
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

// Accept lobby ID from control UI and broadcast to overlay via WebSocket
app.post('/lobby', (req, res) => {
  const { id } = req.body || {};
  console.log('POST /lobby', { id: typeof id === 'string' ? id.slice(0,200) : id, origin: req.headers.origin });

  const payload = { type: 'lobby', id: (typeof id === 'string' ? id.trim() : '') };
  const msg = JSON.stringify(payload);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); sent++; } catch (e) { console.warn('Failed sending lobby to client', e); }
    }
  });
  console.log(`Broadcasted lobby to ${sent} clients`);

  res.json({ ok: true });
});

app.post('/reset', (req, res) => {
  scoreboardState = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "BRACKETS",
    footerText: "#StilLFantastic"
  };
  broadcastState();
  res.json({ ok: true, state: scoreboardState });
});

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});