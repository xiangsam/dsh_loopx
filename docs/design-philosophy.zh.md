# 设计说明：DeepSeek Harness 上的 LoopX

这是一个把 LoopX 状态接到 DSH 上的插件，**不是**重写 LoopX。Goal、Agent、Todo、
quota、线程绑定的唯一权威仍然在 LoopX。本文记录插件映射到 DSH 的模型，以及为什么这样设计。

## LoopX 的原生模型

LoopX 通过持久化以下内容，让长任务在多次 agent 轮次之间持续推进：

- **Goal（目标）** — 挂在**项目**里的长期目标（`<project>/.loopx/registry.json`）。
  带 id、状态（`active` / `stopped` / 归档）、`registered_agents[]` 和
  `thread_agent_bindings[]`。
- **Agent（工人）** — 一条驱动车道。一个 Goal 可注册多个 Agent，由 quota
  准入的那条车道推进。
- **Thread（线程）** — 绑定到某个 Goal *和* 某个 Agent 的宿主对话
  （`host_surface`、`thread_id`、`agent_id`）。线程决定某条对话如何认领车道。
- **Todo / Task（任务）** — 有 `role`（`agent`/`user`）、`status`、
  `task_class`（`advancement_task`、`user_gate`、`user_action`、
  `continuous_monitor` 等）和 `claimed_by` 的有界工作项。
- **Gate / Quota（门槛/配额）** — LoopX 决定下一轮 Agent 能否运行
  （`quota should-run`），并且不会跳过 `user_gate`。

## DSH 侧的适配（只有一种 Agent，就是 DSH）

DSH 是宿主上唯一一种 Agent surface，所以插件把通用多 Agent 图景收敛到宿主：

- **DSH Session = LoopX thread**。插件绑定精确的 `$DSH_SESSION_ID` 到
  Goal + Agent，而不是另造一个车道对象。
- 绑定 Session 的 Agent id 由确定性、公开安全的函数生成：
  `publicSafeAgentIdForSession(sessionId)` → `dsh_<压缩后的 session 尾>`。
  这是本插件唯一会创建的 Agent 类型。
- 已经运行的 Goal 对任何未绑定 Session 都只**旁观**，由绑定的那个会话**驱动**。
  插件绝不自动绑定：加入是选择性的（`以新工人加入` / `在此交互接管`）。
- Start / Pause / Leave 都要求**恰好这个 Session** 已绑定。绑定解析之前，
  未绑定 Session 什么都不渲染。

## 为什么 UI 刻意保持很窄

插件**不克隆** LoopX 的仪表盘：

- 一个紧凑的 **GoalBar** dock 展示唯一绑定 Goal 的激活状态、进度和
  Start/Pause/Leave。
- 一个**任务面板**（`conversation.view`）展示对本 Session 可见的 Goal 的下一步
  和未完成工作，按状态分组（需要你 / 进行中 / 等待中 / 持续观察），并带进度条和
  计数汇总。它是只读投影，不是可编辑看板。
- 线上白名单很窄：id、激活状态、活的 Agent 状态、计数、游标、不透明 source
  revision、固定错误码。**Todo 文本、目标、quota、证据、CLI 输出、registry 路径、
  Agent id 都不在线上。** UI 绝不打印 Agent id。

### 视觉处理

面板是只读投影，而不是重建的看板，样式也保持这一点：中性色来自 DSH token
（因此适配浅色/深色），再用一小撮插件自带 token 表达状态。活的 Goal 读作绿色，
暂停的 Goal 读作灰色，等待用户的 Goal 则呈现为明确的红色「需要你」状态。下一步
卡片带有一条竖条，代理工作为绿色、用户闸口为红色，让唯一阻断进度的动作一目了然。
动效只保留缓慢的状态脉冲和进度填充，并在 `prefers-reduced-motion` 下关闭。

## 失败即关闭

读取严格且失败即关闭：

- 无绑定且**项目无活跃 Goal** → 干净的空面板，提示 `/loopx <任务>`
  （缺失/未初始化的 registry 视为「无活跃 Goal」，而不是故障）。
- 绑定缺失或有歧义 → 什么都不渲染。
- 畸形 CLI 响应、可执行文件缺失、权威错误 → 固定故障码；面板绝不猜测。

## 「只有一种 Agent」这条规则

对 DSH 而言，它的意思是：插件从不另起一个 Agent 运行时——DSH 就是那个 Agent，
LoopX 的 Agent 车道只是某个绑定会话所驱动的身份。新的未绑定会话注册自己的车道，
而不是悄悄复用正在运行的车道；`在此交互接管` 是显式的例外口子。
