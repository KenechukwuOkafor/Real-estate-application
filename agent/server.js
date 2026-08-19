// agent/server.js
// Express HTTP API. Every response is { success, data, error }.
// The server never throws — all errors are caught and returned as success:false.

'use strict';

const express = require('express');

// cdpGetter is a function that returns the current CDPClient (or null).
// This indirection lets the controller hot-swap the client on reconnect.
function createServer(executor, cdpGetter) {
  const app = express();
  app.use(express.json());

  // ------------------------------------------------------------------
  // POST /run — execute a browser action
  // ------------------------------------------------------------------
  app.post('/run', async (req, res) => {
    const {
      action,
      selector,
      value,
      url,
      urlPattern,
      expression,
      path: filePath,
    } = req.body;

    const logParts = [`action=${action}`];
    if (selector)   logParts.push(`selector="${selector}"`);
    if (value)      logParts.push(`value="${value}"`);
    if (url)        logParts.push(`url="${url}"`);
    if (expression) logParts.push(`expression="${expression.slice(0, 60)}..."`);
    console.log(`[API] /run →`, logParts.join(' | '));

    if (!action) {
      return res.json({ success: false, error: '"action" field is required' });
    }

    const cdp = cdpGetter();
    if (!cdp || !cdp.connected) {
      return res.json({
        success: false,
        error: 'CDP not connected. Chrome may have closed or the tab navigated away.',
      });
    }

    try {
      let data;

      switch (action) {
        case 'click':
          data = await executor.click(cdp, selector);
          break;

        case 'type':
          data = await executor.type(cdp, selector, value);
          break;

        case 'navigate':
          data = await executor.navigate(cdp, url);
          break;

        case 'getText':
          data = await executor.getText(cdp, selector);
          break;

        case 'getHTML':
          data = await executor.getHTML(cdp, selector);
          break;

        case 'getAll':
          data = await executor.getAll(cdp, selector);
          break;

        case 'getUrl':
          data = await executor.getUrl(cdp);
          break;

        case 'reload':
          data = await executor.reload(cdp);
          break;

        case 'evaluate':
          data = await executor.evaluate(cdp, expression);
          break;

        case 'screenshot':
          data = await executor.screenshot(cdp, filePath);
          break;

        case 'waitForUrl':
          data = await executor.waitForUrl(cdp, urlPattern);
          break;

        case 'setViewport':
          data = await executor.setViewport(cdp, req.body.width, req.body.height, req.body.deviceScaleFactor, req.body.mobile);
          break;

        default:
          return res.json({
            success: false,
            error: `Unknown action: "${action}". Valid actions: click, type, navigate, getText, getHTML, getAll, getUrl, reload, evaluate, screenshot, waitForUrl, setViewport`,
          });
      }

      console.log(`[API] ✓ ${action} completed`);
      res.json({ success: true, data });

    } catch (err) {
      console.error(`[API] ✗ ${action} failed:`, err.message);
      res.json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------------------------------
  // GET /status — health check (useful for confirming agent is alive)
  // ------------------------------------------------------------------
  app.get('/status', (req, res) => {
    const cdp = cdpGetter();
    res.json({
      ok: true,
      cdpConnected: !!(cdp && cdp.connected),
      timestamp: new Date().toISOString(),
    });
  });

  // ------------------------------------------------------------------
  // GET /actions — list available actions and their required fields
  // ------------------------------------------------------------------
  app.get('/actions', (_req, res) => {
    res.json({
      actions: [
        { action: 'click',       required: ['selector'] },
        { action: 'type',        required: ['selector', 'value'] },
        { action: 'navigate',    required: ['url'] },
        { action: 'getText',     required: ['selector'] },
        { action: 'getHTML',     required: ['selector'] },
        { action: 'getAll',      required: ['selector'] },
        { action: 'getUrl',      required: [] },
        { action: 'reload',      required: [] },
        { action: 'evaluate',    required: ['expression'] },
        { action: 'screenshot',  required: [], optional: ['path'] },
        { action: 'waitForUrl',  required: ['urlPattern'] },
      ],
    });
  });

  return app;
}

module.exports = createServer;
