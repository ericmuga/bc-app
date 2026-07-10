/**
 * controllers/systemController.js
 * Exposes the running build's git commit + app version for the Releases page.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import logger from '../services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function git(args) {
  try { return execSync(`git ${args}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}

let cached = null;
export function getRelease(_req, res) {
  if (!cached) {
    let version = null;
    try { version = JSON.parse(readFileSync(path.join(repoRoot, 'server', 'package.json'), 'utf8')).version; } catch {}
    cached = {
      version,
      commit:      git('rev-parse HEAD'),
      shortCommit: git('rev-parse --short HEAD'),
      committedAt: git('log -1 --format=%cI'),
      message:     git('log -1 --format=%s'),
      branch:      git('rev-parse --abbrev-ref HEAD'),
      startedAt:   new Date().toISOString(),
    };
    logger.info('release info computed', { commit: cached.shortCommit, version: cached.version });
  }
  res.json(cached);
}
