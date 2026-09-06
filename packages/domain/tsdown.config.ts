import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    host: 'lib/types/index.js',
    client: 'lib/types/client.js',
    compatibility: 'lib/types/compatibility.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
