# Session-opt-in GoalBar

LoopX Goals live in the **project**. DSH Sessions are **independent chats**.
The plugin must not put LoopX UI on every chat in a folder.

## What users see

| This DSH chat | LoopX UI | Auto-continue |
| --- | --- | --- |
| Ordinary chat, never ran `/loopx` | Nothing. Same as a normal DSH session. | No |
| This chat ran `/loopx` and is bound | Compact **GoalBar** above the composer (progress, next step, Start/Pause) | Yes, after quota |
| Same folder, different chat | Still nothing unless that chat also ran `/loopx` | No |

There is **no** LoopX Goal tab on every conversation. DSH already has its own
任务 strip on the composer. LoopX must not compete with that unless this
Session opted in.

## How to opt in

1. Open the project in DSH.
2. In **this** chat, run `/loopx` plus a concrete task.
3. LoopX binds this Session (`$DSH_SESSION_ID`) to the project Goal.
4. GoalBar appears only here. Pause here pauses the shared Goal; Start resumes
   it only if this Session still has typed `/loopx` evidence.

To continue the same Goal in a **new** chat, run `/loopx` again in that chat.
Do not expect the Goal to follow you automatically.

## Versus DSH tasks

- DSH 任务 is this Session's local checklist.
- LoopX GoalBar is the project Goal's driver strip for one bound Session.
- LoopX remains the only writer for Goal, Agent, Todo, quota, and binding.

## What we do not do

- Clone the LoopX dashboard.
- Register a `conversation.view` tab on every Session.
- Show another chat's LoopX todos in an unbound Session.
- Start/Pause from a chat that is not bound.

Chinese: [session-goal-surface.zh.md](./session-goal-surface.zh.md)
