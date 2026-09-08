import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@deepseek-ai/dsh-experimental-client-ui-agent-team/client': fileURLToPath(new URL(
        './.dsh/harness/packages/experimental/client-ui-agent-team/src/client/index.ts',
        import.meta.url,
      )),
      '@deepseek-ai/dsh-api-gateway/client': fileURLToPath(new URL(
        './.dsh/harness/packages/api/gateway/src/client/index.ts',
        import.meta.url,
      )),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'workspace',
          include: ['packages/*/tests/**/*.spec.ts', 'packages/*/tests/**/*.spec.tsx', 'scripts/tests/**/*.spec.ts'],
          exclude: ['**/member-task-ui.client.spec.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'team-task-ui',
          include: ['packages/*/tests/member-task-ui.client.spec.tsx'],
          environment: 'jsdom',
          // Keep real Host admission on Node file URLs in this browser scenario.
          server: { deps: { external: [/\/packages\/(?:domain|codex)\/lib\//] } },
        },
      },
    ],
  },
})
