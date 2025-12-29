/**
 * Brutalist web server for Topbars
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline, generateLineBank } from './pipeline.js';
import type { PipelineResult } from './types.js';

// Load .env
const envPaths = [
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);

// In-memory cache for results
const resultCache = new Map<string, PipelineResult>();

/**
 * Serve static HTML
 */
function serveStatic(res: http.ServerResponse, filePath: string, contentType: string): void {
  const fullPath = path.join(process.cwd(), 'public', filePath);

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

/**
 * Parse POST body
 */
async function parseBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const result: Record<string, string> = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      resolve(result);
    });
  });
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render results as brutalist HTML
 */
function renderResults(result: PipelineResult): string {
  const lineBank = generateLineBank(result);

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Topbars - ${escapeHtml(result.playlist.name)}</title>
  <style>
    body { font-family: monospace; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.5; }
    h1, h2, h3 { font-weight: normal; }
    hr { border: none; border-top: 1px solid #000; margin: 20px 0; }
    .bar { margin: 10px 0; padding: 10px; background: #f5f5f5; }
    .bar-lyric { font-style: italic; }
    .bar-meta { font-size: 0.85em; color: #666; }
    .bar-note { font-size: 0.9em; margin-top: 5px; color: #333; }
    .track { margin: 20px 0; }
    .track-title { font-weight: bold; }
    .fallback { color: #999; font-style: italic; }
    .summary { background: #eee; padding: 15px; margin: 20px 0; }
    .line-bank { background: #ffffcc; padding: 15px; white-space: pre-wrap; font-size: 0.9em; }
    button { font-family: monospace; padding: 8px 16px; cursor: pointer; margin-right: 10px; }
    a { color: #000; }
    textarea { width: 100%; height: 200px; font-family: monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>TOPBARS</h1>
  <p><a href="/">&larr; Back</a></p>

  <div class="summary">
    <strong>Playlist:</strong> <a href="${escapeHtml(result.playlist.url)}" target="_blank">${escapeHtml(result.playlist.name)}</a><br>
    <strong>Tracks:</strong> ${result.summary.tracks_total}<br>
    <strong>Matched to Genius:</strong> ${result.summary.matched}<br>
    <strong>With bars:</strong> ${result.summary.with_bars}<br>
    <strong>No bars:</strong> ${result.summary.no_bars}
  </div>

  <hr>
  <h2>TRACKS</h2>
`;

  for (const track of result.tracks) {
    html += `
  <div class="track">
    <div class="track-title">${escapeHtml(track.spotify.artist)} - ${escapeHtml(track.spotify.title)}</div>
`;

    if (track.topbars.length > 0) {
      for (const bar of track.topbars) {
        const lyric = escapeHtml(bar.lyric.replace(/\n/g, ' / '));
        html += `
    <div class="bar">
      <div class="bar-lyric">"${lyric}"</div>
      <div class="bar-meta">${bar.votes} votes</div>
      ${bar.note ? `<div class="bar-note">${escapeHtml(bar.note)}</div>` : ''}
    </div>
`;
      }
    } else {
      html += `    <div class="fallback">${escapeHtml(track.fallback || 'No bars available')}</div>\n`;
    }

    html += `  </div>\n`;
  }

  html += `
  <hr>
  <h2>LINE BANK</h2>
  <p>All bars from this playlist, one per line. Copy for caption/tweet inspo.</p>
  <button onclick="copyLineBank()">Copy Line Bank</button>
  <button onclick="downloadJson()">Download JSON</button>

  <textarea id="lineBank" readonly>${escapeHtml(lineBank)}</textarea>

  <script>
    const resultJson = ${JSON.stringify(result)};

    function copyLineBank() {
      const textarea = document.getElementById('lineBank');
      textarea.select();
      document.execCommand('copy');
      alert('Copied to clipboard!');
    }

    function downloadJson() {
      const blob = new Blob([JSON.stringify(resultJson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'topbars-${result.playlist.id}.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;

  return html;
}

/**
 * Main request handler
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Serve index
  if (req.method === 'GET' && url.pathname === '/') {
    serveStatic(res, 'index.html', 'text/html');
    return;
  }

  // Handle form submission
  if (req.method === 'POST' && url.pathname === '/generate') {
    try {
      const body = await parseBody(req);
      const playlistUrl = body.url;

      if (!playlistUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing playlist URL');
        return;
      }

      // Check cache
      if (resultCache.has(playlistUrl)) {
        const cached = resultCache.get(playlistUrl)!;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderResults(cached));
        return;
      }

      console.log(`Processing: ${playlistUrl}`);
      const result = await runPipeline(playlistUrl, { maxBars: 3 });

      // Cache result
      resultCache.set(playlistUrl, result);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderResults(result));

    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="font-family: monospace; padding: 20px;">
  <h1>Error</h1>
  <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
  <p><a href="/">Back</a></p>
</body>
</html>
      `);
    }
    return;
  }

  // API endpoint for JSON results
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    res.setHeader('Content-Type', 'application/json');

    try {
      const body = await parseBody(req);
      const playlistUrl = body.url;

      if (!playlistUrl) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing playlist URL' }));
        return;
      }

      const result = await runPipeline(playlistUrl, { maxBars: 3 });
      res.writeHead(200);
      res.end(JSON.stringify(result, null, 2));

    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
}

// Start server
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('Unhandled error:', err);
    res.writeHead(500);
    res.end('Internal server error');
  });
});

server.listen(PORT, () => {
  console.log(`\n  Topbars server running at http://localhost:${PORT}\n`);
});
