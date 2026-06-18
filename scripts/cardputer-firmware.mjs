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
const commands = ['prepare', 'build', 'check', 'upload', 'flash', 'monitor', 'ports'];

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const [command = 'help', maybeProjectPath] = process.argv.slice(2);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  try {
    await runFirmwareCommand(command, { projectPath: maybeProjectPath });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function runFirmwareCommand(command, options = {}) {
  if (!commands.includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const result = { command, logs: [] };
  const log = (message = '') => {
    result.logs.push(String(message));
    if (!options.capture) console.log(message);
  };

  if (command === 'ports') {
    result.ports = listPorts(options);
    return result;
  }

  if (command === 'monitor') {
    monitor(options);
    return result;
  }

  if (command === 'prepare') {
    await prepare(options, log);
    return result;
  }

  if (command === 'build' || command === 'check') {
    await prepare(options, log);
    pio(['run', '-d', firmwareDir, '-e', envName], options, result);
    return result;
  }

  if (command === 'upload' || command === 'flash') {
    await prepare(options, log);
    const port = options.port || options.env?.CARDPUTER_PORT || process.env.CARDPUTER_PORT || detectCardputerPort(options, result);
    if (!port) throw new Error('No Cardputer USB serial port found. Set CARDPUTER_PORT=COMx and retry.');
    result.port = port;
    log(`Using upload port ${port}`);
    pio(['run', '-d', firmwareDir, '-e', envName, '-t', 'upload', '--upload-port', port], options, result);
    return result;
  }

  return result;
}

async function prepare(options = {}, log = console.log) {
  const project = loadProject(options.projectPath, options.projectRaw);
  const bundle = options.generatedFiles
    ? { files: options.generatedFiles }
    : await exportFirmwareProject(project);
  resetGeneratedDir();
  for (const [name, content] of Object.entries(bundle.files)) {
    if (!/^cardputer_ui.*\.(h|cpp)$/.test(name)) continue;
    writeFileSync(join(generatedDir, name), content);
  }
  writeFileSync(defaultProjectPath, serializeProject(project));
  log(`Generated firmware sources in ${relative(generatedDir)}`);
}

function loadProject(projectPath, projectRaw) {
  if (projectRaw) return parseDesignProject(projectRaw);
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

function detectCardputerPort(options = {}, commandResult = null) {
  const result = spawnSync('pio', ['device', 'list', '--json-output'], { encoding: 'utf8' });
  if (options.capture && commandResult) appendProcessOutput(commandResult, result);
  if (result.status !== 0) return '';
  const devices = JSON.parse(result.stdout || '[]');
  const usbDevice = devices.find((device) => /VID:PID=303A:1001/i.test(device.hwid || ''));
  if (usbDevice) return usbDevice.port;
  const serialUsb = devices.find((device) => /USB/i.test(`${device.hwid} ${device.description}`));
  return serialUsb?.port || '';
}

function listPorts(options = {}) {
  const result = pio(['device', 'list'], options, { logs: [] });
  return result.stdout || '';
}

function monitor(options = {}) {
  const port = options.port || options.env?.CARDPUTER_PORT || process.env.CARDPUTER_PORT || detectCardputerPort(options);
  if (!port) throw new Error('No Cardputer USB serial port found. Set CARDPUTER_PORT=COMx and retry.');
  pio(['device', 'monitor', '-p', port, '-b', '115200'], options);
}

function pio(args, options = {}, commandResult = null) {
  const result = options.capture
    ? spawnSync('pio', args, { cwd: root, encoding: 'utf8' })
    : spawnSync('pio', args, { cwd: root, stdio: 'inherit' });
  if (options.capture && commandResult) appendProcessOutput(commandResult, result);
  if (result.status !== 0) {
    const detail = options.capture ? [result.stdout, result.stderr].filter(Boolean).join('\n').trim() : '';
    throw new Error(`PlatformIO failed: pio ${args.join(' ')}${detail ? `\n\n${detail}` : ''}`);
  }
  return result;
}

function appendProcessOutput(commandResult, result) {
  if (result.stdout) commandResult.logs.push(result.stdout.trimEnd());
  if (result.stderr) commandResult.logs.push(result.stderr.trimEnd());
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
  node scripts/cardputer-firmware.mjs flash [project.cardputer-ui.json]
  node scripts/cardputer-firmware.mjs monitor
  node scripts/cardputer-firmware.mjs ports

Environment:
  CARDPUTER_PORT=COM5   Override auto-detected USB serial port.
`);
}
