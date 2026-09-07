#!/usr/bin/env node

import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import React, { createElement } from 'react'
import { act, Simulate } from 'react-dom/test-utils'

const [ultraClientFile, teamClientFile, teamPackageRoot, rawHarnessRoot] = process.argv.slice(2)
if ([ultraClientFile, teamClientFile, teamPackageRoot, rawHarnessRoot].some(value => value === undefined)) {
  throw new Error('usage: probe-packed-message-center <ultra-client.js> <team-client.js> <team-package-root> <harness-root>')
}

const harnessRoot = resolve(rawHarnessRoot)
const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-packed-message-center-'))
const leadId = 'packed-message-lead'
const members = {
  dsh: { id: 'packed-dsh-worker', name: 'dsh-worker', provider: 'spawn' },
  codex: { id: 'packed-codex-worker', name: 'codex-worker', provider: 'codex' },
  claude: { id: 'packed-claude-worker', name: 'claude-worker', provider: 'claude-code' },
}
const codexMessageId = 'message-codex'
const packedWorkerName = 'packed-controlled-worker'
const packedRequestText = '请从打包消息中心执行这项受控工作。'
const packedPrerequisiteSubject = 'Inspect packed dependency graph'
const packedDependentSubject = 'Publish packed dependency graph'
const packedProviderId = 'packed-controlled'
const packedRuntimeEntryId = 'packed-controlled-runtime'
const packedTeamEntryId = 'packed-agent-team'
const packedLaunchRequestId = '77777777-7777-4777-8777-777777777777'
const controlledRuntimeUrl = pathToFileURL(join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/packed-controlled-team-runtime.mjs',
)).href
const controlledRuntimeKey = Symbol.for('dsh-agent-team-ultra.packed-controlled-runtime')
const deliveryRelease = Promise.withResolvers()
const runtimeControl = {
  providerId: packedProviderId,
  providerLoads: 0,
  createCalls: [],
  resumeCalls: [],
  deliverCalls: [],
  runtimes: new Map(),
  deliveryTurns: new Map(),
  deliveryRelease,
}
globalThis[controlledRuntimeKey] = runtimeControl

const fileUrl = path => pathToFileURL(resolve(path)).href
const harnessUrl = path => fileUrl(join(harnessRoot, path))
const teamUrl = path => fileUrl(join(resolve(teamPackageRoot), path))
const cordis = await import(harnessUrl('vendor/cordis/lib/index.js'))
const clientStore = await import(harnessUrl('packages/client/store/lib/index.js'))
const harnessRequire = createRequire(join(harnessRoot, 'package.json'))
const WebSocketBase = harnessRequire('ws')
let websocketCookie = ''

class AuthenticatedWebSocket extends WebSocketBase {
  constructor(url, protocols) {
    super(url, protocols ?? [], { headers: { cookie: websocketCookie } })
  }
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://127.0.0.1/',
})
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
})
globalThis.WebSocket = AuthenticatedWebSocket
window.WebSocket = AuthenticatedWebSocket
globalThis.requestAnimationFrame = callback => dom.window.requestAnimationFrame(callback)
globalThis.cancelAnimationFrame = handle => dom.window.cancelAnimationFrame(handle)

const nativeFetch = globalThis.fetch
const handoffs = new Map()
window.__ModuleLoader__ = {
  load(handoff) {
    handoffs.set(handoff.id, handoff)
  },
}

function loadClientBundle(path) {
  const code = readFileSync(resolve(path), 'utf8')
  new Function(code)()
}

for (const path of [
  join(harnessRoot, 'packages/typert/registry/lib/client.js'),
  join(harnessRoot, 'packages/client/connection/lib/client.js'),
  join(harnessRoot, 'packages/api/gateway/lib/client.js'),
  join(harnessRoot, 'packages/api/remotes/lib/client.js'),
  join(harnessRoot, 'packages/client/ui-renderer/lib/client.js'),
  join(harnessRoot, 'packages/client/locale/lib/client.js'),
  resolve(teamClientFile),
  resolve(ultraClientFile),
]) loadClientBundle(path)

const uiSlots = await import(harnessUrl('packages/client/ui-slots/lib/index.js'))
const ReactDom = await import('react-dom')
const ReactDomClient = await import('react-dom/client')
const jsxRuntime = await import('react/jsx-runtime')
const Primitive = props => createElement('span', props)
const primitives = new Proxy({}, { get: () => Primitive })

function instantiate(id, extra = {}) {
  const handoff = handoffs.get(id)
  if (handoff === undefined) throw new Error(`missing Client bundle handoff ${id}`)
  const modules = {
    '@deepseek-ai/cordis': cordis,
    '@deepseek-ai/dsh-client-ui-primitives': primitives,
    '@deepseek-ai/dsh-client-ui-slots': uiSlots,
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    ...extra,
  }
  return handoff.factory(specifier => {
    if (!(specifier in modules)) throw new Error(`${id}: unexpected Client external ${specifier}`)
    return modules[specifier]
  })
}

const registryClient = instantiate('@deepseek-ai/dsh-typert-registry')
const connectionClient = instantiate('@deepseek-ai/dsh-client-connection')
const gatewayClient = instantiate('@deepseek-ai/dsh-api-gateway')
const remotesClient = instantiate('@deepseek-ai/dsh-api-remotes')
const rendererClient = instantiate('@deepseek-ai/dsh-client-ui-renderer')
const localeClient = instantiate('@deepseek-ai/dsh-client-locale', {
  '@deepseek-ai/dsh-client-store': clientStore,
})
const teamClient = instantiate('@deepseek-ai/dsh-experimental-client-ui-agent-team')
const ultraClient = instantiate('@benz-ai-x/dsh-client-ui-agent-team-ultra', {
  '@deepseek-ai/dsh-api-gateway/client': gatewayClient,
})

function appendMember(session, TeamId, SessionId, member) {
  const base = {
    id: SessionId(member.id),
    name: member.name,
    description: `${member.name} runtime`,
    provider: member.provider,
    context: 'fresh',
    phase: 'provisioning',
  }
  for (const snapshot of [base, { ...base, phase: 'active' }]) {
    session.append('team/member', { version: 2, teamId: TeamId(leadId), member: snapshot })
  }
}

function appendMessage(session, TeamId, TeamMessageId, SessionId, input) {
  const message = {
    id: TeamMessageId(input.id),
    senderId: SessionId(input.senderId),
    senderName: input.senderName,
    targetId: SessionId(input.targetId),
    content: [{ type: 'text', text: input.body }],
  }
  session.append('team/message/queued', { version: 2, teamId: TeamId(leadId), message })
  if (input.delivered === true) {
    session.append('team/message/delivered', {
      version: 2,
      teamId: TeamId(leadId),
      messageId: message.id,
      targetId: message.targetId,
    })
  }
  return message
}

async function startHost(resume) {
  const { Context } = cordis
  const { Loader } = await import(harnessUrl('vendor/loader/lib/index.js'))
  const { default: AgentLoop } = await import(harnessUrl('packages/core/agent-loop/lib/index.js'))
  const { mountAgentLoopTestDependencies } = await import(harnessUrl('packages/test-support/agent-loop-testkit/lib/index.js'))
  const connectionHost = await import(harnessUrl('packages/client/connection/lib/index.js'))
  const { default: TypertRemoteService } = await import(harnessUrl('packages/api/gateway/lib/index.js'))
  const remotesHost = await import(harnessUrl('packages/api/remotes/lib/index.js'))
  const { SessionId } = await import(harnessUrl('packages/core/session/lib/index.js'))
  const { default: SessionProjectionRegistry } = await import(harnessUrl('packages/session/session-projection/lib/index.js'))
  const { default: JsonlSessionPersistence } = await import(harnessUrl('packages/session/session-persistence-jsonl/lib/index.js'))
  const { default: SubagentService } = await import(harnessUrl('packages/subagent/subagent/lib/index.js'))
  const { default: TypertRegistry } = await import(harnessUrl('packages/typert/registry/lib/index.js'))
  const { default: PackedTeamService, TeamId, TeamMessageId } = await import(teamUrl('lib/index.js'))
  const { TYPERT } = await import(teamUrl('lib/typert.host.js'))

  const routes = []
  const upgradeRoutes = []
  const credentials = new Map()
  const host = new Context()
  host.provide('webServer', {
    register(route) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
    registerUpgrade(route) {
      upgradeRoutes.push(route)
      return () => { upgradeRoutes.splice(upgradeRoutes.indexOf(route), 1) }
    },
    tapIndex() { return () => {} },
    port: 0,
  })
  host.provide('credentials', {
    readRecord(key) { return Promise.resolve(credentials.get(key)) },
    async modifyRecord(key, mutate) {
      const next = await mutate(credentials.get(key))
      if (next !== undefined) credentials.set(key, next)
      return next ?? credentials.get(key)
    },
  })
  await mountAgentLoopTestDependencies(host)
  await host.plugin(SessionProjectionRegistry)
  await host.plugin(JsonlSessionPersistence, { root: storageRoot })
  await host.plugin(AgentLoop, { agents: [] })
  await host.plugin(SubagentService)
  await host.plugin({ inject: connectionHost.inject, apply: connectionHost.apply })
  await host.plugin(TypertRegistry)
  await host.plugin(TypertRemoteService)
  await host.plugin({ inject: remotesHost.inject, apply: remotesHost.apply })
  const loaderFiber = host.plugin(Loader, {
    baseUrl: pathToFileURL(join(resolve(teamPackageRoot), 'package.json')).href,
  })
  await loaderFiber
  const teamEntry = {
    id: packedTeamEntryId,
    name: teamUrl('lib/index.js'),
    config: {},
  }
  const runtimeEntry = {
    id: packedRuntimeEntryId,
    name: controlledRuntimeUrl,
    config: {},
  }
  await host.loader.root.update(resume ? [teamEntry] : [teamEntry, runtimeEntry])
  await host.loader.await()
  if (!(host.agentTeams instanceof PackedTeamService)) {
    throw new Error('Loader did not mount the packed TeamService implementation')
  }
  host.typert.register(TYPERT)

  let lead
  if (!resume) {
    lead = await host.agentLoop.create(SessionId(leadId), {})
    const spawned = await host.agentTeams.spawnTeammate(lead, {
      name: packedWorkerName,
      description: 'Controlled recipient created through the packed Team owner',
      prompt: [{ type: 'text', text: 'Accept one controlled packed message.' }],
      context: 'fresh',
      runtime: {
        kind: 'external-agent',
        provider: packedProviderId,
        launchRequestId: packedLaunchRequestId,
        profile: {
          persona: 'Be deterministic.',
          mission: 'Accept one controlled packed message.',
          context: [],
          memory: [],
          toolPolicy: { mode: 'inherit', names: [] },
          hooks: [],
        },
        requirements: {
          contextMode: 'fresh',
          profileCapabilities: ['persona', 'mission'],
          runtimeCapabilities: [],
        },
      },
      signal: new AbortController().signal,
    })
    const prerequisite = await host.agentTeams.createTask(lead, {
      subject: packedPrerequisiteSubject,
      description: 'Inspect the installed production task graph.',
    })
    await host.agentTeams.createTask(lead, {
      subject: packedDependentSubject,
      description: 'Publish only after the packed prerequisite is complete.',
      blockedBy: [prerequisite.id],
    })
    const session = lead.session
    for (const member of Object.values(members)) appendMember(session, TeamId, SessionId, member)
    for (let index = 0; index < 19; index += 1) {
      appendMessage(session, TeamId, TeamMessageId, SessionId, {
        id: `message-filler-${String(index).padStart(2, '0')}`,
        senderId: leadId,
        senderName: 'lead',
        targetId: members.dsh.id,
        body: `DSH durable filler ${index}`,
      })
    }
    appendMessage(session, TeamId, TeamMessageId, SessionId, {
      id: 'message-dsh', senderId: leadId, senderName: 'lead', targetId: members.dsh.id,
      body: 'DSH durable body',
    })
    appendMessage(session, TeamId, TeamMessageId, SessionId, {
      id: codexMessageId, senderId: members.codex.id, senderName: members.codex.name, targetId: leadId,
      body: 'Codex durable body', delivered: true,
    })
    appendMessage(session, TeamId, TeamMessageId, SessionId, {
      id: 'message-claude', senderId: members.claude.id, senderName: members.claude.name, targetId: leadId,
      body: 'Claude durable body',
    })
    await host.sessions.flush(session)
    await host.loader.remove(packedRuntimeEntryId)
    if (host.agentTeams.listMembers(lead).find(member => member.name === packedWorkerName)?.status !== 'inactive') {
      throw new Error('Loader removal did not make the controlled packed recipient inactive')
    }
  } else {
    const resumed = await host.agents.resume({ resumeSessionId: SessionId(leadId), agentOptions: {} })
    lead = resumed.agent
    const recovered = host.agentTeams.listMembers(lead).find(member => member.name === packedWorkerName)
    if (recovered?.status !== 'inactive') throw new Error('recovered packed recipient is not inactive without its provider')
  }

  const tasks = host.agentTeams.listTasks(lead)
  const prerequisite = tasks.find(task => task.subject === packedPrerequisiteSubject)
  const dependent = tasks.find(task => task.subject === packedDependentSubject)
  if (prerequisite === undefined || dependent === undefined
    || dependent.blockedBy.length !== 1 || dependent.blockedBy[0] !== prerequisite.id
    || dependent.ready !== false) {
    throw new Error(`Host did not retain the authoritative packed task dependency: ${JSON.stringify(tasks)}`)
  }

  if (routes.length !== 1 || routes[0].path !== '/api') throw new Error('Host did not expose one /api route')
  if (upgradeRoutes.length !== 1 || upgradeRoutes[0].path !== '/api/remote.mux') {
    throw new Error('Host did not expose one /api/remote.mux upgrade route')
  }
  const server = createServer((request, response) => {
    if ((request.url ?? '/').startsWith('/?')) {
      if (host.connection.authorizeIndex(request, response)) {
        response.writeHead(200, { 'content-type': 'text/html' })
        response.end('<body>shell</body>')
      }
      return
    }
    void routes[0].handler(request, response)
  })
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const route = upgradeRoutes.find(candidate => candidate.path === path)
    if (route === undefined) {
      socket.destroy()
      return
    }
    route.handler(request, socket, head)
  })
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Host has no TCP address')
  const origin = `http://127.0.0.1:${address.port}`
  const login = await nativeFetch(host.connection.authenticatedUrl(origin), { redirect: 'manual' })
  const setCookie = login.headers.get('set-cookie')
  if (login.status !== 303 || setCookie === null) throw new Error('Host authentication exchange failed')
  const cookie = setCookie.split(';', 1)[0]

  return {
    origin,
    cookie,
    lead,
    taskGraph: { prerequisite, dependent },
    async events() {
      const stored = await host.sessionPersistence.open(SessionId(leadId), 'read')
      try {
        return structuredClone(await stored.read())
      } finally {
        await stored.close()
      }
    },
    async enableProvider() {
      await host.loader.root.update([teamEntry, runtimeEntry])
      await host.loader.await()
    },
    async dispose() {
      await new Promise((resolveClose, rejectClose) => server.close(error => {
        if (error === undefined) resolveClose()
        else rejectClose(error)
      }))
      await host.fiber.dispose()
    },
  }
}

async function startClient(host) {
  dom.reconfigure({ url: host.origin })
  globalThis.location = dom.window.location
  websocketCookie = host.cookie
  globalThis.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('cookie', host.cookie)
    return nativeFetch(input, { ...init, headers })
  }

  const client = new cordis.Context()
  for (const plugin of [registryClient, connectionClient, gatewayClient, remotesClient]) {
    await client.plugin({ inject: plugin.inject, apply: plugin.apply }).await()
  }
  let current = leadId
  client.provide('sessions', {
    list: { getSnapshot: () => ({ current }) },
    binding: () => undefined,
    refreshSubagents: () => Promise.resolve(),
    openSubagent: id => { current = id },
  })
  const locale = new localeClient.LocaleRuntime(client)
  client.provide('locale', locale)
  await client.plugin({ inject: rendererClient.inject, apply: rendererClient.apply }).await()
  client.slots.installLocale(locale)
  const sessionBinding = {
    key: leadId,
    ctx: client,
    hooks: {},
    keyedHooks: {},
    props: { sessionId: leadId },
  }
  const sessionSource = {
    getSnapshot: () => sessionBinding,
    subscribe: () => () => {},
  }
  client.slots.installScope('session', {
    current: sessionSource,
    resolve: key => key === leadId ? sessionBinding : undefined,
    renderArea: (_binding, { children }) => children,
  })
  const RootFrame = ({ renderSlot, SessionProvider }) => createElement(
    SessionProvider,
    null,
    renderSlot('conversation.session.header.actions', {}),
  )
  const disposeRootSlot = client.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  }, RootFrame)
  const teamFiber = client.plugin({ inject: teamClient.inject, apply: teamClient.apply })
  await teamFiber.await()
  const ultraFiber = client.plugin({ inject: ultraClient.inject, apply: ultraClient.apply })
  await ultraFiber.await()
  await waitUntil(
    () => client.get('connection').state.getSnapshot() === 'connected',
    'packed Remote connection',
  )

  const parentEntry = client.slots.entries('conversation.session.header.actions')
    .find(entry => entry.options.id === 'agent-team')
  const childEntry = client.slots.entries('agent-team.panel.view')
    .find(entry => entry.options.id === 'messages')
  if (parentEntry === undefined || childEntry === undefined) throw new Error('packed Team owner/message entries are missing')
  const childActions = childEntry.inject()
  const sendMessage = childActions.sendMessage.bind(childActions)
  let droppedSendResponse = null
  childActions.sendMessage = async (sessionId, request, signal) => {
    const drop = droppedSendResponse
    if (drop === null) return await sendMessage(sessionId, request, signal)
    droppedSendResponse = null
    try {
      const result = await sendMessage(sessionId, request, signal)
      drop.resolve({ request, result, signal })
      return await new Promise(() => {})
    } catch (error) {
      drop.reject(error)
      throw error
    }
  }

  return {
    childActions,
    dropNextSendResponse() {
      if (droppedSendResponse !== null) throw new Error('a packed send response is already armed for loss')
      droppedSendResponse = Promise.withResolvers()
      return droppedSendResponse.promise
    },
    async renderPanel() {
      const container = document.createElement('div')
      document.body.replaceChildren(container)
      let unmount
      await act(async () => {
        unmount = client.uiRenderer.mount(container)
      })
      return {
        container,
        async dispose() {
          await act(async () => { unmount() })
        },
      }
    },
    async dispose() {
      disposeRootSlot()
      await client.fiber.dispose()
    },
  }
}

async function waitUntil(assertion, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await assertion()
      if (value !== false && value !== undefined && value !== null) return value
    } catch (error) {
      lastError = error
    }
    await act(async () => { await new Promise(resolveWait => setTimeout(resolveWait, 10)) })
  }
  throw new Error(`${label} did not become true${lastError === undefined ? '' : `: ${String(lastError)}`}`)
}

function button(container, label) {
  const found = [...container.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === label)
  if (found === undefined) throw new Error(`button ${JSON.stringify(label)} is missing`)
  return found
}

function ariaButton(container, label) {
  const found = [...container.querySelectorAll('button')]
    .find(candidate => candidate.getAttribute('aria-label') === label)
  if (found === undefined) throw new Error(`button with aria-label ${JSON.stringify(label)} is missing`)
  return found
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function doubleClick(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function select(container, label, value) {
  const field = [...container.querySelectorAll('label')]
    .find(candidate => candidate.firstChild?.textContent?.trim() === label)?.querySelector('select')
  if (field === undefined) throw new Error(`select ${JSON.stringify(label)} is missing`)
  await act(async () => { Simulate.change(field, { target: { value } }) })
}

function selectOptionValue(container, label, text) {
  const field = [...container.querySelectorAll('label')]
    .find(candidate => candidate.firstChild?.textContent?.trim() === label)?.querySelector('select')
  const option = [...field?.querySelectorAll('option') ?? []]
    .find(candidate => candidate.textContent?.trim() === text)
  if (option === undefined) throw new Error(`option ${JSON.stringify(text)} is missing from ${JSON.stringify(label)}`)
  return option.value
}

async function enterText(container, label, value) {
  const field = [...container.querySelectorAll('label')]
    .find(candidate => candidate.firstChild?.textContent?.trim() === label)?.querySelector('textarea')
  if (field === undefined) throw new Error(`textarea ${JSON.stringify(label)} is missing`)
  await act(async () => {
    Simulate.change(field, { target: { value } })
  })
}

async function enterSearch(container, label, value) {
  const field = [...container.querySelectorAll('input[type="search"]')]
    .find(candidate => candidate.getAttribute('aria-label') === label)
  if (field === undefined) throw new Error(`searchbox ${JSON.stringify(label)} is missing`)
  await act(async () => {
    Simulate.change(field, { target: { value } })
  })
}

function messageButtons(container) {
  const list = container.querySelector('[aria-label="Persisted Team messages"]')
  if (list === null) return []
  return [...list.querySelectorAll(':scope > button')]
    .filter(candidate => candidate.textContent?.trim() !== 'Load older messages')
}

async function openMessages(panel) {
  if (panel.container.querySelector('[role="dialog"][aria-label="Agent Team"]') === null) {
    const teamTab = await waitUntil(
      () => button(panel.container, 'Agent Team'),
      'packed Agent Team tab',
    ).catch((error) => {
      throw new Error(`${String(error)}; rendered DOM: ${panel.container.innerHTML}`)
    })
    await click(teamTab)
  }
  await waitUntil(() => button(panel.container, 'Messages'), 'packed Messages tab')
  await click(button(panel.container, 'Messages'))
  await waitUntil(() => panel.container.textContent?.includes('Persisted messages'), 'packed message center')
  await waitUntil(() => messageButtons(panel.container).length > 0, 'packed message rows')
}

async function verifyTaskDag(panel, taskGraph) {
  const teamTab = await waitUntil(
    () => button(panel.container, 'Agent Team'),
    'packed Agent Team tab',
  ).catch((error) => {
    throw new Error(`${String(error)}; rendered DOM: ${panel.container.innerHTML}`)
  })
  await click(teamTab)

  const dependentLabel = `${taskGraph.dependent.id} · ${taskGraph.dependent.subject}`
  const prerequisiteLabel = `${taskGraph.prerequisite.id} · ${taskGraph.prerequisite.subject}`
  const dependentRow = await waitUntil(
    () => ariaButton(panel.container, dependentLabel),
    'packed authoritative dependent task row',
  ).catch((error) => {
    throw new Error(`${String(error)}; rendered DOM: ${panel.container.innerHTML}`)
  })
  await click(dependentRow)

  const details = await waitUntil(
    () => panel.container.querySelector('[role="region"][aria-label="Task details"]'),
    'packed shared task details',
  )
  for (const expected of [
    taskGraph.dependent.id,
    taskGraph.dependent.subject,
    taskGraph.prerequisite.id,
    'Pending',
    'Blocked by dependencies',
  ]) {
    if (!details.textContent.includes(expected)) throw new Error(`packed task details are missing ${JSON.stringify(expected)}`)
  }
  for (const expected of ['New task', 'Edit', 'Delete']) button(panel.container, expected)
  if (details.querySelector('select') === null) throw new Error('packed task details omitted the existing owner control')

  await click(button(panel.container, 'Task dependency graph'))
  const graph = await waitUntil(
    () => panel.container.querySelector('[role="application"][aria-label="Task dependency graph"]'),
    'packed task dependency graph',
  )
  const edgeLabel = `${taskGraph.prerequisite.id} → ${taskGraph.dependent.id}`
  const edge = [...graph.querySelectorAll('[aria-label]')]
    .find(candidate => candidate.getAttribute('aria-label') === edgeLabel)
  if (edge?.getAttribute('data-from-task-id') !== taskGraph.prerequisite.id
    || edge.getAttribute('data-to-task-id') !== taskGraph.dependent.id
    || edge.getAttribute('marker-end') !== 'url(#agent-team-task-arrow)') {
    throw new Error(`packed task graph omitted its authoritative directed edge ${edgeLabel}`)
  }
  const prerequisiteNode = ariaButton(graph, prerequisiteLabel)
  const dependentNode = ariaButton(graph, dependentLabel)
  for (const expected of ['Unowned', 'Pending', 'Blocked by dependencies', taskGraph.prerequisite.id]) {
    if (!dependentNode.textContent.includes(expected)) {
      throw new Error(`packed dependent node is missing Host fact ${JSON.stringify(expected)}`)
    }
  }
  if (prerequisiteNode.getAttribute('data-graph-column') !== '0'
    || dependentNode.getAttribute('data-graph-column') !== '1') {
    throw new Error('packed task graph did not apply its dependency-aware layout')
  }

  const zoomBefore = graph.getAttribute('data-zoom')
  await click(ariaButton(panel.container, 'Zoom in dependency graph'))
  await waitUntil(() => graph.getAttribute('data-zoom') !== zoomBefore, 'packed graph zoom')
  button(panel.container, 'Fit dependency graph to view')

  await act(async () => {
    prerequisiteNode.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  })
  await waitUntil(() => dependentNode.getAttribute('aria-pressed') === 'true', 'packed graph keyboard navigation')
  await click(button(panel.container, 'Task list'))
  if (ariaButton(panel.container, dependentLabel).getAttribute('aria-pressed') !== 'true') {
    throw new Error('packed task selection did not survive graph-to-list switching')
  }

  await enterSearch(panel.container, 'Filter tasks', taskGraph.dependent.subject)
  await waitUntil(
    () => panel.container.textContent.includes(`Hidden dependencies: ${taskGraph.prerequisite.id}`),
    'packed hidden-dependency list cue',
  )
  if (!panel.container.textContent.includes('Blocked by dependencies')) {
    throw new Error('packed task filter changed the authoritative readiness text')
  }
  await click(button(panel.container, 'Task dependency graph'))
  const filteredGraph = panel.container.querySelector('[role="application"][aria-label="Task dependency graph"]')
  if (filteredGraph === null
    || !filteredGraph.textContent.includes(`Hidden dependencies: ${taskGraph.prerequisite.id}`)
    || [...filteredGraph.querySelectorAll('[aria-label]')].some(candidate => candidate.getAttribute('aria-label') === edgeLabel)) {
    throw new Error('packed filtered graph did not distinguish hidden dependencies from Host readiness')
  }
  await enterSearch(panel.container, 'Filter tasks', '')
  await waitUntil(
    () => [...filteredGraph.querySelectorAll('[aria-label]')]
      .some(candidate => candidate.getAttribute('aria-label') === edgeLabel),
    'packed dependency edge after clearing filter',
  )
}

async function filterCodex(panel) {
  await select(panel.container, 'Member', members.codex.id)
  await select(panel.container, 'Direction', 'sent')
  await select(panel.container, 'Delivery', 'delivered')
  await click(button(panel.container, 'Apply filters'))
  await waitUntil(() => {
    const rows = messageButtons(panel.container)
    return rows.length === 1 && rows[0].textContent.includes('codex-worker → lead')
  }, 'filtered Codex row')
}

function requireRemoteSuccess(result, label) {
  if (result?.ok !== true) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
  return result.value
}

function validateSubmissionFacts(events, expected) {
  const facts = events.filter(event => event.type === 'team/message/request-committed'
    && event.data.receipt.requestId === expected.requestId)
  if (facts.length !== 1) throw new Error(`expected one durable request fact, received ${facts.length}`)
  const fact = facts[0]
  const { message, receipt } = fact.data
  if (fact.data.version !== 1 || fact.data.teamId !== leadId
    || receipt.senderId !== leadId || receipt.replyTo !== expected.replyTo
    || receipt.result.requestId !== expected.requestId || receipt.result.status !== 'accepted'
    || receipt.result.messageId !== message.id || message.senderId !== leadId
    || message.targetId !== expected.recipientId
    || message.content.length !== 1 || message.content[0]?.type !== 'text'
    || message.content[0]?.text !== expected.text
    || !/^[0-9a-f]{64}$/u.test(receipt.inputFingerprint)) {
    throw new Error(`durable request fact does not match the packed submission: ${JSON.stringify(fact)}`)
  }
  return fact
}

function requireValidatorRejection(events, expected, label) {
  try {
    validateSubmissionFacts(events, expected)
  } catch {
    return
  }
  throw new Error(`packed submission validator accepted ${label}`)
}

let firstHost
let firstClient
let firstPanel
let secondHost
let secondClient
let secondPanel
try {
  firstHost = await startHost(false)
  firstClient = await startClient(firstHost)
  firstPanel = await firstClient.renderPanel()
  await verifyTaskDag(firstPanel, firstHost.taskGraph)
  await openMessages(firstPanel)
  for (const route of ['lead → dsh-worker', 'codex-worker → lead', 'claude-worker → lead']) {
    if (!firstPanel.container.textContent.includes(route)) throw new Error(`packed first page is missing ${route}`)
  }
  if (messageButtons(firstPanel.container).length !== 20) throw new Error('packed first page is not bounded to 20 rows')
  await click(button(firstPanel.container, 'Load older messages'))
  await waitUntil(() => messageButtons(firstPanel.container).length === 22, 'packed second page')

  await filterCodex(firstPanel)
  if (firstPanel.container.textContent.includes('Codex durable body')) {
    throw new Error('packed message list fetched content before row selection')
  }
  await click(messageButtons(firstPanel.container)[0])
  await waitUntil(() => firstPanel.container.textContent.includes('Codex durable body'), 'packed Codex detail')
  if (!firstPanel.container.textContent.includes(codexMessageId)) throw new Error('packed detail omitted the stable message id')

  const packedWorkerId = selectOptionValue(firstPanel.container, 'Recipient', packedWorkerName)
  await select(firstPanel.container, 'Reply to', codexMessageId)
  await select(firstPanel.container, 'Recipient', packedWorkerId)
  await enterText(firstPanel.container, 'Message', packedRequestText)
  const droppedSendResponse = firstClient.dropNextSendResponse()
  await doubleClick(button(firstPanel.container, 'Send message'))
  const dropped = await droppedSendResponse
  const droppedSubmission = requireRemoteSuccess(dropped.result, 'packed committed response selected for loss')
  if (droppedSubmission.ok !== true
    || droppedSubmission.value.submission.requestId !== dropped.request.requestId) {
    throw new Error(`packed response was lost before durable acceptance: ${JSON.stringify(dropped.result)}`)
  }
  await waitUntil(
    () => firstPanel.container.textContent?.includes('Submission result unknown. Review this saved intent before retrying.'),
    'packed dropped-response deadline',
    20_000,
  ).catch((error) => {
    throw new Error(`${String(error)}; rendered DOM: ${firstPanel.container.innerHTML}`)
  })
  if (!dropped.signal.aborted || !firstPanel.container.textContent.includes(dropped.request.requestId)) {
    throw new Error('packed dropped response did not abort at the deadline with its exact saved request visible')
  }

  const acceptedEvents = await firstHost.events()
  const acceptedFact = acceptedEvents.find(event => event.type === 'team/message/request-committed')
  if (acceptedFact === undefined) throw new Error('packed generated Remote accepted without a durable request fact')
  const acceptedRequest = dropped.request
  validateSubmissionFacts(acceptedEvents, acceptedRequest)
  requireValidatorRejection(
    acceptedEvents.filter(event => event !== acceptedFact),
    acceptedRequest,
    'a missing required request fact',
  )
  requireValidatorRejection(
    [...acceptedEvents, structuredClone(acceptedFact)],
    acceptedRequest,
    'duplicate request facts',
  )
  if (acceptedEvents.filter(event => event.type === 'team/message/request-committed').length !== 1
    || runtimeControl.deliverCalls.length !== 0 || runtimeControl.createCalls.length !== 1
    || runtimeControl.providerLoads !== 1) {
    throw new Error('packed double-click did not retain exactly one request before provider recovery')
  }
  const savedIntent = JSON.parse(sessionStorage.getItem(
    `dsh-agent-team-ultra.message-intent.v1:${encodeURIComponent(leadId)}`,
  ))
  if (savedIntent.version !== 1
    || savedIntent.request.requestId !== acceptedRequest.requestId
    || savedIntent.request.recipientId !== packedWorkerId
    || savedIntent.request.replyTo !== codexMessageId
    || savedIntent.request.text !== packedRequestText) {
    throw new Error(`packed dropped response did not retain the exact intent: ${JSON.stringify(savedIntent)}`)
  }

  const filters = { memberId: members.codex.id, direction: 'sent', delivery: 'delivered' }
  const beforeRestart = requireRemoteSuccess(await firstClient.childActions.listMessages(leadId, {
    limit: 1,
    filters,
  }), 'pre-restart packed UI list')
  const beforeDetail = requireRemoteSuccess(await firstClient.childActions.getMessage(leadId, {
    messageId: codexMessageId,
    committedCursor: beforeRestart.committedCursor,
  }), 'pre-restart packed UI detail')
  if (beforeDetail.content.parts[0]?.text !== 'Codex durable body') throw new Error('pre-restart detail body mismatch')

  await firstPanel.dispose()
  firstPanel = undefined
  await firstClient.dispose()
  firstClient = undefined
  await firstHost.dispose()
  firstHost = undefined

  secondHost = await startHost(true)
  const recoveredBeforeClient = await secondHost.events()
  const recoveredFact = validateSubmissionFacts(recoveredBeforeClient, acceptedRequest)
  if (recoveredBeforeClient.some(event => event.type === 'team/message/delivered'
    && event.data.messageId === recoveredFact.data.message.id)) {
    throw new Error('packed message fabricated delivery while its provider was unavailable')
  }
  secondClient = await startClient(secondHost)
  const afterRestart = requireRemoteSuccess(await secondClient.childActions.listMessages(leadId, {
    limit: 1,
    filters,
    cursor: beforeRestart.committedCursor,
  }), 'recovered packed UI list')
  if (afterRestart.items[0]?.id !== codexMessageId) throw new Error('recovered cursor returned a different message')
  const recoveredDetail = requireRemoteSuccess(await secondClient.childActions.getMessage(leadId, {
    messageId: codexMessageId,
    committedCursor: afterRestart.committedCursor,
  }), 'recovered packed UI detail')
  if (recoveredDetail.content.parts[0]?.text !== 'Codex durable body') throw new Error('recovered detail body mismatch')

  secondPanel = await secondClient.renderPanel()
  await openMessages(secondPanel)
  await waitUntil(
    () => secondPanel.container.textContent.includes('Submission result unknown. Review this saved intent before retrying.'),
    'recovered packed saved intent',
  )
  if (!secondPanel.container.textContent.includes(acceptedRequest.requestId)
    || (await secondHost.events()).filter(event => event.type === 'team/message/request-committed').length !== 1
    || runtimeControl.deliverCalls.length !== 0) {
    throw new Error('packed remount automatically resent or lost the accepted retry intent')
  }

  await secondHost.enableProvider()
  await waitUntil(() => runtimeControl.deliverCalls.length === 1, 'packed provider recovery delivery')
  const delivery = runtimeControl.deliverCalls[0]
  if (runtimeControl.providerLoads !== 2 || runtimeControl.resumeCalls.length !== 1
    || delivery.deliveryId !== recoveredFact.data.message.id
    || delivery.nativeHandle !== [...runtimeControl.runtimes.values()][0]?.nativeHandle
    || delivery.senderId !== leadId || delivery.senderName !== 'lead'
    || delivery.content[0]?.type !== 'text'
    || delivery.content[0]?.text !== `Team message ${delivery.deliveryId} in reply to ${codexMessageId} from lead:`
    || delivery.content[1]?.type !== 'text' || delivery.content[1]?.text !== packedRequestText) {
    throw new Error(`packed provider received the wrong recovered message: ${JSON.stringify(delivery)}`)
  }
  const beforeRelease = await secondHost.events()
  validateSubmissionFacts(beforeRelease, acceptedRequest)
  if (beforeRelease.some(event => event.type === 'team/message/delivered'
    && event.data.messageId === delivery.deliveryId)) {
    throw new Error('packed Team marked delivery before the provider barrier acknowledged it')
  }
  deliveryRelease.resolve(undefined)
  await waitUntil(async () => (await secondHost.events()).some(event => event.type === 'team/message/delivered'
    && event.data.messageId === delivery.deliveryId), 'packed persisted delivery acknowledgement')

  await click(button(secondPanel.container, 'Retry same request'))
  await waitUntil(() => secondPanel.container.textContent?.includes('Accepted and delivered.'), 'packed explicit replay result')
  const finalEvents = await secondHost.events()
  validateSubmissionFacts(finalEvents, acceptedRequest)
  if (finalEvents.filter(event => event.type === 'team/message/request-committed').length !== 1
    || finalEvents.filter(event => event.type === 'team/message/delivered'
      && event.data.messageId === delivery.deliveryId).length !== 1
    || runtimeControl.deliverCalls.length !== 1) {
    throw new Error('packed explicit replay created duplicate request or provider work')
  }
  const submittedPage = requireRemoteSuccess(await secondClient.childActions.listMessages(leadId, {
    limit: 100,
  }), 'packed submitted-message list')
  const submittedRow = submittedPage.items.find(item => item.id === delivery.deliveryId)
  if (submittedRow?.requestId !== acceptedRequest.requestId || submittedRow.replyTo !== codexMessageId
    || submittedRow.sender.id !== leadId || submittedRow.recipient.id !== packedWorkerId
    || submittedRow.delivery.stage !== 'delivered') {
    throw new Error(`packed submitted-message projection is incomplete: ${JSON.stringify(submittedRow)}`)
  }

  await filterCodex(secondPanel)
  await click(messageButtons(secondPanel.container)[0])
  await waitUntil(() => secondPanel.container.textContent.includes('Codex durable body'), 'recovered packed detail')
  if (!secondPanel.container.textContent.includes(codexMessageId)) throw new Error('recovered packed detail omitted message id')

  console.log('PASS packed Team owner panel shares authoritative task list, dependency graph, selection, details, controls, navigation, and filtering')
  console.log('PASS packed Team owner panel reads paged DSH/Codex/Claude messages through the generated Remote and survives Host recovery')
  console.log('PASS packed production renderer loses one committed Remote response, reaches its deadline, and preserves the exact retry intent across Host recovery')
  console.log('PASS packed Loader/AgentLoop/Team/JSONL boundary recovers one pending reply through the controlled provider without duplicate work')
  console.log('PASS packed durable-request validator rejects missing and duplicate required facts')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  deliveryRelease.resolve(undefined)
  await secondPanel?.dispose().catch(() => {})
  await secondClient?.dispose().catch(() => {})
  await secondHost?.dispose().catch(() => {})
  await firstPanel?.dispose().catch(() => {})
  await firstClient?.dispose().catch(() => {})
  await firstHost?.dispose().catch(() => {})
  globalThis.fetch = nativeFetch
  delete globalThis[controlledRuntimeKey]
  dom.window.close()
  rmSync(storageRoot, { recursive: true, force: true })
}
