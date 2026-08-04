// agent/controller.js
// Entry point. Owns the startup sequence and auto-reconnect loop.
// Wires cdp.js → executor.js → server.js together.

'use strict';

const http = require('http');
const CDPClient = require('./cdp');
const executor = require('./executor');
const createServer = require('./server');

const HTTP_PORT = Number(process.env.CDP_AGENT_PORT || 4000);
const CHROME_DEBUG_URL =
  process.env.CHROME_DEBUG_URL || 'http://localhost:9222/json';
const TARGET_APP_URL =
  process.env.CDP_TARGET_URL_PATTERN || 'localhost:3001';

// Reconnect backoff: starts at 3s, doubles each failure, caps at 30s
const RECONNECT_BASE_MS  = 3_000;
const RECONNECT_MAX_MS   = 30_000;

// The live CDPClient. Null when disconnected. Server reads this via getCDP().
let cdp = null;
let reconnectDelay = RECONNECT_BASE_MS;

// ---------------------------------------------------------------------------
// Chrome tab discovery
// ---------------------------------------------------------------------------
function fetchTabs() {
  return new Promise((resolve, reject) => {
    http.get(CHROME_DEBUG_URL, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Failed to parse Chrome tab list — is Chrome running with --remote-debugging-port=9222?'));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Cannot reach Chrome debugger at ${CHROME_DEBUG_URL}: ${err.message}`));
    });
  });
}

async function findTargetTab() {
  const tabs = await fetchTabs();

  console.log('[Controller] Tabs found:');
  tabs.forEach((t, i) => console.log(`  [${i}] (${t.type}) ${t.url}`));

  // Prefer our app; fall back to any page tab so we still get a connection
  const target =
    tabs.find((t) => t.type === 'page' && t.url.includes(TARGET_APP_URL)) ||
    tabs.find((t) => t.type === 'page');

  if (!target) {
    throw new Error(
      `No page-type tabs found. Open http://${TARGET_APP_URL} in your Chrome debug window.`
    );
  }

  console.log(`[Controller] Selected tab: ${target.url}`);
  return target.webSocketDebuggerUrl;
}

// ---------------------------------------------------------------------------
// CDP connection + domain setup
// ---------------------------------------------------------------------------
async function connect() {
  const wsUrl = await findTargetTab();

  const client = new CDPClient();
  await client.connect(wsUrl);

  // Enable the domains we use
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  // Mirror browser console → our stdout for debugging
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    const values = args
      .map((a) => a.value ?? a.description ?? JSON.stringify(a))
      .join(' ');
    console.log(`[Browser:${type}]`, values);
  });

  // Surface uncaught page exceptions
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    const msg = exceptionDetails.exception?.description ?? exceptionDetails.text;
    console.error('[Browser:exception]', msg);
  });

  // Log page navigations (helps when testing multi-page flows)
  client.on('Page.frameNavigated', ({ frame }) => {
    if (!frame.parentId) {
      // Only top-level frame
      console.log('[Browser:navigate]', frame.url);
    }
  });

  // When Chrome disconnects, clear our reference and schedule a reconnect
  client.on('disconnected', ({ code }) => {
    cdp = null;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    console.log(`[Controller] Disconnected (code ${code}). Reconnecting in ${delay}ms...`);
    setTimeout(reconnect, delay);
  });

  return client;
}

// ---------------------------------------------------------------------------
// Auto-reconnect loop
// ---------------------------------------------------------------------------
async function reconnect() {
  console.log('[Controller] Attempting reconnect...');
  try {
    cdp = await connect();
    reconnectDelay = RECONNECT_BASE_MS; // reset backoff on success
    console.log('[Controller] Reconnected successfully.');
  } catch (err) {
    console.error('[Controller] Reconnect failed:', err.message);
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    console.log(`[Controller] Retrying in ${delay}ms...`);
    setTimeout(reconnect, delay);
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Ruvo Chrome CDP Agent');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Start HTTP server first — it will report "CDP not connected" cleanly
  // until the browser is ready, rather than refusing connections.
  const app = createServer(executor, () => cdp);
  app.listen(HTTP_PORT, () => {
    console.log(`[Server] HTTP API → http://localhost:${HTTP_PORT}`);
    console.log(`[Server] Chrome target list → ${CHROME_DEBUG_URL}`);
    console.log(`[Server] Preferred app URL pattern → ${TARGET_APP_URL}`);
    console.log(`[Server] GET  /status   — health check`);
    console.log(`[Server] GET  /actions  — list available actions`);
    console.log(`[Server] POST /run      — execute a browser action`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });

  // Then attempt the initial Chrome connection
  try {
    cdp = await connect();
    reconnectDelay = RECONNECT_BASE_MS;
    console.log('[Controller] CDP ready. Agent is fully operational.');
  } catch (err) {
    console.error('[Controller] Initial connection failed:', err.message);
    console.log('[Controller] Will keep retrying in the background...');
    setTimeout(reconnect, RECONNECT_BASE_MS);
  }
}

main().catch((err) => {
  console.error('[Controller] Fatal startup error:', err);
  process.exit(1);
});
