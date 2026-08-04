// agent/executor.js
// All browser action handlers. Each function takes a CDPClient + action params
// and returns a plain object. Throws on failure — the server catches and formats.

'use strict';

const fs = require('fs');
const path = require('path');

const WAIT_TIMEOUT_MS = 5000;
const WAIT_INTERVAL_MS = 200;

// ---------------------------------------------------------------------------
// Core utility: poll for a selector to appear in the DOM
// ---------------------------------------------------------------------------
function waitForSelector(cdp, selector, timeout = WAIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    const check = async () => {
      try {
        const result = await cdp.send('Runtime.evaluate', {
          expression: `!!document.querySelector(${JSON.stringify(selector)})`,
          returnByValue: true,
        });

        if (result.result.value === true) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(new Error(`Timeout after ${timeout}ms: element not found → "${selector}"`));
        } else {
          setTimeout(check, WAIT_INTERVAL_MS);
        }
      } catch (err) {
        reject(err);
      }
    };

    check();
  });
}

// ---------------------------------------------------------------------------
// click
// ---------------------------------------------------------------------------
async function click(cdp, selector) {
  if (!selector) throw new Error('"selector" is required for click');
  await waitForSelector(cdp, selector);

  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'Element disappeared between wait and click' };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { ok: true };
      })()
    `,
    returnByValue: true,
  });

  const val = result.result.value;
  if (!val.ok) throw new Error(val.error);
  return { clicked: selector };
}

// ---------------------------------------------------------------------------
// type — React-compatible: uses native value setter to bypass synthetic events
// ---------------------------------------------------------------------------
async function type(cdp, selector, value) {
  if (!selector) throw new Error('"selector" is required for type');
  if (value === undefined) throw new Error('"value" is required for type');
  await waitForSelector(cdp, selector);

  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'Element disappeared between wait and type' };

        el.focus();

        // React tracks value via the native HTMLInputElement setter.
        // Direct assignment bypasses this and React ignores the change.
        // We must use the native prototype setter to trigger React's fiber reconciler.
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
          const proto = tag === 'textarea'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          nativeSetter.call(el, ${JSON.stringify(value)});
        } else {
          // contenteditable or other elements
          el.textContent = ${JSON.stringify(value)};
        }

        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return { ok: true };
      })()
    `,
    returnByValue: true,
  });

  const val = result.result.value;
  if (!val.ok) throw new Error(val.error);
  return { typed: value, into: selector };
}

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------
async function navigate(cdp, url) {
  if (!url) throw new Error('"url" is required for navigate');
  const result = await cdp.send('Page.navigate', { url });
  // Navigation starts immediately; elements won't exist until page loads.
  // Callers should use waitForSelector / getText after navigating.
  return { navigated: url, frameId: result.frameId };
}

// ---------------------------------------------------------------------------
// getText — returns innerText of the first matching element
// ---------------------------------------------------------------------------
async function getText(cdp, selector) {
  if (!selector) throw new Error('"selector" is required for getText');
  await waitForSelector(cdp, selector);

  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? el.innerText : null;
      })()
    `,
    returnByValue: true,
  });

  const text = result.result.value;
  if (text === null) throw new Error(`Element disappeared before getText: "${selector}"`);
  return { text, selector };
}

// ---------------------------------------------------------------------------
// getHTML — returns outerHTML (lets the AI see component structure)
// ---------------------------------------------------------------------------
async function getHTML(cdp, selector) {
  if (!selector) throw new Error('"selector" is required for getHTML');
  await waitForSelector(cdp, selector);

  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? el.outerHTML : null;
      })()
    `,
    returnByValue: true,
  });

  const html = result.result.value;
  if (html === null) throw new Error(`Element disappeared before getHTML: "${selector}"`);
  return { html, selector };
}

// ---------------------------------------------------------------------------
// getAll — returns innerText of ALL matching elements (useful for lists/tables)
// ---------------------------------------------------------------------------
async function getAll(cdp, selector) {
  if (!selector) throw new Error('"selector" is required for getAll');

  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .map(el => ({ text: el.innerText, tag: el.tagName.toLowerCase() }))
    `,
    returnByValue: true,
  });

  return { items: result.result.value ?? [], selector };
}

// ---------------------------------------------------------------------------
// getUrl — returns the current browser URL (useful after redirects)
// ---------------------------------------------------------------------------
async function getUrl(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true,
  });
  return { url: result.result.value };
}

// ---------------------------------------------------------------------------
// reload — hard reload (ignores cache)
// ---------------------------------------------------------------------------
async function reload(cdp) {
  await cdp.send('Page.reload', { ignoreCache: true });
  return { reloaded: true };
}

// ---------------------------------------------------------------------------
// evaluate — run arbitrary JS in page context (powerful debugging tool)
// The expression result must be JSON-serialisable.
// ---------------------------------------------------------------------------
async function evaluate(cdp, expression) {
  if (!expression) throw new Error('"expression" is required for evaluate');

  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`JS exception: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }

  return { value: result.result.value };
}

// ---------------------------------------------------------------------------
// screenshot — captures visible viewport as PNG, saves to disk
// Default path: /tmp/scholaris_screenshot.png
// The AI can then read the file to visually inspect the page.
// ---------------------------------------------------------------------------
async function screenshot(cdp, filePath) {
  const resolved = path.resolve(filePath || '/tmp/scholaris_screenshot.png');

  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });

  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(resolved, buffer);

  console.log(`[Executor] Screenshot saved → ${resolved} (${buffer.length} bytes)`);
  return { saved: resolved, bytes: buffer.length };
}

// ---------------------------------------------------------------------------
// waitForUrl — poll until window.location.href matches a string or regex
// ---------------------------------------------------------------------------
async function waitForUrl(cdp, urlPattern, timeout = WAIT_TIMEOUT_MS) {
  if (!urlPattern) throw new Error('"urlPattern" is required for waitForUrl');

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const pattern = urlPattern instanceof RegExp ? urlPattern : new RegExp(urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const check = async () => {
      try {
        const result = await cdp.send('Runtime.evaluate', {
          expression: 'window.location.href',
          returnByValue: true,
        });
        const current = result.result.value;
        if (pattern.test(current)) {
          resolve({ url: current });
        } else if (Date.now() >= deadline) {
          reject(new Error(`Timeout: URL never matched "${urlPattern}" (current: "${current}")`));
        } else {
          setTimeout(check, WAIT_INTERVAL_MS);
        }
      } catch (err) {
        reject(err);
      }
    };

    check();
  });
}

// ---------------------------------------------------------------------------
// setViewport — override device metrics for mobile/responsive testing
// width, height, deviceScaleFactor (default 2), mobile (default true)
// Pass width=0 to reset to natural browser size.
// ---------------------------------------------------------------------------
async function setViewport(cdp, width, height, deviceScaleFactor = 2, mobile = true) {
  if (!width) {
    // Reset to default
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    return { reset: true };
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width:             width,
    height:            height || Math.round(width * 2),
    deviceScaleFactor: deviceScaleFactor,
    mobile:            mobile,
  });
  return { width, height: height || Math.round(width * 2), deviceScaleFactor, mobile };
}

module.exports = {
  waitForSelector,
  click,
  type,
  navigate,
  getText,
  getHTML,
  getAll,
  getUrl,
  reload,
  evaluate,
  screenshot,
  waitForUrl,
  setViewport,
};
