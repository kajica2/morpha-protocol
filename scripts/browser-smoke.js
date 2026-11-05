// scripts/browser-smoke.js
//
// Headless browser smoke test for the MORPHA runtime.
//
// Drives the real application in Chrome over the DevTools Protocol. No test
// dependencies are added: Chrome is launched directly and spoken to over the
// WebSocket client built into Node 22.
//
// Verifies that the ritual actually starts and renders:
//   - the page loads and the entry ritual can be entered
//   - a WebGL canvas is created
//   - glyph pixels are present and reach visible luminance
//   - the rendered output CHANGES over time (the morph is alive, not frozen)
//   - no uncaught exceptions, unhandled rejections or console errors
//
// Usage: node scripts/browser-smoke.js [--url http://127.0.0.1:5174]
// Exit codes: 0 pass, 1 fail, 2 skipped (no browser installed).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';

/**
 * Decode a PNG and measure how much of it is lit.
 *
 * The GL back buffer is cleared after compositing, so readPixels() on a
 * canvas without preserveDrawingBuffer legitimately returns zeros. The
 * screenshot is what the user actually sees, so that is what gets measured.
 *
 * @param {Buffer} buffer PNG bytes.
 * @returns {{lit: number, max: number, total: number, ratio: number}}
 *   Lit pixel count, peak luminance, total pixels and lit fraction.
 */
function analysePng(buffer) {
  let offset = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  // Undo the PNG per-scanline filters.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const rawByte = line[x];
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = rawByte + pred;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      out[x] = value & 0xff;
    }
  }

  let lit = 0;
  let max = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    const v = Math.max(pixels[i], pixels[i + 1] ?? pixels[i], pixels[i + 2] ?? pixels[i]);
    if (v > 24) lit++;
    if (v > max) max = v;
  }
  const total = width * height;
  return { lit, max, total, ratio: total ? lit / total : 0 };
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * Locate a Chrome/Chromium binary.
 *
 * @returns {string|null} Path to the browser, or null when none is installed.
 */
function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * GET a URL and resolve with its body.
 *
 * @param {string} url Target URL.
 * @returns {Promise<string>} Response body.
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Sleep for a number of milliseconds.
 *
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until a condition becomes true.
 *
 * @param {() => Promise<boolean>|boolean} condition Predicate to poll.
 * @param {number} timeoutMs Maximum wait.
 * @param {string} label Description used in the timeout message.
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let ok = false;
    try { ok = await condition(); } catch { ok = false; }
    if (ok) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

const argv = process.argv.slice(2);
const urlIndex = argv.indexOf('--url');
const APP_URL = urlIndex >= 0 ? argv[urlIndex + 1] : 'http://127.0.0.1:5174';

const chromePath = findChrome();
if (!chromePath) {
  console.error('SKIP: no Chrome/Chromium binary found - browser smoke test not run.');
  process.exit(2);
}

const profileDir = mkdtempSync(join(tmpdir(), 'morpha-smoke-'));
const port = 9222 + Math.floor(Math.random() * 900);

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1280,800',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  // NOTE: the URL is deliberately NOT passed here. Passing it as a startup
  // argument makes Chrome create an initial empty document (origin "://")
  // for the same frame as the real page. Runtime.evaluate without an
  // explicit contextId then binds to that stale empty document, so
  // document.title reads "" even though the real page is fully loaded.
  // Navigating explicitly via Page.navigate below avoids the duplicate
  // context entirely.
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeStderr = '';
chrome.stderr.on('data', (chunk) => { chromeStderr += chunk.toString(); });

const failures = [];
const consoleErrors = [];
const pageErrors = [];

/**
 * Record a check result.
 *
 * @param {boolean} ok Whether the check passed.
 * @param {string} label Description of the check.
 */
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
  if (!ok) failures.push(label);
}

let ws;
let nextId = 1;
const pending = new Map();

/**
 * Send a CDP command and await its result.
 *
 * @param {string} method CDP method name.
 * @param {object} [params] Method parameters.
 * @returns {Promise<object>} Command result.
 */
function cdp(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
  });
}

/**
 * Evaluate an expression in the page and return its value.
 *
 * @param {string} expression JavaScript expression.
 * @returns {Promise<*>} Evaluated value.
 */
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'page exception');
  }
  return result.result.value;
}

/**
 * Capture a PNG screenshot of the viewport and hash it.
 *
 * @returns {Promise<string>} Hex digest of the screenshot bytes.
 */
async function frameHash() {
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  return createHash('sha256').update(Buffer.from(shot.data, 'base64')).digest('hex');
}

try {
  // Wait for the DevTools endpoint, then find the page target.
  let pageTarget = null;
  for (let i = 0; i < 80 && !pageTarget; i++) {
    try {
      const list = JSON.parse(await httpGet(`http://127.0.0.1:${port}/json/list`));
      pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch {
      // browser not up yet
    }
    if (!pageTarget) await sleep(250);
  }
  if (!pageTarget) throw new Error(`Chrome DevTools endpoint never came up.\n${chromeStderr.slice(-500)}`);

  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails.text || 'exception');
    }
  });

  await cdp('Runtime.enable');
  await cdp('Page.enable');

  // readyState 'complete' can precede the first title assignment in a
  // freshly served document, so wait for a non-empty title as well. Without
  // this the smoke test flakes against a just-started dev server.
  //
  // The title must also be the app's title. A dev server that is up but not
  // yet serving the app returns an error page whose title is the host name
  // ("127.0.0.1"), which would otherwise sail through as a loaded page and
  // fail confusingly several checks later.
  const EXPECTED_TITLE = 'MORPHA';
  // Navigate explicitly rather than relying on a Chrome startup argument.
  await cdp('Page.navigate', { url: APP_URL });

  // Wait for the app's actual title, not merely a complete document. A
  // complete document with an empty title means the evaluation is bound to
  // the wrong execution context, and that must fail loudly rather than
  // cascade into confusing downstream failures.
  await waitFor(
    async () =>
      (await evaluate('document.readyState')) === 'complete' &&
      (await evaluate('document.title || ""')).trim() === EXPECTED_TITLE,
    20000,
    `page load (title "${EXPECTED_TITLE}")`
  );

  const title = await evaluate('document.title');
  check(typeof title === 'string' && title.length > 0, `page loads (title: "${title}")`);

  // Install error collectors before the ritual starts.
  await evaluate(`(() => {
    window.__errors = [];
    window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));
    return true;
  })()`);

  const entered = await evaluate(`(() => {
    const el = document.getElementById('entry-ritual');
    if (!el) return false;
    el.click();
    return true;
  })()`);
  check(entered === true, 'entry ritual element present and clickable');

  await waitFor(
    async () => await evaluate('!!document.querySelector("canvas")'),
    20000,
    'canvas to be created'
  );

  const canvasInfo = await evaluate(`(() => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return { width: c.width, height: c.height, hasGL: !!gl };
  })()`);
  check(canvasInfo.hasGL === true, `WebGL context created (${canvasInfo.width}x${canvasInfo.height})`);

  const hashA = await frameHash();
  await sleep(2500);
  const hashB = await frameHash();
  check(hashA !== hashB, 'rendered output changes over time (the morph is alive)');

  // Measure the pixels the user actually sees.
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  const brightness = analysePng(Buffer.from(shot.data, 'base64'));
  check(
    brightness.lit > 0,
    `glyph pixels present on screen (${brightness.lit} of ${brightness.total}, ${(brightness.ratio * 100).toFixed(2)}%)`
  );
  check(brightness.max > 60, `glyph reaches visible luminance (peak ${brightness.max}/255)`);

  const runtimeErrors = await evaluate('window.__errors || []');
  check(runtimeErrors.length === 0, `no page errors (${runtimeErrors.length})`);
  check(pageErrors.length === 0, `no uncaught exceptions (${pageErrors.length})`);
  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})`);

  console.log('');
  if (failures.length) {
    console.error(`browser smoke FAILED (${failures.length} check(s)):`);
    for (const f of failures) console.error(`  - ${f}`);
    if (consoleErrors.length) console.error(`console: ${consoleErrors.slice(0, 5).join(' | ')}`);
    if (pageErrors.length) console.error(`exceptions: ${pageErrors.slice(0, 5).join(' | ')}`);
    if (runtimeErrors && runtimeErrors.length) console.error(`page errors: ${runtimeErrors.slice(0, 5).join(' | ')}`);
    process.exitCode = 1;
  } else {
    console.log('browser smoke PASSED');
  }
} catch (error) {
  console.error(`browser smoke ERROR: ${error.message}`);
  if (chromeStderr) console.error(chromeStderr.slice(-1000));
  process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch { /* already closed */ }
  chrome.kill('SIGKILL');
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
