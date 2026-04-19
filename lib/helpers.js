const http = require('http');
const https = require('https');

// helper to fetch remote URL (http/https)
function fetchUrl(url, opts = {}) {
  // follow redirects up to a limit
  const maxRedirects = typeof opts.maxRedirects === 'number' ? opts.maxRedirects : 5;
  const ua = opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  return new Promise((resolve, reject) => {
    try {
      const doRequest = (target, redirectsLeft) => {
        const u = new URL(target);
        const lib = u.protocol === 'https:' ? https : http;
        const requestOpts = { headers: Object.assign({ 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, opts.headers || {}) };
        const req = lib.get(u, requestOpts, (res) => {
          // follow redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location && redirectsLeft > 0) {
            const loc = res.headers.location;
            const next = (loc.startsWith('http') ? loc : new URL(loc, u).toString());
            // drain and follow
            res.resume();
            return doRequest(next, redirectsLeft - 1);
          }

          let data = '';
          res.on('data', (chunk) => data += chunk.toString());
          res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
          res.on('error', (e) => reject(e));
        });
        req.on('error', reject);
        // safety timeout
        req.setTimeout(opts.timeout || 15000, () => { req.abort(); reject(new Error('timeout')); });
      };

      doRequest(url, maxRedirects);
    } catch (e) {
      reject(e);
    }
  });
}

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
    if (/^[A-Za-z0-9 \-'.]{2,60}$/.test(line) && /[A-Za-z]/.test(line)) names.add(line);
  }

  return Array.from(names).slice(0, 200);
}

module.exports = { fetchUrl, extractNamesFromHtml };
