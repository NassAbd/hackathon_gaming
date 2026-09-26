import type { KingCue } from './black-king';
export const KING_AUDIO: Record<KingCue, string> = {
  'start-1': new URL('../assets/black-king/black-king-start-1.wav', import.meta.url).href,
  'start-2': new URL('../assets/black-king/black-king-start-2.wav', import.meta.url).href,
  unresolved: new URL('../assets/black-king/black-king-unresolved.wav', import.meta.url).href,
  'not-mate': new URL('../assets/black-king/black-king-not-mate.wav', import.meta.url).href,
  checkmate: new URL('../assets/black-king/black-king-checkmate.wav', import.meta.url).href,
  'run-complete': new URL('../assets/black-king/black-king-run-complete.wav', import.meta.url).href,
};
