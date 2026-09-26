import { validateFen } from 'chess.js';
import { isRecord } from '../src/services/gemini/contracts';
import { resolveIntent } from './gemini';
import type { GeminiOptions } from './gemini';

const errorResponse = (status: number) => Response.json({ status: 'error', code: 'invalid_request' }, { status });

export async function handleIntent(request: Request, options: GeminiOptions): Promise<Response> {
  if (request.method !== 'POST') return errorResponse(405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return errorResponse(403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return errorResponse(415);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 4096) return errorResponse(413);
  let input: unknown;
  try { input = JSON.parse(text); } catch { return errorResponse(400); }
  if (!isRecord(input) || Object.keys(input).sort().join(',') !== 'fen,utterance'
    || typeof input.utterance !== 'string' || !input.utterance.trim() || input.utterance.length > 300
    || typeof input.fen !== 'string' || input.fen.length > 200 || !validateFen(input.fen).ok) return errorResponse(400);
  const result = await resolveIntent({ utterance: input.utterance.trim(), fen: input.fen }, options);
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
