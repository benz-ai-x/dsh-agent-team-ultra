/** Loader-mounted deterministic external boundary for the packed Team message probe. */

export const name = 'packed-controlled-team-runtime'
export const inject = ['agentTeams']

const controlKey = Symbol.for('dsh-agent-team-ultra.packed-controlled-runtime')

export function apply(ctx) {
  const control = globalThis[controlKey]
  if (control === undefined) throw new Error('packed controlled runtime has no probe controller')

  const provider = {
    id: control.providerId,
    displayName: 'Packed controlled Team runtime',
    contextModes: ['fresh'],
    profileCapabilities: ['persona', 'mission'],
    runtimeCapabilities: [],
    memberOperations: ['messages.send'],
    bindMemberOperations() {},
    async create(request) {
      request.signal.throwIfAborted()
      control.createCalls.push(request)
      const identity = `${request.launchRequestId}:${request.memberId}`
      let runtime = control.runtimes.get(identity)
      if (runtime === undefined) {
        runtime = {
          launchRequestId: request.launchRequestId,
          memberId: request.memberId,
          nativeHandle: `packed-native-${control.runtimes.size + 1}`,
          initialTurnId: `packed-initial-${control.runtimes.size + 1}`,
        }
        control.runtimes.set(identity, runtime)
      }
      return {
        nativeHandle: runtime.nativeHandle,
        turnId: runtime.initialTurnId,
        presence: 'idle',
        memberOperations: ['messages.send'],
      }
    },
    async resume(request) {
      request.signal.throwIfAborted()
      control.resumeCalls.push(request)
      const runtime = [...control.runtimes.values()].find(candidate =>
        candidate.launchRequestId === request.launchRequestId
        && candidate.memberId === request.memberId
        && (request.nativeHandle === undefined || candidate.nativeHandle === request.nativeHandle))
      if (runtime === undefined) return undefined
      return {
        nativeHandle: runtime.nativeHandle,
        turnId: runtime.initialTurnId,
        presence: 'idle',
      }
    },
    async deliver(request) {
      request.signal.throwIfAborted()
      control.deliverCalls.push(request)
      await control.deliveryRelease.promise
      request.signal.throwIfAborted()
      let turnId = control.deliveryTurns.get(request.deliveryId)
      if (turnId === undefined) {
        turnId = `packed-turn-${control.deliveryTurns.size + 1}`
        control.deliveryTurns.set(request.deliveryId, turnId)
      }
      return { turnId, presence: 'idle' }
    },
    interrupt() {
      return { previousStatus: 'idle' }
    },
    async dispose() {},
  }

  const registration = ctx.agentTeams.registerTeammateRuntimeProvider(provider)
  control.providerLoads += 1
  ctx.effect(
    () => async () => { await registration() },
    'packed controlled Team runtime registration',
  )
}
