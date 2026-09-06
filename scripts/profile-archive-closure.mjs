/** Compare shipped archives with the packages contributed by one version's profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export function assertProfileArchiveClosure(source, archives) {
  const directory = join(source, 'packages/profile')
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const patches = yaml.load(readFileSync(join(directory, manifest.dsh.bundle.patch), 'utf8'))
  const names = new Set([manifest.name])
  const visit = (entries) => {
    for (const entry of entries) {
      names.add(entry.name)
      if (entry.group) visit(entry.config ?? [])
    }
  }
  for (const patch of patches) visit(patch.insert ?? [])
  assert.deepEqual(archives.map(archive => archive.name).sort(), [...names].sort(),
    'archives must contain exactly the packages contributed by this source profile')
}
