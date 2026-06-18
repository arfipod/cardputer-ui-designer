import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

import { runFirmwareCommand } from './cardputer-firmware.mjs';

const root = resolve(process.argv[2] ?? '.');
const firmwareDir = join(root, 'firmware', 'cardputer_adv_ui_test');
const firmwareEnv = 'cardputer_adv';
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 5173;

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png']
]);

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  if (url.pathname === '/api/firmware/stream') {
    await handleFirmwareStreamRequest(request, response);
    return;
  }

  if (url.pathname === '/api/firmware') {
    await handleFirmwareRequest(request, response);
    return;
  }

  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = resolve(join(root, safePath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html');
  }
  response.writeHead(200, { 'Content-Type': mime.get(extname(filePath)) ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Cardputer UI Designer running at http://localhost:${port}`);
});

async function handleFirmwareRequest(request, response) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { ok: false, error: 'Use POST.' });
    return;
  }

  try {
    const body = JSON.parse(await readBody(request));
    const command = body.command === 'build' ? 'build' : body.command === 'prepare' ? 'prepare' : 'flash';
    const projectRaw = JSON.stringify(body.project);
    const generatedFiles = validateGeneratedFiles(body.files);
    const result = await runFirmwareCommand(command, {
      capture: true,
      generatedFiles,
      projectRaw,
      port: typeof body.port === 'string' ? body.port.trim() : ''
    });
    writeJson(response, 200, { ok: true, ...result, output: result.logs.filter(Boolean).join('\n') });
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleFirmwareStreamRequest(request, response) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { ok: false, error: 'Use POST.' });
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const write = (message) => response.write(message);

  try {
    const body = JSON.parse(await readBody(request));
    const command = body.command === 'build' ? 'build' : body.command === 'prepare' ? 'prepare' : 'flash';
    const projectRaw = JSON.stringify(body.project);
    const generatedFiles = validateGeneratedFiles(body.files);

    write('[cardputer-ui] Generating firmware sources...\n');
    await runFirmwareCommand('prepare', {
      capture: true,
      generatedFiles,
      projectRaw,
      port: typeof body.port === 'string' ? body.port.trim() : ''
    });

    if (command === 'prepare') {
      write('[cardputer-ui] Sources ready.\n');
      response.end();
      return;
    }

    let uploadPort = typeof body.port === 'string' ? body.port.trim() : '';
    if (command === 'flash') {
      uploadPort = uploadPort || await detectUploadPort();
      if (!uploadPort) throw new Error('No Cardputer USB serial port found. Set CARDPUTER_PORT=COMx and retry.');
      write(`[cardputer-ui] Using upload port ${uploadPort}\n`);
    }

    const args = ['run', '-d', firmwareDir, '-e', firmwareEnv];
    if (command === 'flash') args.push('-t', 'upload', '--upload-port', uploadPort);
    write(`[cardputer-ui] pio ${args.join(' ')}\n\n`);
    await streamProcess('pio', args, write);
    write(`\n[cardputer-ui] ${command === 'flash' ? 'Upload' : 'Build'} completed.\n`);
    response.end();
  } catch (error) {
    write(`\n[cardputer-ui] ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    response.end();
  }
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        rejectBody(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function validateGeneratedFiles(files) {
  if (!files || typeof files !== 'object') return undefined;
  const allowed = {};
  for (const [name, content] of Object.entries(files)) {
    if (/^cardputer_ui.*\.(h|cpp)$/.test(name) && typeof content === 'string') {
      allowed[name] = content;
    }
  }
  return Object.keys(allowed).length ? allowed : undefined;
}

function streamProcess(command, args, write) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd: root, shell: process.platform === 'win32' });
    child.stdout.on('data', (chunk) => write(chunk));
    child.stderr.on('data', (chunk) => write(chunk));
    child.on('error', rejectProcess);
    child.on('close', (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function detectUploadPort() {
  const output = await collectProcess('pio', ['device', 'list', '--json-output']);
  const devices = JSON.parse(output || '[]');
  const usbDevice = devices.find((device) => /VID:PID=303A:1001/i.test(device.hwid || ''));
  if (usbDevice) return usbDevice.port;
  const serialUsb = devices.find((device) => /USB/i.test(`${device.hwid} ${device.description}`));
  return serialUsb?.port || '';
}

function collectProcess(command, args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd: root, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectProcess);
    child.on('close', (code) => {
      if (code === 0) resolveProcess(stdout);
      else rejectProcess(new Error(stderr || `${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value, null, 2));
}
