import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  BoardDataSnapshotV1,
  BoardGoalChoiceV1,
} from '../goalbar/protocol.ts'
import type { GoalBarConnectionResetSubscriber } from './useGoalBar.ts'
import type { GoalBarRpc, GoalBarWatchAnchorV1 } from './rpc.ts'

export interface UseBoardOptions {
  readonly sessionId: string
  readonly rpc: GoalBarRpc
  readonly subscribeConnectionReset?: GoalBarConnectionResetSubscriber | undefined
}

export interface UseBoardResult {
  readonly data: BoardDataSnapshotV1 | null
  readonly goals: readonly BoardGoalChoiceV1[]
  readonly error: boolean
  readonly loading: boolean
  readonly pending: boolean
  readonly refresh: () => void
  readonly toggleActivation: () => void
  readonly unbindSession: () => void
  readonly join: (goalId: string, loopxAgentId: string, mode: 'fresh' | 'takeover') => void
  readonly deleteGoal: (goalId: string, loopxAgentId: string) => void
}

interface BoardCacheEntry {
  readonly data: BoardDataSnapshotV1 | null
  readonly goals: readonly BoardGoalChoiceV1[]
}

/**
 * Last-good projection per Session id. Opening the LoopX tab again within the
 * same live Session reuses this instead of flashing a fresh "not bound" state
 * while the first CLI read is still in flight.
 */
const boardCache = new Map<string, BoardCacheEntry>()

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
  const [goals, setGoals] = useState<readonly BoardGoalChoiceV1[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const sessionRef = useRef(sessionId)
  const generationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const dataRef = useRef<BoardDataSnapshotV1 | null>(null)
  const goalsRef = useRef<readonly BoardGoalChoiceV1[]>([])
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
      goalsRef.current = []
      boardCache.set(sessionId, { data: outcome.response.result.data, goals: [] })
      setData(outcome.response.result.data)
      setGoals([])
      setError(false)
      return true
    }
    if (outcome.ok && outcome.response.result.kind === 'choose') {
      dataRef.current = null
      goalsRef.current = outcome.response.result.goals
      boardCache.set(sessionId, { data: null, goals: outcome.response.result.goals })
      setData(null)
      setGoals(outcome.response.result.goals)
      setError(false)
      return true
    }
    dataRef.current = null
    goalsRef.current = []
    setData(null)
    setGoals([])
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

  const join = useCallback((goalId: string, loopxAgentId: string, mode: 'fresh' | 'takeover') => {
    if (sessionRef.current !== sessionId || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    const generation = replaceGeneration()
    void (async () => {
      try {
        await rpc.join(sessionId, goalId, loopxAgentId, mode, generation.controller.signal)
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

  const deleteGoal = useCallback((goalId: string, loopxAgentId: string) => {
    const snapshot = dataRef.current
    if (sessionRef.current !== sessionId
      || snapshot === null
      || snapshot.goalId !== goalId
      || snapshot.loopxAgentId !== loopxAgentId
      || !snapshot.sessionBound
      || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    const generation = replaceGeneration()
    void (async () => {
      try {
        await rpc.deleteGoal(sessionId, { goalId, loopxAgentId }, generation.controller.signal)
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

  const unbindSession = useCallback(() => {
    const snapshot = dataRef.current
    if (sessionRef.current !== sessionId
      || snapshot === null
      || snapshot.goalId === null
      || snapshot.loopxAgentId === null
      || !snapshot.sessionBound
      || pendingRef.current) return
    const goalId = snapshot.goalId
    const loopxAgentId = snapshot.loopxAgentId
    pendingRef.current = true
    setPending(true)
    const generation = replaceGeneration()
    void (async () => {
      try {
        await rpc.unbind(sessionId, { goalId, loopxAgentId }, generation.controller.signal)
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
    // Seed the last-good projection so re-opening the tab renders immediately
    // instead of flashing nothing while the first CLI read is in flight.
    const cached = boardCache.get(sessionId)
    dataRef.current = cached?.data ?? null
    goalsRef.current = cached?.goals ?? []
    pendingRef.current = false
    setData(cached?.data ?? null)
    setGoals(cached?.goals ?? [])
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

  return { data, goals, error, loading, pending, refresh, toggleActivation, unbindSession, join, deleteGoal }
}
