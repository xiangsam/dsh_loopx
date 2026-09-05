# 会话选择加入的 GoalBar

LoopX 的 Goal 挂在**项目**上。DSH 的 Session 是**互不继承的聊天**。
插件不能把 LoopX 界面塞进同一个文件夹里的每一条对话。

## 用户看见什么

| 这条 DSH 对话 | GoalBar | 任务面板 | 自动续跑 |
| --- | --- | --- | --- |
| 普通聊天，从没跑过 `/loopx` | 隐藏 | 项目有唯一 Goal 时可旁观；否则空 | 否 |
| 本聊天跑过 `/loopx` 且已绑定 | 进度、启动/暂停 | 司机：下一步、未完成、**离开此对话** | 是 |
| 同一文件夹、未绑定的其他聊天 | 隐藏 | 旁观；无启动/暂停/离开 | 否 |

GoalBar 只在本 Session 绑定后出现。任务面板用来看项目工作和解绑。它展示
Goal 头部（激活状态、驱动/旁观模式、进度条）、按状态分组（需要你 / 进行中 /
等待中 / 持续观察）并带计数的未完成工作，以及下一步。未绑定且项目中无活跃 Goal
的 Session 会看到干净的「未绑定」提示，而不是故障。

模型与单一 Agent 规则：[design-philosophy.zh.md](./design-philosophy.zh.md)。

## 怎么接上

1. 在 DSH 打开这个项目。
2. 在**这条**对话里输入 `/loopx` 加具体任务。
3. LoopX 把本 Session（`$DSH_SESSION_ID`）绑到项目 Goal。
4. GoalBar 只出现在这里。这里点暂停会停整个 Goal；启动只会在本 Session 仍有
   typed `/loopx` 证据时恢复。

**新开的未绑定聊天**必须注册自己的工人（`start-goal --new-peer`）。
不要传入别的聊天的 `--agent-id`，除非你明确要接管。

任务面板里，未绑定聊天若只找到一个项目 Goal，会显示**以新工人加入**（注册
新 lane）和**在此交互接管**（把本 Session 绑到该 Goal 的司机 Agent）。如果
项目有多个 active Goal，面板会列出每个 Goal 的这两种动作，而不是默默选一个。
这样始终是一个 Session 一个工人、一个 Goal 一个司机。

离开此对话、保留 Goal：点任务面板的「离开此对话」，或：

```bash
loopx unbind-agent-thread --goal-id <goal-id> --thread-id "$DSH_SESSION_ID" \
  --host-surface deepseek-harness-native --agent-id <agent-id> --execute
```

## 和 DSH 任务的区别

- DSH 任务是这条会话自己的清单。
- LoopX GoalBar 是项目 Goal 在「已绑定会话」上的司机条。
- Goal / Agent / Todo / quota / 绑定的权威仍只在 LoopX。

## 认领不是「所有聊天都加入」

新开一条 DSH 聊天不会认领任何任务。LoopX 认领的是 **Agent**，DSH 会话是
**线程**。只有带 typed `/loopx` 证据的 Session 才能当司机。

如果好几条聊天都 `/loopx` 并绑到**同一个** agent id（现在常常是
`default`），它们会共用一个工人。这不是自动加入，而是复用同一条 lane。
新的未绑定 Session 应注册新 lane，除非用户明确要在本对话继续。GoalBar
第一屏不要展示 agent id。

## 不做

- 不克隆 LoopX 仪表盘。
- 不把 LoopX 仪表盘做成完整看板。
- 不在未绑定会话提供启动/暂停/离开。

English: [session-goal-surface.md](./session-goal-surface.md)
