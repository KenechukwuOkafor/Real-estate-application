# Ruvo Chrome CDP Agent

This folder contains a small HTTP bridge for controlling a Chrome tab through the
Chrome DevTools Protocol.

## What It Can Do

- navigate to URLs
- click elements
- type into inputs and textareas
- read page text and HTML
- evaluate JavaScript in the page
- wait for URL changes
- change viewport size
- save screenshots to disk

## Prerequisites

1. Start Chrome with remote debugging enabled.
2. Run the Next.js app locally.
3. Start the CDP agent.

## Start Chrome

Example:

```bash
google-chrome --remote-debugging-port=9222
```

If Chrome is already running, you may need to launch a separate instance or quit
the current one first depending on your platform.

## Start The App

```bash
npm run dev
```

## Start The Agent

```bash
npm run agent
```

Optional environment variables:

```bash
CDP_AGENT_PORT=4000
CHROME_DEBUG_URL=http://localhost:9222/json
CDP_TARGET_URL_PATTERN=localhost:3001
```

## API

Health check:

```bash
curl http://localhost:4000/status
```

List actions:

```bash
curl http://localhost:4000/actions
```

Navigate:

```bash
curl -X POST http://localhost:4000/run \
  -H "Content-Type: application/json" \
  -d '{"action":"navigate","url":"http://localhost:3001"}'
```

Screenshot:

```bash
curl -X POST http://localhost:4000/run \
  -H "Content-Type: application/json" \
  -d '{"action":"screenshot","path":"/tmp/ruvo-home.png"}'
```

## Notes

- This is not an MCP server. It is a local HTTP control service.
- It is still useful for frontend testing and screenshot capture while developing.
