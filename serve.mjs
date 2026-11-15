import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html'],
  '/studio.css': ['studio.css', 'text/css'],
  '/studio.js': ['studio.js', 'text/javascript'],
  '/mesh.js': ['mesh.js', 'text/javascript'],
};

const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Choose a port between 1 and 65535.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const file = files[new URL(request.url, 'http://localhost').pathname];
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1] }).end(body);
  } catch {
    response.writeHead(500).end('Unable to read the app file.');
  }
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Port ' + port + ' is in use. Open the existing app or try node serve.mjs 4174.'
    : error.message);
  process.exitCode = 1;
});
server.listen(port, 'localhost', () => console.log('http://localhost:' + port));
