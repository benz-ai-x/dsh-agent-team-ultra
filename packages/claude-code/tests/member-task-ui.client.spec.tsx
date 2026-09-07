// @vitest-environment jsdom

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TeamAction, type TeamActionProps } from '@deepseek-ai/dsh-experimental-client-ui-agent-team/src/client/TeamAction.tsx'
import { en, type TeamKey } from '@deepseek-ai/dsh-experimental-client-ui-agent-team/src/client/locales.ts'
import { claudeWorkflow, operationResult } from './fixtures/member-workflow.ts'

afterEach(cleanup)

const EMPTY_PANEL_VIEWS = [] as const
const usePanelViews = ((selector: (views: typeof EMPTY_PANEL_VIEWS) => unknown) => (
  selector(EMPTY_PANEL_VIEWS)
)) as TeamActionProps['usePanelViews']
const usePanelNavigation = ((selector: (request: null) => unknown) => (
  selector(null)
)) as TeamActionProps['usePanelNavigation']

async function update(client: Client, taskId: string, expectedRevision: number, action: string) {
  return operationResult(await client.callTool({
    name: 'team_task_update', arguments: { taskId, expectedRevision, action },
    _meta: { 'claudecode/toolUseId': `toolu_ui_${expectedRevision}` },
  }))
}

it('shows Claude task ownership and completion in the existing Team task UI', async () => {
  const { ctx, lead, client, native, runtime } = await claudeWorkflow()
  const task = await ctx.agentTeams.createTask(lead.agent, {
    subject: 'Visible Claude task', description: 'Render the authoritative task state.',
  })
  const props = {
    sessionId: lead.agent.id,
    usePanelViews,
    usePanelNavigation,
    consumePanelNavigation: () => {},
    resolveTeamSessionId: (sessionId: string) => sessionId,
    renderSlot: () => null,
    async load(sessionId: string) {
      expect(sessionId).toBe(lead.agent.id)
      return { ok: true, value: ctx.agentTeams.remoteView(lead.agent) }
    },
    async createTask() { throw new Error('This scenario mutates tasks through Claude.') },
    async updateTask() { throw new Error('This scenario mutates tasks through Claude.') },
    async openTeammate() { throw new Error('This scenario stays on the task board.') },
    t: ((key: TeamKey) => en[key]) as TeamActionProps['t'],
  } as TeamActionProps
  render(<TeamAction {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Agent Team' }))
  expect(await screen.findByText('Visible Claude task')).toBeTruthy()
  expect(screen.getByText('Pending')).toBeTruthy()
  expect((screen.getByLabelText('Owner') as HTMLSelectElement).value).toBe('')

  expect((await update(client!, task.id, 1, 'claim')).success).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Team' }))
  expect(await screen.findByText('In progress')).toBeTruthy()
  expect((screen.getByLabelText('Owner') as HTMLSelectElement).value).toBe('claude-reviewer')

  expect((await update(client!, task.id, 2, 'complete')).success).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Team' }))
  expect(await screen.findByText('Completed')).toBeTruthy()
  await waitFor(() => { expect((screen.getByLabelText('Owner') as HTMLSelectElement).disabled).toBe(true) })
  expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy()
  expect(ctx.agentTeams.getTask(lead.agent, task.id)).toMatchObject({
    revision: 3, status: 'completed', ownerName: 'claude-reviewer',
  })
  native.complete('The task is visible as complete.')
  await runtime.dispose()
})
