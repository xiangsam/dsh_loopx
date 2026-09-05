# LoopX for DeepSeek Harness

`dsh-loopx-plugin` is the DeepSeek Harness (DSH) plugin that connects a project
to [LoopX](https://github.com/huangruiteng/loopx). It does not replace LoopX.

After it is installed, start durable LoopX work with `/loopx <task>` in the
chat that should drive it. That bind-this-chat step is opt-in: other DSH
Sessions in the same folder stay ordinary chats until they also `/loopx`.
The bound Session shows a compact GoalBar and a LoopX task panel. A new
unbound chat must not take over another chat's worker. LoopX remains the
only authority for Goal, Agent, Todo, quota, and thread-binding data.

Chinese: [README.zh.md](README.zh.md).
How GoalBar attaches: [docs/session-goal-surface.md](docs/session-goal-surface.md).
Design rationale (model + single-agent rule): [docs/design-philosophy.md](docs/design-philosophy.md).

Current checkout version: **0.1.1-beta.6**. The last published prebuilt
tarball is **0.1.1-beta.4**. Install this checkout with `./install.sh` if you
want the source that matches `package.json`.

## What you get

One package, three DSH Loader rows:

| Row | What it does | When it becomes active |
| --- | --- | --- |
| **Init** | Installs or upgrades a private LoopX CLI and the LoopX workflow skills, then verifies the DSH-native `loopx` entry before DSH finishes loading the plugin. | Automatically on DSH start. `/loopx-init` is only a repair command. |
| **Driver** | After *this exact Session* successfully invokes the exact `loopx` skill, asks LoopX whether another turn may run and queues that heartbeat into the live DSH Agent. | Only after typed `loopx` skill evidence in this Session. Installing the plugin is not enough. |
| **GoalBar + task panel** | A compact status row on the composer, plus a LoopX `conversation.view` panel with a progress bar, a count summary, grouped open work, and the next step. Both read LoopX CLI; they do not clone the dashboard. | GoalBar is hidden until *this exact Session* is bound. The panel can show a unique project Goal as watch-only. Start/Pause and Leave this chat require this Session to be bound. |

### Task panel

For the Goal visible to this Session, the panel shows:

- **Goal header** — activation (Active/Paused) and drive/watch mode, the Goal id,
  a progress bar with `done / total` and a percentage, and a summary of open,
  done, and needs-you counts.
- **Open work** — grouped by status: *Needs you*, *In progress*, *Waiting*,
  *Watching*, each with a count. Items that need you are highlighted.
- **Next step** — the next action (agent todo or a user gate), with a shortcut
  back to chat.

A Session that is not bound and finds **no active Goal** in the project shows a
clean "not bound" prompt instead of an error, so a fresh workspace is not a
fault.

The plugin does **not** expose LoopX model tools, a binding sidecar, or its own
Goal/Todo store. Models use the installed LoopX skills and call the LoopX CLI
directly.

## Requirements

- Node.js 22.19+ (Node.js 23 is not supported) or Node.js 24+
- `pnpm` 9+ for a source install
- Python 3.11+ with `pip` (the initializer tries `PYTHON_BIN`, then
  `python3`, `python3.14`, `python3.13`, `python3.12`, `python3.11`)
- Network access on the first DSH start if no compatible LoopX CLI is present

LoopX itself is not a prerequisite. If the plugin must install or upgrade it,
it writes an isolated copy under `$DSH_AGENTS_HOME/runtime/dsh-loopx-plugin`
(default `~/.agents/runtime/dsh-loopx-plugin`) and never mutates the system
Python environment. The published plugin requires **LoopX 0.5.4 or newer**.

## Install

### Prebuilt release (published tarball)

```bash
dsh plugin --profile web add \
  "https://github.com/huangruiteng/loopx/releases/download/dsh-loopx-plugin-v0.1.1-beta.4/dsh-loopx-plugin-0.1.1-beta.4.tgz"
```

### This source checkout

From the plugin root (this repository):

```bash
./install.sh
```

That builds the current `package.json` version, packs it, installs it into
the DSH `web` profile, and checks that the three rows above are present.

Then start DSH on loopback. Port `0` asks the OS for a free port. Open the
printed URL. The plugin finishes its LoopX CLI and skill bootstrap *before*
DSH publishes the Web URL:

```bash
dsh --profile web --port 0
```

Use `/loopx <task>` immediately. If automatic initialization reports a safe
failure in the DSH log, fix the named Python or package-manager problem and
run `/loopx-init` once. Normal installation does not need that command.

## First use

1. In the project you want LoopX to manage, start a DSH chat.
2. Run `/loopx` plus a concrete task, for example `/loopx 把插件功能和安装说清楚`.
3. The installed `loopx` skill uses this Session's `$DSH_SESSION_ID` and
   `--host-surface deepseek-harness-native`. Follow the typed LoopX CLI
   commands it returns; do not invent Goal or Agent ids.
4. After that Session is bound, the GoalBar can show Start / Pause and
   agent-lane progress. `Start` resumes a stopped Goal only when this live
   Session already has typed `loopx` skill evidence. `Pause` stops the Goal
   and retires future continuation; it does not abort a claimed or running
   turn.

To confirm the binding from this Session's DSH shell:

```bash
loopx --registry .loopx/registry.json --format json \
  resolve-agent-thread \
  --host-surface deepseek-harness-native \
  --thread-id "$DSH_SESSION_ID"
```

`status=bound` with one exact Goal/Agent pair admits the GoalBar row.
Missing or ambiguous results fail closed and render nothing.

To **leave this chat** (unbind, keep the Goal):

```bash
loopx --registry .loopx/registry.json unbind-agent-thread \
  --goal-id <goal-id> \
  --thread-id "$DSH_SESSION_ID" \
  --host-surface deepseek-harness-native \
  --agent-id <agent-id> \
  --execute
```

The task panel's **Leave this chat** button runs the same command for this
Session. To stop automatic turns without unbinding:

```bash
loopx goal-lifecycle --goal-id <goal-id> --operation stop --execute
```

A **new** DSH chat on an existing Goal should register its own worker
(`loopx start-goal --new-peer ...`). Do not pass another Session's
`--agent-id` unless you explicitly want takeover.

LoopX Goals live in the project. DSH Sessions are independent tasks. The
Driver continues a quota-admitted agent todo and will not skip a `user_gate`.

## Commands you will actually use

- `/loopx <task>` — start or continue a concrete LoopX Goal in this project.
- `/loopx` — inspect connection, status, gates, and the next safe action.
- `/loopx-init` — repair LoopX CLI / skills after a named bootstrap failure.
  It takes no arguments.
- `/loopx-pr-review` — review PRs through the LoopX PR-review skill.
- `/loopx-global-summary`, `/loopx-global-gates`, `/loopx-global-todos`,
  `/loopx-global-risks` — read-only global manager views.

## What does *not* activate the Driver

The Driver is per Session, not per plugin, process, Agent, Goal, or project.
Only these durable typed Session facts count:

- a `user/message` whose source is exactly `skill-invocation`, whose name is
  exactly `loopx`, and whose form is exactly `instructions`
- a model `tool/call` named exactly `skill`, with JSON arguments whose `name`
  is exactly `loopx`, paired with a later successful `tool/result`

A skill catalog, ordinary prose, shell text, `/loopx-init`, plugin-authored
init or heartbeat messages, a failed or superseded model call, and the mere
presence of a CLI, registry, Goal, or project file do **not** activate it.
Replacing or clearing a Session starts from that Session's new history.

## Uninstall

Remove the plugin from the web profile, then restart DSH:

```bash
dsh plugin --profile web remove dsh-loopx-plugin
```

This removes the GoalBar, Driver, and `/loopx-init`. It does **not** remove
LoopX, its registry, bindings, skills, or the plugin-managed runtime.

Remove only LoopX-managed skills:

```bash
loopx workflow-skills --uninstall \
  --skills-dir "${DSH_HOME:-$HOME/.dsh}/skills"
```

The workflow skills are installed into DSH's own skill root (`$DSH_HOME/skills`), so they are
scoped to DSH and not shared with another harness.

After DSH has stopped and the plugin has been removed, the isolated CLI copy
can be deleted without touching LoopX state:

```bash
DSH_LOOPX_RUNTIME="${DSH_AGENTS_HOME:-$HOME/.agents}/runtime/dsh-loopx-plugin"
test -f "$DSH_LOOPX_RUNTIME/loopx_cli.py" && rm -rf -- "$DSH_LOOPX_RUNTIME"
```

To roll back the plugin while keeping LoopX state, remove it and add a
previously retained tarball:

```bash
RETAINED_PREVIOUS_DSH_LOOPX_TARBALL=/absolute/path/to/retained/previous-dsh-loopx-plugin.tgz
dsh plugin --profile web remove dsh-loopx-plugin
dsh plugin --profile web add "$RETAINED_PREVIOUS_DSH_LOOPX_TARBALL" --ignore-scripts
dsh --profile web --dump-config
```

## Authority and privacy

`/loopx` is registered with Connection authority `loopback`. That is a
reachability fence, not user authentication. Phase 1 does not support LAN or
remote browsers. The browser supplies only its injected DSH Session id and,
for an action, the last validated Goal/Agent pair. The Host re-derives cwd
and thread identity from the live DSH Agent, freshly resolves the binding,
and executes only fixed LoopX argv.

The wire allowlist contains ids, activation, live Agent status, full-lane
counts, cursors, opaque source revisions, and fixed error codes. It excludes
Todo text, Goal objective, quota, evidence, CLI output, exception messages,
registry paths, credentials, and binding candidates.

## Maintainer checks

```bash
pnpm build
pnpm smoke:artifact
pnpm smoke:profile
pnpm smoke:runtime
pnpm smoke:docker
```

These prove packing, profile composition, automatic initialization, Client
materialization, and a clean-container install. They do not replace the
owner-reviewed packed-browser gate for Start / Pause in a real DSH URL.
The Docker smoke needs Docker, `uv`, and network access; it never opens a
browser or configures a model provider.
