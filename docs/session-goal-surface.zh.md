# 会话选择加入的 GoalBar

LoopX 的 Goal 挂在**项目**上。DSH 的 Session 是**互不继承的聊天**。
插件不能把 LoopX 界面塞进同一个文件夹里的每一条对话。

## 用户看见什么

| 这条 DSH 对话 | LoopX 界面 | 自动续跑 |
| --- | --- | --- |
| 普通聊天，从没跑过 `/loopx` | 什么都没有，就是普通 DSH | 否 |
| 本聊天跑过 `/loopx` 且已绑定 | 输入框上方一条紧凑 **GoalBar**（进度、下一步、启动/暂停） | 是，quota 允许后 |
| 同一文件夹的其他聊天 | 仍然没有，除非那条也跑过 `/loopx` | 否 |

**不会**给每条会话加 LoopX Goal 标签。DSH 自己已经有输入框上的「任务」条。
没主动接上 LoopX 的对话，不该被抢戏。

## 怎么接上

1. 在 DSH 打开这个项目。
2. 在**这条**对话里输入 `/loopx` 加具体任务。
3. LoopX 把本 Session（`$DSH_SESSION_ID`）绑到项目 Goal。
4. GoalBar 只出现在这里。这里点暂停会停整个 Goal；启动只会在本 Session 仍有
   typed `/loopx` 证据时恢复。

要在**新开的聊天**里继续同一个 Goal，在新聊天里再跑一次 `/loopx`。
目标不会自动跟到新窗口。

## 和 DSH 任务的区别

- DSH 任务是这条会话自己的清单。
- LoopX GoalBar 是项目 Goal 在「已绑定会话」上的司机条。
- Goal / Agent / Todo / quota / 绑定的权威仍只在 LoopX。

## 不做

- 不克隆 LoopX 仪表盘。
- 不给每条会话注册 `conversation.view` 标签。
- 不在未绑定会话展示别人的 LoopX 待办。
- 不在未绑定会话提供启动/暂停。

English: [session-goal-surface.md](./session-goal-surface.md)
