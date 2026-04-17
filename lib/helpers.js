const http = require('http');
const https = require('https');

// helper to fetch remote URL (http/https)
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const opts = { headers: { 'User-Agent': 'ScoreboardBot/1.0 (+https://example)' } };
      lib.get(u, opts, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk.toString());
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
        res.on('error', (e) => reject(e));
      }).on('error', reject);
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
