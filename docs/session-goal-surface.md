# Session-opt-in GoalBar

LoopX Goals live in the **project**. DSH Sessions are **independent chats**.
The plugin must not put LoopX UI on every chat in a folder.

## What users see

| This DSH chat | GoalBar | Task panel | Auto-continue |
| --- | --- | --- | --- |
| Ordinary chat, never ran `/loopx` | Hidden | Watch-only if the project has one Goal; else empty | No |
| This chat ran `/loopx` and is bound | Compact row: progress, Start/Pause | Driver: next step, open work, **Leave this chat** | Yes, after quota |
| Same folder, different unbound chat | Hidden | Watch-only; no Start/Pause/Leave | No |

GoalBar stays off until this Session is bound. The task panel is the place to
see project work and to unbind. It shows the Goal header (activation, drive/watch
mode, progress bar), grouped open work by status (needs-you / in-progress /
waiting / watching) with counts, and the next step. A Session that is unbound and
finds no active Goal in the project sees a clean "not bound" prompt rather than a
fault.

Model + single-agent rule: [design-philosophy.md](./design-philosophy.md).

## How to opt in

1. Open the project in DSH.
2. In **this** chat, run `/loopx` plus a concrete task.
3. LoopX binds this Session (`$DSH_SESSION_ID`) to the project Goal.
4. GoalBar appears only here. Pause here pauses the shared Goal; Start resumes
   it only if this Session still has typed `/loopx` evidence.

A **new** unbound chat must register a fresh worker (`start-goal --new-peer`).
Do not pass another chat's `--agent-id` unless you explicitly take over.

In the task panel, an unbound chat that finds one project Goal shows
**Join as new worker** (register a fresh lane) and **Take over here** (bind
this Session to the Goal's driver agent). If the project has more than one
active Goal, the panel shows a chooser with both actions per Goal instead of
picking silently. This keeps one worker per Session and one live Driver per
Goal.

To leave this chat without deleting the Goal, use **Leave this chat** or:

```bash
loopx unbind-agent-thread --goal-id <goal-id> --thread-id "$DSH_SESSION_ID" \
  --host-surface deepseek-harness-native --agent-id <agent-id> --execute
```

## Versus DSH tasks

- DSH 任务 is this Session's local checklist.
- LoopX GoalBar is the project Goal's driver strip for one bound Session.
- LoopX remains the only writer for Goal, Agent, Todo, quota, and binding.

## Claiming is not "every chat joins"

Opening a DSH chat claims nothing. LoopX claims are **agent-scoped**; DSH
Sessions are **thread-scoped**. Only a Session with typed `/loopx` evidence
can drive.

If several chats all `/loopx` and bind the **same** agent id (often
`default`), they share that worker. That is reuse of one lane, not auto-join.
A new unbound Session should register a fresh lane unless the user explicitly
continues here. GoalBar copy must not show agent ids.

## What we do not do

- Clone the LoopX dashboard as a full kanban.
- Let Start/Pause/Leave run from a chat that is not bound.

Chinese: [session-goal-surface.zh.md](./session-goal-surface.zh.md)
