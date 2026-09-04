import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

import type { GoalBarUiErrorCode } from './useGoalBar.ts'

export const GOALBAR_LOCALE_NAMESPACE = 'loopx.goalbar' as const

const en = {
  'region.label': 'LoopX Goal status',
  'goal.label': 'Goal {goalId}',
  'status.active': 'Active',
  'status.running': 'Running',
  'status.paused': 'Paused',
  'action.start': 'Start',
  'action.pause': 'Pause',
  'action.refresh': 'Refresh',
  'action.refreshing': 'Refreshing',
  'progress.label': 'Agent-lane todos: {processed} of {total} processed',
  'progress.empty': 'No agent-lane todos',
  'error.session_unavailable': 'The session is unavailable. Refresh to retry.',
  'error.cli_unavailable': 'LoopX is unavailable. Refresh to retry.',
  'error.binding_read_failed': 'The LoopX binding could not be read. Refresh to retry.',
  'error.activation_read_failed': 'Goal status could not be read. Refresh to retry.',
  'error.todo_read_failed': 'Todo progress could not be read. Refresh to retry.',
  'error.protocol_mismatch': 'LoopX returned an unsupported status. Refresh to retry.',
  'error.transport_error': 'LoopX is temporarily unreachable. Refresh to retry.',
  'error.protocol_error': 'LoopX returned an unsupported response. Refresh to retry.',
  'error.binding_mismatch': 'The LoopX binding changed. Refresh before trying again.',
  'error.binding_validation_failed': 'The LoopX binding could not be verified. Refresh before trying again.',
  'error.not_actionable': 'That action is no longer available. Refresh to continue.',
  'error.action_in_flight': 'Another LoopX action is in progress. Refresh to check its result.',
  'error.operation_result_unknown': 'The action result is uncertain. Refresh before trying again.',
  'error.driver_sync_failed': 'LoopX changed, but the session did not sync. Refresh to check.',
  'error.post_read_failed': 'LoopX changed, but the latest status is unavailable. Refresh to check.',
  'board.label': 'This session Goal',
  'board.unbound.title': 'This session is not bound to a LoopX Goal',
  'board.unbound.body': 'This workspace has no active LoopX Goal. In chat, run /loopx with a concrete task to create one in this project.',
  'board.workspace.body': 'This Goal belongs to the workspace. This chat is not the live Driver. Run /loopx here to continue in this Session.',
  'board.next': 'Next step',
  'board.continue': 'Back to chat',
  'board.next.agent': 'Continue in this chat after this Session is bound. The same-session Driver runs the next todo after LoopX quota admits a turn.',
  'board.next.gate': 'This Goal is waiting on you. Handle it in chat; the Driver will not skip a user gate.',
  'board.open': 'Open work',
  'board.meta.gate': 'Needs you',
  'board.meta.active': 'In this session',
  'board.meta.waiting': 'Waiting',
  'board.meta.watching': 'Watching',
  'board.doneCount': '{count} completed',
  'board.empty': 'No open work',
  'board.error': 'Could not read this session Goal.',
} as const

export type GoalBarLocaleKey = keyof typeof en

const zh: Record<GoalBarLocaleKey, string> = {
  'region.label': 'LoopX 目标状态',
  'goal.label': '目标 {goalId}',
  'status.active': '已激活',
  'status.running': '运行中',
  'status.paused': '已暂停',
  'action.start': '启动',
  'action.pause': '暂停',
  'action.refresh': '刷新',
  'action.refreshing': '刷新中',
  'progress.label': 'Agent 通道待办：已处理 {processed} / {total}',
  'progress.empty': '没有 Agent 通道待办',
  'error.session_unavailable': '会话不可用。请刷新后重试。',
  'error.cli_unavailable': 'LoopX 当前不可用。请刷新后重试。',
  'error.binding_read_failed': '无法读取 LoopX 绑定。请刷新后重试。',
  'error.activation_read_failed': '无法读取目标状态。请刷新后重试。',
  'error.todo_read_failed': '无法读取待办进度。请刷新后重试。',
  'error.protocol_mismatch': 'LoopX 返回了不支持的状态。请刷新后重试。',
  'error.transport_error': '暂时无法连接 LoopX。请刷新后重试。',
  'error.protocol_error': 'LoopX 返回了不支持的响应。请刷新后重试。',
  'error.binding_mismatch': 'LoopX 绑定已变化。请刷新后再试。',
  'error.binding_validation_failed': '无法验证 LoopX 绑定。请刷新后再试。',
  'error.not_actionable': '此操作已不可用。请刷新后继续。',
  'error.action_in_flight': '另一个 LoopX 操作正在进行。请刷新查看结果。',
  'error.operation_result_unknown': '操作结果不确定。请刷新后再试。',
  'error.driver_sync_failed': 'LoopX 已更新，但会话同步失败。请刷新检查。',
  'error.post_read_failed': 'LoopX 已更新，但最新状态不可用。请刷新检查。',
  'board.label': '本会话目标',
  'board.unbound.title': '当前会话尚未绑定 LoopX 目标',
  'board.unbound.body': '这个工作区还没有活跃的 LoopX 目标。请在对话里输入 /loopx 加具体任务，在本项目创建目标。',
  'board.workspace.body': '目标挂在工作区，当前对话还不是执行 Session。在本会话运行 /loopx，才会把 Driver 接到这里。',
  'board.next': '下一步',
  'board.continue': '回到对话',
  'board.next.agent': '在本会话接上之后，请在对话里继续。同一 Session 的 Driver 会在 LoopX quota 允许后推进下一项。',
  'board.next.gate': '这个目标正在等你确认。请在对话里处理；Driver 不会跳过需要你的步骤。',
  'board.open': '未完成',
  'board.meta.gate': '需要你',
  'board.meta.active': '本会话推进中',
  'board.meta.waiting': '等待中',
  'board.meta.watching': '持续观察',
  'board.doneCount': '已完成 {count} 项',
  'board.empty': '没有未完成工作',
  'board.error': '无法读取本会话目标。',
}

export const GOALBAR_LOCALES = Object.freeze({ en, zh })

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'loopx.goalbar': GoalBarLocaleKey
  }
}

export type GoalBarTranslate = Translate<GoalBarLocaleKey>

const ERROR_KEYS: Readonly<Record<GoalBarUiErrorCode, GoalBarLocaleKey>> = {
  session_unavailable: 'error.session_unavailable',
  cli_unavailable: 'error.cli_unavailable',
  binding_read_failed: 'error.binding_read_failed',
  activation_read_failed: 'error.activation_read_failed',
  todo_read_failed: 'error.todo_read_failed',
  protocol_mismatch: 'error.protocol_mismatch',
  transport_error: 'error.transport_error',
  protocol_error: 'error.protocol_error',
  binding_mismatch: 'error.binding_mismatch',
  binding_validation_failed: 'error.binding_validation_failed',
  not_actionable: 'error.not_actionable',
  action_in_flight: 'error.action_in_flight',
  operation_result_unknown: 'error.operation_result_unknown',
  driver_sync_failed: 'error.driver_sync_failed',
  post_read_failed: 'error.post_read_failed',
}

export function goalBarErrorKey(code: GoalBarUiErrorCode): GoalBarLocaleKey {
  return ERROR_KEYS[code]
}
