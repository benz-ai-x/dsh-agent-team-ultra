/** Resolve the local-only delivery closure from qualified package identities. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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

/** Reuse the attested SDK installations, including their platform-native payloads. */
export function qualifiedProductOverrides(source, harness) {
  const proof = JSON.parse(readFileSync(join(source, 'packages/domain/lib/compatibility.json'), 'utf8'))
  const overrides = {}
  for (const directory of archivePackageRoots(source, harness)) {
    const manifestPath = join(directory, 'package.json')
    const owner = JSON.parse(readFileSync(manifestPath, 'utf8')).name
    const resolver = createRequire(manifestPath)
    for (const product of proof.packages[owner]?.products ?? []) {
      let directory
      try { directory = dirname(resolver.resolve(`${product.name}/package.json`)) }
      catch (error) {
        // Some SDKs export their runtime but intentionally hide package.json.
        if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
        directory = dirname(resolver.resolve(product.name))
      }
      const actual = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      if (actual.name !== product.name || Object.entries(product.fields).some(([field, value]) => actual[field] !== value)) {
        throw new Error(`native product ${product.name} does not match the qualified installation`)
      }
      const link = `link:${realpathSync(directory)}`
      if (overrides[product.name] !== undefined && overrides[product.name] !== link) {
        throw new Error(`native product ${product.name} has ambiguous qualified owners`)
      }
      overrides[product.name] = link
    }
  }
  return overrides
}
