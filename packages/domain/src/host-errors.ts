import { TeammateRuntimeError } from '@deepseek-ai/dsh-experimental-agent-team'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { DigitalEmployeeAuthorityErrorDetails, DigitalEmployeeFailure, DigitalEmployeeProfileHead } from './types.ts'
import { snapshotProfileHead } from './profile-snapshot.ts'

/** Keep arbitrary failures bounded before they enter a durable binding diagnostic. */
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length <= 2048 ? text : `${text.slice(0, 2045)}...`
}

export function failure(code: DigitalEmployeeFailure['code'], message: string, currentHead?: DigitalEmployeeProfileHead): DigitalEmployeeFailure {
  return Object.freeze({
    code,
    message,
    ...(currentHead === undefined ? {} : { currentHead: snapshotProfileHead(currentHead) }),
  })
}

export function authorityRemoteError(
  error: DigitalEmployeeFailure,
  operation: DigitalEmployeeAuthorityErrorDetails['operation'],
): RemoteError<'digital-employees/team-lead-required' | 'digital-employees/team-rejected'> {
  const details = Object.freeze({ operation })
  return error.code === 'team-lead-required'
    ? new RemoteError('digital-employees/team-lead-required', error.message, details)
    : new RemoteError('digital-employees/team-rejected', error.message, details)
}

/** Translate typed teammate-runtime rejections without inspecting provider prose. */
export function externalRuntimeFailure(error: TeammateRuntimeError): DigitalEmployeeFailure {
  switch (error.code) {
    case 'TEAM_RUNTIME_UNAVAILABLE':
      return failure('runtime-target-unavailable', error.message)
    case 'TEAM_RUNTIME_CAPABILITY_MISMATCH':
      return failure('runtime-capability-mismatch', error.message)
    case 'TEAM_RUNTIME_IDENTITY_CONFLICT':
    case 'TEAM_RUNTIME_INVALID_PROVIDER':
      return failure('runtime-route-invalid', error.message)
  }
}
