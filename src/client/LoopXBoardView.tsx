import type { JSX } from 'react'

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

function openTasks(tasks: readonly BoardTaskV1[]): BoardTaskV1[] {
  return tasks.filter(task => task.status !== 'done')
}

function statusLabel(task: BoardTaskV1, t: GoalBarTranslate): string {
  if (task.taskClass === 'user_gate' || task.taskClass === 'user_action') {
    return t('board.meta.gate')
  }
  if (task.status === 'scheduled') return t('board.meta.watching')
  if (task.status === 'waiting') return t('board.meta.waiting')
  return t('board.meta.active')
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
  const remaining = openTasks(data?.tasks ?? [])
  const doneCount = (data?.tasks ?? []).filter(task => task.status === 'done').length
  const live = bound && data.sessionBound

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

      {bound ? (
        <section className={styles.card}>
          <div className={styles.header}>
            <div className={styles.headerMain}>
              <span className={styles.brand}>LoopX</span>
              <h2 className={styles.title}>{t('goal.label', { goalId: data.goalId })}</h2>
              <p className={styles.body}>
                {live
                  ? (data.progress === null
                    ? t('progress.empty')
                    : t('progress.label', {
                        processed: data.progress.processed,
                        total: data.progress.total,
                      }))
                  : t('board.workspace.body')}
              </p>
            </div>
            <div className={styles.actions}>
              {live && (
                <button
                  type="button"
                  className={data.goalActivation === 'stopped' ? styles.primary : styles.button}
                  disabled={board.pending}
                  onClick={board.toggleActivation}
                >
                  {data.goalActivation === 'stopped' ? t('action.start') : t('action.pause')}
                </button>
              )}
              <button
                type="button"
                className={styles.button}
                disabled={board.loading}
                onClick={board.refresh}
              >
                {t('action.refresh')}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          <span className={styles.brand}>LoopX</span>
          <h2 className={styles.title}>{t('board.unbound.title')}</h2>
          <p className={styles.body}>{t('board.unbound.body')}</p>
        </section>
      )}

      {data !== null && data.nextActionTitle !== null && (
        <section className={styles.card}>
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
          <span className={styles.brand}>{t('board.open')}</span>
          {remaining.length === 0 ? (
            <p className={styles.empty}>
              {doneCount > 0 ? t('board.doneCount', { count: doneCount }) : t('board.empty')}
            </p>
          ) : (
            <ul className={styles.list}>
              {remaining.map(task => (
                <li
                  key={task.id}
                  className={styles.item}
                  data-kind={
                    task.taskClass === 'user_gate' || task.taskClass === 'user_action'
                      ? 'user_gate'
                      : 'agent'
                  }
                >
                  <h3 className={styles.itemTitle}>{task.title}</h3>
                  <div className={styles.itemMeta}>{statusLabel(task, t)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
