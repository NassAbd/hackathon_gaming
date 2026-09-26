import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES } from '../src/puzzles';
import { parseProposal } from '../src/services/gemini/contracts';
import { resolveIntent, buildContext } from './gemini';
import { handleIntent } from './intent-api';

const request = { utterance: 'put the rook on the back rank', fen: PUZZLES[0].fen };
const proposal = { status: 'resolved', from: 'a1', to: 'a8', promotion: null };
const response = (value: unknown = proposal, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const options = (fetcher: typeof fetch) => ({ apiKey: 'test-key-not-a-secret', fetcher });

describe('proposal parser', () => {
  it('normalizes nullable promotion and accepts explicit unresolved', () => {
    expect(parseProposal(proposal)).toEqual({ status: 'resolved', candidate: { from: 'a1', to: 'a8' } });
    expect(parseProposal({ status: 'unresolved', from: null, to: null, promotion: null })).toEqual({ status: 'unresolved' });
    expect(parseProposal({ ...proposal, promotion: 'n' })).toMatchObject({ candidate: { promotion: 'n' } });
  });
  it.each([null, [], {}, { ...proposal, from: 'z9' }, { ...proposal, promotion: 'king' }, { ...proposal, san: 'Ra8#' }, { ...proposal, status: 'unresolved' }, { from: 'a1', to: 'a8', status: 'resolved' }])('rejects malformed output %j', value => {
    expect(parseProposal(value)).toEqual({ status: 'error', code: 'malformed' });
  });
});

describe('Gemini adapter', () => {
  it('sends engine-derived context and constrained JSON, without asking for SAN', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    expect(await resolveIntent(request, options(fetcher))).toEqual({ status: 'resolved', candidate: PUZZLES[0].solution });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key-not-a-secret' });
    const body = JSON.parse(String(init?.body));
    const context = JSON.parse(body.contents[0].parts[0].text);
    expect(context.fen).toBe(request.fen);
    expect(context.sideToMove).toBe('white');
    expect(context.utterance).toBe(request.utterance);
    expect(context.legalMoves).toHaveLength(new Chess(request.fen).moves().length);
    expect(context.legalMoves).toContainEqual(expect.objectContaining({ from: 'a1', to: 'a8' }));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.required).toEqual(['status', 'from', 'to', 'promotion']);
    expect(body.generationConfig.responseJsonSchema.additionalProperties).toBe(false);
    expect(context).not.toHaveProperty('solution');
    expect(context).not.toHaveProperty('objective');
    for (const move of context.legalMoves) {
      expect(move).not.toHaveProperty('checkmate');
      expect(move).not.toHaveProperty('check');
      expect(move).not.toHaveProperty('san');
    }
    expect(body.systemInstruction.parts[0].text).toContain('NOT a chess solver');
  });
  it('derives side to move and legal moves from the provided FEN', () => {
    const context = buildContext({ ...request, fen: new Chess().fen().replace(' w ', ' b ') });
    expect(context.sideToMove).toBe('black');
    expect(context.legalMoves.length).toBe(20);
  });
  it('does not call Gemini without credentials', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await resolveIntent(request, { fetcher })).toEqual({ status: 'error', code: 'missing_credentials' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects illegal proposals and spurious promotion', async () => {
    for (const value of [{ ...proposal, to: 'b3' }, { ...proposal, promotion: 'q' }]) {
      expect(await resolveIntent(request, options(async () => response(value)))).toEqual({ status: 'error', code: 'illegal' });
    }
  });
  it.each(['SAFETY', 'MAX_TOKENS'])('rejects incomplete or blocked %s output', async reason => {
    expect(await resolveIntent(request, options(async () => response(proposal, reason)))).toEqual({ status: 'error', code: 'malformed' });
  });
  it('handles bad JSON, missing candidates, and missing text', async () => {
    for (const value of ['broken', '{}', '{"candidates":[{}]}']) {
      expect(await resolveIntent(request, options(async () => new Response(value)))).toEqual({ status: 'error', code: 'malformed' });
    }
  });
  it('preserves unresolved intent', async () => {
    expect(await resolveIntent(request, options(async () => response({ status: 'unresolved', from: null, to: null, promotion: null })))).toEqual({ status: 'unresolved' });
  });
  it('handles provider errors without forwarding private diagnostics', async () => {
    expect(await resolveIntent(request, options(async () => new Response('private details', { status: 429 })))).toEqual({ status: 'error', code: 'upstream' });
    expect(await resolveIntent(request, options(async () => { throw new Error('private key'); }))).toEqual({ status: 'error', code: 'network' });
  });
  it('aborts on timeout', async () => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    expect(await resolveIntent(request, { ...options(fetcher), timeoutMs: 5 })).toEqual({ status: 'error', code: 'timeout' });
  });
});

describe('HTTP boundary', () => {
  const makeRequest = (body: unknown, origin = 'http://localhost:5173') => new Request('http://localhost:5173/api/intent', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  it.each([{ ...request, utterance: '' }, { ...request, utterance: 'x'.repeat(301) }, { ...request, fen: 'broken' }, { ...request, apiKey: 'client-key' }])('rejects invalid request before calling provider', async body => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await handleIntent(makeRequest(body), options(fetcher))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, non-POST, wrong content type and oversized bodies', async () => {
    expect((await handleIntent(makeRequest(request, 'https://other.example'), {})).status).toBe(403);
    expect((await handleIntent(new Request('http://localhost/api/intent'), {})).status).toBe(405);
    expect((await handleIntent(new Request('http://localhost/api/intent', { method: 'POST', body: '{}' }), {})).status).toBe(415);
    expect((await handleIntent(makeRequest({ ...request, utterance: 'x'.repeat(5000) }), {})).status).toBe(413);
  });
  it('returns a safe missing-credentials error and valid proposals', async () => {
    expect(await (await handleIntent(makeRequest(request), {})).json()).toEqual({ status: 'error', code: 'missing_credentials' });
    expect(await (await handleIntent(makeRequest(request), options(async () => response()))).json()).toEqual({ status: 'resolved', candidate: PUZZLES[0].solution });
  });
});
