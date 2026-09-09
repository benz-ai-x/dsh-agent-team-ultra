/** Resolve the local-only delivery closure from qualified package identities. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { profileContributionNames } from './profile-archive-closure.mjs'

export function harnessPackages(harness) {
  const packages = new Map()
  const categories = readdirSync(join(harness, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => join(harness, 'packages', entry.name))
  for (const parent of [join(harness, 'vendor'), ...categories]) {
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = join(parent, entry.name)
      if (!existsSync(join(directory, 'package.json'))) continue
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      if (packages.has(manifest.name)) throw new Error(`duplicate selected package ${manifest.name}`)
      packages.set(manifest.name, { directory, manifest })
    }
  }
  return packages
}

/** Archive every profile contribution plus its local overlay dependency closure. */
export function archivePackageRoots(source, harness) {
  const available = harnessPackages(harness)
  const overlayNames = new Set()
  for (const entry of readdirSync(join(source, 'packages'), { withFileTypes: true })) {
    const directory = join(source, 'packages', entry.name)
    if (!entry.isDirectory() || !existsSync(join(directory, 'package.json'))) continue
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    if (available.has(manifest.name)) throw new Error(`duplicate overlay package ${manifest.name}`)
    available.set(manifest.name, { directory, manifest })
    overlayNames.add(manifest.name)
  }
  const selected = new Map()
  const visit = name => {
    if (selected.has(name)) return
    const candidate = available.get(name)
    if (!candidate) throw new Error(`profile archive ${name} has no selected source package`)
    selected.set(name, candidate.directory)
    for (const dependency of Object.keys({ ...candidate.manifest.dependencies, ...candidate.manifest.peerDependencies })) {
      if (overlayNames.has(dependency)
        || available.get(dependency)?.directory.startsWith(join(harness, 'packages/experimental') + '/')) visit(dependency)
    }
  }
  for (const name of profileContributionNames(source)) visit(name)
  return [...selected].sort(([left], [right]) => left.localeCompare(right)).map(([, directory]) => directory)
}

/** Every qualified, non-archived Harness dependency resolves from one source. */
export function qualifiedHarnessPeerRoots(source, harness, archivedNames) {
  const packages = harnessPackages(harness)
  const proof = JSON.parse(readFileSync(join(source, 'packages/domain/lib/compatibility.json'), 'utf8'))
  return Object.keys(proof.packages).sort().filter(name => !archivedNames.has(name)).map(name => {
    const selected = packages.get(name)
    if (selected === undefined || selected.manifest.version !== proof.packages[name].version) {
      throw new Error(`qualified local package ${name} is absent or has a different version`)
    }
    return selected.directory
  })
}
