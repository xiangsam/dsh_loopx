# DeepSeek Harness 上的 LoopX 插件

`dsh-loopx-plugin` 是把 [LoopX](https://github.com/huangruiteng/loopx) 接到
DeepSeek Harness（DSH）的插件。它不替代 LoopX。

装好之后，在**要推进工作的那条对话**里用 `/loopx <任务>` 启动。这是按会话
选择加入：同一文件夹里的其他 DSH 聊天仍是普通会话，没有 LoopX Goal 标签，
也没有 GoalBar。只有被 `/loopx` 绑定的 Session 才会显示一条紧凑 GoalBar。
Goal、Agent、Todo、quota、线程绑定的权威数据仍然只在 LoopX 里。

English: [README.md](README.md)。
GoalBar 怎么挂到对话上：[docs/session-goal-surface.zh.md](docs/session-goal-surface.zh.md)。

当前源码版本：**0.1.1-beta.6**。已经发布的预构建包是 **0.1.1-beta.4**。
如果要安装和 `package.json` 一致的源码，请在本仓库根目录运行 `./install.sh`。

## 插件提供什么

一个包，三行 DSH Loader：

| 行 | 做什么 | 何时生效 |
| --- | --- | --- |
| **Init（初始化）** | 安装或升级一份隔离的 LoopX CLI，以及 LoopX 工作流 skills，并在 DSH 加载完成前校验 DSH 原生 `loopx` 入口。 | DSH 启动时自动执行。`/loopx-init` 只是失败后的修复命令。 |
| **Driver（同会话驱动）** | 仅当**当前这个 Session** 成功调用了名为 `loopx` 的 skill 之后，才会向 LoopX 询问下一轮是否可跑，并把 heartbeat 排进这个活着的 DSH Agent。 | 必须先有本 Session 里的 typed `loopx` skill 证据。只装插件不够。 |
| **GoalBar** | 在 DSH 原生 GoalBar 和 Queue 之间放一条紧凑 LoopX 状态栏。只读 CLI，不克隆仪表盘，也不给每条会话加标签。 | 仅当**当前 Session** 被 `/loopx` 绑定后才显示。同一文件夹里的其他聊天仍是普通 DSH 会话。 |

插件**不会**向模型暴露 LoopX tools，也不会自己存 Goal/Todo。模型使用安装好的
LoopX skills，并直接调用 LoopX CLI。

## 环境要求

- Node.js 22.19+（不支持 Node.js 23）或 Node.js 24+
- 源码安装需要 `pnpm` 9+
- Python 3.11+ 且带 `pip`（初始化会先看 `PYTHON_BIN`，再试 `python3`、
  `python3.14`、`python3.13`、`python3.12`、`python3.11`）
- 第一次启动 DSH 时，如果本机还没有兼容的 LoopX CLI，需要能访问网络

不必事先安装 LoopX。插件如果要安装或升级，会把隔离副本写到
`$DSH_AGENTS_HOME/runtime/dsh-loopx-plugin`（默认
`~/.agents/runtime/dsh-loopx-plugin`），不会改系统 Python。
已发布插件要求 **LoopX 0.5.4 或更新**。

## 安装

### 预构建包（已发布的 tarball）

```bash
dsh plugin --profile web add \
  "https://github.com/huangruiteng/loopx/releases/download/dsh-loopx-plugin-v0.1.1-beta.4/dsh-loopx-plugin-0.1.1-beta.4.tgz"
```

### 本仓库源码

在插件根目录（本仓库）执行：

```bash
./install.sh
```

它会按当前 `package.json` 版本构建、打包、装进 DSH `web` profile，并核对上面
三行都在。

然后在 loopback 上启动 DSH。端口 `0` 表示让系统分配空闲端口。打开打印出的
URL。插件会在 DSH 公布 Web URL **之前**完成 LoopX CLI 和 skill 引导：

```bash
dsh --profile web --port 0
```

随后立刻可以用 `/loopx <任务>`。如果自动初始化在 DSH 日志里报告了安全失败，
先修好指出的 Python / 包管理问题，再运行一次 `/loopx-init`。正常安装不需要
这条命令。

## 第一次使用

1. 打开你希望 LoopX 管理的项目，新建一个 DSH 对话。
2. 输入 `/loopx` 加上具体任务，例如 `/loopx 把插件功能和安装说清楚`。
3. 安装好的 `loopx` skill 会使用本 Session 的 `$DSH_SESSION_ID` 和
   `--host-surface deepseek-harness-native`。按 LoopX CLI 返回的 typed
   命令执行，不要自己编 Goal / Agent id。
4. 本 Session 绑定成功后，GoalBar 才能显示 Start / Pause 和待办进度。
   `Start` 只会在这个活着的 Session 已经有 typed `loopx` skill 证据时恢复已停止的 Goal。
   `Pause` 会停止 Goal 并取消尚未开始的后续轮次，但不会中断已经 claim / 正在跑的一轮。

在本 Session 的 DSH shell 里核对绑定：

```bash
loopx --registry .loopx/registry.json --format json \
  resolve-agent-thread \
  --host-surface deepseek-harness-native \
  --thread-id "$DSH_SESSION_ID"
```

`status=bound` 且只有一对精确的 Goal/Agent，GoalBar 才会显示。缺失或有歧义时
失败关闭，不渲染。

LoopX 的 Goal 挂在项目上。DSH 的 Session 是独立任务。只有调用过 `/loopx` 并
绑定了本线程的会话才会显示 GoalBar；同一文件夹里的其他聊天不受影响。Driver
只会推进 quota 允许的 agent todo，并且不会跳过 `user_gate`。

## 实际会用到的命令

- `/loopx <任务>` — 在本项目启动或继续一个具体 LoopX Goal。
- `/loopx` — 查看连接、状态、gates 和下一步安全动作。
- `/loopx-init` — 自动初始化失败后，修复 LoopX CLI / skills。无参数。
- `/loopx-pr-review` — 走 LoopX 的 PR review skill。
- `/loopx-global-summary`、`/loopx-global-gates`、`/loopx-global-todos`、
  `/loopx-global-risks` — 只读的全局管理视图。

## 什么情况**不会**激活 Driver

Driver 按 Session 生效，不是按插件、进程、Agent、Goal 或项目生效。只有下面
这些 durable typed 事实算数：

- `user/message` 的 source 恰好是 `skill-invocation`，name 恰好是 `loopx`，
  form 恰好是 `instructions`
- 模型 `tool/call` 的 name 恰好是 `skill`，参数 JSON 里 `name` 恰好是
  `loopx`，并且之后有对应的成功 `tool/result`

技能目录、普通文字、shell 文本、`/loopx-init`、插件自己写的 init / heartbeat
消息、失败或被覆盖的模型调用，以及「本机已有 CLI / registry / Goal / 项目文件」
都**不会**激活它。替换或清空 Session 后，只从新历史重新计算。

## 卸载

从 web profile 移除插件，然后重启 DSH：

```bash
dsh plugin --profile web remove dsh-loopx-plugin
```

这会去掉 GoalBar、Driver 和 `/loopx-init`，但**不会**删除 LoopX、它的
registry、绑定、skills，或插件管理的 runtime。

只卸载 LoopX 管理的 skills：

```bash
loopx workflow-skills --uninstall \
  --skills-dir "${DSH_AGENTS_HOME:-$HOME/.agents}/skills"
```

DSH 已停止且插件已移除后，可以单独删掉隔离的 CLI 副本，不动 LoopX 状态：

```bash
DSH_LOOPX_RUNTIME="${DSH_AGENTS_HOME:-$HOME/.agents}/runtime/dsh-loopx-plugin"
test -f "$DSH_LOOPX_RUNTIME/loopx_cli.py" && rm -rf -- "$DSH_LOOPX_RUNTIME"
```

回滚插件但保留 LoopX 状态时，先移除再装回之前留存的 tarball：

```bash
RETAINED_PREVIOUS_DSH_LOOPX_TARBALL=/absolute/path/to/retained/previous-dsh-loopx-plugin.tgz
dsh plugin --profile web remove dsh-loopx-plugin
dsh plugin --profile web add "$RETAINED_PREVIOUS_DSH_LOOPX_TARBALL" --ignore-scripts
dsh --profile web --dump-config
```

## 权限与隐私

`/loopx` 的 Connection 权限是 `loopback`。这是网络可达性围栏，不是用户认证。
Phase 1 不支持局域网或远程浏览器。浏览器只提供注入的 DSH Session id，以及
动作所需的上次已校验 Goal/Agent 对。Host 从活着的 DSH Agent 重新推导 cwd 和
线程身份，重新解析绑定，并且只执行固定的 LoopX argv。

线上允许的字段只有 id、激活状态、活 Agent 状态、通道计数、游标、不透明
source revision 和固定错误码。不包括 Todo 文本、Goal 目标、quota、证据、
CLI 输出、异常信息、registry 路径、凭据和绑定候选。

## 维护者检查

```bash
pnpm build
pnpm smoke:artifact
pnpm smoke:profile
pnpm smoke:runtime
pnpm smoke:docker
```

这些检查覆盖打包、profile 组合、自动初始化、Client 物化，以及干净容器安装。
它们不能替代在真实 DSH URL 上由 owner 过目的浏览器 Start / Pause 门禁。
Docker smoke 需要 Docker、`uv` 和网络，不会打开浏览器，也不会配置模型供应商。
