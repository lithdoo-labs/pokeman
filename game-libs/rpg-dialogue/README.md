# RPG Dialogue 游戏库

> 当前实现基线：**v0 Design Frozen / Implemented / Qualified**
> 下一版候选：**v1 Normative Candidate / Ready for implementation**；controls migration 落地后 current HEAD qualification 切到 v1

`@loomrealm-game/rpg-dialogue` 定义可复用的 RPG 对话 interaction session。它负责当前 Conversation 的交互、人物 Presentation、session History 与 WebComponent 投影；剧情流程、分支、Quest/Inventory/Battle/Map side effect 以及 durable story state 始终由调用方拥有。

## 使用模型

以下代码表示已冻结的 v0 public contract usage；runtime package 落地后实现必须保持这些 observable semantics：

```ts
const dialogue = new RPGDialogue(scope, frame, {
  // optional；默认 false
  cancelable: false,
  // optional；默认 2_147_483_646，由业务决定相对 stacking
  zIndex: 100,
});

dialogue.setHistory(savedHistory);

const result = await dialogue.openConversation({
  conversation: {
    speakerName: "村长",
    text: "你愿意帮助我们吗？",
    choices: [
      { choiceId: "yes", text: "愿意", data: {} },
      { choiceId: "no", text: "不了", data: {} },
    ],
    data: {
      windowStyle: "classic",
    },
  },
  // Conversation speaker 与 Character Presentation 完全解耦；
  // 纯文本/名字牌式对话可以没有任何人物图。
  characters: [],
});

if (result.type === "submitted" && result.choiceId === "yes") {
  await quest.accept("wolf");
}

dialogue.appendHistory({
  entryId: "elder.question",
  speakerName: "村长",
  text: "你愿意帮助我们吗？",
});

dialogue.close();
```

`RPGDialogue` 不内建 Story Graph、`next`、branch、condition 或 gameplay mutation。连续对话就是普通 TypeScript control flow。

Conversation、Character 与 Choice 是并列且解耦的业务/presentation input：Conversation 的 `speakerName` 只是显示文本，不引用 Character；Character 可以独立存在或完全为空；Choice 只表达当前可选项。

`cancelable` 默认 `false`；`zIndex` 默认 `2_147_483_646`，业务可在构造时传任意合法 int32，并在实例 lifetime 内保持固定；`openConversation()` 的 operation/preflight/lifecycle failure 通过 returned Promise rejection 暴露；History 等同步 API 的非法调用保持同步 throw semantics。

## Authority 边界

```text
caller
→ Story Flow
→ Conversation / Character / Choice 内容
→ caller-defined data schema
→ History 内容语义与 durable persistence 决策
→ Dialogue RenderDomain stacking policy（zIndex）
→ gameplay side effects

RPGDialogue
→ 当前 Conversation interaction
→ session-level History retained state
→ Dialogue Render Tree
→ v1 semantic Control Port

product composition
→ physical/unified controls -> Dialogue semantic command mapping

Business WebComponent
→ concrete DOM / Shadow DOM / Canvas / WebGL / Live2D / Spine
→ reveal / selection / scroll / animation 等 presentation-local state
→ interpretation of caller-defined data
```

Dialogue-owned semantic facts 进入对应 `RenderNode.attrs`。Conversation / Character / Choice 的 `data: JsonObject` 完全由调用方及其业务 WebComponent 定义，并分别原样进入对应 `RenderNode.data`；RPG Dialogue 不解释、包装或注入这些 schema。

## 默认 Browser 入口

```text
@loomrealm-game/rpg-dialogue/browser/rpg-dialogue.browser.js
@loomrealm-game/rpg-dialogue/browser/rpg-dialogue.browser.css
```

默认实现提供冻结 contract 所要求的 canonical tags/event ABI；具体视觉样式、DOM 组织和可替换业务 WebComponent 不属于 v0 compatibility surface。

## 规范入口

- [RPG Dialogue v0 API](./RPG_DIALOGUE_V0_API.md) — **Active / Normative / Frozen**；public TypeScript API、生命周期、History 与 authority。
- [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md) — **Active / Normative / Frozen**；canonical Render Tree、attrs/data、WebComponent 与 interaction ABI。
- [RPG Dialogue v1 API candidate](./RPG_DIALOGUE_V1_API.md) — **Normative Candidate / Ready for implementation**；v0 business surface + additive semantic `controls`，并移除 Runtime raw physical input ownership。
- [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md) — LoomRealm 通用 Web Presentation contract。
- [Render Update v1](../../doc/15-contracts/render-update-v1.md) — retained Render state 与 transient Render Event wire contract。
- [RPG Dialogue v0 Qualification](../../doc/30-implementation/rpg-dialogue-v0-qualification.md) — executable subject、命令、PASS 结果与 Frozen contract matrix。
- [Game Control Ports 与 Activation-scoped Common Controls Consumer](../../doc/10-architecture/game-control-ports.md) — **Draft / Ready for implementation**；定义下一版 controls port / binding 迁移，v0 Frozen contract 在实现落地前保持不变。

README 只作为模块入口。当前已实现 subject 的 observable v0 语义仍以上述 Frozen v0 API / Presentation contract 为准；下一轮 control-port implementation 以 v1 candidate + Game Control Ports landing profile 为依据。不得回写 v0 历史 contract，也不得让 current v1 Runtime继续拥有 raw Keyboard/Gamepad mapping。
