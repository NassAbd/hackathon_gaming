# Vercel API deployment

Goal: HTTPS API-only deployment; preserve handleApi(Request, env) and all game/AI behavior.

Plan: add two Fetch-style api entrypoints and one environment-only adapter; test
forwarding and existing boundary behavior; configure Vercel Other/Node 24 with an
isolated static output directory; run checks/builds, then deploy only if CLI auth
is available. Configure exact-origin CORS via production environment bindings.

Files: api/*.ts, server/vercel.ts and test, vercel.json/.vercelignore, build script,
README and TypeScript include list. No frameworks or new dependencies.

Acceptance: both routes reach unchanged handleApi, OPTIONS/errors preserved, only
four server bindings forwarded, no frontend/env assets deployed. Remote verification
requires an authenticated Vercel account, deployment and server env configuration.
Out of scope: game/semantic changes, SPEC edits, itch upload, auth or persistent state.

Result: production deployed at https://soniccheck-api.vercel.app, deployment
`dpl_Ak2aW5BxcEPzRaR86uNQbuNgGi3d`. Remote CORS/input/provider checks passed.
Initial Node ESM extensionless imports failed remotely; explicit .js specifiers
and a compiled-entrypoint regression check fixed that without behavior changes.
94 offline tests, typecheck/lint, frontend/API/Vercel builds and secret scans passed.
Current exact bootstrap origin: https://soniccheck-verification.invalid.
Next: real itch ZIP, then replace origin after inspecting the uploaded Draft.
No frontend was deployed and build:itch was not run during this deployment pass.
