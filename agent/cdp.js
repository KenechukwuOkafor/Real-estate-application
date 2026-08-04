// agent/cdp.js
// Raw CDP WebSocket connection.
// Handles command/response correlation and event emission.
// Everything else in the system talks to Chrome through this module.

'use strict';

const WebSocket = require('ws');
const EventEmitter = require('events');

class CDPClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.msgId = 0;
    // Map<id, { resolve, reject }> — pending command responses
    this.pending = new Map();
  }

  // Connect to a Chrome tab's WebSocket debugger URL.
  // Resolves when the connection is open, rejects on failure.
  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        console.log('[CDP] Connected →', wsUrl);
        resolve();
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          console.error('[CDP] Unparseable message:', raw);
          return;
        }

        if (msg.id !== undefined) {
          // Response to a command we sent
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            if (msg.error) {
              handler.reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
            } else {
              handler.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          // Unsolicited event from Chrome
          this.emit(msg.method, msg.params);
        }
      });

      ws.on('error', (err) => {
        console.error('[CDP] WebSocket error:', err.message);
        // Fail the connect() promise if we haven't resolved yet
        reject(err);
        this._rejectAllPending('WebSocket error: ' + err.message);
      });

      ws.on('close', (code, reason) => {
        const msg = `WebSocket closed (code ${code})`;
        console.log('[CDP]', msg);
        this._rejectAllPending(msg);
        // Let the controller handle reconnect logic
        this.emit('disconnected', { code, reason: reason?.toString() });
      });
    });
  }

  // Send a CDP command. Returns a Promise that resolves with the result.
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP not connected'));
      }
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get connected() {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  _rejectAllPending(reason) {
    for (const [, handler] of this.pending) {
      handler.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

module.exports = CDPClient;
