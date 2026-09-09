/** Shipping Studio -> generated Client Remote -> authenticated transport -> installed Host. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import React, { createElement } from 'react'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'
import { act } from 'react-dom/test-utils'

/** The caller owns the installed Host and historical target; this probe owns only its Web/Client lifetime. */
export async function probePackedStudio({ ctx, installed, harnessRoot, lead, memberId, profileId, historicalTurns }) {
  assert.ok(historicalTurns?.length > 0, 'the predecessor must supply an original canonical work turn')
  const harness = path => import(pathToFileURL(join(harnessRoot, path, 'lib/index.js')).href)
  const [cordis, uiSlots, clientStore, connectionHost, remotesHost] = await Promise.all([
    harness('vendor/cordis'), harness('packages/client/ui-slots'), harness('packages/client/store'),
    harness('packages/client/connection'), harness('packages/api/remotes'),
  ])
  const routes = []
  const upgradeRoutes = []
  const credentials = new Map()
  const webFiber = ctx.plugin({
    apply(web) {
      web.provide('webServer', {
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
      web.provide('credentials', {
        readRecord(key) { return Promise.resolve(credentials.get(key)) },
        async modifyRecord(key, mutate) {
          const next = await mutate(credentials.get(key))
          if (next !== undefined) credentials.set(key, next)
          return next ?? credentials.get(key)
        },
      })
    },
  })
  const nativeFetch = globalThis.fetch
  const server = createServer((request, response) => {
    if ((request.url ?? '/').startsWith('/?')) {
      if (ctx.connection.authorizeIndex(request, response)) {
        response.writeHead(200)
        response.end('<body>Studio probe</body>')
      }
      return
    }
    void routes[0].handler(request, response)
  })
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const route = upgradeRoutes.find(candidate => candidate.path === path)
    if (route === undefined) socket.destroy()
    else route.handler(request, socket, head)
  })
  const client = new cordis.Context()
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const globals = new Map()
  const expose = (name, value) => {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  let unmount
  let ultraFiber
  try {
    await webFiber
    await webFiber.ctx.plugin({ inject: connectionHost.inject, apply: connectionHost.apply })
    await webFiber.ctx.plugin({ inject: remotesHost.inject, apply: remotesHost.apply })
    assert.deepEqual(routes.map(route => route.path), ['/api'])
    assert.deepEqual(upgradeRoutes.map(route => route.path), ['/api/remote.mux'])
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const origin = `http://127.0.0.1:${server.address().port}`
    const login = await nativeFetch(ctx.connection.authenticatedUrl(origin), { redirect: 'manual' })
    assert.equal(login.status, 303)
    const cookie = login.headers.get('set-cookie').split(';', 1)[0]
    dom.reconfigure({ url: origin })
    for (const name of ['window', 'document', 'location', 'HTMLElement', 'Event', 'MouseEvent', 'navigator', 'sessionStorage']) {
      expose(name, name === 'window' ? dom.window : dom.window[name])
    }
    expose('IS_REACT_ACT_ENVIRONMENT', true)
    expose('requestAnimationFrame', callback => dom.window.requestAnimationFrame(callback))
    expose('cancelAnimationFrame', handle => dom.window.cancelAnimationFrame(handle))
    const WebSocketBase = createRequire(join(harnessRoot, 'package.json'))('ws')
    class AuthenticatedWebSocket extends WebSocketBase {
      constructor(url, protocols) { super(url, protocols ?? [], { headers: { cookie } }) }
    }
    expose('WebSocket', AuthenticatedWebSocket)
    dom.window.WebSocket = AuthenticatedWebSocket
    expose('fetch', (input, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('cookie', cookie)
      return nativeFetch(input, { ...init, headers })
    })
    const handoffs = new Map()
    dom.window.__ModuleLoader__ = { load: handoff => { handoffs.set(handoff.id, handoff) } }
    const bundlePaths = [
      'packages/typert/registry', 'packages/client/connection', 'packages/api/gateway',
      'packages/api/remotes', 'packages/client/ui-renderer', 'packages/client/locale',
    ].map(path => join(harnessRoot, path, 'lib/client.js'))
    bundlePaths.push(installed.resolve('@deepseek-ai/dsh-experimental-client-ui-agent-team/client'),
      installed.resolve('@benz-ai-x/dsh-client-ui-agent-team-ultra/client'))
    for (const path of bundlePaths) new Function(readFileSync(path, 'utf8'))()
    const Primitive = props => createElement('span', props)
    const modules = {
      '@deepseek-ai/cordis': cordis,
      '@deepseek-ai/dsh-client-ui-primitives': new Proxy({}, { get: () => Primitive }),
      '@deepseek-ai/dsh-client-ui-slots': uiSlots,
      '@deepseek-ai/dsh-client-store': clientStore,
      react: React, 'react-dom': ReactDom, 'react-dom/client': ReactDomClient, 'react/jsx-runtime': jsxRuntime,
    }
    const instantiate = id => {
      const handoff = handoffs.get(id)
      assert.ok(handoff, `missing shipping Client bundle ${id}`)
      const value = handoff.factory(specifier => {
        assert.ok(specifier in modules, `${id}: unexpected Client external ${specifier}`)
        return modules[specifier]
      })
      modules[`${id}/client`] = value
      return value
    }
    for (const id of ['dsh-typert-registry', 'dsh-client-connection', 'dsh-api-gateway', 'dsh-api-remotes']) {
      const plugin = instantiate(`@deepseek-ai/${id}`)
      await client.plugin({ inject: plugin.inject, apply: plugin.apply })
    }
    client.provide('sessions', {
      list: { getSnapshot: () => ({ current: lead.agent.id }) },
      binding: () => undefined,
      refreshSubagents: () => Promise.resolve(),
      openSubagent() {},
    })
    const localePlugin = instantiate('@deepseek-ai/dsh-client-locale')
    const locale = new localePlugin.LocaleRuntime(client)
    client.provide('locale', locale)
    const renderer = instantiate('@deepseek-ai/dsh-client-ui-renderer')
    await client.plugin({ inject: renderer.inject, apply: renderer.apply })
    client.slots.installLocale(locale)
    locale.setLocale('en')
    const binding = { key: lead.agent.id, ctx: client, hooks: {}, keyedHooks: {}, props: { sessionId: lead.agent.id } }
    client.slots.installScope('session', {
      current: { getSnapshot: () => binding, subscribe: () => () => {} },
      resolve: key => key === binding.key ? binding : undefined,
      renderArea: (_binding, { children }) => children,
    })
    client.slots.register({
      name: 'root', children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
    }, ({ renderSlot, SessionProvider }) => createElement(SessionProvider, null,
      renderSlot('conversation.session.header.actions', {})))
    const team = instantiate('@deepseek-ai/dsh-experimental-client-ui-agent-team')
    await client.plugin({ inject: team.inject, apply: team.apply })
    const ultra = instantiate('@benz-ai-x/dsh-client-ui-agent-team-ultra')
    ultraFiber = client.plugin({ inject: ultra.inject, apply: ultra.apply })
    await ultraFiber
    const container = document.createElement('div')
    document.body.append(container)
    await act(async () => { unmount = client.uiRenderer.mount(container) })
    await click(await until(() => [...container.querySelectorAll('button')]
      .find(button => button.textContent.includes('Digital employees')), 'shipping Studio entry'))
    const dialog = await until(() => container.querySelector('[role="dialog"][aria-label="Digital Employee Studio"]'), 'Studio dialog')
    await until(() => dialog.textContent.includes(profileId), 'historical Profile in shipping Studio')
    const rows = await until(() => {
      const found = [...dialog.querySelectorAll('[id$="-runs"] > button')]
      return found.length > 0 && found
    }, 'historical Runs in shipping Studio')
    const displayedTurns = new Set()
    for (const row of rows) {
      await click(row)
      const link = await until(() => dialog.querySelector('a[aria-label="Canonical source"]'), 'generated Remote Run detail')
      await until(() => dialog.querySelector('main time') || dialog.querySelector('main').textContent
        .includes('No normalized evidence is available for this Run.'), 'canonical Run detail from Remote')
      const turn = link.textContent.replace('Canonical source: ', '')
      displayedTurns.add(turn)
      assert.ok(dialog.querySelector('main').textContent.includes('Run evidence'))
      assert.ok(dialog.querySelector('main').textContent.includes('Evidence completeness:'))
      assert.ok([...dialog.querySelectorAll('main time')].every(time => time.textContent !== new Date(0).toLocaleString()),
        'unknown historical times must not appear as a fabricated epoch date')
      if (historicalTurns.includes(turn)) assert.ok(dialog.querySelector('main').textContent
        .includes('Evidence completeness: incomplete'), 'the original fixture cannot reconstruct complete native evidence')
    }
    assert.equal(displayedTurns.size, rows.length, 'one canonical work turn must not create duplicate Run rows')
    for (const turn of historicalTurns) assert.ok(displayedTurns.has(turn), `Studio lost predecessor work turn ${turn}`)
    assert.ok(dialog.querySelector(`a[href="#agent-team/messages/${encodeURIComponent(memberId)}"]`),
      'Studio preserves original member identity')
    console.log('PASS shipping Studio renders restored Profile, original member and Run evidence through authenticated generated Remote')
    await probeV2Usage({ ctx, client, harness, lead, dialog })
    await act(async () => { await lead.dispose() })
    const refused = await client.remote.digitalEmployees.view(binding.key)
    assert.equal(refused.ok, false)
    assert.equal(refused.error.code, 'gateway/lookup-not-found')
    await click(dialog.querySelector('button[aria-label="Refresh"]'))
    await until(() => [...dialog.querySelectorAll('[role="alert"]')]
      .some(alert => alert.textContent.includes('gateway/lookup-not-found')), 'retired Lead failure bubbling into Studio')
    assert.doesNotMatch(dialog.querySelector('main').textContent, /PRIVATE_/)
    console.log('PASS shipping Studio exposes the real retired-Lead Remote error without reporting success or raw model content')
  } finally {
    try {
      if (unmount) await act(async () => { unmount() })
      if (ultraFiber) {
        await ultraFiber.dispose()
        assert.equal(client.get('remote.digitalEmployees'), undefined)
        assert.ok(!client.slots.entries('conversation.session.header.actions')
          .some(entry => entry.options.id === 'agent-team-ultra'))
      }
    } finally {
      await client.fiber.dispose()
      await webFiber.dispose()
      if (server.listening) await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()))
      dom.window.close()
      for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    }
  }
}

/** Only the external LLM stream is controlled; the Agent loop writes real v2 settlements. */
async function probeV2Usage({ ctx, client, harness, lead, dialog }) {
  const [{ LlmAdapter }, { default: Approval }, { default: SandboxPolicy }, SubagentSpawn] = await Promise.all([
    harness('packages/llm/llm'), harness('packages/interaction/user-approval'),
    harness('packages/sandbox/sandbox-policy'), harness('packages/subagent/subagent-spawn-in-process'),
  ])
  const fibers = [ctx.plugin(Approval), ctx.plugin(SandboxPolicy)]
  await Promise.all(fibers)
  fibers.push(ctx.plugin(SubagentSpawn, { providerName: 'studio-spawn' }))
  await fibers.at(-1)
  class UsageModel extends LlmAdapter {
    attempts = 0
    terminal = true
    total = true
    providerInfo(provider) { return { id: provider, name: 'Studio usage probe' } }
    async listModels(provider) { return [{ provider, id: 'reviewer', name: 'Reviewer' }] }
    async resolveModel(provider, model) { return { provider, id: model, name: 'Reviewer' } }
    async *stream() {
      this.attempts += 1
      if (this.attempts === 1) {
        for (const usage of [
          { inputTokens: 8, outputTokens: 1, totalTokens: 9 },
          { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
        ]) yield { type: 'usage', usage }
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'PRIVATE_RETRY' } } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'PRIVATE_RESPONSE' } }
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2, ...(this.total ? { totalTokens: 7 } : {}) } }
      if (this.terminal) yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const releaseRetry = ctx.on('agent/request-error', async ({ provider }) => provider.startsWith('studio-usage-')
    ? { kind: 'retry' } : undefined)
  try {
    for (const [suffix, terminal, total] of [['complete', true, true], ['partial', false, false]]) {
      const provider = `studio-usage-${suffix}`
      const adapter = new UsageModel()
      adapter.terminal = terminal
      adapter.total = total
      const releaseModel = ctx.llm.registerAdapter([provider], adapter)
      try {
        const saved = await actResult(() => client.remote.digitalEmployees.save(lead.agent.id, {
          expectedHeadRevision: null, runtimeTarget: { kind: 'dsh-model', provider, model: 'reviewer' },
          profile: {
            id: provider, employeeName: provider, displayName: provider, description: 'Inspect reported usage.',
            continuationProvider: 'studio-spawn', contextMode: 'fresh', persona: 'Review carefully.', mission: 'Report findings.',
            toolPolicy: { mode: 'inherit', names: [] }, context: [], memory: [], hooks: [],
          },
        }))
        assert.equal(saved.ok && saved.value.ok, true, JSON.stringify(saved))
        const active = await actResult(() => client.remote.digitalEmployees.activate(lead.agent.id, {
          profileId: provider, revision: 1, expectedHeadRevision: 1,
        }))
        assert.equal(active.ok && active.value.ok, true, JSON.stringify(active))
        const launched = await actResult(() => client.remote.digitalEmployees.spawn(lead.agent.id, {
          profileId: provider, launchRequestId: suffix === 'complete'
            ? '41414141-4141-4141-8141-414141414141' : '42424242-4242-4242-8242-424242424242',
          assignment: 'PRIVATE_INPUT',
        }))
        assert.equal(launched.ok && launched.value.ok, true, JSON.stringify(launched))
        const memberId = launched.value.value.memberId
        assert.ok(memberId)
        await until(() => adapter.attempts === 2 && ctx.agents.get(memberId) === undefined, 'two attempts in one settled v2 turn')
        await click(dialog.querySelector('button[aria-label="Refresh"]'))
        const rows = await until(() => {
          const found = [...dialog.querySelectorAll('[id$="-runs"] > button')]
            .filter(row => row.querySelector('strong')?.textContent === provider)
          return found.length > 0 && found
        }, 'one v2 Run in shipping Studio')
        assert.equal(rows.length, 1, 'a retried provider request is not another accepted Run')
        await click(rows[0])
        await until(() => dialog.querySelector('main time'), 'v2 Run timeline through generated Remote')
        const text = dialog.querySelector('main').textContent
        assert.ok(text.includes(`Evidence completeness: ${terminal ? 'complete' : 'incomplete'}`), text)
        const usage = [...dialog.querySelectorAll('main strong')]
          .find(label => label.textContent === 'Reported usage (input / output / total):')?.parentElement.textContent
        assert.equal(usage, `Reported usage (input / output / total): 15 / 6${total ? ' / 21' : ''}`)
        assert.doesNotMatch(text, /PRIVATE_/)
        assert.ok(dialog.querySelector(`a[href="/sessions/${encodeURIComponent(memberId)}?turn=1"]`))
      } finally { releaseModel() }
    }
    console.log('PASS shipping Studio shows one v2 Run per work turn, retry usage 14 + 7 = 21, missing totals and missing terminal as incomplete')
  } finally {
    releaseRetry()
    for (const fiber of fibers.reverse()) await fiber.dispose()
  }
}

async function until(read, label) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = await read()
    if (value) return value
    assert.ok(Date.now() < deadline, `${label} did not become visible`)
    await act(async () => { await new Promise(resolveWait => setTimeout(resolveWait, 10)) })
  }
}

async function click(element) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

async function actResult(action) {
  let value
  await act(async () => { value = await action() })
  return value
}
