import { defineConfig } from 'vite';
// No loadEnv/define: secret bindings are supplied only when the function runs.
export default defineConfig({
  build: {
    outDir: 'server-dist', target: 'es2022', minify: false,
    lib: { entry: 'server/api.ts', formats: ['es'], fileName: 'api' },
  },
});
