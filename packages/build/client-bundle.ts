/** Standalone lazy-CJS build preset for an external DSH Client package. */

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

const CSS_PREFIX = '\0agent-team-ultra-css:'
const CSS_SUFFIX = '.mjs'

const PLATFORM_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
])

function cssModule(id: string, file: string, source: Uint8Array): string {
  const compiled = transform({
    filename: file,
    code: source,
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  const classes = Object.fromEntries(
    Object.entries(compiled.exports ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [name, value.name]),
  )
  const tag = `${id}/${basename(file)}`
  return [
    `const css = ${JSON.stringify(compiled.code.toString())};`,
    `const tag = ${JSON.stringify(tag)};`,
    "if (typeof document !== 'undefined') {",
    "  let node = document.querySelector('style[data-plugin-css=' + JSON.stringify(tag) + ']');",
    '  if (node === null) {',
    "    node = document.createElement('style');",
    `    node.dataset.plugin = ${JSON.stringify(id)};`,
    '    node.dataset.pluginCss = tag;',
    '    document.head.appendChild(node);',
    '  }',
    '  if (node.textContent !== css) node.textContent = css;',
    '}',
    `export default ${JSON.stringify(classes)};`,
  ].join('\n')
}

/**
 * Produce both the Host placeholder and the browser module-table factory.
 * This intentionally owns the small compatibility surface instead of importing
 * the Harness repository's unpublished `clientBundle()` helper.
 */
export function externalClientBundle(id: string): UserConfig[] {
  const host: UserConfig = {
    name: id,
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
  const client: UserConfig = {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: specifier => PLATFORM_EXTERNALS.has(specifier),
      alwaysBundle: specifier => !PLATFORM_EXTERNALS.has(specifier),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      name: 'agent-team-ultra-client-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (PLATFORM_EXTERNALS.has(source)) return null
        if (source === '@deepseek-ai/dsh-agent-team-ultra/remote') return null
        throw new Error(`Agent Team Ultra Client cannot inline the cross-plugin runtime ${source}`)
      },
    }, {
      name: 'agent-team-ultra-css-modules',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css') || importer === undefined) return null
        return CSS_PREFIX + resolve(dirname(importer), source) + CSS_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_PREFIX)) return null
        const file = virtualId.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
        this.addWatchFile(file)
        return cssModule(id, file, await readFile(file))
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapExcludeSources: false,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  }
  return [host, client]
}
