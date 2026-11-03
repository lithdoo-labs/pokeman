# Game Session 与基础 Frame

> 从 `../DESIGN.md` 拆分；原文档保持不变。

PokeMan 除 World / Dialogue / Battle 等玩法 Frame 外，还需要两个基础交互 Frame：**System Menu** 与 **Message**。

## System Menu Frame

System Menu 是可重复实例化的 Frame 类型，不是整个 Session 中唯一的固定 Frame 实例。

游戏刚启动、尚未进入任何 World 时，首先创建一个 System Menu 实例作为当前 Frame 栈的最底层实例，使游戏即使还没有进入存档 / 世界，也始终能够展示基础系统入口：

```text
栈顶
┌────────────────────────┐
│ System Menu #root      │
│                        │
│ New Game               │
│ Load Game              │
│ Settings               │
│ Exit                   │
└────────────────────────┘
栈底
```

玩家选择进入游戏后，由这个 root System Menu 调用 World：

```text
栈顶
┌────────────────────────┐
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

**“System Menu 位于栈底”只描述启动时这个 root 实例的位置，不表示 System Menu subsystem 只能出现在栈底。Frame 栈位置属于 Frame 实例，而不属于 subsystem 类型。**

当玩家已经处于 World、Battle 或其他允许打开菜单的游戏状态时，当前 Frame 可以再次调用同一个 System Menu subsystem，产生一个新的菜单 Frame 实例并压到当前栈顶：

```text
栈顶
┌────────────────────────┐
│ System Menu #in-game   │
├────────────────────────┤
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

此时下层 caller 按正常 Frame call 语义暂停；菜单关闭后，当前菜单 Frame 完成并返回 caller，caller 以新的 Activation 继续。

System Menu 可以根据调用上下文展示不同操作，但仍是同一个 subsystem。例如：

```text
root mode
├─ New Game
├─ Load Game
├─ Settings
└─ Exit

in-game mode
├─ Resume
├─ Save
├─ Load
├─ Settings
├─ Return to Title
└─ Exit
```

具体 Save persistence、Load 后如何替换当前游戏状态、Return to Title / Exit 如何影响更下层 Frame 与 Session 生命周期，属于后续架构设计；System Menu 的产品职责是承载这些系统操作的交互入口，而不是把所有生命周期 authority 都收进菜单自身。

## Message Frame

Message 是统一的**模态消息 Frame**。它不承担 toast / 后台非阻塞通知；当业务需要向玩家显示消息、警告、确认或可恢复异常时，由当前活动 Frame 直接调用 Message：

```text
World / Dialogue / Battle / System Menu
                ↓
          call(Message)
                ↓
      caller Activation 暂停
                ↓
        Message 位于栈顶
                ↓
      玩家确认 / 选择 / 取消
                ↓
         Message 完成
                ↓
          返回 caller
```

典型用途包括：

- 获得角色卡等需要玩家明确确认的业务消息；
- “无法携带更多角色卡”等业务提示；
- 存档 / 读取失败等可恢复错误；
- 警告信息；
- `确认 / 取消`、`是 / 否` 等模态选择；
- 退出游戏、覆盖存档等危险操作前的确认。

例如 System Menu 自己也可以继续调用 Message：

```text
栈顶
┌────────────────────────┐
│ Message                │
├────────────────────────┤
│ System Menu #in-game   │
├────────────────────────┤
│ World                  │
├────────────────────────┤
│ System Menu #root      │
└────────────────────────┘
栈底
```

因此当前基础 Frame 关系可以概括为：

```text
System Menu #root
│
└─ World
   │
   ├─ Dialogue
   │  └─ Message
   │
   ├─ Battle
   │  ├─ System Menu #in-game
   │  │  └─ Message
   │  └─ Message
   │
   ├─ System Menu #in-game
   │  └─ Message
   │
   └─ Message
```

真正导致 Session / Runtime 已经无法继续工作的 fatal failure 不能依赖 Message Frame 才能显示，因为此时对应 Subsystem / Frame 可能已经无法运行；这类失败仍由更底层的 Main / Platform failure presentation 处理。Message 面向的是游戏仍可运行时的模态业务消息和可恢复异常。