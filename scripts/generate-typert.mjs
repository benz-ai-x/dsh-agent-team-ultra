/** Generate Typert artifacts for an external, source-linked DSH package. */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const lock = JSON.parse(readFileSync(join(projectRoot, 'dsh-reference.lock.json'), 'utf8'))
const harnessRoot = resolve(
  process.env.DSH_HARNESS_ROOT ?? join(projectRoot, '..', 'deepseek-harness'),
)

if (!existsSync(join(harnessRoot, 'tsconfig.base.json'))) {
  throw new Error(`generate-typert: pinned Harness source not found at ${harnessRoot}`)
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-agent-team-ultra-typert-'))

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function copyPackage(source, target) {
  mkdirSync(target, { recursive: true })
  cpSync(join(source, 'src'), join(target, 'src'), { recursive: true })
  cpSync(join(source, 'package.json'), join(target, 'package.json'))
  writeJson(join(target, 'tsconfig.json'), {
    extends: join(harnessRoot, 'tsconfig.base.json'),
    compilerOptions: { rootDir: 'src', outDir: 'lib/types' },
    include: ['src'],
  })
}

try {
  const domainRoot = join(temporaryRoot, 'packages', 'domain')
  const protocolRoot = join(temporaryRoot, 'packages', 'typert-protocol')
  const sessionRoot = join(temporaryRoot, 'packages', 'session')
  const agentRoot = join(temporaryRoot, 'packages', 'agent')

  copyPackage(join(projectRoot, 'packages', 'domain'), domainRoot)
  copyPackage(join(harnessRoot, 'packages', 'typert', 'protocol'), protocolRoot)
  copyPackage(join(harnessRoot, 'packages', 'core', 'session'), sessionRoot)
  copyPackage(join(harnessRoot, 'packages', 'core', 'agent'), agentRoot)

  const baseRead = ts.readConfigFile(join(harnessRoot, 'tsconfig.base.json'), ts.sys.readFile)
  if (baseRead.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(baseRead.error.messageText, '\n'))
  }
  const basePaths = baseRead.config?.compilerOptions?.paths ?? {}
  const paths = Object.fromEntries(Object.entries(basePaths).map(([specifier, targets]) => [
    specifier,
    targets.map(target => resolve(harnessRoot, target)),
  ]))
  paths['@deepseek-ai/dsh-typert-protocol'] = [join(protocolRoot, 'src', 'index.ts')]
  paths['@deepseek-ai/dsh-typert-protocol/types'] = [join(protocolRoot, 'src', 'types.ts')]
  paths['@deepseek-ai/dsh-session'] = [join(sessionRoot, 'src', 'index.ts')]
  paths['@deepseek-ai/dsh-session/types'] = [join(sessionRoot, 'src', 'types.ts')]
  paths['@deepseek-ai/dsh-agent'] = [join(agentRoot, 'src', 'index.ts')]
  paths['@deepseek-ai/dsh-agent/types'] = [join(agentRoot, 'src', 'types.ts')]
  paths['@deepseek-ai/dsh-agent/brand'] = [join(agentRoot, 'src', 'brand.ts')]

  writeJson(join(temporaryRoot, 'tsconfig.host.json'), {
    extends: join(harnessRoot, 'tsconfig.base.json'),
    compilerOptions: { paths },
    files: [],
    references: [
      { path: './packages/typert-protocol' },
      { path: './packages/session' },
      { path: './packages/agent' },
      { path: './packages/domain' },
    ],
  })

  const generator = new WorkspaceTypertGenerator(temporaryRoot, { checkDiagnostics: false })
  const artifacts = generator.generate(['@deepseek-ai/dsh-agent-team-ultra'], ['host'])
  const artifact = artifacts.find(candidate =>
    candidate.packageRoot === 'packages/domain' && candidate.face === 'host')
  if (artifact === undefined || artifact.remote === undefined) {
    throw new Error('generate-typert: Host or Remote artifact was not emitted')
  }

  const output = join(projectRoot, 'packages', 'domain', 'lib')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'typert.host.js'), artifact.js)
  writeFileSync(join(output, 'typert.host.d.ts'), artifact.dts)
  writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
  writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)

  process.stdout.write(
    `Generated Typert Host and Remote artifacts against ${lock.upstream?.commit ?? 'the pinned Harness'}.\n`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
