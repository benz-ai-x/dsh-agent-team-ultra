import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'node',
    // The shipped Host is Node ESM even when a joint test renders its Client in JSDOM.
    server: { deps: { external: [/\/packages\/domain\/lib\//] } },
    passWithNoTests: false,
    include: ['packages/*/tests/**/*.spec.ts', 'packages/*/tests/**/*.spec.tsx', 'scripts/tests/**/*.spec.ts'],
  },
})
