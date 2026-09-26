import { defineConfig, loadEnv } from 'vite';
import { intentPlugin } from './server/vite-intent';

export default defineConfig(({ mode }) => {
  // Empty prefix loads server secrets here only. Never put these values in `define` or VITE_*.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    build: { assetsInlineLimit: 0 },
    plugins: [intentPlugin({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, gradiumApiKey: env.GRADIUM_API_KEY })],
  };
});
