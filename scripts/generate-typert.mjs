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

function writeAgentFacade(source, target) {
  // Generation only needs the audited Agent identity/lifecycle surface imported
  // by this plugin. The real Host build type-checks the complete source package
  // first; this isolated facade keeps unrelated declaration merges out of the
  // generator sandbox without weakening that check.
  mkdirSync(join(target, 'src'), { recursive: true })
  cpSync(join(source, 'package.json'), join(target, 'package.json'))
  writeFileSync(join(target, 'src', 'index.ts'), `
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertContext, TypertLookup } from '@deepseek-ai/dsh-typert-protocol'

export interface Agent {
  readonly id: SessionId
  readonly session: { readonly header: { readonly parentSession?: SessionId } }
  readonly ctx: Context
  inject(message: unknown): void
}

export type PreStepDecision =
  | { readonly kind: 'reject' }
  | { readonly kind: 'enter'; readonly messages: readonly unknown[]; readonly startsRequestSeries?: true }

export interface AgentRegistry {
  get(id: SessionId): Agent | undefined
  list(): readonly Agent[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    agent: TypertLookup<Agent, SessionId>
  }
  interface TypertContextMap {
    agent: TypertContext<SessionId>
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    agents: AgentRegistry
    agent?: Agent
  }
  interface Events {
    'agent/created'(payload: { readonly agent: Agent }): void
    'agent/disposed'(payload: { readonly agent: Agent }): void
    'agent/session-start'(payload: { readonly agent: Agent }): void
    'agent/pre-step'(
      payload: unknown,
      next: () => Promise<PreStepDecision>,
    ): Promise<PreStepDecision>
  }
}
`)
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
  writeAgentFacade(join(harnessRoot, 'packages', 'core', 'agent'), agentRoot)

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
  paths['@deepseek-ai/dsh-agent/types'] = [join(agentRoot, 'src', 'index.ts')]

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
  const artifacts = generator.generate(['@benz-ai-x/dsh-agent-team-ultra'], ['host'])
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
