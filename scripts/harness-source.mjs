/** Shared selection and attestation for every source-linked build consumer. */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

function files(root) {
  const result = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  visit(root)
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function docsDigest(root) {
  const aggregate = createHash('sha256')
  for (const absolute of files(join(root, 'docs'))) {
    const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex')
    aggregate.update(`${digest}  ${relative(root, absolute).split(sep).join('/')}\n`)
  }
  return aggregate.digest('hex')
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function parseVersion(value) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/u.exec(value)
  return match === null ? undefined : match.slice(1).map(Number)
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

export function nodeSatisfies(range) {
  const actual = parseVersion(process.version)
  if (actual === undefined || typeof range !== 'string') return false
  return range.split('||').some(raw => {
    const clause = raw.trim()
    const minimum = parseVersion(clause.replace(/^(?:\^|>=)\s*/u, ''))
    if (minimum === undefined || compareVersions(actual, minimum) < 0) return false
    if (clause.startsWith('>=')) return true
    if (clause.startsWith('^')) return compareVersions(actual, [minimum[0] + 1, 0, 0]) < 0
    return compareVersions(actual, minimum) === 0
  })
}

function manifests(projectRoot) {
  return [join(projectRoot, 'package.json'), ...readdirSync(join(projectRoot, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(projectRoot, 'packages', entry.name, 'package.json')))
    .map(entry => join(projectRoot, 'packages', entry.name, 'package.json'))]
}

export function validateLinks(projectRoot, harnessRoot, check) {
  for (const manifestPath of manifests(projectRoot)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    for (const section of sections) {
      for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
        if (typeof specifier !== 'string' || !specifier.startsWith('link:')) continue
        const target = resolve(dirname(manifestPath), specifier.slice('link:'.length))
        check(existsSync(target), `${manifest.name} ${section}.${name} link exists`)
        if (!existsSync(target)) continue
        check(realpathSync(target).startsWith(`${realpathSync(harnessRoot)}${sep}`),
          `${manifest.name} ${section}.${name} links into the audited Harness`)
        const installed = createRequire(manifestPath).resolve.paths(name)
          ?.map(directory => join(directory, name)).find(path => existsSync(path))
        check(installed !== undefined, `${manifest.name} has an installed ${name} from ${harnessRoot}`)
        if (installed !== undefined) {
          const actual = realpathSync(installed)
          check(actual === realpathSync(target),
            `${manifest.name} installed ${name} resolves to ${actual}; selected source is ${realpathSync(target)}`)
        }
        const targetManifestPath = join(target, 'package.json')
        if (!existsSync(targetManifestPath)) continue
        const targetManifest = JSON.parse(readFileSync(targetManifestPath, 'utf8'))
        const inputs = [targetManifestPath]
        if (existsSync(join(target, 'src'))) inputs.push(...files(join(target, 'src')))
        const newestInput = Math.max(...inputs.map(input => statSync(input).mtimeMs))
        for (const field of ['main', 'types']) {
          const entry = targetManifest[field]
          if (typeof entry !== 'string') continue
          const artifact = join(target, entry)
          check(existsSync(artifact), `${name} has a built ${field} entry`)
          if (existsSync(artifact)) check(statSync(artifact).mtimeMs >= newestInput, `${name} built ${field} entry is fresh`)
        }
      }
    }
  }
}

/** TypeScript bases and upstream references must agree with runtime package resolution. */
export function validateTypeScriptSources(projectRoot, harnessRoot, check) {
  const workspaceRoots = manifests(projectRoot).slice(1).map(path => realpathSync(dirname(path)))
  const selected = realpathSync(harnessRoot)
  const inside = (path, root) => path === root || path.startsWith(`${root}${sep}`)
  for (const directory of [projectRoot, ...workspaceRoots]) {
    const configs = readdirSync(directory).filter(name => /^tsconfig(?:\.[^.]+)*\.json$/u.test(name))
    for (const name of configs) {
      const path = join(directory, name)
      const config = JSON.parse(readFileSync(path, 'utf8'))
      const inspect = (value, kind, allowWorkspace) => {
        if (typeof value !== 'string') return
        const target = resolve(directory, value)
        check(existsSync(target), `${path} TypeScript ${kind} exists at ${target}`)
        if (!existsSync(target)) return
        const actual = realpathSync(target)
        const owned = allowWorkspace && workspaceRoots.some(root => inside(actual, root))
        check(owned || inside(actual, selected),
          `${path} TypeScript ${kind} resolves to ${actual}; selected Harness source is ${selected}`)
      }
      for (const base of [config.extends].flat()) inspect(base, 'extends', false)
      for (const reference of config.references ?? []) inspect(reference.path, 'reference', true)
    }
  }
}


export const harnessLink = '.dsh/harness'

/** Relative selections belong to the Ultra checkout, independently of process.cwd(). */
export function selectHarnessRoot(projectRoot, lock, env = process.env) {
  const prepared = join(projectRoot, harnessLink)
  let preparedExists = false
  try { lstatSync(prepared); preparedExists = true } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const selected = env[lock.localResolution?.environmentVariable ?? 'DSH_HARNESS_ROOT']
    ?? (preparedExists ? harnessLink : lock.localResolution?.fallbackRelativePath)
  if (typeof selected !== 'string' || selected.trim() === '') throw new Error('Harness source selection is empty')
  const absolute = resolve(projectRoot, selected)
  return existsSync(absolute) ? realpathSync(absolute) : absolute
}

export function inspectHarnessIdentity(harnessRoot, lock, check) {
  const manifest = JSON.parse(readFileSync(join(harnessRoot, 'package.json'), 'utf8'))
  const commit = git(harnessRoot, ['rev-parse', 'HEAD'])
  const digest = docsDigest(harnessRoot)
  check(manifest.version === lock.upstream.version, `Harness version matches ${lock.upstream.version}`)
  check(manifest.engines?.node === lock.upstream.node, 'Harness Node engine matches')
  check(commit === lock.upstream.commit, `Harness commit matches ${lock.upstream.commit}`)
  check(digest === lock.upstream.docsDigest, 'Harness docs digest matches')
  const dirty = [
    git(harnessRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
    git(harnessRoot, ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env']),
  ].filter(Boolean).join('\n')
  check(dirty === '', dirty === '' ? 'Harness attested inputs are clean' : `Harness has changes:\n${dirty}`)
  return { harnessRoot, repository: lock.upstream.repository, version: manifest.version, commit, docsDigest: digest }
}

export function requireLockedHarness(projectRoot) {
  const lock = JSON.parse(readFileSync(join(projectRoot, 'dsh-reference.lock.json'), 'utf8'))
  const harnessRoot = selectHarnessRoot(projectRoot, lock)
  const failures = []
  const check = (valid, message) => { if (!valid) failures.push(message) }
  check(lock.schemaVersion === 1, 'reference lock schema is supported')
  check(nodeSatisfies(lock.upstream?.node), `Node ${process.version} satisfies ${lock.upstream?.node}`)
  let proof
  try { proof = inspectHarnessIdentity(harnessRoot, lock, check) } catch (error) { failures.push(String(error)) }
  if (failures.length) throw new Error(`Harness source validation failed at ${harnessRoot}:\n${failures.join('\n')}`)
  return { lock, harnessRoot, proof }
}

/** Verify the prepared anchor and actual Node resolution before loading Harness modules. */
export function requirePreparedHarness(projectRoot) {
  const source = requireLockedHarness(projectRoot)
  const prepared = join(projectRoot, harnessLink)
  if (!existsSync(prepared) || realpathSync(prepared) !== source.harnessRoot) {
    throw new Error(`Harness source is not prepared at ${prepared}; selected source is ${source.harnessRoot}. Run pnpm prepare:harness, then pnpm install.`)
  }
  const failures = []
  const check = (valid, message) => { if (!valid) failures.push(message) }
  validateLinks(projectRoot, source.harnessRoot, check)
  validateTypeScriptSources(projectRoot, source.harnessRoot, check)
  if (failures.length) throw new Error(`Harness source mismatch at ${source.harnessRoot}:\n${failures.join('\n')}`)
  return source
}
