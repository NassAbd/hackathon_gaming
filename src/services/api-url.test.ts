import { expect, it } from 'vitest';
import { apiUrl } from './api-url';
it('preserves local relative endpoints and joins a public HTTPS base', () => {
  expect(apiUrl('intent', '')).toBe('./api/intent');
  expect(apiUrl('gradium-token', 'https://api.example/api/')).toBe('https://api.example/api/gradium-token');
  expect(apiUrl('intent', 'https://api.example/api')).toBe('https://api.example/api/intent');
});
it.each(['http://api.example', 'https://user:secret@api.example', 'https://api.example/?key=x', 'https://api.example/#x', 'https://localhost', 'https://127.0.0.1'])('rejects unsafe production base %s', base => {
  expect(() => apiUrl('intent', base)).toThrow();
});
