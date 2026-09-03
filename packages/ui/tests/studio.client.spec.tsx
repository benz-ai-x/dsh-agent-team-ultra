// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DigitalEmployeeEvalRunSummary,
  DigitalEmployeeEvalSetCatalogEntry,
  DigitalEmployeeProfile,
  DigitalEmployeeProfileCatalogEntry,
  DigitalEmployeePromotionGate,
  DigitalEmployeeProfileRevision,
  DigitalEmployeeRuntimeCatalog,
  DigitalEmployeeRuntimeTarget,
  DigitalEmployeeStudioView,
} from '@deepseek-ai/dsh-agent-team-ultra/client'
import { DigitalEmployeeStudio, type DigitalEmployeeStudioProps } from '../src/client/Studio.tsx'
import { en, type UltraKey } from '../src/client/locales.ts'

function profile(displayName = 'Reviewer One', revision = 1): DigitalEmployeeProfile {
  return {
    id: 'reviewer',
    employeeName: 'reviewer',
    displayName,
    description: 'Reviews code.',
    continuationProvider: 'spawn',
    contextMode: 'fresh',
    persona: 'Be precise.',
    mission: 'Find defects.',
    toolPolicy: { mode: 'allow', names: ['read'] },
    context: [],
    memory: [],
    hooks: [],
    revision,
    createdAt: 1,
    updatedAt: revision,
  }
}

function immutableRevision(
  profile: DigitalEmployeeProfile,
  runtimeTarget: DigitalEmployeeRuntimeTarget = {
    kind: 'dsh-model', provider: 'test-provider', model: 'test-model',
  },
): DigitalEmployeeProfileRevision {
  const { revision, createdAt, updatedAt, ...draft } = profile
  return {
    schemaVersion: 1,
    profileId: profile.id,
    revision,
    profile: draft,
    runtimeTarget,
    requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission', 'tool-policy'] },
    fingerprint: `${String(revision).padStart(64, '0')}`,
    createdAt,
    updatedAt,
  }
}

function catalog(
  latestProfile: DigitalEmployeeProfile,
  options: {
    readonly headRevision?: number
    readonly activeRevision?: number | null
    readonly archivedAt?: number
    readonly history?: readonly DigitalEmployeeProfile[]
    readonly runtimeTarget?: DigitalEmployeeRuntimeTarget
    readonly promotionGate?: DigitalEmployeePromotionGate
  } = {},
): DigitalEmployeeProfileCatalogEntry {
  const latest = immutableRevision(latestProfile, options.runtimeTarget)
  const activeRevision = options.activeRevision === undefined ? latest.revision : options.activeRevision
  const history = (options.history ?? [latestProfile]).map(immutableRevision)
  return {
    head: {
      schemaVersion: 1,
      profileId: latest.profileId,
      headRevision: options.headRevision ?? latest.revision,
      latestRevision: latest.revision,
      ...(activeRevision === null ? {} : { activeRevision }),
      historyStartsAtRevision: Math.min(...history.map(revision => revision.revision)),
      ...(options.archivedAt === undefined ? {} : { archivedAt: options.archivedAt }),
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
    },
    latest,
    history: history.map(revision => ({
      revision: revision.revision,
      fingerprint: revision.fingerprint,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    })),
    historyTruncated: false,
    promotionGate: options.promotionGate ?? { status: 'not-required' },
  }
}

function runtimeCatalog(): DigitalEmployeeRuntimeCatalog {
  return {
    generation: 1,
    backends: [
      {
        routingId: 'dsh-model/test-provider/test-model',
        family: 'dsh-model',
        availability: 'available',
        provider: 'test-provider',
        providerDisplayName: 'Test Provider',
        model: 'test-model',
        displayName: 'Test Model',
        contextModes: ['fresh', 'fork'],
        profileCapabilities: ['persona', 'mission', 'context', 'memory', 'tool-policy', 'hooks'],
        runtimeCapabilities: [],
        reasoning: {
          efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
          defaultEffort: 'low',
        },
      },
      {
        routingId: 'external-agent/native-reviewer',
        family: 'external-agent',
        availability: 'available',
        provider: 'native-reviewer',
        displayName: 'Native Reviewer',
        contextModes: ['fresh'],
        profileCapabilities: ['persona', 'mission'],
        runtimeCapabilities: ['evaluation', 'evidence'],
      },
      {
        routingId: 'dsh-model/retired-provider/retired-model',
        family: 'dsh-model',
        availability: 'unavailable',
        provider: 'retired-provider',
        providerDisplayName: 'Retired Provider',
        model: 'retired-model',
        displayName: 'Retired Model',
        contextModes: [],
        profileCapabilities: [],
        runtimeCapabilities: [],
        diagnostic: 'Historical route is missing.',
      },
      {
        routingId: 'external-agent/codex',
        family: 'external-agent',
        availability: 'unsupported',
        provider: 'codex',
        displayName: 'Codex',
        contextModes: [],
        profileCapabilities: [],
        runtimeCapabilities: [],
        diagnostic: 'One-shot only.',
      },
    ],
  }
}

function view(profiles: readonly DigitalEmployeeProfile[] = []): DigitalEmployeeStudioView {
  return {
    profiles: profiles.map(profile => catalog(profile)),
    runtimeCatalog: runtimeCatalog(),
    tools: [{ name: 'read', description: 'Read files' }],
    instances: [],
    runs: [],
    evalSets: [],
    evalRuns: [],
  }
}

function catalogView(profiles: readonly DigitalEmployeeProfileCatalogEntry[]): DigitalEmployeeStudioView {
  return {
    profiles,
    runtimeCatalog: runtimeCatalog(),
    tools: [{ name: 'read', description: 'Read files' }],
    instances: [],
    runs: [],
    evalSets: [],
    evalRuns: [],
  }
}

function saved(profile: DigitalEmployeeProfile, headRevision = profile.revision) {
  const entry = catalog(profile, { headRevision })
  return { unchanged: false, head: entry.head, revision: entry.latest }
}

function evalSetCatalog(): DigitalEmployeeEvalSetCatalogEntry {
  const evalSet = {
    id: 'reviewer-smoke',
    profileId: 'reviewer' as never,
    displayName: 'Reviewer smoke',
    toolAllowlist: ['read'],
    resourceCeilings: { maxSteps: 3, maxOutputTokens: 512, maxElapsedMs: 10_000 },
    passPolicy: { kind: 'all' as const },
    cases: [{
      id: 'summarize',
      title: 'Summarize fixture',
      input: 'Summarize the fixture.',
      fixtures: [{ id: 'readme', content: 'A bounded fixture.' }],
      assertions: {
        acceptedTerminals: ['completed' as const],
        requiredTools: ['read'],
        forbiddenTools: [],
        requiredOutputSubstrings: ['summary'],
        forbiddenOutputSubstrings: ['secret'],
      },
    }],
  }
  return {
    head: {
      schemaVersion: 1,
      evalSetId: evalSet.id,
      profileId: evalSet.profileId,
      headRevision: 1,
      latestRevision: 1,
      createdAt: 10,
      updatedAt: 10,
    },
    latest: {
      schemaVersion: 1,
      evalSetId: evalSet.id,
      profileId: evalSet.profileId,
      revision: 1,
      evalSet,
      fingerprint: 'e'.repeat(64),
      createdAt: 10,
      updatedAt: 10,
    },
    history: [{ revision: 1, fingerprint: 'e'.repeat(64), createdAt: 10, updatedAt: 10 }],
    historyTruncated: false,
  }
}

function evalRun(
  evalRunId: string,
  status: DigitalEmployeeEvalRunSummary['status'],
  passedCases: number,
): DigitalEmployeeEvalRunSummary {
  return {
    schemaVersion: 1,
    evalRunId: evalRunId as never,
    requestFingerprint: evalRunId.padEnd(64, 'a').slice(0, 64),
    teamId: 'session-a',
    profileId: 'reviewer' as never,
    profileRevision: 2,
    profileFingerprint: 'p'.repeat(64),
    runtimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
    capabilityGeneration: 1,
    evalSetId: 'reviewer-smoke',
    evalSetRevision: 1,
    evalSetFingerprint: 'e'.repeat(64),
    assertionSchemaVersion: 1,
    environmentFingerprint: 'v'.repeat(64),
    effectiveToolAllowlist: ['read'],
    status,
    passedCases,
    totalCases: 1,
    startedAt: 100,
    updatedAt: 110,
    ...(status === 'running' ? {} : { endedAt: 110 }),
  }
}

function props(overrides: Partial<DigitalEmployeeStudioProps> = {}): DigitalEmployeeStudioProps {
  return {
    sessionId: 'session-a' as never,
    load: vi.fn(async () => ({ ok: true, value: view() })),
    watch: vi.fn(() => ({
      start: vi.fn(),
      restart: vi.fn(),
      dispose: vi.fn(async () => undefined),
    })),
    save: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-invalid', message: 'invalid' } } })),
    revision: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'revision-not-found', message: 'missing' } } })),
    activate: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    rollback: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    archive: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    restore: vi.fn(async () => ({ ok: true, value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } } })),
    spawn: vi.fn(async () => ({
      ok: true,
      value: {
        ok: true,
        value: {
          teamId: 'session-a',
          memberName: 'reviewer',
          profileId: 'reviewer',
          profileRevision: 1,
          runtimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
          resolvedRuntimeTarget: { kind: 'dsh-model', provider: 'test-provider', model: 'test-model' },
          requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'] },
          provisioningPhase: 'active',
          runtimeAvailability: 'available',
          runtimePresence: 'idle',
        },
      },
    })),
    run: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'run-not-found', message: 'missing' } },
    })),
    saveEvalSet: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'eval-invalid', message: 'invalid' } },
    })),
    setEvalGate: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'profile-conflict', message: 'stale' } },
    })),
    startEvalRun: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'eval-environment-unavailable', message: 'unavailable' } },
    })),
    cancelEvalRun: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'eval-not-found', message: 'missing' } },
    })),
    evalRun: vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'eval-not-found', message: 'missing' } },
    })),
    t: ((key: UltraKey) => en[key]) as DigitalEmployeeStudioProps['t'],
    ...overrides,
  } as DigitalEmployeeStudioProps
}

const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function dispatchPointer(
  target: Element | Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: MouseEventInit & { pointerId: number },
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId })
  fireEvent(target, event)
}

afterEach(() => {
  setViewport(originalViewport.width, originalViewport.height)
  document.body.innerHTML = ''
  for (const node of document.querySelectorAll('style')) node.remove()
})

describe('Digital Employee Studio', () => {
  it('distinguishes the opening load from a complete empty snapshot', async () => {
    let resolveLoad: ((result: { readonly ok: true; readonly value: DigitalEmployeeStudioView }) => void) | undefined
    const load = vi.fn(() => new Promise(resolve => { resolveLoad = resolve }))
    render(<DigitalEmployeeStudio {...props({ load })} />)

    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(screen.getByText(en.loading)).toBeTruthy()
    await act(async () => { resolveLoad?.({ ok: true, value: view() }) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
    expect(screen.queryByText(en.loading)).toBeNull()
  })

  it('keeps the last complete snapshot stale across carrier loss and replaces it after reconnect', async () => {
    let resolveLoad: ((result: { readonly ok: true; readonly value: DigitalEmployeeStudioView }) => void) | undefined
    let sink: {
      replace(value: DigitalEmployeeStudioView): void
      stale(): void
      failed(error: unknown): void
    } | undefined
    const dispose = vi.fn(async () => undefined)
    const watch = vi.fn((_sessionId, nextSink) => {
      sink = nextSink
      return { start: vi.fn(), restart: vi.fn(), dispose }
    })
    const { unmount } = render(<DigitalEmployeeStudio {...props({
      watch: watch as never,
      load: vi.fn(() => new Promise(resolve => { resolveLoad = resolve })),
    })} />)

    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await waitFor(() => { expect(watch).toHaveBeenCalledWith('session-a', expect.any(Object)) })

    act(() => { sink!.replace(view([profile()])) })
    expect(await screen.findByText('Reviewer One')).toBeTruthy()

    act(() => { sink!.stale() })
    expect(screen.getByText(en.streamStale)).toBeTruthy()
    expect(screen.getByText('Reviewer One')).toBeTruthy()

    act(() => { sink!.replace(view([profile('Reviewer Two', 2)])) })
    expect(await screen.findByText('Reviewer Two')).toBeTruthy()
    expect(screen.queryByText(en.streamStale)).toBeNull()

    await act(async () => {
      resolveLoad?.({ ok: true, value: view([profile('Late unary snapshot', 1)]) })
    })
    expect(screen.queryByText('Late unary snapshot')).toBeNull()
    expect(screen.getByText('Reviewer Two')).toBeTruthy()

    act(() => { sink!.failed(new Error('socket rejected')) })
    expect(screen.getByText(en.streamDisconnected)).toBeTruthy()
    expect(screen.getByText('Reviewer Two')).toBeTruthy()

    unmount()
    await waitFor(() => { expect(dispose).toHaveBeenCalledOnce() })
  })

  it('filters Runs and lazily shows a redacted timeline for both runtime families', async () => {
    const dshRun = {
      schemaVersion: 1 as const,
      runId: 'run-dsh' as never,
      source: 'dsh-session' as const,
      canonicalTurnId: 'child:1',
      canonicalSource: { kind: 'dsh-session' as const, sessionId: 'child', turn: 1 },
      teamId: 'session-a',
      owner: { kind: 'team-member' as const, memberId: 'child', memberName: 'reviewer' },
      profileId: 'reviewer',
      profileRevision: 1,
      profileFingerprint: 'a'.repeat(64),
      selectedRuntimeTarget: { kind: 'dsh-model' as const, provider: 'test-provider', model: 'test-model' },
      actualRuntimeTarget: { kind: 'dsh-model' as const, provider: 'test-provider', model: 'test-model' },
      capabilityGeneration: 1,
      terminal: 'failed' as const,
      startedAt: 100,
      endedAt: 110,
      completeness: {
        status: 'complete' as const,
        redactions: ['content', 'tool-arguments', 'tool-results', 'raw-payloads'] as const,
      },
    }
    const externalRun = {
      ...dshRun,
      runId: 'run-external' as never,
      source: 'external-native' as const,
      canonicalTurnId: 'native-turn-7',
      canonicalSource: {
        kind: 'external-native' as const,
        provider: 'native-reviewer',
        nativeHandle: 'native-session' as never,
        nativeTurnId: 'native-turn-7',
      },
      selectedRuntimeTarget: { kind: 'external-agent' as const, provider: 'native-reviewer' },
      actualRuntimeTarget: { kind: 'external-agent' as const, provider: 'native-reviewer' },
      terminal: 'completed' as const,
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      startedAt: 200,
      endedAt: 220,
    }
    const evaluationRun = {
      ...dshRun,
      runId: 'run-evaluation' as never,
      canonicalTurnId: 'evaluation-child:1',
      canonicalSource: { kind: 'dsh-session' as const, sessionId: 'evaluation-child', turn: 1 },
      owner: { kind: 'evaluation-worker' as const, evalRunId: 'eval-run-4', caseId: 'case-2' },
    }
    const loaded = { ...view([profile()]), runs: [externalRun, evaluationRun, dshRun] }
    const run = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        value: {
          run: externalRun,
          timeline: [
            { kind: 'tool' as const, timestamp: 210, name: 'read', outcome: 'completed' as const },
            {
              kind: 'approval' as const,
              timestamp: 215,
              name: 'write_file',
              outcome: 'asked' as const,
              callId: 'call-7',
              approvalId: 'approval-7',
              policyId: 'confirm-write',
            },
            { kind: 'turn' as const, timestamp: 220, outcome: 'completed' as const },
          ],
          timelineTruncated: false,
        },
      },
    }))
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: loaded })),
      run,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    await screen.findByRole('heading', { name: 'Runs' })
    expect(screen.getByRole('button', {
      name: /Evaluation eval-run-4 \/ case-2.*Failed.*DSH Session/i,
    })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Run source'), { target: { value: 'external-native' } })
    expect(screen.queryByRole('button', { name: /failed.*DSH Session/i })).toBeNull()
    const externalButton = screen.getByRole('button', { name: /reviewer.*Completed.*External native session/i })
    fireEvent.click(externalButton)

    await waitFor(() => { expect(run).toHaveBeenCalledOnce() })
    expect(run.mock.calls[0]?.[0]).toBe('session-a')
    expect(run.mock.calls[0]?.[1]).toBe('run-external')
    expect(await screen.findByRole('heading', { name: 'Run evidence' })).toBeTruthy()
    expect(screen.getByText(/Selected route:/).parentElement?.textContent).toContain('native-reviewer')
    expect(screen.getByText(/content, tool-arguments, tool-results, raw-payloads/)).toBeTruthy()
    expect(screen.getByText(/tool · read/)).toBeTruthy()
    expect(screen.getByText('Approval requested')).toBeTruthy()
    expect(screen.getByText(/Call ID: call-7/)).toBeTruthy()
    expect(screen.getByText(/Approval ID: approval-7/)).toBeTruthy()
    expect(screen.getByText(/Policy ID: confirm-write/)).toBeTruthy()
    const source = screen.getByRole('link', { name: 'Canonical source' }) as HTMLAnchorElement
    expect(source.getAttribute('href')).toContain('native-reviewer/native-turn-7')
  })

  it('groups stable Runtime Backends, exposes capabilities, and saves the selected target separately', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: { code: 'profile-invalid' as const, message: 'stop after capture' } },
    }))
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: view([profile()]) })),
      save,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))

    const backend = screen.getByLabelText('Runtime backend') as HTMLSelectElement
    expect([...backend.querySelectorAll('optgroup')].map(group => group.label)).toEqual([
      'DSH Models',
      'Local Agents',
    ])
    expect((within(backend).getByRole('option', { name: /Test Provider · Test Model/ }) as HTMLOptionElement).disabled).toBe(false)
    expect((within(backend).getByRole('option', { name: /Retired Provider · Retired Model.*unavailable/i }) as HTMLOptionElement).disabled).toBe(true)
    expect((within(backend).getByRole('option', { name: /Codex.*unsupported/i }) as HTMLOptionElement).disabled).toBe(true)
    expect((screen.getByLabelText('Reasoning effort') as HTMLSelectElement).value).toBe('')
    expect(within(screen.getByLabelText('Reasoning effort')).getByRole('option', { name: /High/ })).toBeTruthy()

    fireEvent.change(backend, { target: { value: 'external-agent/native-reviewer' } })
    expect(screen.getByText(/Available.*Fresh/)).toBeTruthy()
    expect(screen.getByText(/Persona.*Mission/)).toBeTruthy()
    expect(screen.getByText(/Runtime capabilities: Evaluation.*Evidence/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      profile: { continuationProvider: 'spawn' },
      runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
    })
  })

  it('allows saving edits that retain the latest unavailable historical route', async () => {
    const historical = catalog(profile(), {
      headRevision: 4,
      runtimeTarget: { kind: 'dsh-model', provider: 'retired-provider', model: 'retired-model' },
    })
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: { code: 'runtime-target-unavailable' as const, message: 'captured' } },
    }))
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: catalogView([historical]) })),
      save,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated while route is offline.' } })

    const saveButton = screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)
    fireEvent.click(saveButton)
    await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      expectedHeadRevision: 4,
      runtimeTarget: { kind: 'dsh-model', provider: 'retired-provider', model: 'retired-model' },
    })
  })

  it('shows selected and actual runtime routes for a launched instance', async () => {
    const loaded = view([profile()])
    const withInstance: DigitalEmployeeStudioView = {
      ...loaded,
      instances: [{
        teamId: 'session-a',
        memberName: 'reviewer',
        memberId: 'child',
        profileId: 'reviewer',
        profileRevision: 1,
        runtimeTarget: {
          kind: 'dsh-model', provider: 'test-provider', model: 'test-model', reasoningEffort: 'high',
        },
        resolvedRuntimeTarget: {
          kind: 'dsh-model', provider: 'test-provider', model: 'test-model', reasoningEffort: 'high',
        },
        requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'] },
        provisioningPhase: 'active',
        runtimeAvailability: 'available',
        runtimePresence: 'idle',
      }],
    }
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: withInstance })),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))

    expect(await screen.findByText('Selected route: test-provider/test-model · high')).toBeDefined()
    expect(screen.getByText('Actual route: test-provider/test-model · high')).toBeDefined()
    expect(screen.getByText('Provisioning: Active · r1')).toBeDefined()
    expect(screen.getByText('Runtime availability: Available')).toBeDefined()
    expect(screen.getByText('Runtime presence: Idle')).toBeDefined()
  })

  it('shows the opaque native handle for an external instance', async () => {
    const loaded = view([profile()])
    const withInstance: DigitalEmployeeStudioView = {
      ...loaded,
      instances: [{
        teamId: 'session-a',
        memberName: 'native-reviewer',
        memberId: 'external-member',
        profileId: 'reviewer',
        profileRevision: 1,
        runtimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
        resolvedRuntimeTarget: { kind: 'external-agent', provider: 'native-reviewer' },
        nativeRuntimeHandle: 'native-session-7' as never,
        requiredCapabilities: { contextMode: 'fresh', profileCapabilities: ['persona', 'mission'] },
        provisioningPhase: 'active',
        runtimeAvailability: 'available',
        runtimePresence: 'idle',
      }],
    }
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: withInstance })),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))

    expect(await screen.findByText('Native runtime handle: native-session-7')).toBeDefined()
  })

  it('reuses one launch request through transport and pending retries, then fences a new intent', async () => {
    const launched = {
      teamId: 'session-a',
      memberName: 'reviewer',
      profileId: 'reviewer',
      profileRevision: 1,
      runtimeTarget: { kind: 'dsh-model' as const, provider: 'test-provider', model: 'test-model' },
      resolvedRuntimeTarget: { kind: 'dsh-model' as const, provider: 'test-provider', model: 'test-model' },
      requiredCapabilities: { contextMode: 'fresh' as const, profileCapabilities: ['persona', 'mission'] as const },
      runtimeAvailability: 'available' as const,
      runtimePresence: 'idle' as const,
    }
    const spawn = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'disconnected', message: 'offline' } })
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: true, value: { ...launched, provisioningPhase: 'pending' as const } },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: true, value: { ...launched, provisioningPhase: 'active' as const } },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: false, error: { code: 'profile-not-active', message: 'inactive' } },
      })
      .mockResolvedValueOnce({ ok: false, error: { code: 'disconnected', message: 'offline again' } })
    render(<DigitalEmployeeStudio {...props({
      load: vi.fn(async () => ({ ok: true, value: view([profile()]) })),
      spawn,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    const launch = screen.getByRole('button', { name: 'Launch employee' })

    fireEvent.click(launch)
    fireEvent.click(launch)
    await waitFor(() => { expect(spawn).toHaveBeenCalledTimes(1) })
    fireEvent.click(launch)
    await waitFor(() => { expect(spawn).toHaveBeenCalledTimes(2) })
    fireEvent.click(launch)
    await waitFor(() => { expect(spawn).toHaveBeenCalledTimes(3) })

    const firstRequest = spawn.mock.calls[0]?.[1]
    expect(firstRequest).toMatchObject({
      profileId: 'reviewer',
      launchRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    })
    expect(spawn.mock.calls[1]?.[1]).toEqual(firstRequest)
    expect(spawn.mock.calls[2]?.[1]).toEqual(firstRequest)

    fireEvent.click(launch)
    await waitFor(() => { expect(spawn).toHaveBeenCalledTimes(4) })
    expect(spawn.mock.calls[3]?.[1].launchRequestId).not.toBe(firstRequest.launchRequestId)
    const rejectedRequestId = spawn.mock.calls[3]?.[1].launchRequestId

    fireEvent.click(launch)
    await waitFor(() => { expect(spawn).toHaveBeenCalledTimes(5) })
    expect(spawn.mock.calls[4]?.[1].launchRequestId).not.toBe(rejectedRequestId)
  })

  it('fences duplicate saves before React can render the pending state', async () => {
    let settle: ((value: Awaited<ReturnType<DigitalEmployeeStudioProps['save']>>) => void) | undefined
    const save = vi.fn(() => new Promise<Awaited<ReturnType<DigitalEmployeeStudioProps['save']>>>(resolveSave => {
      settle = resolveSave
    }))
    render(<DigitalEmployeeStudio {...props({ save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    await screen.findByRole('button', { name: /New profile/ })
    fireEvent.click(screen.getByRole('button', { name: /New profile/ }))
    const saveButton = screen.getByRole('button', { name: 'Save profile' })
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)
    expect(save).toHaveBeenCalledOnce()
    await act(async () => {
      settle?.({
        ok: true,
        value: {
          ok: true,
          value: saved(profile('New Employee')),
        },
      })
    })
  })

  it('replaces the whole view on refresh and discards a stale entity draft on Session change', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view([profile('Reviewer One', 1)]) })
      .mockResolvedValueOnce({ ok: true, value: view([profile('Reviewer Two', 2)]) })
    const initial = props({ load })
    const rendered = render(<DigitalEmployeeStudio {...initial} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Reviewer One')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Reviewer Two')
    })
    expect(screen.getByRole('button', { name: /Reviewer Two/ }).textContent).toContain('Revision 2')

    rendered.rerender(<DigitalEmployeeStudio {...props({ sessionId: 'session-b' as never, load })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps transport failure distinct from a domain rejection', async () => {
    const transport = vi.fn(async () => ({
      ok: false,
      error: { code: 'disconnected', message: 'offline' },
    } as const))
    const rendered = render(<DigitalEmployeeStudio {...props({ load: transport })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('offline (disconnected)')

    rendered.unmount()
    const server = catalog(profile('Server copy', 2), { headRevision: 4 })
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: view([profile()]) })
      .mockResolvedValue({ ok: true as const, value: catalogView([server]) })
    const domainSave = vi.fn(async () => ({
      ok: true,
      value: { ok: false, error: { code: 'profile-conflict', message: 'stale', currentHead: server.head } },
    } as const))
    render(<DigitalEmployeeStudio {...props({ load, save: domainSave })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect((await screen.findByRole('alert')).textContent).toContain('stale (profile-conflict)')
    await waitFor(() => {
      expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Server copy')
    })
  })

  it('cancels an unaccepted launch when the owning Session changes', async () => {
    let launchSignal: AbortSignal | undefined
    const spawn = vi.fn((_sessionId, _request, signal?: AbortSignal) => {
      launchSignal = signal
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
      })
    })
    const load = vi.fn(async () => ({ ok: true as const, value: view([profile()]) }))
    const rendered = render(<DigitalEmployeeStudio {...props({ load, spawn })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Launch employee' }))
    expect(launchSignal?.aborted).toBe(false)

    rendered.rerender(<DigitalEmployeeStudio {...props({ sessionId: 'session-b' as never, load, spawn })} />)
    await waitFor(() => { expect(launchSignal?.aborted).toBe(true) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('inspects immutable history and sends explicit activate, rollback, and archive CAS operations', async () => {
    const oldest = profile('Reviewer One', 1)
    const active = profile('Reviewer Two', 2)
    const latest = profile('Reviewer Candidate', 3)
    const entry = catalog(latest, {
      headRevision: 5,
      activeRevision: 2,
      history: [latest, active, oldest],
    })
    const revision = vi.fn(async (_sessionId, _profileId, selectedRevision: number) => {
      const selected = [latest, active, oldest].find(candidate => candidate.revision === selectedRevision)!
      return {
        ok: true as const,
        value: {
          ok: true as const,
          value: {
            head: entry.head,
            revision: immutableRevision(selected),
            comparedToRevision: 2,
            diff: selectedRevision === 3
              ? [{ path: 'profile.displayName', kind: 'changed' as const, before: '"Reviewer Two"', after: '"Reviewer Candidate"' }]
              : [],
            diffTruncated: false,
          },
        },
      }
    })
    const mutate = async () => ({
      ok: true as const,
      value: { ok: true as const, value: { head: entry.head } },
    })
    const activate = vi.fn(mutate)
    const rollback = vi.fn(mutate)
    const archive = vi.fn(mutate)
    const load = vi.fn(async () => ({ ok: true as const, value: catalogView([entry]) }))

    render(<DigitalEmployeeStudio {...props({ load, revision, activate, rollback, archive })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer Candidate/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Revisions/ }))

    await waitFor(() => {
      expect(revision).toHaveBeenCalledWith('session-a', 'reviewer', 3)
    })
    expect(screen.getByText('profile.displayName')).toBeDefined()
    expect(screen.getByText(/Active r2/)).toBeDefined()
    expect(screen.getByText(/Latest r3/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Activate latest' }))
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('session-a', 'reviewer', 3, 5)
    })

    fireEvent.click(screen.getByRole('button', { name: /Revision 1/ }))
    await waitFor(() => {
      expect(revision).toHaveBeenCalledWith('session-a', 'reviewer', 1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to revision 1' }))
    await waitFor(() => {
      expect(rollback).toHaveBeenCalledWith('session-a', 'reviewer', 1, 5)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Archive profile' }))
    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith('session-a', 'reviewer', 5)
    })
  })

  it('blocks launch without an active Revision and offers restore for an archived Head', async () => {
    const candidate = profile('Inactive Reviewer', 1)
    const inactive = catalog(candidate, { headRevision: 1, activeRevision: null })
    const archived = catalog(candidate, { headRevision: 2, activeRevision: 1, archivedAt: 5 })
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: catalogView([inactive]) })
      .mockResolvedValue({ ok: true as const, value: catalogView([archived]) })
    const restore = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: { head: archived.head } },
    }))
    const rendered = render(<DigitalEmployeeStudio {...props({ load, restore })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Inactive Reviewer/ }))
    expect((screen.getByRole('button', { name: 'Launch employee' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('No active revision')).toBeDefined()

    rendered.unmount()
    render(<DigitalEmployeeStudio {...props({ load, restore })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Inactive Reviewer/ }))
    expect((screen.getByRole('button', { name: 'Launch employee' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore profile' }))
    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith('session-a', 'reviewer', 2)
    })
  })
})

describe('evaluation workflow', () => {
  it('versions Eval Sets, manages the gate, runs and cancels candidates, and compares inspectable evidence', async () => {
    const running = evalRun('33333333-3333-4333-8333-333333333333', 'running', 0)
    const failed = evalRun('44444444-4444-4444-8444-444444444444', 'failed', 0)
    const passed = evalRun('55555555-5555-4555-8555-555555555555', 'passed', 1)
    const set = evalSetCatalog()
    const entry = catalog(profile('Reviewer Candidate', 2), {
      headRevision: 7,
      activeRevision: 1,
      promotionGate: {
        status: 'invalidated',
        requiredEvalSet: { evalSetId: set.head.evalSetId, revision: 1 },
        diagnostic: 'The passing evidence belongs to another exact candidate.',
      },
    })
    const evaluationView: DigitalEmployeeStudioView = {
      ...catalogView([entry]),
      evalSets: [set],
      evalRuns: [running, failed, passed],
    }
    const load = vi.fn(async () => ({ ok: true as const, value: evaluationView }))
    const saveEvalSet = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        value: { unchanged: false, head: set.head, revision: set.latest },
      },
    }))
    const setEvalGate = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: { head: entry.head } },
    }))
    const startEvalRun = vi.fn(async (_sessionId, request) => ({
      ok: true as const,
      value: {
        ok: true as const,
        value: { replayed: false, run: { ...running, evalRunId: request.evalRunId } },
      },
    }))
    const cancelled = { ...running, status: 'cancelled' as const, endedAt: 120, updatedAt: 120 }
    const cancelEvalRun = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: { run: cancelled } },
    }))
    const evalRunDetail = (summary: DigitalEmployeeEvalRunSummary) => {
      const { passedCases: _passedCases, totalCases: _totalCases, ...record } = summary
      return {
        run: {
          ...record,
          cases: [{
            caseId: 'summarize',
            status: summary.status === 'passed' ? 'passed' as const : summary.status === 'running' ? 'running' as const : 'failed' as const,
            assertions: summary.status === 'running' ? [] : [{
              kind: 'required-output' as const,
              subject: 'summary',
              passed: summary.status === 'passed',
              diagnostic: summary.status === 'passed' ? 'substring observed' : 'substring missing',
            }],
          }],
        },
        evalSet: set.latest,
      }
    }
    const getEvalRun = vi.fn(async (_sessionId, request) => {
      const summary = [running, failed, passed].find(candidate => candidate.evalRunId === request.evalRunId)!
      return {
        ok: true as const,
        value: { ok: true as const, value: evalRunDetail(summary) },
      }
    })

    render(<DigitalEmployeeStudio {...props({
      load,
      saveEvalSet,
      setEvalGate,
      startEvalRun,
      cancelEvalRun,
      evalRun: getEvalRun,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer Candidate/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Evaluations/ }))

    expect(screen.getByText(/Invalidated/)).toBeDefined()
    expect(screen.getByText('The passing evidence belongs to another exact candidate.')).toBeDefined()
    expect(screen.getByText('Reviewer smoke')).toBeDefined()

    const cases = screen.getByLabelText('Cases JSON') as HTMLTextAreaElement
    const editedCases = JSON.parse(cases.value)
    editedCases[0].input = 'Summarize this exact fixture.'
    fireEvent.change(cases, { target: { value: JSON.stringify(editedCases, null, 2) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Eval Set' }))
    await waitFor(() => {
      expect(saveEvalSet).toHaveBeenCalledWith('session-a', expect.objectContaining({
        expectedHeadRevision: 1,
        evalSet: expect.objectContaining({
          id: 'reviewer-smoke',
          cases: [expect.objectContaining({ input: 'Summarize this exact fixture.' })],
        }),
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Require latest revision' }))
    await waitFor(() => {
      expect(setEvalGate).toHaveBeenCalledWith('session-a', {
        profileId: 'reviewer',
        expectedHeadRevision: 7,
        requiredEvalSet: { evalSetId: 'reviewer-smoke', revision: 1 },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run candidate' }))
    await waitFor(() => {
      expect(startEvalRun).toHaveBeenCalledWith('session-a', expect.objectContaining({
        profileId: 'reviewer',
        profileRevision: 2,
        evalSetId: 'reviewer-smoke',
        evalSetRevision: 1,
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: /Evaluation run 33333333/ }))
    await waitFor(() => {
      expect(getEvalRun).toHaveBeenCalledWith('session-a', { evalRunId: running.evalRunId })
    })
    expect(screen.getByText('summarize')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel evaluation' }))
    await waitFor(() => {
      expect(cancelEvalRun).toHaveBeenCalledWith('session-a', { evalRunId: running.evalRunId })
    })

    fireEvent.click(screen.getByRole('button', { name: /Evaluation run 44444444/ }))
    await waitFor(() => { expect(screen.getByText('substring missing')).toBeDefined() })
    fireEvent.change(screen.getByLabelText('Compare evaluation run'), {
      target: { value: passed.evalRunId },
    })
    expect(screen.getByText('failed → passed')).toBeDefined()
  })
})

describe('sectioned navigation', () => {
  it('exposes all six Studio work areas from one workspace navigation', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([profile()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    for (const name of ['Profiles', 'Runtime backends', 'Revisions', 'Instances', 'Runs', 'Evaluations']) {
      expect(within(nav).getByRole('link', { name })).toBeDefined()
    }

    fireEvent.click(within(nav).getByRole('link', { name: 'Runtime backends' }))
    expect(screen.getByLabelText('Runtime backend')).toBeDefined()
    fireEvent.click(within(nav).getByRole('link', { name: 'Evaluations' }))
    expect(screen.getByText('Candidate evaluations')).toBeDefined()
  })

  it('starts on the identity section, switches sections from the nav, and keeps edits while switching', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([profile()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const card = await screen.findByRole('button', { name: /Reviewer One/ })
    expect(within(card).getByText('R')).toBeDefined()
    fireEvent.click(card)

    expect(screen.getByLabelText('Display name')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Senior Reviewer' } })

    fireEvent.click(screen.getByRole('button', { name: /^Tools/ }))
    expect(screen.queryByLabelText('Display name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Inherit all' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Persona/ }))
    expect(screen.getByLabelText('Persona')).toBeDefined()
    expect(screen.getByLabelText('Mission')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Identity/ }))
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Senior Reviewer')
  })

  it('summarizes each section in the nav with counts and the tool mode', async () => {
    const configured: DigitalEmployeeProfile = {
      ...profile(),
      toolPolicy: { mode: 'allow', names: ['read'] },
      context: [
        { id: 'c1', title: 'Repo', content: 'Monorepo.', enabled: true },
        { id: 'c2', title: 'Style', content: 'Tabs.', enabled: false },
      ],
      memory: [{ id: 'm1', title: 'Decisions', content: 'ADR-7.', enabled: true }],
      hooks: [
        { id: 'h1', point: 'session-start', effect: 'context', text: 'Read README.', enabled: true },
        { id: 'h2', point: 'before-tool', effect: 'deny', matcher: 'shell*', text: 'No shell.', enabled: false },
      ],
    }
    const load = vi.fn(async () => ({ ok: true as const, value: view([configured]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getByRole('button', { name: /Tools/ }).textContent).toContain('Allow selected')
    expect(within(nav).getByRole('button', { name: /Context/ }).textContent).toContain('2')
    expect(within(nav).getByRole('button', { name: /Memory/ }).textContent).toContain('1')
    expect(within(nav).getByRole('button', { name: /Hooks/ }).textContent).toContain('1 / 2')
  })
})

describe('movable and resizable window', () => {
  it('moves from the title bar and keeps the complete window inside the viewport', async () => {
    setViewport(1_200, 900)
    render(<DigitalEmployeeStudio {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const dialog = await screen.findByRole('dialog')
    const dragHandle = dialog.querySelector<HTMLElement>('[data-window-drag-handle]')
    expect(dragHandle).not.toBeNull()

    const initialLeft = Number.parseFloat(dialog.style.left)
    const initialTop = Number.parseFloat(dialog.style.top)
    dispatchPointer(dragHandle as HTMLElement, 'pointerdown', {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    })
    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: 140, clientY: 130 })
    expect(Number.parseFloat(dialog.style.left)).toBe(initialLeft + 40)
    expect(Number.parseFloat(dialog.style.top)).toBe(initialTop + 30)

    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: -2_000, clientY: -2_000 })
    expect(dialog.style.left).toBe('16px')
    expect(dialog.style.top).toBe('16px')
    dispatchPointer(window, 'pointerup', { pointerId: 7 })
  })

  it('resizes from every edge, respects minimums, and fits itself after viewport shrink', async () => {
    setViewport(1_200, 900)
    render(<DigitalEmployeeStudio {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelectorAll('[data-resize-edge]')).toHaveLength(8)

    const southeast = dialog.querySelector<HTMLElement>('[data-resize-edge="se"]')
    expect(southeast).not.toBeNull()
    const initialWidth = Number.parseFloat(dialog.style.width)
    const initialHeight = Number.parseFloat(dialog.style.height)
    dispatchPointer(southeast as HTMLElement, 'pointerdown', {
      button: 0,
      pointerId: 9,
      clientX: 1_000,
      clientY: 700,
    })
    dispatchPointer(window, 'pointermove', { pointerId: 9, clientX: 1_050, clientY: 740 })
    expect(Number.parseFloat(dialog.style.width)).toBe(initialWidth + 50)
    expect(Number.parseFloat(dialog.style.height)).toBe(initialHeight + 40)
    dispatchPointer(window, 'pointermove', { pointerId: 9, clientX: -2_000, clientY: -2_000 })
    expect(dialog.style.width).toBe('680px')
    expect(dialog.style.height).toBe('480px')
    dispatchPointer(window, 'pointerup', { pointerId: 9 })

    setViewport(640, 420)
    fireEvent(window, new Event('resize'))
    await waitFor(() => {
      expect(dialog.style.left).toBe('16px')
      expect(dialog.style.top).toBe('16px')
      expect(dialog.style.width).toBe('608px')
      expect(dialog.style.height).toBe('388px')
    })
  })
})

describe('draft dirty tracking', () => {
  it('flags unsaved edits and clears the flag after a save refreshes the profile', async () => {
    const renamed = profile('Senior Reviewer', 2)
    const load = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: view([profile()]) })
      .mockResolvedValue({ ok: true as const, value: view([renamed]) })
    const save = vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: saved(renamed) } }))
    render(<DigitalEmployeeStudio {...props({ load, save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    expect(screen.queryByText(/Unsaved changes/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Senior Reviewer' } })
    expect(screen.getByText(/Unsaved changes/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(screen.queryByText(/Unsaved changes/)).toBeNull() })
  })
})

describe('text block cards', () => {
  function withMemory(): DigitalEmployeeProfile {
    return {
      ...profile(),
      memory: [{ id: 'm1', title: 'Conventions', content: 'Use pnpm.', enabled: true }],
    }
  }

  it('toggles a memory block from its card header and persists the change on save', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: saved({ ...withMemory(), revision: 2 }) },
    }))
    const load = vi.fn(async () => ({ ok: true as const, value: view([withMemory()]) }))
    render(<DigitalEmployeeStudio {...props({ load, save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Memory/ }))

    const card = screen.getByDisplayValue('Conventions').closest('article')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(/9\s/)).toBeDefined()
    const toggle = within(card as HTMLElement).getByRole('switch')
    expect((toggle as HTMLInputElement).checked).toBe(true)
    fireEvent.click(toggle)

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(save).toHaveBeenCalled() })
    const saved = save.mock.calls[0]?.[1].profile
    expect(saved.memory[0]?.enabled).toBe(false)
  })

  it('collapses a block card to its header and expands it again', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([withMemory()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Memory/ }))

    const card = screen.getByDisplayValue('Conventions').closest('article') as HTMLElement
    expect(within(card).getByLabelText('Content')).toBeDefined()
    fireEvent.click(within(card).getByRole('button', { name: 'Collapse' }))
    expect(within(card).queryByLabelText('Content')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Expand' }))
    expect(within(card).getByLabelText('Content')).toBeDefined()
  })
})

describe('hook cards', () => {
  function withHook(): DigitalEmployeeProfile {
    return {
      ...profile(),
      hooks: [{ id: 'h1', point: 'session-start', effect: 'context', text: 'Read the README first.', enabled: true }],
    }
  }

  it('derives the effect badge from the hook point and shows the matcher only for tool hooks', async () => {
    const load = vi.fn(async () => ({ ok: true as const, value: view([withHook()]) }))
    render(<DigitalEmployeeStudio {...props({ load })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Hooks/ }))

    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.queryByLabelText(/Tool matcher/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'before-tool' } })
    expect(screen.getByText('Deny call')).toBeDefined()
    expect(screen.getByLabelText(/Tool matcher/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'after-tool' } })
    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.getByLabelText(/Tool matcher/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'before-step' } })
    expect(screen.getByText('Inject context')).toBeDefined()
    expect(screen.queryByLabelText(/Tool matcher/)).toBeNull()
  })

  it('edits a before-tool Hook between deny and exact-call approval', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: { code: 'profile-invalid' as const, message: 'captured' } },
    }))
    const load = vi.fn(async () => ({ ok: true as const, value: view([withHook()]) }))
    render(<DigitalEmployeeStudio {...props({ load, save })} />)
    fireEvent.click(screen.getByRole('button', { name: /Digital employees/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Reviewer One/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Hooks/ }))

    fireEvent.change(screen.getByLabelText('Point'), { target: { value: 'before-tool' } })
    const effect = screen.getByLabelText('Effect') as HTMLSelectElement
    expect(effect.value).toBe('deny')
    fireEvent.change(effect, { target: { value: 'ask' } })
    expect(screen.getByText('Ask for approval')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
    expect(save.mock.calls[0]?.[1].profile.hooks[0]).toMatchObject({
      id: 'h1',
      point: 'before-tool',
      effect: 'ask',
      matcher: '*',
    })
  })
})

describe('standalone Client bundle', () => {
  it('registers a lazy module-table factory and injects its CSS only when materialized', async () => {
    const code = readFileSync(resolve('packages/ui/lib/client.js'), 'utf8')
    let handoff: {
      id: string
      factory: (require: (specifier: string) => unknown) => Record<string, unknown>
    } | undefined
    ;(window as unknown as { __ModuleLoader__: { load: (value: typeof handoff) => void } }).__ModuleLoader__ = {
      load: value => { handoff = value },
    }
    // Deliberate built-artifact fixture: execute the browser factory registration in window scope.
    new Function(code)()
    expect(handoff?.id).toBe('@deepseek-ai/dsh-client-ui-agent-team-ultra')
    expect(document.querySelectorAll('style')).toHaveLength(0)
    const modules = new Map<string, unknown>([
      ['react', await import('react')],
      ['react/jsx-runtime', await import('react/jsx-runtime')],
      ['@deepseek-ai/cordis', await import('@deepseek-ai/cordis')],
      ['@deepseek-ai/dsh-api-gateway/client', await import('@deepseek-ai/dsh-api-gateway/client')],
      ['@deepseek-ai/dsh-client-ui-primitives', await import('@deepseek-ai/dsh-client-ui-primitives')],
    ])
    const exports = handoff?.factory(specifier => {
      if (!modules.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return modules.get(specifier)
    })
    expect(exports?.apply).toBeTypeOf('function')
    expect(exports?.inject).toEqual(['remote', 'slots', 'locale'])
    expect(document.querySelectorAll('style[data-plugin-css]')).toHaveLength(1)
    handoff?.factory(specifier => {
      if (!modules.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return modules.get(specifier)
    })
    expect(document.querySelectorAll('style[data-plugin-css]')).toHaveLength(1)
  })
})
