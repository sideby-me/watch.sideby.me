import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketIO } from './server/socket';
import { logEvent } from './server/logger';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000');

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      if (req.url && (req.url === '/_health' || req.url.startsWith('/_health?'))) {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end("oh hello! it works btw, if that's what you are wondering");
        return;
      }

      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logEvent({
        level: 'error',
        domain: 'other',
        event: 'request_error',
        message: 'Error handling request',
        meta: { url: req.url, error: err },
      });
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO with the TypeScript implementation
  initSocketIO(httpServer);

  httpServer
    .once('error', err => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      logEvent({
        level: 'info',
        domain: 'other',
        event: 'server_start',
        message: `Ready on http://${hostname}:${port}`,
      });
      logEvent({
        level: 'info',
        domain: 'other',
        event: 'socket_start',
        message: `Socket.IO server running on path: /api/socket/io`,
      });
    });
});
