const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const { importRunePage, lcuErrorResponse } = require('./api/lcu');

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const translationCache = new Map();
const supportedTranslationLanguages = new Set(['en', 'es', 'fr', 'de', 'pt', 'it', 'ro', 'tr', 'pl', 'ru', 'ko', 'ja']);
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function readJsonBody(req, callback) {
  let raw = '';
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 262144) req.destroy();
  });
  req.on('end', () => {
    try {
      callback(null, raw ? JSON.parse(raw) : {});
    } catch (error) {
      callback(error);
    }
  });
}

function translateBatch(texts, target) {
  return new Promise((resolve, reject) => {
    const normalizedTexts = texts.map(text => String(text || '').replace(/\s+/g, ' ').trim());
    const cacheKey = `${target}:${JSON.stringify(normalizedTexts)}`;
    if (translationCache.has(cacheKey)) {
      resolve(translationCache.get(cacheKey));
      return;
    }

    const body = new URLSearchParams();
    body.append('q', normalizedTexts.join('\n'));

    const req = https.request(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body.toString())
        }
      },
      response => {
        let raw = '';
        response.on('data', chunk => { raw += chunk; });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Translation request failed with status ${response.statusCode}.`));
            return;
          }

          try {
            const parsed = JSON.parse(raw);
            const combined = (parsed[0] || []).map(part => part[0]).join('');
            const translated = combined.split('\n').map((value, index) => value.trim() || normalizedTexts[index] || '');
            const padded = normalizedTexts.map((value, index) => translated[index] || value);
            translationCache.set(cacheKey, padded);
            resolve(padded);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.end(body.toString());
  });
}

http.createServer((req, res) => {
  let requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';

  if (req.method === 'POST' && requestPath === '/api/lcu/runes') {
    readJsonBody(req, async (parseError, body) => {
      if (parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Invalid JSON request body.' }));
        return;
      }

      try {
        const result = await importRunePage(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          message: `Imported ${result.page.name} into League Client.`,
          page: result.page
        }));
      } catch (error) {
        const response = lcuErrorResponse(error);
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.body));
      }
    });
    return;
  }

  if (req.method === 'POST' && requestPath === '/api/translate') {
    readJsonBody(req, async (parseError, body) => {
      if (parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Invalid JSON request body.' }));
        return;
      }

      const target = String(body.target || 'en').toLowerCase();
      const texts = Array.isArray(body.texts) ? body.texts : [];
      if (!supportedTranslationLanguages.has(target)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Unsupported language.' }));
        return;
      }

      if (target === 'en') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, translations: texts.map(text => String(text || '')) }));
        return;
      }

      try {
        const translations = await translateBatch(texts.slice(0, 60), target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, translations }));
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Translation service unavailable.' }));
      }
    });
    return;
  }

  const file = path.normalize(path.join(root, requestPath));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1');
