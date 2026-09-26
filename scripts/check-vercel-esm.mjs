import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Exercise emitted, unbundled Node ESM, matching Vercel's TypeScript deployment.
execFileSync(resolve('node_modules/.bin/tsc'), ['--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', '.vercel/esm-check', 'api/intent.ts', 'api/gradium-token.ts'], { stdio: 'inherit' });
for (const route of ['intent', 'gradium-token']) {
  const { default: handler } = await import(pathToFileURL(resolve(`.vercel/esm-check/api/${route}.js`)).href);
  // No Origin is always rejected, even with real bindings; no provider call occurs.
  const response = await handler.fetch(new globalThis.Request(`https://api.example/api/${route}`, { method: 'OPTIONS' }));
  if (response.status !== 403) throw new Error('Emitted Vercel entrypoint did not preserve origin rejection');
}
