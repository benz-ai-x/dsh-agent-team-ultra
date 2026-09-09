import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { DigitalEmployeeAuthorityErrorDetails, DigitalEmployeeFailure, DigitalEmployeeProfileHead } from './types.ts'
import { snapshotProfileHead } from './profile-snapshot.ts'

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
