import { handleApi } from './api.js';

/** Vercel's Fetch entrypoint already supplies a Web Request. No HTTP logic here. */
export default {
  fetch(request: Request): Promise<Response> {
    return handleApi(request, {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GRADIUM_API_KEY: process.env.GRADIUM_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    });
  },
};
