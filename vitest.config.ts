import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-api-gateway/client': fileURLToPath(new URL(
        '../deepseek-harness/packages/api/gateway/src/client/index.ts',
        import.meta.url,
      )),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts', 'packages/*/tests/**/*.spec.tsx'],
    environment: 'node',
    passWithNoTests: false,
  },
})
