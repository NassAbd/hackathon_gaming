import process from 'node:process';
import { URL } from 'node:url';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadEnv, createServer } from 'vite';
import { scanSecrets } from './scan-secrets.mjs';

const env = loadEnv('production', process.cwd(), '');
if (!env.VITE_API_BASE_URL?.trim()) {
  console.error('Set public VITE_API_BASE_URL to your deployed HTTPS API base ending /api. No ZIP produced.');
  process.exit(1);
}
// Share the browser URL contract rather than implementing a second validator.
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { apiUrl } = await server.ssrLoadModule('/src/services/api-url.ts');
  apiUrl('intent', env.VITE_API_BASE_URL);
  if (new URL(env.VITE_API_BASE_URL).pathname.replace(/\/$/, '') !== '/api') throw new Error('The supplied serverless entry point routes /api/intent and /api/gradium-token; use a base ending /api.');
} finally { await server.close(); }
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
await scanSecrets(['dist']);
await mkdir('release', { recursive: true });
const zip = resolve('release/soniccheck-itch.zip');
await rm(zip, { force: true });
execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: 'dist' });
const temp = await mkdtemp(join(tmpdir(), 'soniccheck-zip-'));
try {
  execFileSync('unzip', ['-q', zip, '-d', temp]);
  await readFile(join(temp, 'index.html'));
  await scanSecrets([temp]);
} catch (error) { await rm(zip, { force: true }); throw error; }
finally { await rm(temp, { recursive: true, force: true }); }
console.log('Created release/soniccheck-itch.zip with root index.html. Uploaded Draft/iframe testing is still required.');
