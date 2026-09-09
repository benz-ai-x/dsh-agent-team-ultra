/** Compare shipped archives with the packages contributed by one version's profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { requirePreparedHarness } from './harness-source.mjs'

export function profileContributionNames(source) {
  const directory = join(source, 'packages/profile')
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const { harnessRoot } = requirePreparedHarness(source)
  const { entryListSchema } = createRequire(import.meta.url)(join(harnessRoot, 'vendor/include/lib/index.js'))
  const patches = yaml.load(readFileSync(join(directory, manifest.dsh.bundle.patch), 'utf8'), { schema: entryListSchema })
  const names = new Set([manifest.name])
  const visit = (entries) => {
    for (const entry of entries) {
      assert.equal(typeof entry.name, 'string', 'profile contribution must name a package export')
      names.add(entry.name.split('/').slice(0, entry.name.startsWith('@') ? 2 : 1).join('/'))
      if (entry.group) visit(entry.config ?? [])
    }
  }
  for (const patch of patches) visit(patch.insert ?? [])
  return names
}

export function assertProfileArchiveClosure(source, archives) {
  const packages = new Map(archives.map(archive => [archive.name, archive]))
  const reachable = new Set()
  const visit = name => {
    if (reachable.has(name)) return
    const manifest = packages.get(name)
    assert.ok(manifest, `profile contribution ${name} must have a shipped archive`)
    reachable.add(name)
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (packages.has(dependency)) visit(dependency)
    }
  }
  for (const name of profileContributionNames(source)) visit(name)
  assert.deepEqual(archives.map(archive => archive.name).sort(), [...reachable].sort(),
    'archives must be reachable from the actual profile package closure')
}
