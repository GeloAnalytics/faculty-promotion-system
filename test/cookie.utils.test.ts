import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookieHeader } from '../src/utils/cookie.utils';

test('parseCookieHeader reads cookie pairs and preserves equals signs in values', () => {
  const cookies = parseCookieHeader('fps_session=abc=123; theme=dark; empty=');

  assert.deepEqual(cookies, {
    fps_session: 'abc=123',
    theme: 'dark',
    empty: '',
  });
});
