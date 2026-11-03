# 产品定位、构建与分发

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## 项目定位

**PokeMan** 是游戏英文名，中文名为 **口袋从者**。

游戏在体验结构上对标 GBA 时代的 Pokémon RPG：以俯视角 Tile Map 探索为主要世界空间，通过地图人物、事件和 Dialogue 推进 RPG 内容，并通过独立 Battle 进入战斗体验。

但口袋从者不复刻传统 Pokémon 的角色关系、捕获过程或战斗控制。玩家主要以 **主公** 身份旅行，在世界中认识、接触、影响并最终与不同人物建立角色卡契约，使其成为能够通过角色卡随身携带、持续互动并用于 Battle 的 **从者**。

Battle 是 PokeMan 的核心差异化系统之一：从者不是等待玩家逐步遥控的棋子，而是具有自身判断的人物。Battle 通过 Decision / LLM 形成具体战术行为，由 Simulation 决定行为是否合法、何时发生以及实际结果；未来主公通过高层战术指令影响从者 Decision，而不是绕过 Decision 直接控制 Simulation。

## 素材来源、构建与分发边界

PokeMan 当前计划以 **非商业发布** 为前提，并把 Pokémon / Pokémon Essentials 素材与 PokeMan 自身代码、规则和内容定义分离。

公开项目主要提供：

- PokeMan 游戏逻辑与配置；
- Dialogue / Event；
- Battle 定义；
- 角色、关系与世界状态定义；
- 从 `essentials-v21.1` 映射到 PokeMan Content 的规则；
- 本地 Builder / Import tooling。

用户在自己的本地环境中提供一份可用的 `essentials-v21.1`：

```text
PokeMan source / definitions
          +
用户本地 essentials-v21.1
          ↓
PokeMan Builder / Importer
          ↓
选择、转换并映射所需 Map / Graphics / Content
          ↓
用户本地可运行的 PokeMan Game Package
```

因此：

> **PokeMan 分发自己的游戏逻辑和构建手段；原版 Pokémon / Essentials 素材由用户本地提供，并在用户环境中参与构建。**

生成出来的素材与派生 Game Package 属于本地构建产物，不因为开发 PokeMan 而反向提交原版资源到项目仓库。Importer 校验、版本识别、资源映射格式、输出目录和构建命令属于后续工程设计。