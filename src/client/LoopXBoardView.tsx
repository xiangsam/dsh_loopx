import { useState, type JSX } from 'react'

import type { BoardTaskV1 } from '../goalbar/protocol.ts'
import styles from './board.module.css'
import type { GoalBarTranslate } from './locale.ts'
import type { GoalBarRpc } from './rpc.ts'
import {
  useBoard,
  type UseBoardOptions,
} from './useBoard.ts'

export interface LoopXBoardViewProps {
  readonly sessionId: string
  readonly rpc: GoalBarRpc
  readonly t: GoalBarTranslate
  readonly openView?: ((viewId: string) => void) | undefined
  readonly subscribeConnectionReset?: UseBoardOptions['subscribeConnectionReset']
}

type BoardGroupKind = 'gate' | 'in_progress' | 'waiting' | 'scheduled'

interface BoardGroup {
  readonly kind: BoardGroupKind
  readonly tasks: readonly BoardTaskV1[]
}

function isGateTask(task: BoardTaskV1): boolean {
  return task.taskClass === 'user_gate' || task.taskClass === 'user_action'
}

function groupKind(task: BoardTaskV1): BoardGroupKind {
  if (isGateTask(task)) return 'gate'
  if (task.status === 'scheduled') return 'scheduled'
  if (task.status === 'waiting') return 'waiting'
  return 'in_progress'
}

function openTasks(tasks: readonly BoardTaskV1[]): BoardTaskV1[] {
  return tasks.filter(task => task.status !== 'done')
}

function groupOpenTasks(tasks: readonly BoardTaskV1[]): readonly BoardGroup[] {
  const buckets: Record<BoardGroupKind, BoardTaskV1[]> = {
    gate: [],
    in_progress: [],
    waiting: [],
    scheduled: [],
  }
  for (const task of tasks) {
    if (task.status !== 'done') buckets[groupKind(task)].push(task)
  }
  const order: readonly BoardGroupKind[] = [
    'gate',
    'in_progress',
    'waiting',
    'scheduled',
  ]
  return order
    .map(kind => ({
      kind,
      tasks: buckets[kind],
    }))
    .filter(group => group.tasks.length > 0)
}

function groupLabel(group: BoardGroup, t: GoalBarTranslate): string {
  if (group.kind === 'gate') return t('board.group.gate')
  if (group.kind === 'in_progress') return t('board.group.in_progress')
  if (group.kind === 'waiting') return t('board.group.waiting')
  return t('board.group.scheduled')
}

function groupCountLabel(group: BoardGroup): string {
  return String(group.tasks.length)
}

function taskClassTag(task: BoardTaskV1, t: GoalBarTranslate): string | null {
  if (task.taskClass === 'user_gate' || task.taskClass === 'user_action') return t('board.task.gate')
  if (task.taskClass === 'continuous_monitor') return t('board.task.monitor')
  if (task.taskClass === 'blocker') return t('board.task.blocked')
  return null
}

function percentage(progress: { processed: number; total: number }): number {
  if (progress.total <= 0) return 0
  return Math.min(100, Math.round((progress.processed / progress.total) * 100))
}

/** DSH conversation-view panel for the exact live Session's LoopX Goal. */
export function LoopXBoardView({
  sessionId,
  rpc,
  t,
  openView,
  subscribeConnectionReset,
}: LoopXBoardViewProps): JSX.Element {
  const board = useBoard({ sessionId, rpc, subscribeConnectionReset })
  const data = board.data
  const bound = data !== null && data.goalId !== null
  const tasks = data?.tasks ?? []
  const open = openTasks(tasks)
  const userOpen = open.filter(task => task.role === 'user')
  const agentOpen = open.filter(task => task.role === 'agent')
  const doneCount = tasks.filter(task => task.status === 'done').length
  const gateCount = open.filter(task => isGateTask(task)).length
  const inProgressCount = agentOpen.filter(task => groupKind(task) === 'in_progress').length
  const waitingCount = agentOpen.filter(task => groupKind(task) === 'waiting').length
  const scheduledCount = agentOpen.filter(task => groupKind(task) === 'scheduled').length
  const groups = groupOpenTasks(agentOpen)
  const live = bound && data.sessionBound
  const choosing = board.goals.length > 0
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newTask, setNewTask] = useState('')

  const goalStatus = data === null || data.goalActivation === null
    ? null
    : data.goalActivation === 'stopped'
      ? 'paused'
      : userOpen.length > 0
        ? 'needs_you'
        : open.length > 0
          ? 'active'
          : 'done'

  const showSkeleton = board.loading && data === null && !choosing && !board.error
  const progress = data?.progress ?? null
  const progressPercent = progress === null ? 0 : percentage(progress)
  const activationLabel = data?.goalActivation === 'stopped'
    ? t('board.activation.stopped')
    : t('board.activation.active')
  const quota = data?.quota ?? null
  const quotaState = quota === null
    ? null
    : quota.waitingOnUser
      ? 'user'
      : quota.canRun
        ? 'ready'
        : 'waiting'

  return (
    <div className={styles.panel} aria-label={t('board.label')} aria-busy={board.loading || board.pending}>
      {board.error && (
        <div className={styles.error}>
          <span>{t('board.error')}</span>
          <button type="button" className={styles.button} onClick={board.refresh}>
            {t('action.refresh')}
          </button>
        </div>
      )}

      {showSkeleton && (
        <div className={styles.skeleton} aria-hidden="true">
          <span className={styles.skeletonBar} />
          <span className={styles.skeletonBar} />
          <span className={styles.skeletonBar} />
        </div>
      )}

      {choosing && (
        <section className={styles.card}>
          <span className={styles.brand}>{t('board.choose')}</span>
          <h2 className={styles.title}>{t('board.choose.title')}</h2>
          <ul className={styles.list}>
            {board.goals.map(goal => (
              <li key={goal.goalId} className={styles.item}>
                <h3 className={styles.itemTitle}>{goal.title}</h3>
                <div className={styles.itemMeta}>{goal.goalId}</div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={board.pending}
                    onClick={() => board.join(goal.goalId, goal.loopxAgentId, 'fresh')}
                  >
                    {t('board.join.fresh')}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={board.pending}
                    onClick={() => board.join(goal.goalId, goal.loopxAgentId, 'takeover')}
                  >
                    {t('board.join.takeover')}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={board.loading}
                    onClick={board.refresh}
                  >
                    {t('action.refresh')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bound ? (
        <section className={styles.card}>
          <div className={styles.header}>
            <div className={styles.headerMain}>
              <div className={styles.brandRow}>
                <span className={styles.brand}>LoopX</span>
                {goalStatus !== null && (
                  <span
                    className={styles.goalStatus}
                    data-status={goalStatus}
                    role="status"
                  >
                    {goalStatus === 'needs_you'
                      ? t('board.status.needs_you')
                      : goalStatus === 'active'
                        ? t('board.status.active')
                        : goalStatus === 'done'
                          ? t('board.status.done')
                          : t('board.status.paused')}
                  </span>
                )}
                <span
                  className={styles.statusBadge}
                  data-status={data.goalActivation}
                  role="status"
                >
                  <span className={styles.statusMark} aria-hidden="true" />
                  {activationLabel}
                </span>
                <span
                  className={styles.modeBadge}
                  data-live={live}
                >
                  {live ? t('board.mode.drive') : t('board.mode.watch')}
                </span>
                {live && quotaState !== null && (
                  <span
                    className={styles.quotaBadge}
                    data-state={quotaState}
                    role="status"
                  >
                    {quotaState === 'user'
                      ? t('board.quota.user')
                      : quotaState === 'ready'
                        ? t('board.quota.ready')
                        : t('board.quota.waiting')}
                  </span>
                )}
              </div>
              <h2 className={styles.title}>{data.goalTitle ?? data.goalId}</h2>
              <div className={styles.goalMeta}>
                <span className={styles.metaItem} data-kind="id">
                  {t('board.goal.id', { goalId: data.goalId })}
                </span>
                {data.domain !== null && (
                  <span className={styles.metaItem} data-kind="domain">
                    {data.domain}
                  </span>
                )}
                {data.laneCount !== null && (
                  <span className={styles.metaItem} data-kind="lanes">
                    {t('board.meta.lanes', { count: data.laneCount })}
                  </span>
                )}
                {data.bindingCount !== null && (
                  <span className={styles.metaItem} data-kind="chats">
                    {t('board.meta.chats', { count: data.bindingCount })}
                  </span>
                )}
              </div>
              <p className={styles.body}>
                {live
                  ? (progress === null
                    ? t('progress.empty')
                    : t('progress.label', {
                        processed: progress.processed,
                        total: progress.total,
                      }))
                  : t('board.workspace.body')}
              </p>
              {progress !== null && progress.total > 0 && (
                <div
                  className={styles.progressWrap}
                  data-goal={data.goalActivation}
                >
                  <progress
                    className={styles.progress}
                    max={progress.total}
                    value={progress.processed}
                    aria-label={t('progress.label', {
                      processed: progress.processed,
                      total: progress.total,
                    })}
                  />
                  <span className={styles.progressText}>
                    {t('progress.percent', { value: progressPercent })}
                  </span>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              {live && (
                <button
                  type="button"
                  className={data.goalActivation === 'stopped' ? styles.primary : styles.button}
                  disabled={board.pending}
                  title={data.goalActivation === 'stopped'
                    ? t('action.start.tip')
                    : t('action.pause.tip')}
                  onClick={board.toggleActivation}
                >
                  {data.goalActivation === 'stopped' ? t('action.start') : t('action.pause')}
                </button>
              )}
              {live ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={board.pending}
                  title={t('action.unbind.tip')}
                  onClick={board.unbindSession}
                >
                  {t('board.unbind')}
                </button>
              ) : data !== null && data.loopxAgentId !== null ? (
                <>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={board.pending}
                    onClick={() => board.join(data.goalId as string, data.loopxAgentId as string, 'fresh')}
                  >
                    {t('board.join.fresh')}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={board.pending}
                    onClick={() => board.join(data.goalId as string, data.loopxAgentId as string, 'takeover')}
                  >
                    {t('board.join.takeover')}
                  </button>
                </>
              ) : null}
              {live && (
                confirmDelete
                  ? (
                    <>
                      <button
                        type="button"
                        className={styles.button}
                        disabled={board.pending}
                        onClick={() => {
                          setConfirmDelete(false)
                          board.deleteGoal(data.goalId as string, data.loopxAgentId as string)
                        }}
                      >
                        {t('board.delete.confirm')}
                      </button>
                      <button
                        type="button"
                        className={styles.button}
                        disabled={board.pending}
                        onClick={() => setConfirmDelete(false)}
                      >
                        {t('board.delete.cancel')}
                      </button>
                    </>
                  )
                  : (
                    <button
                      type="button"
                      className={styles.button}
                      disabled={board.loading}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t('board.delete')}
                    </button>
                  )
              )}
              <button
                type="button"
                className={styles.button}
                disabled={board.loading || board.pending}
                onClick={board.refresh}
              >
                {board.loading ? t('action.refreshing') : t('action.refresh')}
              </button>
            </div>
          </div>
          {bound && (
            <div className={styles.summary}>
              <span className={styles.summaryItem} data-kind="open">
                {t('board.summary.open', { count: open.length })}
              </span>
              <span className={styles.summaryItem} data-kind="gate">
                {t('board.summary.gate', { count: gateCount })}
              </span>
              {inProgressCount > 0 && (
                <span className={styles.summaryItem} data-kind="in_progress">
                  {t('board.summary.in_progress', { count: inProgressCount })}
                </span>
              )}
              {waitingCount > 0 && (
                <span className={styles.summaryItem} data-kind="waiting">
                  {t('board.summary.waiting', { count: waitingCount })}
                </span>
              )}
              {scheduledCount > 0 && (
                <span className={styles.summaryItem} data-kind="scheduled">
                  {t('board.summary.scheduled', { count: scheduledCount })}
                </span>
              )}
              <span className={styles.summaryItem} data-kind="done">
                {t('board.summary.done', { count: doneCount })}
              </span>
            </div>
          )}
        </section>
      ) : !choosing && !showSkeleton && !board.error ? (
        <section className={styles.card}>
          <span className={styles.brand}>LoopX</span>
          <h2 className={styles.title}>{t('board.unbound.title')}</h2>
          <p className={styles.body}>{t('board.unbound.body')}</p>
        </section>
      ) : null}

      {data !== null && data.nextActionTitle !== null && (
        <section
          className={styles.card}
          data-action={data.nextActionKind ?? 'agent'}
        >
          <div className={styles.header}>
            <div className={styles.nextMain}>
              <span className={styles.brand}>{t('board.next')}</span>
              <p className={styles.title}>{data.nextActionTitle}</p>
              <p className={styles.body}>
                {data.nextActionKind === 'user_gate'
                  ? t('board.next.gate')
                  : t('board.next.agent')}
              </p>
            </div>
            {openView !== undefined && (
              <button
                type="button"
                className={styles.primary}
                onClick={() => openView('chat')}
              >
                {t('board.continue')}
              </button>
            )}
          </div>
        </section>
      )}

      {bound && (
        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <span className={styles.brand}>{t('board.open')}</span>
            <span className={styles.sectionMeta}>{String(open.length)}</span>
          </div>
          {live && (
            <form
              className={styles.addRow}
              onSubmit={event => {
                event.preventDefault()
                const text = newTask.trim()
                if (text.length === 0) return
                board.addTask(text)
                setNewTask('')
              }}
            >
              <input
                className={styles.addInput}
                type="text"
                value={newTask}
                placeholder={t('board.add.placeholder')}
                aria-label={t('board.add.label')}
                disabled={board.pending}
                onChange={event => setNewTask(event.target.value)}
              />
              <button
                type="submit"
                className={styles.primary}
                disabled={board.pending || newTask.trim().length === 0}
              >
                {t('board.add')}
              </button>
            </form>
          )}
          {userOpen.length === 0 && groups.length === 0 ? (
            <p className={styles.empty}>
              {doneCount > 0 ? t('board.doneCount', { count: doneCount }) : t('board.empty')}
            </p>
          ) : (
            <div className={styles.groups}>
              {userOpen.length > 0 && (
                <div className={styles.group} data-kind="user">
                  <div className={styles.groupHeader}>
                    <span className={styles.groupLabel}>{t('board.group.gate')}</span>
                    <span className={styles.groupCount}>{String(userOpen.length)}</span>
                  </div>
                  <ul className={styles.list}>
                    {userOpen.map(task => (
                      <li key={task.id} className={styles.item} data-kind="user_gate">
                        <div className={styles.itemRow}>
                          <h3 className={styles.itemTitle}>{task.title}</h3>
                          <div className={styles.itemActions}>
                            <span className={styles.badge} data-status="gate">
                              {t('board.group.gate')}
                            </span>
                            {live && (
                              <button
                                type="button"
                                className={styles.button}
                                disabled={board.pending}
                                onClick={() => board.completeTask(task.id)}
                              >
                                {t('board.resolve')}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {groups.map(group => (
                <div key={group.kind} className={styles.group} data-kind={group.kind}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupLabel}>{groupLabel(group, t)}</span>
                    <span className={styles.groupCount}>{groupCountLabel(group)}</span>
                  </div>
                  <ul className={styles.list}>
                    {group.tasks.map(task => (
                      <li
                        key={task.id}
                        className={styles.item}
                        data-kind={
                          task.taskClass === 'user_gate' || task.taskClass === 'user_action'
                            ? 'user_gate'
                            : 'agent'
                        }
                      >
                        <div className={styles.itemRow}>
                          <h3 className={styles.itemTitle}>{task.title}</h3>
                          <div className={styles.itemActions}>
                            <span
                              className={styles.badge}
                              data-status={group.kind}
                            >
                              {groupLabel(group, t)}
                            </span>
                            {live && (
                              <button
                                type="button"
                                className={styles.button}
                                disabled={board.pending}
                                onClick={() => board.completeTask(task.id)}
                              >
                                {isGateTask(task) ? t('board.resolve') : t('board.complete')}
                              </button>
                            )}
                          </div>
                        </div>
                        {taskClassTag(task, t) !== null && (
                          <div className={styles.itemMeta}>
                            <span
                              className={styles.taskTag}
                              data-kind={task.taskClass ?? undefined}
                            >
                              {taskClassTag(task, t)}
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
