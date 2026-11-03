# PokeMan Controls Composition

> 状态：**Implemented / Qualified**
> 范围：PokeMan 当前 Map-only gameplay 的 product-private controls topology
> 上游设计：[`game-control-ports.md`](../../../doc/10-architecture/game-control-ports.md)

本阶段仍然只有 **Map gameplay**。新增的 `base` 只是产品基础设施 Subsystem，不是 World / Dialogue / Battle / Story gameplay。

## Target topology

```text
Game
└─ base
   ├─ RenderDomain
   │  └─ <game-controls-input>
   └─ call("map", initialMapParams)
          ↓
        map Frame
        ├─ ControlsConsumer
        ├─ DirectionalControlsTracker
        └─ RPGMapControls
```

职责固定：

```text
base
→ unified controls producer lifetime only

map.mjs
→ product mapping from generic controls to RPGMapControls

@loomrealm-game/map
→ Map gameplay only
```

Base 不订阅 controls、不转发 Map semantic action、不维护 direction state。

## Exact landing

`game.json`：

```text
initial.subsystem = "base"
initial.input     = existing map initial params
subsystems       = base + map
```

`launch.hostra.json`：

```text
base -> subsystems/base.mjs
map  -> subsystems/map.mjs
```

`launch.pwa.json` 使用相同逻辑 topology：

```text
base -> subsystems/base.mjs
map  -> subsystems/map.mjs
```

PWA bundle / staging / qualification 必须安装两个 executable；不得保留只安装 `subsystems/map.mjs` 的旧特例。

新增 `subsystems/base.mjs`：

```ts
export default defineSubsystem((scope) => ({
  async frame(frame) {
    const inputHost = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "game-controls-input",
        tag: "game-controls-input",
        attrs: {},
        data: {},
        children: [],
      }],
    });

    try {
      return await frame.call("map", frame.params);
    } finally {
      inputHost.close();
    }
  },
}));
```

现有 `subsystems/map.mjs` 增加 Consumer/Tracker product composition，并在 finally 中：

```text
map.controls.setMoveIntent(null)
directions.reset()
consumer.close()
```

`package.json` 增加 `@loomrealm-game/common-controls` dependency。

现有 `presentation.json` / Presentation sync 继续提供 `controls/device-input.browser.js`。不得再由 Map Library Render Tree 创建 raw keyboard/gamepad producer。

## Blocked movement for this landing

PokeMan 跟随 Frozen Map Control Port v1：

```text
blocked
→ retain current moveIntent
→ no automatic retry
→ no retry timer
→ no retry from controls State refresh
→ no retry from same-value setMoveIntent
```

玩家松开/换方向后再次给出 direction，才形成新的 movement intent。未来若需要动态障碍消失后自动继续，由 Map-specific contract 单独增加 wake-up semantics。

## Qualification

必须证明：

- current gameplay topology 是 `base + map`，且只有 Map 是 gameplay subsystem；
- Base 的 producer 在 Base suspend、Map active 时仍 live；
- one Window 只有一个 active `game-controls-input`;
- keyboard input 经 top-frame 到 Map Consumer 后产生真实 movement；
- Desktop Hostra 与 PWA 的 Game Entry / launch manifest 都精确为 `base + map`；
- PWA installed executable index 精确包含 `subsystems/base.mjs` + `subsystems/map.mjs`；
- Map transfer 后输入继续工作；
- teardown 后无 retained movement / duplicate producer。

本文件取代旧 Map-only 执行计划中“运行拓扑只能注册一个 map subsystem”的限制；其他“不接入 World/Dialogue/Battle/Story”的范围限制继续有效。
