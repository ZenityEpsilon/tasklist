import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const statePath = join(root, 'sync-state.json');
const port = Number(process.env.PORT || 8080);
const launcherPid = Number(process.env.NBK_PARENT_PID || process.ppid || 0);
const clients = new Set();

let state = loadState();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.otf': 'font/otf'
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/state') {
    handleState(request, response);
    return;
  }

  if (url.pathname === '/api/events') {
    handleEvents(request, response);
    return;
  }

  if (url.pathname === '/obs/') {
    response.writeHead(302, { Location: '/obs' });
    response.end();
    return;
  }

  serveStatic(url.pathname, response);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('');
    console.error(`Cannot start NBK List: port ${port} is already in use.`);
    console.error('Close the other NBK List console window first, or use a different PORT value.');
    console.error(`Example: PORT=8081 node server.js`);
    console.error('');
    process.exit(1);
  }

  throw error;
});

server.listen(port, () => {
  console.log(`NBK list sync server: http://localhost:${port}`);
});

if (launcherPid > 0) {
  setInterval(() => {
    try {
      process.kill(launcherPid, 0);
    } catch {
      shutdownBecauseLauncherClosed();
    }
  }, 1500).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('SIGHUP', shutdown);

function shutdownBecauseLauncherClosed() {
  shutdown(0);
}

function shutdown(exitCode = 0) {
  clients.forEach(client => client.end());
  server.close(() => {
    process.exit(exitCode);
  });

  setTimeout(() => {
    process.exit(exitCode);
  }, 1000).unref();
}

function handleState(request, response) {
  if (request.method === 'GET') {
    sendJson(response, state);
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'GET, POST' });
    response.end();
    return;
  }

  readBody(request)
    .then(body => {
      const payload = parsePayload(JSON.parse(body));

      if (payload.revision >= state.revision) {
        state = payload;
        saveState();
        broadcastState();
      }

      sendJson(response, state);
    })
    .catch(error => {
      sendJson(response, { error: error.message }, 400);
    });
}

function handleEvents(request, response) {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end();
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  clients.add(response);
  writeEvent(response, state);

  const keepAlive = setInterval(() => {
    response.write(': keep-alive\n\n');
  }, 25000);

  request.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(response);
  });
}

function serveStatic(pathname, response) {
  const requestedPath = pathname === '/' || pathname === '/obs'
    ? '/index.html'
    : decodeURIComponent(pathname);
  const filePath = normalize(resolve(root, `.${requestedPath}`));

  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });

  createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        rejectBody(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function parsePayload(payload) {
  if (!payload || !Array.isArray(payload.orders)) {
    throw new Error('Payload must contain orders array');
  }

  return {
    version: 2,
    sourceId: payload.sourceId || 'server',
    revision: Number(payload.revision) || Date.now(),
    orders: payload.orders
  };
}

function loadState() {
  try {
    if (existsSync(statePath)) {
      return parsePayload(JSON.parse(readFileSync(statePath, 'utf8')));
    }
  } catch {}

  return {
    version: 2,
    sourceId: 'server',
    revision: 0,
    orders: []
  };
}

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function broadcastState() {
  clients.forEach(client => writeEvent(client, state));
}

function writeEvent(response, payload) {
  response.write(`event: state\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  response.end(JSON.stringify(payload));
}
