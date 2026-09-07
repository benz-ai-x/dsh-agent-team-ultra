// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TeamAction, type TeamActionProps } from '@deepseek-ai/dsh-experimental-client-ui-agent-team/src/client/TeamAction.tsx'
import { en, type TeamKey } from '@deepseek-ai/dsh-experimental-client-ui-agent-team/src/client/locales.ts'
import { operationResult, queryWorkflow } from './fixtures/member-workflow.ts'

afterEach(cleanup)

const EMPTY_PANEL_VIEWS = [] as const
const usePanelViews = ((selector: (views: typeof EMPTY_PANEL_VIEWS) => unknown) => (
  selector(EMPTY_PANEL_VIEWS)
)) as TeamActionProps['usePanelViews']

it('shows Codex task ownership and completion in the existing Team task UI', async () => {
  const { ctx, lead, native, runtime, handle } = await queryWorkflow()
  const task = await ctx.agentTeams.createTask(lead.agent, { subject: 'Visible Codex task', description: 'Render the authoritative task state.' })
  const props = {
    sessionId: lead.agent.id,
    usePanelViews,
    resolveTeamSessionId: (sessionId: string) => sessionId,
    renderSlot: () => null,
    async load(sessionId: string) {
      expect(sessionId).toBe(lead.agent.id)
      return { ok: true, value: ctx.agentTeams.remoteView(lead.agent) }
    },
    watch(sessionId, sink) {
      expect(sessionId).toBe(lead.agent.id)
      let active = true
      return {
        start() {
          if (active) sink.replace(ctx.agentTeams.remoteView(lead.agent))
        },
        async dispose() {
          active = false
        },
      }
    },
    async createTask() { throw new Error('This scenario mutates tasks through Codex.') },
    async updateTask() { throw new Error('This scenario mutates tasks through Codex.') },
    async openTeammate() { throw new Error('This scenario stays on the task board.') },
    t: ((key: TeamKey) => en[key]) as TeamActionProps['t'],
  } as TeamActionProps
  render(<TeamAction {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Agent Team' }))
  expect(await screen.findByText('Visible Codex task')).toBeTruthy()
  const taskDetail = within(screen.getByRole('region', { name: 'Task details' }))
  expect(taskDetail.getByText('Pending')).toBeTruthy()
  expect((screen.getByLabelText('Owner') as HTMLSelectElement).value).toBe('')

  expect(operationResult(await native.query(handle, 'team_task_update', { taskId: task.id, expectedRevision: 1, action: 'claim' })).success).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Team' }))
  expect(await taskDetail.findByText('In progress')).toBeTruthy()
  expect((screen.getByLabelText('Owner') as HTMLSelectElement).value).toBe('codex-reviewer')

  expect(operationResult(await native.query(handle, 'team_task_update', { taskId: task.id, expectedRevision: 2, action: 'complete' })).success).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Team' }))
  expect(await taskDetail.findByText('Completed')).toBeTruthy()
  await waitFor(() => { expect((screen.getByLabelText('Owner') as HTMLSelectElement).disabled).toBe(true) })
  expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy()
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({ revision: 3, status: 'completed', ownerName: 'codex-reviewer' })
  native.complete()
  await runtime.dispose()
})
