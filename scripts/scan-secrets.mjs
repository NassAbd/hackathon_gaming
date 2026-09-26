import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { loadEnv } from 'vite';

export async function scanSecrets(directories = ['dist']) {
  const env = loadEnv('production', process.cwd(), '');
  const keys = ['GEMINI_API_KEY', 'GRADIUM_API_KEY'].map(name => env[name]).filter(value => value?.trim());
  const patterns = [/AIza[0-9A-Za-z_-]{35}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
  let count = 0;
  function check(bytes, name) {
    count++;
    const value = bytes.toString('utf8');
    if (keys.some(key => value.includes(key)) || patterns.some(pattern => pattern.test(value))) {
      // Never print a match, value, line, or provider diagnostics.
      throw new Error(`Possible credential in ${name}; contents suppressed.`);
    }
  }
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) check(await readFile(name), name);
    }
  }
  for (const dir of directories) await walk(dir);
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
  for (const name of tracked) {
    try { check(await readFile(name), `working tree:${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const committed = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD']).toString().split('\0').filter(Boolean);
  for (const name of committed) check(execFileSync('git', ['show', `HEAD:${name}`]), `HEAD:${name}`);
  console.log(`Secret scan passed: ${count} artifact/tracked/HEAD files; ${keys.length} configured key values plus key/private-key patterns. Not a universal secret detector.`);
}
if (process.argv[1]?.endsWith('/scan-secrets.mjs')) await scanSecrets(process.argv.slice(2).length ? process.argv.slice(2) : ['dist']);
