import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createProject } from '../src/core/project.js';
import { parseDesignProject, serializeProject } from '../src/core/storage.js';
import { exportFirmwareProject } from '../src/exporters/firmware.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firmwareDir = join(root, 'firmware', 'cardputer_adv_ui_test');
const generatedDir = join(firmwareDir, 'src', 'generated');
const defaultProjectPath = join(firmwareDir, 'generated-project.cardputer-ui.json');
const envName = 'cardputer_adv';

const [command = 'help', maybeProjectPath] = process.argv.slice(2);

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (!['prepare', 'build', 'check', 'upload', 'monitor', 'ports'].includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

try {
  if (command === 'ports') {
    listPorts();
  } else if (command === 'monitor') {
    monitor();
  } else if (command === 'prepare') {
    await prepare(maybeProjectPath);
  } else if (command === 'build' || command === 'check') {
    await prepare(maybeProjectPath);
    pio(['run', '-d', firmwareDir, '-e', envName]);
  } else if (command === 'upload') {
    await prepare(maybeProjectPath);
    const port = process.env.CARDPUTER_PORT || detectCardputerPort();
    if (!port) throw new Error('No Cardputer USB serial port found. Set CARDPUTER_PORT=COMx and retry.');
    console.log(`Using upload port ${port}`);
    pio(['run', '-d', firmwareDir, '-e', envName, '-t', 'upload', '--upload-port', port]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function prepare(projectPath) {
  const project = loadProject(projectPath);
  const bundle = await exportFirmwareProject(project);
  resetGeneratedDir();
  for (const [name, content] of Object.entries(bundle.files)) {
    if (!/^cardputer_ui.*\.(h|cpp)$/.test(name)) continue;
    writeFileSync(join(generatedDir, name), content);
  }
  writeFileSync(defaultProjectPath, serializeProject(project));
  console.log(`Generated firmware sources in ${relative(generatedDir)}`);
}

function loadProject(projectPath) {
  if (!projectPath) {
    const project = createProject();
    console.log('No project JSON provided; using the default designer project.');
    return project;
  }
  const absolute = resolve(root, projectPath);
  if (!existsSync(absolute)) throw new Error(`Project JSON not found: ${absolute}`);
  return parseDesignProject(readFileSync(absolute, 'utf8'));
}

function resetGeneratedDir() {
  const resolved = resolve(generatedDir);
  if (!resolved.startsWith(root)) throw new Error(`Refusing to clean unexpected path: ${resolved}`);
  rmSync(resolved, { recursive: true, force: true });
  mkdirSync(resolved, { recursive: true });
}

function detectCardputerPort() {
  const result = spawnSync('pio', ['device', 'list', '--json-output'], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  const devices = JSON.parse(result.stdout || '[]');
  const usbDevice = devices.find((device) => /VID:PID=303A:1001/i.test(device.hwid || ''));
  if (usbDevice) return usbDevice.port;
  const serialUsb = devices.find((device) => /USB/i.test(`${device.hwid} ${device.description}`));
  return serialUsb?.port || '';
}

function listPorts() {
  pio(['device', 'list']);
}

function monitor() {
  const port = process.env.CARDPUTER_PORT || detectCardputerPort();
  if (!port) throw new Error('No Cardputer USB serial port found. Set CARDPUTER_PORT=COMx and retry.');
  pio(['device', 'monitor', '-p', port, '-b', '115200']);
}

function pio(args) {
  const result = spawnSync('pio', args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`PlatformIO failed: pio ${args.join(' ')}`);
}

function relative(path) {
  return path.replace(`${root}\\`, '').replace(`${root}/`, '');
}

function printHelp() {
  console.log(`Cardputer UI firmware harness

Usage:
  node scripts/cardputer-firmware.mjs prepare [project.cardputer-ui.json]
  node scripts/cardputer-firmware.mjs build [project.cardputer-ui.json]
  node scripts/cardputer-firmware.mjs upload [project.cardputer-ui.json]
  node scripts/cardputer-firmware.mjs monitor
  node scripts/cardputer-firmware.mjs ports

Environment:
  CARDPUTER_PORT=COM5   Override auto-detected USB serial port.
`);
}
