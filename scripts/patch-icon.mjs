import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Find rcedit-x64.exe from electron-builder's winCodeSign cache
const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
const dirs = readdirSync(cacheDir).filter(d => /^\d+$/.test(d)).sort((a, b) => Number(b) - Number(a));
if (!dirs.length) throw new Error('winCodeSign cache not found: ' + cacheDir);
const rcedit = path.join(cacheDir, dirs[0], 'rcedit-x64.exe');
if (!existsSync(rcedit)) throw new Error('rcedit-x64.exe not found: ' + rcedit);

const portableExe = path.join(root, 'dist', 'Unia-Admin.exe');
const icon = path.join(root, 'ICON.ico');
if (!existsSync(portableExe)) throw new Error('Portable exe not found: ' + portableExe);
if (!existsSync(icon)) throw new Error('ICON.ico not found: ' + icon);

console.log('Patching icon on portable exe...');
execFileSync(rcedit, [portableExe, '--set-icon', icon]);
console.log('Done:', portableExe);
