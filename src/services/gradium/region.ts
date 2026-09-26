// Token issuance and its single-use WebSocket consumer must hit the same region.
// Default geo-routing can send Vercel to US and an itch player to EU.
export const GRADIUM_ORIGIN = 'https://eu.api.gradium.ai';
export const GRADIUM_ASR = 'wss://eu.api.gradium.ai/api/speech/asr';
