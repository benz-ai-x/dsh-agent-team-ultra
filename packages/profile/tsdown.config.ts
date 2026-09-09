import { defineConfig } from 'tsdown'

// Each public entry is self-contained; the archive has no private JS chunks.
export default defineConfig(['index', 'data'].map(entry => ({
  entry: `lib/types/${entry}.js`,
  outDir: 'lib',
  format: ['esm'],
  outputOptions: { codeSplitting: false },
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})))
