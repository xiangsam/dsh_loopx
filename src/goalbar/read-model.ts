import {
  LoopXCliError,
  runFile,
  runJsonCommand,
} from '../cli.ts'
import type {
  FileRunner,
  LoopXCommand,
} from '../cli.ts'
import {
  isGoalBarAgentId,
  isGoalBarGoalId,
  isGoalBarSessionId,
} from './protocol.ts'
import type {
  BoardDataSnapshotV1,
  BoardGoalChoiceV1,
  BoardTaskStatusV1,
  BoardTaskV1,
  GoalBarActivationV1,
  GoalBarAgentStatusV1,
  GoalBarProgressV1,
  GoalBarReadFaultCode,
  GoalBarSnapshotV1,
} from './protocol.ts'

export const GOALBAR_HOST_SURFACE = 'deepseek-harness-native' as const
export const GOALBAR_PROJECT_REGISTRY = '.loopx/registry.json' as const
export const GOALBAR_ACTIVE_STATE_ROOT = '.codex/goals' as const
export const GOALBAR_ACTIVE_STATE_FILE = 'ACTIVE_GOAL_STATE.md' as const

const SOURCE_REVISION_FAILURE = `sha256:${createHash('sha256')
  .update('loopx-goalbar-source-revision-unavailable-v1')
  .digest('hex')}`

const BINDING_SCHEMA = 'loopx_thread_agent_binding_resolution_v0'
const ACTIVATION_TRANSITION_SCHEMA = 'loopx_goal_activation_transition_v1'
const ACTIVATION_READBACK_SCHEMA = 'loopx_goal_activation_readback_v1'
const TODO_PROJECTION_SCHEMA = 'agent_lane_todo_list_projection_v0'
const TODO_PROJECTION_VIEW = 'explicit_limit_cold_path'
const READ_ATTEMPTS = 3
const BOARD_TODO_LIMIT = 50
const BOARD_TITLE_MAX = 180

export interface GoalBarCliReadOptions {
  readonly command: LoopXCommand
  readonly cwd: string
  readonly runner?: FileRunner | undefined
  readonly signal?: AbortSignal | undefined
  readonly env?: NodeJS.ProcessEnv | undefined
  readonly retryDelaysMs?: readonly number[] | undefined
}

export interface GoalBarReadModelOptions extends GoalBarCliReadOptions {
  readonly sessionId: string
  readonly agentStatus: GoalBarAgentStatusV1
}

export interface GoalBarSourceRevisionOptions {
  readonly cwd: string
  readonly goalId?: string | undefined
  readonly loopxAgentId?: string | undefined
}

export class GoalBarSourceRevisionError extends Error {}

export function unavailableGoalBarSourceRevision(): string {
  return SOURCE_REVISION_FAILURE
}

function frame(hash: ReturnType<typeof createHash>, label: string, value: Buffer): void {
  const labelBytes = Buffer.from(label, 'utf8')
  const lengths = Buffer.allocUnsafe(8)
  lengths.writeUInt32BE(labelBytes.length, 0)
  lengths.writeUInt32BE(value.length, 4)
  hash.update(lengths)
  hash.update(labelBytes)
  hash.update(value)
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === ''
    || (!pathFromRoot.startsWith(`..${sep}`)
      && pathFromRoot !== '..'
      && !isAbsolute(pathFromRoot))
}

function validatedSourcePaths(options: GoalBarSourceRevisionOptions): string[] {
  if (!isAbsolute(options.cwd) || resolve(options.cwd) !== options.cwd) {
    throw new GoalBarSourceRevisionError('project cwd must be absolute and normalized')
  }
  const paths = [resolve(options.cwd, GOALBAR_PROJECT_REGISTRY)]
  if (options.goalId !== undefined) {
    if (!isGoalBarGoalId(options.goalId)
      || options.goalId === '.'
      || options.goalId === '..'
      || options.goalId.includes('/')
      || options.goalId.includes('\\')) {
      throw new GoalBarSourceRevisionError('goal id is not a safe path segment')
    }
    paths.push(resolve(
      options.cwd,
      GOALBAR_ACTIVE_STATE_ROOT,
      options.goalId,
      GOALBAR_ACTIVE_STATE_FILE,
    ))
  }
  if ((options.goalId === undefined) !== (options.loopxAgentId === undefined)
    || (options.loopxAgentId !== undefined
      && !isGoalBarAgentId(options.loopxAgentId))) {
    throw new GoalBarSourceRevisionError('source revision requires an exact binding pair')
  }
  if (paths.some(candidate => !isContained(options.cwd, candidate))) {
    throw new GoalBarSourceRevisionError('source path escaped project cwd')
  }
  return paths
}

async function readRevisionSource(
  cwd: string,
  path: string,
): Promise<{ readonly exists: boolean; readonly content: Buffer }> {
  try {
    const resolved = await realpath(path)
    const resolvedRoot = await realpath(cwd)
    if (!isContained(resolvedRoot, resolved)) {
      throw new GoalBarSourceRevisionError('source resolved outside project cwd')
    }
    return { exists: true, content: await readFile(resolved) }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { exists: false, content: Buffer.alloc(0) }
    }
    throw error instanceof GoalBarSourceRevisionError
      ? error
      : new GoalBarSourceRevisionError('authoritative source read failed')
  }
}

/** Hash only the fixed authoritative paths; contents and local paths never cross the wire. */
export async function computeGoalBarSourceRevision(
  options: GoalBarSourceRevisionOptions,
): Promise<string> {
  const paths = validatedSourcePaths(options)
  const hash = createHash('sha256')
  frame(hash, 'contract', Buffer.from('loopx-goalbar-source-revision-v1'))
  if (options.goalId !== undefined && options.loopxAgentId !== undefined) {
    frame(hash, 'binding.goal-id', Buffer.from(options.goalId, 'utf8'))
    frame(hash, 'binding.agent-id', Buffer.from(options.loopxAgentId, 'utf8'))
  }
  for (let index = 0; index < paths.length; index += 1) {
    const source = await readRevisionSource(options.cwd, paths[index] as string)
    frame(hash, index === 0 ? 'registry.exists' : 'active-state.exists',
      Buffer.from(source.exists ? '1' : '0'))
    frame(hash, index === 0 ? 'registry.content' : 'active-state.content', source.content)
  }
  return `sha256:${hash.digest('hex')}`
}

export interface GoalBarStableReadResult {
  readonly model: GoalBarReadModelResult
  readonly sourceRevision: string
}

export type GoalBarSourceRevisionReader = (
  options: GoalBarSourceRevisionOptions,
) => Promise<string>

/**
 * Observe the same authoritative bytes before and after their CLI-derived read.
 * A concurrent equal-size write or atomic replacement retries the whole model.
 */
export async function readStableGoalBarModel(
  options: GoalBarReadModelOptions,
  revisionReader: GoalBarSourceRevisionReader = computeGoalBarSourceRevision,
): Promise<GoalBarStableReadResult> {
  let lastRevision = await revisionReader({ cwd: options.cwd })
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const registryBefore = attempt === 0
      ? lastRevision
      : await revisionReader({ cwd: options.cwd })
    const binding = await readGoalBarBinding(options, options.sessionId)
    const registryAfter = await revisionReader({ cwd: options.cwd })
    lastRevision = registryAfter
    if (registryBefore !== registryAfter) continue
    if (binding.kind === 'fault') return { model: binding, sourceRevision: registryAfter }
    if (binding.kind === 'missing') {
      return {
        model: { kind: 'hidden', reason: 'binding_missing' },
        sourceRevision: registryAfter,
      }
    }
    if (binding.kind === 'ambiguous') {
      return {
        model: {
          kind: 'hidden',
          reason: 'binding_ambiguous',
          uniquePairCount: binding.uniquePairCount,
        },
        sourceRevision: registryAfter,
      }
    }
    if (binding.kind === 'unavailable') {
      return {
        model: { kind: 'fault', code: 'binding_read_failed' },
        sourceRevision: registryAfter,
      }
    }

    const exact = { goalId: binding.goalId, loopxAgentId: binding.loopxAgentId }
    const sourceBefore = await revisionReader({
      cwd: options.cwd,
      ...exact,
    })
    const registryGuard = await revisionReader({ cwd: options.cwd })
    if (registryGuard !== registryAfter) {
      lastRevision = registryGuard
      continue
    }
    const [activation, progress] = await Promise.all([
      readGoalBarActivation(options, binding.goalId),
      readGoalBarProgress(options, binding.goalId, binding.loopxAgentId),
    ])
    const sourceAfter = await revisionReader({
      cwd: options.cwd,
      ...exact,
    })
    lastRevision = sourceAfter
    if (sourceBefore !== sourceAfter) continue
    const fault = preferredReadFault(activation, progress)
    if (fault !== undefined) {
      return { model: { ...fault, binding }, sourceRevision: sourceAfter }
    }
    if (activation.kind !== 'value' || progress.kind !== 'value') {
      return {
        model: { kind: 'fault', code: 'protocol_mismatch', binding },
        sourceRevision: sourceAfter,
      }
    }
    return {
      model: {
        kind: 'present',
        snapshot: {
          sessionId: options.sessionId,
          ...exact,
          goalActivation: activation.goalActivation,
          agentStatus: options.agentStatus,
          progress: progress.progress,
        },
      },
      sourceRevision: sourceAfter,
    }
  }
  return {
    model: { kind: 'fault', code: 'binding_read_failed' },
    sourceRevision: lastRevision,
  }
}

export type DecodedBindingResolutionV0 =
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'bound'
      readonly goalId: string
      readonly loopxAgentId: string
    }
  | { readonly kind: 'ambiguous'; readonly uniquePairCount: number }
  | { readonly kind: 'unavailable' }

export type GoalBarBindingReadResult =
  | DecodedBindingResolutionV0
  | { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode }

export type GoalBarActivationReadResult =
  | { readonly kind: 'value'; readonly goalActivation: GoalBarActivationV1 }
  | { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode }

export type GoalBarProgressReadResult =
  | { readonly kind: 'value'; readonly progress: GoalBarProgressV1 }
  | { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode }

export type GoalBarReadModelResult =
  | { readonly kind: 'hidden'; readonly reason: 'binding_missing' }
  | {
      readonly kind: 'hidden'
      readonly reason: 'binding_ambiguous'
      readonly uniquePairCount: number
    }
  | { readonly kind: 'present'; readonly snapshot: GoalBarSnapshotV1 }
  | {
      readonly kind: 'fault'
      readonly code: GoalBarReadFaultCode
      readonly binding?: BindingPair | undefined
    }

interface JsonReadResult {
  readonly exitCode: number
  readonly payload: Record<string, unknown>
}

export interface BindingPair {
  readonly goalId: string
  readonly loopxAgentId: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function safeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function parseBindingPairs(value: unknown): BindingPair[] | undefined {
  if (!Array.isArray(value)) return undefined
  const pairs = new Map<string, BindingPair>()
  for (const item of value) {
    const candidate = record(item)
    if (!isGoalBarGoalId(candidate?.goal_id)
      || !isGoalBarAgentId(candidate.agent_id)) return undefined
    const pair = {
      goalId: candidate.goal_id,
      loopxAgentId: candidate.agent_id,
    }
    pairs.set(`${pair.goalId}\u0000${pair.loopxAgentId}`, pair)
  }
  return [...pairs.values()]
}

/**
 * Validate the authoritative resolver relation while retaining process status.
 * Duplicate records for one exact pair are collapsed before the 0/1/>1 test.
 */
export function decodeThreadAgentBindingResolutionV0(
  value: unknown,
  expectedSessionId: string,
  exitCode: number,
): DecodedBindingResolutionV0 | undefined {
  const input = record(value)
  const pairs = parseBindingPairs(input?.matches)
  if (!isGoalBarSessionId(expectedSessionId)
    || !safeCount(exitCode)
    || input?.schema_version !== BINDING_SCHEMA
    || pairs === undefined) return undefined

  if (input.status === 'missing') {
    return exitCode === 0
      && input.ok === true
      && input.host_surface === GOALBAR_HOST_SURFACE
      && input.thread_id === expectedSessionId
      && input.goal_id === null
      && input.agent_id === null
      && pairs.length === 0
      ? { kind: 'missing' }
      : undefined
  }

  if (input.status === 'bound') {
    const pair = pairs.length === 1 ? pairs[0] : undefined
    return exitCode === 0
      && input.ok === true
      && input.host_surface === GOALBAR_HOST_SURFACE
      && input.thread_id === expectedSessionId
      && pair !== undefined
      && input.goal_id === pair.goalId
      && input.agent_id === pair.loopxAgentId
      ? {
          kind: 'bound',
          goalId: pair.goalId,
          loopxAgentId: pair.loopxAgentId,
        }
      : undefined
  }

  if (input.status === 'ambiguous') {
    return exitCode !== 0
      && input.ok === false
      && input.host_surface === GOALBAR_HOST_SURFACE
      && input.thread_id === expectedSessionId
      && input.goal_id === null
      && input.agent_id === null
      && input.error_kind === 'thread_agent_binding_ambiguous'
      && pairs.length > 1
      ? { kind: 'ambiguous', uniquePairCount: pairs.length }
      : undefined
  }

  if (input.status === 'unavailable') {
    const errorKind = input.error_kind
    const exactEcho = errorKind === 'thread_agent_binding_resolution_failed'
      && input.host_surface === GOALBAR_HOST_SURFACE
      && input.thread_id === expectedSessionId
    const redactedInvalidRequest = errorKind === 'thread_agent_binding_invalid_request'
      && input.host_surface === null
      && input.thread_id === null
    return exitCode !== 0
      && input.ok === false
      && input.goal_id === null
      && input.agent_id === null
      && pairs.length === 0
      && (exactEcho || redactedInvalidRequest)
      ? { kind: 'unavailable' }
      : undefined
  }

  return undefined
}

export function decodeGoalActivationPreviewV1(
  value: unknown,
  expectedGoalId: string,
  exitCode: number,
): GoalBarActivationV1 | undefined {
  const input = record(value)
  const readback = record(input?.readback)
  if (!isGoalBarGoalId(expectedGoalId)
    || exitCode !== 0
    || input?.schema_version !== ACTIVATION_TRANSITION_SCHEMA
    || input.goal_id !== expectedGoalId
    || input.ok !== true
    || input.dry_run !== true
    || input.execute !== false
    || input.written !== false
    || input.partial_write !== false
    || input.after_state !== 'stopped'
    || readback?.schema_version !== ACTIVATION_READBACK_SCHEMA) return undefined

  if (input.before_state === 'active') {
    return input.changed === true
      && readback.status === 'not_executed'
      && readback.verified === false
      ? 'active'
      : undefined
  }
  if (input.before_state === 'stopped') {
    return input.changed === false
      && readback.status === 'not_required'
      && readback.verified === true
      ? 'stopped'
      : undefined
  }
  return undefined
}

export function decodeAgentLaneTodoProgressV0(
  value: unknown,
  expectedGoalId: string,
  expectedAgentId: string,
  exitCode: number,
): GoalBarProgressV1 | undefined {
  const input = record(value)
  const projection = record(input?.todo_list_projection)
  const agentTodos = record(input?.agent_todos)
  const items = agentTodos?.items
  const returnedItems = input?.todos
  const processed = agentTodos?.done_count
  const remaining = agentTodos?.open_count
  const total = agentTodos?.total_count
  const returnedCount = input?.returned_todo_count

  if (!isGoalBarGoalId(expectedGoalId)
    || !isGoalBarAgentId(expectedAgentId)
    || exitCode !== 0
    || input?.ok !== true
    || input.read_only !== true
    || input.command !== 'list'
    || input.goal_id !== expectedGoalId
    || input.agent_id_filter !== expectedAgentId
    || input.role !== 'agent'
    || input.explicit_limit !== 1
    || projection?.schema_version !== TODO_PROJECTION_SCHEMA
    || projection.view !== TODO_PROJECTION_VIEW
    || projection.item_limit_per_role !== 1
    || projection.counts_cover_full_match !== true
    || !safeCount(processed)
    || !safeCount(remaining)
    || !safeCount(total)
    || !Number.isSafeInteger(processed + remaining)
    || processed + remaining !== total
    || !safeCount(input.todo_count)
    || !safeCount(returnedCount)
    || !safeCount(projection.matched_todo_count)
    || !safeCount(projection.returned_todo_count)
    || total !== projection.matched_todo_count
    || input.todo_count !== returnedCount
    || returnedCount !== projection.returned_todo_count
    || !Array.isArray(items)
    || !Array.isArray(returnedItems)
    || items.length !== returnedCount
    || returnedItems.length !== returnedCount
    || returnedCount > 1) return undefined

  return { processed, remaining, total }
}

async function executeJsonRead(
  options: GoalBarCliReadOptions,
  args: readonly string[],
): Promise<JsonReadResult> {
  const runner = options.runner ?? runFile
  let exitCode: number | undefined
  const recordingRunner: FileRunner = async (file, fileArgs, runOptions) => {
    const result = await runner(file, fileArgs, runOptions)
    exitCode = result.exitCode
    return result
  }
  const payload = await runJsonCommand(options.command, args, {
    runner: recordingRunner,
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    attempts: READ_ATTEMPTS,
    retryDelaysMs: options.retryDelaysMs,
  })
  if (exitCode === undefined) {
    throw new LoopXCliError(
      'transport',
      'LoopX command result was unavailable',
      true,
    )
  }
  return { exitCode, payload }
}

function fixedFault(
  error: unknown,
  stageCode: 'binding_read_failed' | 'activation_read_failed' | 'todo_read_failed',
): { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode } {
  return {
    kind: 'fault',
    code: error instanceof LoopXCliError && error.kind === 'missing'
      ? 'cli_unavailable'
      : stageCode,
  }
}

export async function readGoalBarBinding(
  options: GoalBarCliReadOptions,
  sessionId: string,
): Promise<GoalBarBindingReadResult> {
  if (!isGoalBarSessionId(sessionId)) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }
  try {
    const result = await executeJsonRead(options, [
      '--registry', GOALBAR_PROJECT_REGISTRY,
      '--format', 'json',
      'resolve-agent-thread',
      '--host-surface', GOALBAR_HOST_SURFACE,
      '--thread-id', sessionId,
    ])
    const decoded = decodeThreadAgentBindingResolutionV0(
      result.payload,
      sessionId,
      result.exitCode,
    )
    return decoded === undefined || decoded.kind === 'unavailable'
      ? { kind: 'fault', code: 'binding_read_failed' }
      : decoded
  } catch (error: unknown) {
    return fixedFault(error, 'binding_read_failed')
  }
}

export async function readGoalBarActivation(
  options: GoalBarCliReadOptions,
  goalId: string,
): Promise<GoalBarActivationReadResult> {
  if (!isGoalBarGoalId(goalId)) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }
  try {
    const result = await executeJsonRead(options, [
      '--registry', GOALBAR_PROJECT_REGISTRY,
      '--format', 'json',
      'goal-lifecycle',
      '--goal-id', goalId,
      '--operation', 'stop',
    ])
    const goalActivation = decodeGoalActivationPreviewV1(
      result.payload,
      goalId,
      result.exitCode,
    )
    return goalActivation === undefined
      ? { kind: 'fault', code: 'activation_read_failed' }
      : { kind: 'value', goalActivation }
  } catch (error: unknown) {
    return fixedFault(error, 'activation_read_failed')
  }
}

export type BoardProjectionReadResult =
  | { readonly kind: 'ready'; readonly data: BoardDataSnapshotV1 }
  | { readonly kind: 'choose'; readonly goals: readonly BoardGoalChoiceV1[] }
  | { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode }

const WORKSPACE_GOAL_LIMIT = 20

export function decodeWorkspaceGoalChoices(
  value: unknown,
  exitCode: number,
): BoardGoalChoiceV1[] | undefined {
  const input = record(value)
  const goals = input?.goals
  if (exitCode !== 0 || input?.ok !== true || !Array.isArray(goals)) return undefined
  const choices: BoardGoalChoiceV1[] = []
  for (const item of goals) {
    const goal = record(item)
    if (goal === undefined || goal.status !== 'active' || !isGoalBarGoalId(goal.id)) continue
    const agents = Array.isArray(goal.registered_agents) ? goal.registered_agents : []
    const loopxAgentId = agents.find(isGoalBarAgentId) ?? 'default'
    if (!isGoalBarAgentId(loopxAgentId)) return undefined
    const rawTitle = typeof goal.display_name === 'string' ? goal.display_name : goal.id
    const title = clipBoardTitle(rawTitle) ?? goal.id
    choices.push({ goalId: goal.id, title, loopxAgentId })
    if (choices.length >= WORKSPACE_GOAL_LIMIT) break
  }
  return choices
}

export function publicSafeAgentIdForSession(sessionId: string): string {
  const compact = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '')
  const tail = compact.slice(-16) || 'session'
  return `dsh_${tail}`
}

function clipBoardTitle(value: string): string | undefined {
  const trimmed = value.replace(/^\[P\d\]\s*/u, '').trim()
  if (trimmed.length === 0 || /[\u0000-\u001f\u007f]/u.test(trimmed)) return undefined
  const chars = [...trimmed]
  return chars.length <= BOARD_TITLE_MAX ? trimmed : chars.slice(0, BOARD_TITLE_MAX).join('')
}

function boardTaskStatus(item: Record<string, unknown>): BoardTaskStatusV1 {
  if (item.status === 'done' || item.done === true) return 'done'
  if (item.task_class === 'continuous_monitor' || item.status === 'deferred') return 'scheduled'
  if (
    item.task_class === 'user_gate'
    || item.role === 'user'
    || item.status === 'blocked'
  ) return 'waiting'
  return 'in_progress'
}

function decodeBoardTodoItem(value: unknown): BoardTaskV1 | undefined {
  const item = record(value)
  if (item === undefined || typeof item.todo_id !== 'string' || item.todo_id.length === 0) {
    return undefined
  }
  const rawTitle = typeof item.title === 'string' && item.title.trim() !== ''
    ? item.title
    : typeof item.text === 'string' ? item.text : ''
  const title = clipBoardTitle(rawTitle)
  if (title === undefined) return undefined
  return {
    id: [...item.todo_id].length <= 80 ? item.todo_id : [...item.todo_id].slice(0, 80).join(''),
    title,
    status: boardTaskStatus(item),
    taskClass: typeof item.task_class === 'string' && item.task_class.length > 0
      ? item.task_class.slice(0, 64)
      : null,
    claimedBy: isGoalBarAgentId(item.claimed_by) ? item.claimed_by : null,
  }
}

export function decodeBoardTodoListV0(
  value: unknown,
  expectedGoalId: string,
  exitCode: number,
  expectedRole: 'agent' | 'user' = 'agent',
): { readonly tasks: readonly BoardTaskV1[]; readonly progress: GoalBarProgressV1 } | undefined {
  const input = record(value)
  const summary = record(expectedRole === 'user' ? input?.user_todos : input?.agent_todos)
  const todos = input?.todos
  if (exitCode !== 0
    || input?.ok !== true
    || input.command !== 'list'
    || input.goal_id !== expectedGoalId
    || input.role !== expectedRole
    || !Array.isArray(todos)) {
    return undefined
  }
  const tasks: BoardTaskV1[] = []
  for (const item of todos.slice(0, BOARD_TODO_LIMIT)) {
    const task = decodeBoardTodoItem(item)
    if (task === undefined) return undefined
    tasks.push(task)
  }
  const processed = typeof summary?.done_count === 'number' && Number.isSafeInteger(summary.done_count)
    ? summary.done_count
    : tasks.filter(task => task.status === 'done').length
  const remaining = typeof summary?.open_count === 'number' && Number.isSafeInteger(summary.open_count)
    ? summary.open_count
    : tasks.filter(task => task.status !== 'done').length
  const total = typeof summary?.total_count === 'number' && Number.isSafeInteger(summary.total_count)
    ? summary.total_count
    : processed + remaining
  if (processed < 0 || remaining < 0 || total !== processed + remaining) return undefined
  return {
    tasks,
    progress: { processed, remaining, total },
  }
}

const emptyBoard = (sessionId: string): BoardDataSnapshotV1 => ({
  sessionId,
  goalId: null,
  loopxAgentId: null,
  sessionBound: false,
  goalActivation: null,
  progress: null,
  tasks: [],
  nextActionTitle: null,
  nextActionKind: null,
  goalTitle: null,
  domain: null,
  laneCount: null,
  bindingCount: null,
})

export function decodeUniqueActiveProjectGoal(
  value: unknown,
  exitCode: number,
): { readonly goalId: string; readonly loopxAgentId: string } | 'none' | 'ambiguous' | undefined {
  const input = record(value)
  const goals = input?.goals
  if (exitCode !== 0 || input?.ok !== true || !Array.isArray(goals)) return undefined
  const active: Array<{ readonly goalId: string; readonly loopxAgentId: string }> = []
  for (const item of goals) {
    const goal = record(item)
    if (goal === undefined || goal.status !== 'active' || !isGoalBarGoalId(goal.id)) continue
    const agents = Array.isArray(goal.registered_agents) ? goal.registered_agents : []
    const loopxAgentId = agents.find(isGoalBarAgentId) ?? 'default'
    if (!isGoalBarAgentId(loopxAgentId)) return undefined
    active.push({ goalId: goal.id, loopxAgentId })
  }
  if (active.length === 0) return 'none'
  if (active.length > 1) return 'ambiguous'
  return active[0]
}

/**
 * A project that has never bootstrapped LoopX (or was fully uninstalled) has
 * no active `registry.json`. The LoopX CLI reports that as a fixed, empty-state
 * signal rather than a transport or authority failure. Mapping it to zero goals
 * keeps the board on its "no active Goal" surface instead of a hard fault.
 */
function workspaceRegistryNotProvisioned(value: unknown): boolean {
  const input = record(value)
  return input?.ok === false
    && input.error === 'registry file does not exist'
    && input.goals === undefined
    && input.schema_version === undefined
}

async function readWorkspaceGoals(
  options: GoalBarCliReadOptions,
): Promise<
  | { readonly kind: 'goals'; readonly goals: readonly BoardGoalChoiceV1[] }
  | { readonly kind: 'choose'; readonly goals: readonly BoardGoalChoiceV1[] }
  | { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode }
> {
  try {
    const result = await executeJsonRead(options, [
      '--registry', GOALBAR_PROJECT_REGISTRY,
      '--format', 'json',
      'registry',
    ])
    const goals = decodeWorkspaceGoalChoices(result.payload, result.exitCode)
    if (goals !== undefined) {
      if (goals.length === 0) return { kind: 'goals', goals }
      if (goals.length > 1) return { kind: 'choose', goals }
      return { kind: 'goals', goals }
    }
    if (workspaceRegistryNotProvisioned(result.payload)) {
      return { kind: 'goals', goals: [] }
    }
    return { kind: 'fault', code: 'binding_read_failed' }
  } catch (error: unknown) {
    return fixedFault(error, 'binding_read_failed')
  }
}

export interface GoalHeading {
  readonly goalTitle: string | null
  readonly domain: string | null
  readonly laneCount: number | null
  readonly bindingCount: number | null
}

const emptyHeading: GoalHeading = {
  goalTitle: null,
  domain: null,
  laneCount: null,
  bindingCount: null,
}

function headingSlice(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || /[\u0000-\u001f\u007f]/u.test(trimmed)) return null
  const chars = [...trimmed]
  return chars.length <= max ? trimmed : chars.slice(0, max).join('')
}

function headingCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

/** Decode the goal's public heading (title, domain, lane/binding counts) from a `loopx history` projection. */
export function decodeGoalHeading(
  value: unknown,
  expectedGoalId: string,
): GoalHeading | undefined {
  const input = record(value)
  const goals = Array.isArray(input?.goals) ? input.goals.map(record) : []
  const goal = goals.find(candidate => candidate?.id === expectedGoalId)
  if (goal === undefined) return undefined
  const coordination = record(goal.coordination)
  const agents = Array.isArray(goal.registered_agents)
    ? goal.registered_agents
    : Array.isArray(coordination?.registered_agents)
      ? coordination.registered_agents
      : []
  const bindings = Array.isArray(coordination?.thread_agent_bindings)
    ? coordination.thread_agent_bindings
    : Array.isArray(goal.thread_agent_bindings)
      ? goal.thread_agent_bindings
      : []
  return {
    goalTitle: headingSlice(goal.display_name, BOARD_TITLE_MAX),
    domain: headingSlice(goal.domain, 64),
    laneCount: headingCount(agents),
    bindingCount: headingCount(bindings),
  }
}

/** Best-effort goal heading: a failure or missing goal degrades to nulls, never a board fault. */
async function readGoalHeading(
  options: GoalBarCliReadOptions,
  goalId: string,
): Promise<GoalHeading> {
  try {
    const result = await executeJsonRead(options, [
      '--registry', GOALBAR_PROJECT_REGISTRY,
      '--format', 'json',
      'history',
      '--goal-id', goalId,
      '--limit', '1',
    ])
    return decodeGoalHeading(result.payload, goalId) ?? emptyHeading
  } catch {
    return emptyHeading
  }
}

export async function readBoardProjection(
  options: GoalBarCliReadOptions,
  sessionId: string,
): Promise<BoardProjectionReadResult> {
  if (!isGoalBarSessionId(sessionId)) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }
  const binding = await readGoalBarBinding(options, sessionId)
  if (binding.kind === 'fault') return binding
  if (binding.kind === 'unavailable') return { kind: 'fault', code: 'binding_read_failed' }
  let goalId: string
  let loopxAgentId: string
  let sessionBound = false
  if (binding.kind === 'bound') {
    goalId = binding.goalId
    loopxAgentId = binding.loopxAgentId
    sessionBound = true
  } else {
    const workspace = await readWorkspaceGoals(options)
    if (workspace.kind === 'fault') return workspace
    if (workspace.kind === 'choose') return workspace
    if (workspace.goals.length === 0) {
      return { kind: 'ready', data: emptyBoard(sessionId) }
    }
    const single = workspace.goals[0]
    if (single === undefined) {
      return { kind: 'fault', code: 'binding_read_failed' }
    }
    goalId = single.goalId
    loopxAgentId = single.loopxAgentId
  }

  const listTodos = async (role: 'agent' | 'user') => {
    try {
      return await executeJsonRead(options, [
        '--registry', GOALBAR_PROJECT_REGISTRY,
        '--format', 'json',
        'todo', 'list',
        '--goal-id', goalId,
        '--role', role,
        '--limit', String(BOARD_TODO_LIMIT),
      ])
    } catch (error: unknown) {
      return fixedFault(error, 'todo_read_failed')
    }
  }

  const [activation, agentResult, userResult, heading] = await Promise.all([
    readGoalBarActivation(options, goalId),
    listTodos('agent'),
    listTodos('user'),
    readGoalHeading(options, goalId),
  ])
  if (activation.kind === 'fault') return activation
  if ('kind' in agentResult && agentResult.kind === 'fault') return agentResult
  if ('kind' in userResult && userResult.kind === 'fault') return userResult
  if (activation.kind !== 'value' || !('payload' in agentResult) || !('payload' in userResult)) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }
  const agentDecoded = decodeBoardTodoListV0(
    agentResult.payload, goalId, agentResult.exitCode, 'agent',
  )
  const userDecoded = decodeBoardTodoListV0(
    userResult.payload, goalId, userResult.exitCode, 'user',
  )
  if (agentDecoded === undefined || userDecoded === undefined) {
    return { kind: 'fault', code: 'todo_read_failed' }
  }
  const tasks = [
    ...userDecoded.tasks,
    ...agentDecoded.tasks.filter(task => (
      !userDecoded.tasks.some(userTask => userTask.id === task.id)
    )),
  ].slice(0, BOARD_TODO_LIMIT)
  const gate = tasks.find(task => (
    task.status === 'waiting' && (task.taskClass === 'user_gate' || task.taskClass === 'user_action')
  ))
  const nextOpen = gate
    ?? tasks.find(task => task.status === 'in_progress')
    ?? tasks.find(task => task.status === 'waiting')
  const nextActionKind = nextOpen === undefined
    ? null
    : gate !== undefined || nextOpen.taskClass === 'user_gate' || nextOpen.taskClass === 'user_action'
      ? 'user_gate'
      : 'agent'
  return {
    kind: 'ready',
    data: {
      sessionId,
      goalId,
      loopxAgentId,
      sessionBound,
      goalActivation: activation.goalActivation,
      progress: agentDecoded.progress,
      tasks,
      nextActionTitle: nextOpen?.title ?? null,
      nextActionKind,
      ...heading,
    },
  }
}

export async function readGoalBarProgress(
  options: GoalBarCliReadOptions,
  goalId: string,
  loopxAgentId: string,
): Promise<GoalBarProgressReadResult> {
  if (!isGoalBarGoalId(goalId) || !isGoalBarAgentId(loopxAgentId)) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }
  try {
    const result = await executeJsonRead(options, [
      '--registry', GOALBAR_PROJECT_REGISTRY,
      '--format', 'json',
      'todo', 'list',
      '--goal-id', goalId,
      '--role', 'agent',
      '--agent-id', loopxAgentId,
      '--limit', '1',
    ])
    const progress = decodeAgentLaneTodoProgressV0(
      result.payload,
      goalId,
      loopxAgentId,
      result.exitCode,
    )
    return progress === undefined
      ? { kind: 'fault', code: 'todo_read_failed' }
      : { kind: 'value', progress }
  } catch (error: unknown) {
    return fixedFault(error, 'todo_read_failed')
  }
}

function preferredReadFault(
  activation: GoalBarActivationReadResult,
  progress: GoalBarProgressReadResult,
): { readonly kind: 'fault'; readonly code: GoalBarReadFaultCode } | undefined {
  const faults = [activation, progress].filter(
    (result): result is Extract<typeof result, { readonly kind: 'fault' }> => (
      result.kind === 'fault'
    ),
  )
  if (faults.length === 0) return undefined
  return faults.find(fault => fault.code === 'cli_unavailable')
    ?? faults.find(fault => fault.code === 'protocol_mismatch')
    ?? faults[0]
}

export async function readGoalBarModel(
  options: GoalBarReadModelOptions,
): Promise<GoalBarReadModelResult> {
  if (!isGoalBarSessionId(options.sessionId)
    || (options.agentStatus !== 'idle' && options.agentStatus !== 'running')) {
    return { kind: 'fault', code: 'protocol_mismatch' }
  }

  const binding = await readGoalBarBinding(options, options.sessionId)
  if (binding.kind === 'fault') return binding
  if (binding.kind === 'missing') {
    return { kind: 'hidden', reason: 'binding_missing' }
  }
  if (binding.kind === 'ambiguous') {
    return {
      kind: 'hidden',
      reason: 'binding_ambiguous',
      uniquePairCount: binding.uniquePairCount,
    }
  }
  if (binding.kind === 'unavailable') {
    return { kind: 'fault', code: 'binding_read_failed' }
  }

  const [activation, progress] = await Promise.all([
    readGoalBarActivation(options, binding.goalId),
    readGoalBarProgress(options, binding.goalId, binding.loopxAgentId),
  ])
  const fault = preferredReadFault(activation, progress)
  if (fault !== undefined) return { ...fault, binding }
  if (activation.kind !== 'value' || progress.kind !== 'value') {
    return { kind: 'fault', code: 'protocol_mismatch', binding }
  }
  return {
    kind: 'present',
    snapshot: {
      sessionId: options.sessionId,
      goalId: binding.goalId,
      loopxAgentId: binding.loopxAgentId,
      goalActivation: activation.goalActivation,
      agentStatus: options.agentStatus,
      progress: progress.progress,
    },
  }
}
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
