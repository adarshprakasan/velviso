import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html'],
  '/studio.css': ['studio.css', 'text/css'],
  '/studio.js': ['studio.js', 'text/javascript'],
  '/mesh.js': ['mesh.js', 'text/javascript'],
};

createServer(async (request, response) => {
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
}).listen(4173, 'localhost', () => console.log('http://localhost:4173'));
