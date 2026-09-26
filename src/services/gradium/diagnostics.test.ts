import { expect, it } from 'vitest';
import { MicDiagnostics } from './diagnostics';
import { GRADIUM_ORIGIN, GRADIUM_ASR } from './region';
it('uses the same explicit region for token issuance and ASR', () => {
  expect(new URL(GRADIUM_ORIGIN).hostname).toBe('eu.api.gradium.ai');
  expect(new URL(GRADIUM_ASR).hostname).toBe(new URL(GRADIUM_ORIGIN).hostname);
});
it('bounds lifecycle history and exposes actual measured values as text', () => {
  const diagnostic = new MicDiagnostics(() => {});
  for (let n = 0; n < 100; n++) diagnostic.event('state transition');
  expect(diagnostic.events).toHaveLength(80);
  diagnostic.rms = 0.083; diagnostic.inputFrames = 1248;
  diagnostic.transcript = '<script>not HTML</script>';
  expect(diagnostic.display()).toContain('RMS: 0.0830');
  expect(diagnostic.display()).toContain('input frames=1248');
});
