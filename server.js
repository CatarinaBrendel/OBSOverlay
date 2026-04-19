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
      // .env loaded via manual parser
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

// Ensure a permissive CSP for local testing so overlays with inline scripts run.
// This overrides restrictive headers that may be injected by other layers.
app.use((req, res, next) => {
  try {
    res.setHeader('Content-Security-Policy', "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;");
  } catch (e) {}
  next();
});

// Request logging for debugging control UI network issues
app.use((req, res, next) => {
  try {
    // request logging removed
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

// helper utilities
const { fetchUrl, extractNamesFromHtml } = require('./lib/helpers');

// Extract team/player names from HTML using heuristic regexes
// extractNamesFromHtml is implemented in lib/helpers.js

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
  // countdown command received

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
  // broadcasted countdown to clients

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

  // Determine whether this update should be persisted. If `preview=1` or `persist=0` is set
  // on the query string, broadcast the iframe update but do not overwrite saved state or write file.
  const isPreview = (String(req.query.preview || req.query.preview === '1' || '').toLowerCase() === '1') || (String(req.query.persist || '').toLowerCase() === '0') || (req.query.preview === 'true');

  // build the new iframe payload based on current state + provided overrides
  const newIframe = Object.assign({}, iframeState);
  if (typeof src === 'string') { newIframe.src = src; newIframe.html = null; }
  if (typeof html === 'string') { newIframe.html = html; newIframe.src = null; }
  if (typeof scale === 'number' || (typeof scale === 'string' && !isNaN(Number(scale)))) newIframe.scale = Number(scale);

  // If the user submitted HTML that contains an <iframe src="...">, fetch that
  // remote module and write it to a local `challonge.html` so `/challonge` can
  // serve the module content without a cross-origin src. Only persist when
  // this is not a preview update.
  try {
    const iframeMatch = (typeof html === 'string') && html.match(/<iframe[^>]*\s+src=(['"])([^'"\s>]+)\1[^>]*>/i);
    if (iframeMatch) {
      const remoteUrl = iframeMatch[2];
      if (/^https?:\/\//i.test(remoteUrl)) {
        // Instead of fetching remote HTML (which can be blocked), write a
        // local wrapper that contains an iframe pointing to the remote URL.
        // This lets the browser load the Challonge module directly.
        const wrapper = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Challonge Module</title>
    <style>html,body{height:100%;margin:0}iframe{border:0;width:100%;height:100vh;display:block}</style>
  </head>
  <body>
    <iframe src="${remoteUrl}" title="Challonge module" allowfullscreen allowtransparency="true" scrolling="auto"></iframe>
  </body>
</html>`;

        if (!isPreview) {
          try { fs.writeFileSync(path.join(__dirname, 'challonge.html'), wrapper); } catch (e) { console.warn('Failed to write challonge.html', e); }
        }

        // store the wrapper as html so overlays that consume iframe.html get the wrapper
        newIframe.html = wrapper;
        newIframe.src = null;
      }
    }
  } catch (e) { console.warn('Error handling iframe embed submission', e); }

  // persist only when not a preview
  if (!isPreview) {
    iframeState = Object.assign(iframeState, newIframe);
    try { fs.writeFileSync(iframeStateFile, JSON.stringify(iframeState, null, 2)); } catch (e) { console.warn('Failed to persist iframe state', e); }
  }

  // broadcast via websocket so open overlays can update immediately
  const msg = JSON.stringify({ type: 'iframe', iframe: newIframe });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) { console.warn('Failed sending iframe to client', e); }
    }
  });

  res.json({ ok: true, iframe: (isPreview ? newIframe : iframeState), preview: !!isPreview });
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

// Fetch full bracket (matches) from Challonge API
app.get('/iframe/bracket', async (req, res) => {
  try {
    const useApi = req.query.useApi === '1' || req.query.useApi === 'true' || req.query.useapi === '1' || req.query.useapi === 'true';
    const apiKey = (req.query.api_key || req.query.apikey || (req.body && req.body.api_key) || process.env.CHALLONGE_API_KEY || process.env.CHALLONGE_API || process.env.CHALLONGE_KEY) || null;

    if (!useApi) return res.status(400).json({ ok: false, error: 'useApi_required' });
    if (!apiKey) return res.status(400).json({ ok: false, error: 'missing_api_key', hint: 'set CHALLONGE_API_KEY or provide api_key' });
    if (!iframeState.src) return res.status(400).json({ ok: false, error: 'no_iframe_src' });

    // extract slug from iframe URL
    let slug = null;
    try {
      const p = new URL(iframeState.src).pathname.split('/').filter(Boolean);
      const mi = p.indexOf('module');
      if (mi > 0) slug = p[mi - 1];
      else slug = p[p.length - 1] || null;
    } catch (e) { /* fallthrough */ }
    if (!slug) return res.status(400).json({ ok: false, error: 'could_not_parse_slug' });

    const matchesUrl = `https://api.challonge.com/v1/tournaments/${encodeURIComponent(slug)}/matches.json?api_key=${encodeURIComponent(apiKey)}`;
    const participantsUrl = `https://api.challonge.com/v1/tournaments/${encodeURIComponent(slug)}/participants.json?api_key=${encodeURIComponent(apiKey)}`;

    const [fMatches, fParts] = await Promise.all([
      fetchUrl(matchesUrl).catch(err => ({ status: 0, error: String(err) })),
      fetchUrl(participantsUrl).catch(err => ({ status: 0, error: String(err) }))
    ]);

    if (!fMatches || !fMatches.status || fMatches.status < 200 || fMatches.status >= 400) return res.status(502).json({ ok: false, error: 'matches_fetch_failed', status: fMatches && fMatches.status, info: fMatches && fMatches.error });
    if (!fParts || !fParts.status || fParts.status < 200 || fParts.status >= 400) return res.status(502).json({ ok: false, error: 'participants_fetch_failed', status: fParts && fParts.status, info: fParts && fParts.error });

    let parsedMatches = null;
    let parsedParts = null;
    try { parsedMatches = JSON.parse(fMatches.body); } catch (e) { return res.status(502).json({ ok: false, error: 'invalid_matches_response' }); }
    try { parsedParts = JSON.parse(fParts.body); } catch (e) { parsedParts = []; }

    // build participant id -> name map
    const nameMap = {};
    if (Array.isArray(parsedParts)) {
      parsedParts.forEach(p => {
        const part = p && p.participant ? p.participant : p;
        if (part && (part.id || part.participant_id)) {
          const id = part.id || part.participant_id;
          nameMap[id] = part.display_name || part.name || null;
        }
      });
    }

    const matches = (Array.isArray(parsedMatches) ? parsedMatches.map(m => {
      const mm = m && m.match ? m.match : m || {};
      return {
        id: mm.id || null,
        round: mm.round || null,
        player1_id: mm.player1_id || null,
        player2_id: mm.player2_id || null,
        player1_name: nameMap[mm.player1_id] || mm.player1_name || null,
        player2_name: nameMap[mm.player2_id] || mm.player2_name || null,
        scores: mm.scores_csv || mm.scores || null,
        state: mm.state || null,
        winner_id: mm.winner_id || null
      };
    }) : []);

    const out = { source: iframeState.src, method: 'api', slug, count: matches.length, matches, raw: parsedMatches, ts: new Date().toISOString() };
    try { fs.writeFileSync(path.join(__dirname, 'challonge_bracket.json'), JSON.stringify(out, null, 2)); } catch (e) { console.warn('write bracket file failed', e); }
    return res.json({ ok: true, bracket: out });
  } catch (e) {
    console.error('Error fetching bracket', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Proxy a remote Challonge module page and rewrite HTML so it can be embedded.
app.get('/proxy/challonge', async (req, res) => {
  try {
    // prefer explicit url param, otherwise use configured iframeState.src
    const requested = req.query.url || iframeState.src || 'https://challonge.com/de/2XKOvsSFEAM2/module';
    const u = new URL(requested);
    // only allow challonge domains for this proxy to avoid open proxy abuse
    if (!/challonge\.com$/i.test(u.hostname) && !/challonge\.com$/i.test(u.hostname.split('.').slice(-2).join('.'))) {
      return res.status(400).send('Proxy only supports challonge.com');
    }

    let fetched = await fetchUrl(requested, { timeout: 20000 }).catch(err => ({ status: 0, error: String(err) }));
    // Some sites (including Challonge) may block simple programmatic fetches.
    // If we get 403, retry with additional browser-like headers (Referer, Accept-Language).
    if (fetched && fetched.status === 403) {
      try {
        fetched = await fetchUrl(requested, { timeout: 20000, headers: { 'Referer': 'https://challonge.com/', 'Accept-Language': 'en-US,en;q=0.9' } }).catch(err => ({ status: 0, error: String(err) }));
      } catch (e) { /* ignore */ }
    }

    let html = null;
    if (fetched && fetched.status && fetched.status >= 200 && fetched.status < 400) {
      html = fetched.body || '';
    } else {
      console.warn('proxy initial fetch failed', fetched && fetched.error, fetched && fetched.status);
      // Retry a few times with different common browser user-agents and headers
      const attempts = [
        { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', 'Referer': 'https://challonge.com/', 'Accept-Language': 'en-US,en;q=0.9' },
        { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15', 'Referer': 'https://challonge.com/', 'Accept-Language': 'en-US,en;q=0.9' },
        { 'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0', 'Referer': 'https://challonge.com/', 'Accept-Language': 'en-US,en;q=0.9' }
      ];
      for (const h of attempts) {
        try {
          const tryf = await fetchUrl(requested, { timeout: 20000, headers: h }).catch(err => ({ status: 0, error: String(err) }));
          if (tryf && tryf.status && tryf.status >= 200 && tryf.status < 400) { html = tryf.body || ''; break; }
        } catch (e) { /* ignore per-attempt errors */ }
      }
      if (!html) {
        const info = (fetched && (fetched.error || fetched.status)) || 'unknown error';
        const snippet = (fetched && fetched.body) ? ('\n\n-- remote body snippet --\n' + String(fetched.body).slice(0, 2000)) : '';
        console.warn('proxy fetch retries failed', info);
        return res.status(502).send('Failed to fetch remote page: ' + info + '\n\nHint: you can serve a local copy at /challonge (place `challonge.html` in the project root) or adjust the iframe via /iframe to point to a different URL.' + snippet);
      }
    }

    // remove meta CSP tags
    html = html.replace(/<meta[^>]+http-equiv\s*=\s*(?:['"])content-security-policy(?:['"])[^>]*>/ig, '');
    html = html.replace(/<meta[^>]+http-equiv\s*=\s*content-security-policy[^>]*>/ig, '');

    // insert a base tag so relative URLs resolve to the remote module directory
    try {
      const baseDir = requested.replace(/\/[^\/]*$/, '/');
      if (!/\<base\s/i.test(html)) {
        html = html.replace(/<head(\b[^>]*)>/i, `<head$1><base href="${baseDir}">`);
      }
    } catch (e) {}

    // rewrite protocol-relative URLs
    html = html.replace(/src=["']\/\//ig, 'src="https://');
    html = html.replace(/href=["']\/\//ig, 'href="https://');

    // rewrite root-relative paths to absolute using origin
    try {
      const origin = u.origin;
      html = html.replace(/(src|href)=(['"])\/(?!\/)/ig, `$1=$2${origin}/`);
    } catch (e) {}

    // serve rewritten HTML allowing embedding
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // ensure permissive CSP for embedded scripts
    res.setHeader('Content-Security-Policy', "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;");
    return res.send(html);
  } catch (e) {
    console.error('proxy error', e);
    return res.status(500).send('proxy error');
  }
});

// Render the Challonge module using a headless browser and return rendered HTML.
// This is more likely to succeed when the remote site blocks non-browser clients.
app.get('/proxy/challonge-render', async (req, res) => {
  try {
    const requested = req.query.url || iframeState.src || 'https://challonge.com/de/2XKOvsSFEAM2/module';
    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch (e) {
      return res.status(501).send('puppeteer not installed; run `npm install puppeteer` to enable render proxy');
    }

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    try {
      await page.goto(requested, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      await browser.close();
      return res.status(502).send('Failed to load remote page in headless browser: ' + String(e));
    }
    await page.waitForTimeout(500);
    let html = await page.content();
    await browser.close();

    // remove meta CSP tags
    html = html.replace(/<meta[^>]+http-equiv\s*=\s*(?:['"])content-security-policy(?:['"])[^>]*>/ig, '');
    html = html.replace(/<meta[^>]+http-equiv\s*=\s*content-security-policy[^>]*>/ig, '');

    // insert base tag
    try {
      const u = new URL(requested);
      const baseDir = requested.replace(/\/[^\/]*$/, '/');
      if (!/\<base\s/i.test(html)) {
        html = html.replace(/<head(\b[^>]*)>/i, `<head$1><base href="${baseDir}">`);
      }
    } catch (e) {}

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;");
    return res.send(html);
  } catch (e) {
    console.error('render proxy error', e);
    return res.status(500).send('render proxy error');
  }
});

// Convenience public routes that redirect to the proxy endpoints.
// These provide simple URLs like /challonge and /challonge-render that use the
// configured `iframeState.src` by default or accept a `?url=` query param.
app.get(['/challonge','/challonge.html'], (req, res) => {
  // If a local challonge.html exists in the project root, serve it directly
  try {
    const localPath = path.join(__dirname, 'challonge.html');
    if (fs.existsSync(localPath)) return res.sendFile(localPath);
  } catch (e) {}

  // Fallback: redirect to the proxy endpoint using configured iframeState.src
  const url = req.query.url || iframeState.src || 'https://challonge.com/de/2XKOvsSFEAM2/module';
  return res.redirect(`/proxy/challonge?url=${encodeURIComponent(url)}`);
});

app.get(['/challonge-render','/challonge-render.html'], (req, res) => {
  const url = req.query.url || iframeState.src || 'https://challonge.com/de/2XKOvsSFEAM2/module';
  return res.redirect(`/proxy/challonge-render?url=${encodeURIComponent(url)}`);
});

// Accept announcements from control UI and broadcast to overlay via WebSocket
app.post('/announce', (req, res) => {
  const { text, action } = req.body || {};
  // announcement received

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
  // broadcasted announcement to clients

  res.json({ ok: true });
});

// Accept lobby ID from control UI and broadcast to overlay via WebSocket
app.post('/lobby', (req, res) => {
  const { id } = req.body || {};
  // lobby id received

  const payload = { type: 'lobby', id: (typeof id === 'string' ? id.trim() : '') };
  const msg = JSON.stringify(payload);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); sent++; } catch (e) { console.warn('Failed sending lobby to client', e); }
    }
  });
  // broadcasted lobby to clients

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

server.listen(port, () => {});