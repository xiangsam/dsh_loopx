import { useCallback, useEffect, useRef, useState } from 'react'

import type { BoardDataSnapshotV1 } from '../goalbar/protocol.ts'
import type { GoalBarConnectionResetSubscriber } from './useGoalBar.ts'
import type { GoalBarRpc, GoalBarWatchAnchorV1 } from './rpc.ts'

export interface UseBoardOptions {
  readonly sessionId: string
  readonly rpc: GoalBarRpc
  readonly subscribeConnectionReset?: GoalBarConnectionResetSubscriber | undefined
}

export interface UseBoardResult {
  readonly data: BoardDataSnapshotV1 | null
  readonly error: boolean
  readonly loading: boolean
  readonly pending: boolean
  readonly refresh: () => void
  readonly toggleActivation: () => void
}

/**
 * Keep the session-bound board aligned with LoopX source revisions.
 * Binding appearing mid-session, todo completion, and Start/Pause all
 * re-read boardData instead of leaving a stale unbound/empty view.
 */
export function useBoard({
  sessionId,
  rpc,
  subscribeConnectionReset,
}: UseBoardOptions): UseBoardResult {
  const [data, setData] = useState<BoardDataSnapshotV1 | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const sessionRef = useRef(sessionId)
  const generationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const dataRef = useRef<BoardDataSnapshotV1 | null>(null)
  const pendingRef = useRef(false)

  const replaceGeneration = useCallback(() => {
    controllerRef.current?.abort()
    generationRef.current += 1
    const controller = new AbortController()
    controllerRef.current = controller
    return { value: generationRef.current, controller }
  }, [])

  const loadBoard = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const outcome = await rpc.boardData(sessionId, signal)
    if (signal.aborted) return false
    if (outcome.ok && outcome.response.result.kind === 'ready') {
      dataRef.current = outcome.response.result.data
      setData(outcome.response.result.data)
      setError(false)
      return true
    }
    dataRef.current = null
    setData(null)
    setError(true)
    return false
  }, [rpc, sessionId])

  const runCycle = useCallback(async (
    generation: { readonly value: number; readonly controller: AbortController },
  ) => {
    const { controller } = generation
    setLoading(true)
    const loaded = await loadBoard(controller.signal)
    if (generation.value !== generationRef.current || controller.signal.aborted) return
    setLoading(false)
    if (!loaded) return

    let anchor: GoalBarWatchAnchorV1 | null = null
    const read = await rpc.read(sessionId, controller.signal)
    if (generation.value !== generationRef.current || controller.signal.aborted) return
    if (read.ok) {
      const result = read.response.result
      if (result.kind === 'present') {
        anchor = {
          afterSessionEventSeq: result.baseSessionEventSeq,
          sourceRevision: result.sourceRevision,
          expected: {
            goalId: result.snapshot.goalId,
            loopxAgentId: result.snapshot.loopxAgentId,
          },
          agentStatus: result.snapshot.agentStatus,
        }
      } else if (result.kind === 'hidden' || result.kind === 'fault') {
        anchor = {
          afterSessionEventSeq: result.baseSessionEventSeq,
          sourceRevision: result.sourceRevision,
          expected: null,
          agentStatus: null,
        }
      }
    }
    if (anchor === null) return

    while (generation.value === generationRef.current && !controller.signal.aborted) {
      const watch = await rpc.watch(sessionId, anchor, controller.signal)
      if (generation.value !== generationRef.current || controller.signal.aborted) return
      if (!watch.ok || watch.response.result.kind === 'fault') return
      const result = watch.response.result
      if (result.kind === 'timeout' || result.kind === 'runtime_changed') {
        anchor = {
          ...anchor,
          afterSessionEventSeq: result.sessionEventSeq,
          agentStatus: result.kind === 'runtime_changed' ? result.agentStatus : anchor.agentStatus,
        }
        continue
      }
      anchor = { ...anchor, afterSessionEventSeq: result.sessionEventSeq }
      setLoading(true)
      await loadBoard(controller.signal)
      if (generation.value !== generationRef.current || controller.signal.aborted) return
      setLoading(false)
    }
  }, [loadBoard, rpc, sessionId])

  const refresh = useCallback(() => {
    if (sessionRef.current !== sessionId) return
    void runCycle(replaceGeneration())
  }, [replaceGeneration, runCycle, sessionId])

  const toggleActivation = useCallback(() => {
    const snapshot = dataRef.current
    if (sessionRef.current !== sessionId
      || snapshot === null
      || snapshot.goalId === null
      || snapshot.loopxAgentId === null
      || pendingRef.current) return
    const goalId = snapshot.goalId
    const loopxAgentId = snapshot.loopxAgentId
    pendingRef.current = true
    setPending(true)
    const generation = replaceGeneration()
    void (async () => {
      try {
        const expected = { goalId, loopxAgentId }
        if (snapshot.goalActivation === 'stopped') {
          await rpc.start(sessionId, expected, generation.controller.signal)
        } else {
          await rpc.pause(sessionId, expected, generation.controller.signal)
        }
        if (generation.value !== generationRef.current) return
        await runCycle(generation)
      } finally {
        if (generation.value === generationRef.current) {
          pendingRef.current = false
          setPending(false)
        }
      }
    })()
  }, [replaceGeneration, rpc, runCycle, sessionId])

  useEffect(() => {
    sessionRef.current = sessionId
    dataRef.current = null
    pendingRef.current = false
    setData(null)
    setError(false)
    setPending(false)
    void runCycle(replaceGeneration())
    return () => {
      controllerRef.current?.abort()
    }
  }, [replaceGeneration, runCycle, sessionId])

  useEffect(() => {
    if (subscribeConnectionReset === undefined) return undefined
    return subscribeConnectionReset(() => {
      if (sessionRef.current !== sessionId) return
      void runCycle(replaceGeneration())
    })
  }, [replaceGeneration, runCycle, sessionId, subscribeConnectionReset])

  return { data, error, loading, pending, refresh, toggleActivation }
}
