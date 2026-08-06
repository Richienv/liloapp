import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Test config, deliberately narrow.
 *
 * Only `lib/**` is collected. Everything in there is pure — input to verdict,
 * no React, no Supabase, no DOM — which means these tests need no jsdom, no
 * mocks and no fixtures, and they run in under a second. That is the property
 * that decides whether a test suite is still being run six months from now.
 *
 * Component tests are not excluded on principle; they are simply a different
 * job with a different setup cost, and the rules are where the money bugs have
 * actually been.
 */
export default defineConfig({
  resolve: {
    // The app uses the `@/` alias everywhere; tests import the same way the app
    // does so a passing test cannot be exercising a different module path.
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
