# Design: LoopX on DeepSeek Harness

This repository is a DSH plugin that surfaces LoopX state on the harness. It does
**not** reimplement LoopX. LoopX remains the only writer of Goal, Agent, Todo,
quota, and thread-binding data. This document records the model the plugin maps
onto DSH and why it is shaped that way.

## The LoopX model

LoopX keeps long-running work moving between agent turns by persisting:

- **Goal** — a long-running objective that lives in the **project**
  (`<project>/.loopx/registry.json`). It carries an id, a status
  (`active` / `stopped` / archival), `registered_agents[]`, and
  `thread_agent_bindings[]`.
- **Agent** — a driver lane. Several agents may be registered on one Goal; a
  Goal is advanced by whichever lane is admitted by quota.
- **Thread** — a host chat session bound to a Goal *and* an Agent
  (`host_surface`, `thread_id`, `agent_id`). A thread is how a specific chat
  claims a lane.
- **Todo / Task** — a bounded piece of work with a `role` (`agent` / `user`),
  `status`, a `task_class` (`advancement_task`, `user_gate`, `user_action`,
  `continuous_monitor`, …), and a `claimed_by` agent.
- **Gate / Quota** — LoopX decides whether the next Agent turn may run
  (`quota should-run`) and will not skip a `user_gate`.

## The DSH adaptation (single agent = DSH)

DSH is the one agent surface on the harness, so the plugin collapses the generic
multi-agent picture onto the harness:

- A **DSH Session** is a **LoopX thread**. The plugin binds the exact
  `$DSH_SESSION_ID` to a Goal + Agent instead of inventing a separate lane
  object.
- The Agent id for a bound Session is derived deterministically and
  public-safe: `publicSafeAgentIdForSession(sessionId)` →
  `dsh_<compacted-session-tail>`. It is the only Agent kind this plugin creates.
- A Goal that is already running is **watched** by any unbound DSH Session and
  **driven** by the bound one. The plugin never auto-binds: joining is opt-in
  (`Join as new worker` / `Take over here`).
- Start / Pause / Leave require **this exact Session** to be bound. Nothing is
  rendered for an unbound Session until the GoalBar binding is resolved.

## Why the UI is deliberately narrow

The plugin intentionally does **not** clone the LoopX dashboard:

- A compact **GoalBar** dock shows the one bound Goal's activation, progress,
  and Start/Pause/Leave.
- A **task panel** (`conversation.view`) shows the project's next step and open
  work for the Goal visible to this Session, grouped by status (needs-you /
  in-progress / waiting / watching), plus a progress bar and a count summary.
  It is a read projection, not a kanban editor.
- The wire allowlist is narrow: ids, activation, live agent status, counts,
  cursors, opaque source revisions, and fixed error codes. **Todo text, objective,
  quota, evidence, CLI output, registry paths, and agent ids are excluded.** The
  UI never prints an agent id.

### Visual treatment

The panel is a read projection, not a rebuilt dashboard, and it is styled to stay
that way: neutrals come from DSH tokens (so light/dark adapt), while a tiny set of
plugin-scoped tokens expresses status. A live goal reads green, a paused goal
reads muted, and a goal waiting on the user reads as an explicit danger
"need you" state. The next-step card carries an accent rail that is green for
agent work and red for a user gate, so the one action that blocks progress is
unmistakable. Motion is limited to a slow status pulse and progress fill and is
disabled under `prefers-reduced-motion`.

## Fail-closed behavior

Reads are strict and fail closed:

- No binding, and **no active Goal in the project** → a clean empty panel with a
  prompt to `/loopx <task>` (a missing/unprovisioned registry is treated as "no
  active Goal", not as a fault).
- Binding is missing or ambiguous → nothing is rendered.
- A malformed CLI response, a missing executable, or an authority error → a fixed
  fault code; the panel never guesses.

## The one Agent rule

Interpreted for DSH, "only one kind of agent" means the plugin never spins up a
separate agent runtime: DSH is the agent, and the LoopX Agent lane is just the
identity that a bound Session drives. A fresh unbound Session registers its own
lane rather than silently reusing a running one; `Take over here` is the explicit
escape hatch.
