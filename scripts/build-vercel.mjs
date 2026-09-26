import { mkdir, writeFile } from 'node:fs/promises';
// A separate public directory prevents Vercel from serving dist or repository files.
// Functions are compiled by Vercel from api/*.ts, not published as static files.
await mkdir('vercel-static', { recursive: true });
await writeFile('vercel-static/robots.txt', 'User-agent: *\nDisallow: /\n');
