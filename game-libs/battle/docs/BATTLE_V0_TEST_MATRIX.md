# Battle v0 测试矩阵

> 状态：**Core gameplay、Simulation baseline（含 Decision availability circuit）、DeepSeekDecision、Presentation Acceptance、BATTLE-003（显式 initialHp input）、BATTLE-004（独立 BattleArena）与 CTRL-002（pauseReason / onPause）均 IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**。本文不重新定义规则；T-DDEC-* 与 T-DEC-023..036 已纳入普通 credential-free automated qualification，真实 provider smoke 仍为 explicit opt-in。
>
> DeepSeek provider/workflow 已由 BATTLE_V0_DECISION.md 冻结；PlayerGuidance concrete contract 与 Host/InputTarget wiring 明确延期，不得由当前实现自行假设。

## 1. Architecture / Authority

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-ARCH-001 | ARCH-001, ARCH-003 | Presentation 动画提前/延后结束 | Simulation Tick、tile、HP、result 不变 |
| T-ARCH-002 | ARCH-002 | AI 想走 Engine 未预生成的路线 | Decision 可直接提交 path；Simulation 只校验，不替换路线 |
| T-ARCH-003 | ARCH-004, BATTLE-004 | Battle 加载独立 BattleArena + Character | Arena 只复用 Tileset/Autotile/Character 视觉素材，不读取 struct.Map 或 RPGMap Runtime movement/timer |
| T-ARCH-004 | ARCH-001, ARCH-003 | camera/DOM/Sprite 状态变化 | 不改变权威 Battle State |
| T-ARCH-005 | ARCH-005, TIME-001, TIME-002, TIME-003 | 业务只构造 Simulation + ScriptDecision + Null/Recording Presentation，并用可控 clock 推进时间；业务不调用 public tick | Simulation 自己按 200 ms scheduler / event queue / reducer 运行完整 Battle、结算 BattleResult 并记录 Replay |
| T-ARCH-006 | ARCH-005, BATTLE-004 | 不创建 Decision/Simulation instance，只给 Presentation BattleSceneInit + synthetic RenderProjection | 可初始化 BattleArena/Actor 并表现 movement/effect；无需了解 Decision/Simulation concrete implementation |
| T-ARCH-007 | ARCH-002, ARCH-005 | 仅替换注入的 ScriptDecision 为 DeepSeekDecision，二者实现同一 DecisionPort | Simulation 的 clock/reducer/Plan 规则无需改变；Presentation 无感知 |
| T-ARCH-008 | ARCH-006, BATTLE-001 | v0 BattleConfig 提供 3 个 combat Actor | 启动前 validation reject；actor collection N-ready 不等于 v0 支持多人 |
| T-ARCH-009 | ARCH-006 | 同一合法 1v1 Config 只交换 actors collection 的排列顺序，actorId/team/其他事实不变 | identity、side 与规则语义不随数组位置改变；需要稳定遍历时按稳定 actorId key |
| T-ARCH-010 | ARCH-005 | Runtime 注入 Presentation 后，业务只调用 battle.run/pause/resume/cancel/close | Runtime 自己调用 Presentation initialize/render/pause/resume/close；业务不承担 Projection 转发或 Presentation lifecycle |
| T-ARCH-011 | SIMULATION §5 | Runtime run() 初始化 | arm presentation.failure → initialize → initial tick-0 Projection → initial Decision requests(requestTick=0) → start clock，顺序固定 |
| T-ARCH-012 | SIMULATION §16/29 | Tick reducer 需要新 Decision | reducer 只输出 request_decision command；DecisionPort Promise 在同步 Tick stack 外调用，callback 只 enqueue |
| T-ARCH-013 | SIMULATION §3 | headless Simulation 构造 | 只依赖 ResolvedBattleDefinition + narrow capabilities，不需要 ContentClient/SubsystemScope/Frame |
| T-ARCH-014 | CONTRACTS §5, SIMULATION §3 | moveTicks=0 或任一 timing 为负数 | validator reject；v0 movement 至少 1 Tick，windup/recovery/protection 可为 0 但不可为负 |
| T-ARCH-015 | SIMULATION §2 | package build 后 import @loomrealm-game/battle/simulation | subpath export 存在并导出 BattleSimulationBuilder/BattleRuntime/BattleClock；不依赖 Presentation concrete import |
| T-ARCH-016 | SIMULATION §2/5 | Builder build 两次 / run 前 external signal 已 aborted | second build programmer error；pre-aborted run直接 cancelled+CLOSED，不 initialize、不请求Decision、不启动clock |
| T-ARCH-017 | CONTRACTS §9 | initial DecisionRequest observation | actors/skills actorId+skillId ordinal stable；recentEvents=[]；map/passability为detached committed facts；无 Guidance/runtime generations |
| T-ARCH-018 | CONTRACTS §6 | 同一 Skill range 包含 0.5/1.0/0.5 | PlanConstraints.minCoefficients = [0.5, 1.0]，去重且数值升序；skills按skillId ordinal |
| T-ARCH-019 | SIMULATION §3 | build 后调用方修改原 definition/passable/range 数组 | Runtime/Replay事实不变；builder已deep-copy/freeze Simulation-owned resolved definition |
| T-ARCH-020 | SIMULATION §7/31 | 两个 Actor 同 Tick都分配 request/event/ordered facts | actorId ordinal traversal决定稳定 ID/输出顺序；改变Map insertion order不改变Replay/Projection/requestId |
| T-ARCH-021 | CONTRACTS §10 | ActorId 包含开放字符串如 "__proto__"/"10"/"a" | BattleSnapshot.actors 仍为 ordinal-sorted readonly array，不使用 Record/object key authority；reservations同样稳定排序 |
| T-ARCH-011 | ARCH-005 | headless Simulation 只注入 FakeClock + AbortSignal + ScriptDecision + RecordingPresentation | 不需要构造 SubsystemScope/Frame/Viewport/RenderDomain；Core Runtime 仍可完整运行 |
| T-ARCH-012 | BATTLE-001, ARCH-006 | v0 BattleConfig 为两个 Actor，但 team 是 ally+ally 或 enemy+enemy | 启动前 validation reject；v0 必须恰好 1 ally + 1 enemy |

### 1.1 Explicit initial HP amendment — BATTLE-003 (QUALIFIED)

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-INIT-001 | BATTLE-002, BATTLE-003 | `ResolvedBattleActor.initialHp` 省略 | Runtime 初始 `hp = maxHp`，保持既有 caller 兼容 |
| T-INIT-002 | BATTLE-003 | 显式 `initialHp = maxHp` | 初始 Snapshot / Projection 的 hp 等于 maxHp |
| T-INIT-003 | BATTLE-003 | 显式 `1 <= initialHp < maxHp` | 初始 hp 使用 initialHp，maxHp 保持原上限；Replay initial 保留该值 |
| T-INIT-004 | BATTLE-003 | initialHp = 0、负数、超过 maxHp、非整数或非 safe integer | Definition validator reject |
| T-INIT-005 | BATTLE-003, REPLAY-001 | 受损 initialHp 的 live Battle → Replay | Replay 从 record.initial 重建相同初始 hp/maxHp，并通过 deterministic qualification |

### 1.2 Independent BattleArena amendment — BATTLE-004 (QUALIFIED)

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-ARENA-001 | BATTLE-004 | BattleSceneInit / ResolvedDefinition 引用 `arenaId` | Presentation 读取 `struct.BattleArena`，不读取 `struct.Map` |
| T-ARENA-002 | BATTLE-004 | 7×7 Arena passable 全 true，visual tile 全 floor | Simulation 使用 authored passable；视觉 tile 不影响 gameplay |
| T-ARENA-003 | BATTLE-004 | passable shape 与 width/height 不一致，或 data 不是 3-layer exact shape | Content / definition validator reject |
| T-ARENA-004 | BATTLE-004 | Arena tileset_id 指向合法 Tileset，tile ids 合法 | Presentation 能加载 Tileset / Autotile Graphics 并绘制 Arena |
| T-ARENA-005 | BATTLE-004 | RPG Map 4 passage/terrain/player pose 改变，但 Arena Content 不变 | 同一 Battle scenario 的 passable、spawn、Replay 初始事实完全不变 |

## 2. Time / Scheduler

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-TIME-001 | TIME-001 | 推进 1 Tick | 逻辑时长固定 200 ms |
| T-TIME-002 | TIME-003 | 上次处理 Tick 10，scheduler/event loop 晚醒时 target Tick 14 | 依次处理 11/12/13/14 |
| T-TIME-003 | TIME-003 | catch-up 中 scheduled events 分别 due 11 和 14 | 不视为同一批同时事件 |
| T-TIME-004 | DEC-001, TIME-002 | Tick 20 reducer 已结束，Decision completion 在 Tick 21 snapshot 前进入 inbox | Tick 21 消费/校验；若合法且 Actor 可行动，最早 Tick 21 Action phase 执行 |
| T-TIME-005 | DEC-001, TIME-002 | Decision completion 在 Tick 21 snapshot 后、Tick 21 reducer 处理中到达 | 不得重入 Tick 21；最早 Tick 22 消费 |
| T-TIME-006 | DEC-001 | Promise callback 拿到合法 Plan | callback 只 enqueue；Actor/acceptedPlan/HP/position 等权威状态在 reducer 前完全不变 |
| T-TIME-007 | TIME-004 | Battle pause/background 期间现实经过 30 秒 | currentTick 不推进，不产生 150 个 catch-up Tick |
| T-TIME-008 | TIME-003, TIME-004 | Battle clock 正常运行但 scheduler 晚醒 4 Tick | 仍逐 Tick catch-up；每个 Tick 独立建立 event/inbox snapshot |
| T-TIME-009 | DEC-001, TIME-004 | Battle pause 时 LLM completion 返回并进入 inbox | pause 中不消费；resume 后第一个实际 reducer Tick 才可消费 |
| T-TIME-010 | DEC-001, REPLAY-001 | 两次真实运行的 LLM wall-clock latency 不同，但 Replay 记录相同 consumed/accepted Tick | Replay 不依赖 completion timestamp，不重新调用 LLM，按记录 Tick 复现 Plan 生效 |
| T-TIME-011 | SIMULATION §6 | FakeClock 从 0 advance 199ms / 200ms | 199ms 不处理 Tick；200ms 恰好处理 Tick 1 |
| T-TIME-012 | SIMULATION §6 | RUNNING 到 350ms pause，现实暂停 30s 后 resume | logical elapsed 保留350ms；暂停30s不计入，恢复后再累计到400ms才处理 Tick 2 |
| T-TIME-013 | SIMULATION §6/28 | scheduler wake 与 pause 同时竞争 | 已进入同步 Tick则完整结束后pause；pause先执行则不进入新Tick；不存在半Tick状态 |
| T-TIME-014 | SIMULATION §6 | Tick处理本身耗时跨过后续deadline | wake loop每轮重新读取logicalElapsed并继续catch-up；next wake按(nextTick*200 - elapsed)剩余时间调度，不按callback结束后再固定等200ms |
| T-TIME-015 | SIMULATION §6 | BattleClock.nowMs 回退/NaN/Infinity | Runtime invariant error并cleanup；不得产生负delay、倒退Tick或业务BattleResult |

## 3. PlanSubmission

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-PLAN-001 | PLAN-003 | planningOrigin=(2,2)，path 为 (3,2),(4,2) | 合法；path 不重复 planningOrigin |
| T-PLAN-002 | PLAN-003 | 从 (2,2) 直接走 (3,3) | reject `path_not_adjacent` |
| T-PLAN-003 | PLAN-001, PLAN-003 | 默认 maxPathSteps=6 时提交 7 步 | reject `path_too_long` |
| T-PLAN-004 | PLAN-003 | 空 path、无 skill | hold/reobserve |
| T-PLAN-005 | PLAN-003 | 空 path、有合法 skill | direct cast |
| T-PLAN-006 | PLAN-004 | Skill 只有 {0.5,1.0}，提交 0.73 | reject `invalid_min_coefficient` |
| T-PLAN-007 | PLAN-005 | 未来 path 某格当前被动态占用，但静态可走 | 不仅因为未来动态占用就拒绝整份提交 |
| T-PLAN-008 | PLAN-006 | 第一次非法提交 | 返回 machine-readable reason，允许一次修正 |
| T-PLAN-009 | PLAN-006 | 修正后仍非法 | 当前 generation 失败；Actor idle；最早后续 Tick 新 generation |
| T-PLAN-010 | DEC-002 | 旧 generation 响应迟到 | 无提交权 |
| T-PLAN-011 | PLAN-007 | path 走完仍没达到 minCoefficient | 不自动降级用更低 coefficient 攻击 |
| T-PLAN-012 | PLAN-008 | move-only plan 途中进入技能合法格 | 不自动施法 |
| T-PLAN-013 | PLAN-003, PLAN-005 | 同时提交 turn + 非空 path | reject `turn_with_path` |
| T-PLAN-014 | PLAN-003 | turn 使用非法 Direction | reject `invalid_turn` |
| T-PLAN-015 | PLAN-009 | hold/reobserve 在 Tick N 被接受 | Tick N 不启动 Action、不递归 Decision；Plan exhausted，最早 Tick N+1 创建新 generation |
| T-PLAN-016 | PLAN-009 | move-only path 正常耗尽且无 pending Plan | 当前 Tick不零时间重决策；最早下一 Tick ensureDecision |
| T-PLAN-017 | SIMULATION §11 | Plan path A→B→C，A→B reservation成功并 move_start | A→B intent 在 materialize 时消费，cursor 指向 C；但 B→C 仍不得在 A→B complete 前启动 |
| T-PLAN-018 | CONTRACTS §7 | PlanSubmission 缺 path / 含未知字段 / 坐标非整数 / skill含未知字段 | reject invalid_plan_shape；attempt0允许唯一 correction，attempt1结束generation |
| T-PLAN-019 | CONTRACTS §8 | attempt0 返回任一真正 PlanRejectReason | correctionAllowed=true；唯一 correction 后 attempt1 任一 reject 都结束 generation；stale authority 不进入 Plan validation |
| T-PLAN-020 | CONTRACTS §16, SIMULATION §9/11 | Actor moving A→B，最后 move materialize 后预取 next Decision | DecisionRequest.planningOrigin=B，但 observation.self.tile=A 且 action.to=B；next Plan path 按 B 为起点校验 |
| T-PLAN-021 | CONTRACTS §16, SIMULATION §12 | moving-prefetch Plan 已 pending，A→B 正常 complete | promotion 时 committed tile=B=planningOrigin，允许继续；若 move 被 hit 中断则 pending/Decision authority提前失效，不得从 A 解释该 path |
| T-PLAN-024 | PLAN-003, CONTRACTS §16 | moving A→B prefetch，planningOrigin=B，next path 第一格=A | 若 B→A cardinal且静态可走则合法；旧 committed A 不作为 next Plan origin，也不因当前 self occupancy 在 submission 时拒绝 |
| T-PLAN-022 | PLAN-005 | skill target=self / same-team / dead / unknown actor | reject invalid_target；v0 唯一合法 target 是当前存活的对方 Actor |
| T-PLAN-023 | PLAN-007 | accepted attack Plan 尚未 windup 时 target 不再合法 | plan failed=target_invalid；不启动 windup；最早后续合法 Tick重决策 |

## 4. Turn / Movement / Contention

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-TURN-001 | TURN-001, STATE-004 | Actor 原地 turn right | committed tile 不变，direction 立即变 right，本 Tick不能再启动第二个 Action |
| T-TURN-002 | TURN-001, PLAN-003 | Plan = turn right + skill intent | Tick N 只执行 turn；skill 最早后续 Tick重新校验后起手 |
| T-TURN-003 | TURN-001, HIT-005 | protected Actor 执行 turn | 允许 turn；仍不能 windup |
| T-TURN-004 | TURN-001, SKILL-004 | recovery Actor 尝试 turn | recovery 是 action lock，不能 turn |
| T-MOVE-001 | MOVE-001 | Actor 视觉上处于 A→B 中间 | committed/occupied 仍是 A，B 被预约 |
| T-MOVE-002 | MOVE-001 | `move_complete` 到期且 step 未被中断 | 原子释放 A、占用 B、释放 reservation |
| T-MOVE-003 | MOVE-002 | path A→B→C | A→B 提交前不得启动 B→C |
| T-MOVE-004 | MOVE-003, RNG-001 | A/B 同 Tick 抢同一格 | 只一个赢家；使用 seeded 等概率裁决 |
| T-MOVE-005 | MOVE-003, SIMULATION §19 | seed="seed", Tick=10, target=(2,4), competitors=["a","b"] | canonical FNV-1a32 hash=0xc9c67389，h&1=1，因此 winner="b"；Replay/不同遍历顺序一致 |
| T-MOVE-006 | MOVE-003 | 改变 Promise/遍历顺序 | 裁决结果仍只由稳定输入决定 |
| T-MOVE-007 | MOVE-004 | 相邻 Actor 同 Tick 直接 swap | v0 禁止 |
| T-MOVE-008 | MOVE-005 | Actor 输掉 contested tile | 留原格、plan 结束、后续重规划，不同 Tick 零时间重试 |
| T-MOVE-009 | MOVE-006 | Actor 从 A 向右 move_start | direction 立即变 right，但 committed tile 仍是 A |
| T-MOVE-010 | MOVE-007, HIT-003 | active step A→B 中受到非致命 positive damage | step 立即失败；释放 B reservation；留在 A；获得 protection；旧 plan/Decision 失效并创建一次受击后 Decision |
| T-MOVE-011 | MOVE-007, HIT-003 | active step A→B 中受到致命 damage | step 立即失败；释放 B reservation；dead 留在 A；无新 protection/Decision |
| T-MOVE-012 | MOVE-007, TICK-001 | Tick N phase 3 已成功 move_complete 到 B，随后 phase 5–7 被命中 | 伤害发生时 step 已完成，Actor 留在 B，不回滚到 A |
| T-MOVE-013 | MOVE-006, MOVE-007 | move_start 向右后被中断 | committed tile 留 origin，但 direction 保持 right，不回滚 |
| T-MOVE-014 | MOVE-002, PLAN-007 | path A→B→C 被接受 | start 时只 materialize A→B；不得提前 schedule B→C 的 move_complete |
| T-MOVE-015 | MOVE-002, PLAN-007, SIMULATION §11 | A→B 已 materialize，Plan 仍有 B→C | cursor 已指向下一未 materialize step；只有 A→B move_complete 成功后，后续 Action phase 才重新校验并尝试 B→C |
| T-MOVE-016 | MOVE-005, PLAN-007 | A→B 在 reservation contention 失败 | 当前 Plan 终止；未 materialize 的 B→C 不产生 event；后续合法 Tick 重规划 |
| T-MOVE-017 | MOVE-005 | destination committed occupied，且 occupant 本 Tick也想离开 | reason=occupied；origin 在 move_complete 前仍占用，不把它当 free |
| T-MOVE-018 | MOVE-005 | destination 已被更早 active move reservation | reason=reserved；不参与本 phase seeded contention |
| T-MOVE-019 | MOVE-004, MOVE-005 | A→B origin、B→A origin 形成直接 reciprocal swap | 在 occupied 前识别，双方 reason=swap_forbidden |
| T-MOVE-020 | MOVE-003, MOVE-005 | free/unreserved tile 同 phase 有两个 surviving intents | seeded winner成功，loser reason=contested；reason priority不受遍历顺序影响 |

## 5. Skill Range / Coefficient

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-SKILL-001 | SKILL-001 | range 没有 `"↑"` | Content validation fail |
| T-SKILL-002 | SKILL-001 | range 有两个 `"↑"` | Content validation fail |
| T-SKILL-003 | SKILL-001 | range 行长度不同 | Content validation fail |
| T-SKILL-004 | SKILL-001, DAMAGE-001 | coefficient 超过 3 位小数 | validation fail，不隐式 rounding |
| T-SKILL-005 | DAMAGE-001 | baseDamage=7, coefficient=0.5 | units=500，finalDamage=3 |
| T-SKILL-006 | DAMAGE-001 | baseDamage=1, coefficient=0.5 | finalDamage=0 |
| T-SKILL-007 | SKILL-002 | current=0.5, plan min=1.0 | 不起手；有合法剩余 path 则继续 |
| T-SKILL-008 | SKILL-002 | current 达到 1.0, plan min=1.0 | Actor 可攻击时停止剩余 path 并开始 windup |
| T-SKILL-009 | SKILL-003 | 1.0 起手，前摇中目标退到 0.5 | 按 resolve 时 0.5 结算 |
| T-SKILL-010 | SKILL-003, HIT-001 | 前摇中目标离开矩阵 | `miss` |
| T-SKILL-011 | SKILL-002, SKILL-003 | min=1.0 起手，resolve 时只剩 0.5 | 不二次检查 min；按 0.5 结算 |
| T-SKILL-012 | SKILL-006 | caster 与 target 中间有不可通行 Tile，但 target 在正 coefficient 格 | v0 不做 LOS；范围规则仍合法 |
| T-SKILL-013 | SKILL-001, SIMULATION §21 | canonical矩阵 origin上方 cell=1000 | direction 8→world up，2→down，4→left，6→right；exact rotation mapping与Presentation无关 |
| T-SKILL-014 | DAMAGE-001, SIMULATION §6/21 | baseDamage × coefficientUnits 将超 safe integer | 在不精确乘法前终止为 failure source=simulation code=BATTLE_NUMERIC_OVERFLOW |

## 6. Instant Skill / Tick Batch

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-INSTANT-001 | SKILL-005, TICK-001 | windup=0 在 Tick N 起手 | Tick N instant batch 中 resolve |
| T-INSTANT-002 | STATE-004, TICK-002 | windup=0 + recovery=0 | 同 Actor 本 Tick不能启动第二个 Action |
| T-INSTANT-003 | SKILL-005, HIT-006 | 双方同 Tick 启动致命 instant skill | 两个技能都先收集；允许 simultaneous defeat |
| T-INSTANT-004 | TICK-001 | instant skill 杀死原本有“尚未启动移动意图”的 Actor | phase 12 不再为其启动 reservation |
| T-INSTANT-005 | SKILL-005, SIMULATION §17/22 | windup=0 + recovery=0 | resolve 后直接 action=idle，不创建 currentTick recovery event；startedActionActors 仍阻止本 Tick第二 Action |

## 7. Hit / Protection / Recovery

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-HIT-001 | HIT-001 | skill/target 有效、范围内、未保护 | `hit` |
| T-HIT-002 | HIT-001, HIT-004 | target 在 protection 且范围内 | `immune`；0 damage、不中断、不刷新 |
| T-HIT-003 | HIT-001 | target 在 resolve 前离开范围 | `miss`，不是 `invalid` |
| T-HIT-004 | HIT-001 | windup已开始后 target 已死/消失/action invalid | `invalid`、0 damage；若 session仍active则按 skill recovery rule结束此 Action |
| T-HIT-005 | HIT-002 | Tick 10 hit 后 protectionTicks=3 | protectedUntilTickExclusive=14；Tick10后续阶段及11/12/13 protected，14 normal |
| T-HIT-014 | HIT-002 | Tick 10 hit 后 protectionTicks=0 | protectedUntilTickExclusive=11；只保护Tick10后续阶段，Tick11正常 |
| T-HIT-006 | HIT-003 | windup 中受到正 damage | windup invalid；protection set；只创建一个新 Decision generation |
| T-HIT-007 | HIT-003, SKILL-004 | recovery 中受到正 damage | recovery 中断并进入新 Decision 流程 |
| T-HIT-008 | HIT-004 | recovery 中收到 immune impact | recovery 继续 |
| T-HIT-009 | HIT-006 | 同 batch 两个攻击命中同一未保护 target | 两个都按 batch-start protection 判断 |
| T-HIT-010 | HIT-006 | 同 batch 双方都死亡 | simultaneous defeat |
| T-HIT-011 | HIT-005, PLAN-007 | protected Actor 有 accepted attack plan | 可 Thinking/移动/turn 但不能 windup；保护结束后按最新状态和同一 threshold 重检 |
| T-HIT-012 | DAMAGE-001, HIT-007 | 几何命中但 finalDamage=0 | outcome 仍为 hit；HP 不变；不打断、不 protection、不 redecision |
| T-HIT-013 | HIT-007 | recovery/moving Actor 收到 zero-damage hit | 当前 Action 正常继续 |

## 8. Decision / Recovery 并发

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-DEC-001 | STATE-003 | 同 Tick 多个原因调用 ensureDecision | 当前 generation 只存在一个有效 request |
| T-DEC-002 | SKILL-004 | Actor 在 recovery | Thinking 可以继续/开始 |
| T-DEC-003 | SKILL-004, DEC-001 | recovery 中 reducer 消费并接受 Decision Plan | Plan 可暂存，但 recovery 结束前不能启动新 Action |
| T-DEC-004 | DEC-002, SIMULATION §29 | hit 使 generation 失效且旧 LLM仍在执行 | Runtime best-effort abort该 request-scoped signal；provider即使忽略abort并迟到返回也无提交权 |
| T-DEC-005 | STATE-005, SKILL-004 | Actor 正在 recovery 时 Decision request thinking | actionState=recovery 与 decisionState=thinking 可同时存在，不互相覆盖 |
| T-DEC-006 | STATE-005 | Actor moving 时启动 Decision | actionState=moving 与 decisionState=thinking 可同时存在 |
| T-DEC-007 | DEC-003, PLAN-006 | 第一次 Decision completion 返回非法 Plan | Adapter 不自行重试；Simulation validation 后决定是否发起唯一 correction attempt |
| T-DEC-008 | DEC-001, DEC-003, SIMULATION §15 | DecisionCompletion 返回 Plan/failure | Completion 不要求 provider 回传 actorId；Runtime callback closure 以 {actorId, completion} 入 Inbox；无 gameplay timing/dueTick，callback 不修改 Actor state |
| T-DEC-009 | STATE-005, STATE-006 | 当前 Plan 仍有未 materialize 的后续 path/skill intent | 不为“下一 Plan”提前开启新 generation；当前 Plan 继续拥有 future intent |
| T-DEC-010 | STATE-006 | 当前 Plan 的最后一个 intent 已 materialize 成 active move/windup/recovery | 当前 Action 可继续，同时允许最多一个 next Decision 进入 thinking |
| T-DEC-011 | STATE-006, SKILL-004 | action lock 未结束时 next Decision completion 被 reducer 接受 | 保存为唯一 pending accepted plan；不得启动 Action，也不得接受第三份排队 Plan |
| T-DEC-012 | STATE-006, HIT-003 | active Action 受 damaging hit 且 pending Plan 已存在 | 旧 action/plan/decision authority 一并失效；不允许 stale pending Plan 在后续启动 |
| T-DEC-013 | DEC-004/DEC-005, SIMULATION §10 | authority-valid DecisionCompletion.failed(category=attempt_failure)，code任意 | 单次失败不终止 Battle；当前 generation结束；Simulation不解释code，只按category更新availability streak；未达3时最早下一逻辑Tick重新Decision |
| T-DEC-014 | DEC-004 | DecisionCompletion.failed(category=session_fatal) | 进入 Runtime terminal arbiter，BattleResult=failure source=decision |
| T-DEC-015 | SIMULATION §12/17 | recovery_complete 在 phase 3 到期且已有 pending Plan | phase 3 action→idle；phase 10 promote pending→active 并可按最新状态启动本 Tick唯一新 Action |
| T-DEC-016 | SIMULATION §12 | pending attack Plan promotion时 Actor仍 protected | 只获得 active execution authority；不得 windup，保留 intent并等待后续合法 Tick重检 |
| T-DEC-017 | STATE-006, SIMULATION §9/11/17 | skill 在 phase 10 materialize 当前 Plan 最后 intent 并进入 windup/recovery lifecycle | 当前 Tick可用 prefetch_after_materialize 发起 next Decision；不等同于无 Action 的 plan_exhausted |
| T-DEC-018 | STATE-006, SIMULATION §17/20 | final move intent 在 phase 13 reservation成功并 move_start | phase 13 才清空 activePlan并可发 next Decision；reservation失败则不走 prefetch_after_materialize，而按 plan_failed 最早下一 Tick重决策 |
| T-DEC-019 | PLAN-009, TURN-001 | pure turn 是当前 Plan 最后 intent | turn 同 Tick完成，不做 prefetch_after_materialize；最早下一 Tick创建新 generation |
| T-DEC-020 | CONTRACTS §16 | DecisionPort resolve 的 requestId/generation 与 expected 不一致 | protocol invariant；Runtime cleanup并 reject run()，不变成 Plan reject/BattleResult |
| T-DEC-021 | CONTRACTS §16 | DecisionPort Promise reject 或同步 throw | 预期provider失败未按Completion.failed归一化，视为adapter/programmer invariant；Runtime捕获cleanup并 reject run()，无 unhandled rejection |
| T-DEC-022 | CONTRACTS §9 | Tick N damaging hit触发新Decision | Observation recentEvents只含Tick N与N-1 relevant facts，稳定排序；长期Battle不积累无界Observation history |
| T-DEC-023 | DEC-004/DEC-005, SIMULATION §10 | authority-valid attempt_failure 连续第1、2次被消费，code可任意不同 | Simulation不解释code；streak=1/2；Battle保持RUNNING；最早下一合法Tick可重新Decision |
| T-DEC-024 | DEC-005, SIMULATION §10 | 两次attempt_failure后消费一个authority-valid DecisionCompletion.completed，但Plan随后被Simulation reject | completion先把streak重置0；PlanRejectReason/correction不属于Decision availability failure |
| T-DEC-025 | DEC-005, CTRL-002, SIMULATION §10/§16 | 连续第3个authority-valid attempt_failure在Tick N phase 9消费 | Tick N完整提交；本Tick合法Decision commands仍正常调用；随后进入PAUSED且 pauseReason=`decision-circuit`；onPause只发一次；不schedule next wake |
| T-DEC-026 | DEC-005, SIMULATION §10/§29 | circuit trip时另一个Actor仍有active Decision request | 不abort、不revoke；Actor decision/requestId/generation保持不变；request可在PAUSED期间完成并enqueue；resume后第一个真实Tick按正常authority fence消费 |
| T-DEC-027 | SIMULATION §10 | 同一Decision Inbox snapshot按stable order为 failure, failure, failure, success | 第3个failure后circuit latch open；同Tick后续success不得自动解锁；必须显式resume |
| T-DEC-028 | DEC-005, SIMULATION §10 | streak=2后消费一个因既有lifecycle原因已stale的completion | 不读取concrete code；stale/lifecycle-invalid不产生availability signal，不增加、不重置streak，不触发pause |
| T-DEC-029 | DEC-004/DEC-005, SIMULATION §10 | 任意authority-valid session_fatal，code取任意opaque值 | 不等待failure threshold；直接terminal BattleResult=failure source=decision，并可原样传播code但不按code分支 |
| T-DEC-030 | CTRL-002, SIMULATION §10 | decision circuit PAUSED后玩家选择重试，product显式battle.resume() | streak清0、circuit关闭、presentation.resume成功后RUNNING；pauseReason清除；无pause catch-up；保留原thinking/in-flight request；PAUSED期间已enqueue completion在后续首个真实Tick正常消费 |
| T-DEC-031 | CTRL-002, SIMULATION §6/§10 | `pause("host-background")` / resume且circuit未open | PAUSED时 pauseReason=`host-background`；不因pause/resume本身清零已有failure streak；两类pause都不abort/revoke active Decision；resume后reason清除 |
| T-DEC-032 | DEC-005, SIMULATION §10/Replay | Live中曾因3个attempt_failure进入circuit PAUSED；Replay重放相同Decision records | Replay不启用live circuit、不进入PAUSED；由于live circuit未改写requestId/generation/Actor decision authority，Replay仍产生相同Decision request/consume trace |
| T-DEC-033 | DEC-004/DEC-005, CONTRACTS §16 | 三个authority-valid attempt_failure分别使用完全不同的concrete code | Simulation结果与code值无关：都只按category累计；证明circuit对Decision implementation/provider-neutral |
| T-DEC-034 | SIMULATION §6/§10/§28 | late scheduler wake需要catch-up多个Tick，circuit在其中Tick N trip | Tick N完整提交后立即进入PAUSED；`accumulatedRunningMs = N * 200`；N+1..target不继续处理；resume后不得补跑pause前未处理的wall-time backlog |
| T-DEC-035 | SIMULATION §10/§16/Replay | Tick N同时产生合法Decision command且health signal使circuit trip | command仍在Tick N shell中调用并建立正常request authority；随后PAUSED；Replay不运行circuit时仍生成相同requestId/generation与后续Decision record |
| T-DEC-036 | SIMULATION §10/§16/Replay | 新建live Runtime与Replay Runtime分别处理同一Decision failure序列 | live guard初值固定为 streak=0/circuitOpen=false 并按规则更新；Replay path不启用/不读写availability guard，也不因三次failure进入PAUSED |




## 8.1 DeepSeekDecision concrete acceptance — IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED

以下测试针对 BATTLE_V0_DECISION.md，不依赖真实付费 provider；默认使用 FakeDeepSeekTransport。

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-DDEC-001 | DECISION §2–4/§14 | 构造 DeepSeekDecision | public option 只有 configured DeepSeekTransport；不接收 apiKey/provider/model/baseUrl/timeout/retry |
| T-DDEC-002 | DECISION §3 | normal decide() | exactly 两个 provider request；都使用 deepseek-flash + POST /responses + stream=false，无 tools |
| T-DDEC-003 | DECISION §4.1 | Call A request | reasoning.effort=high、text output、max_output_tokens=65536；temperature 不发送 |
| T-DDEC-004 | DECISION §4.2/8 | Call B request | reasoning.effort=none、temperature=0、json_schema name=battle_plan_v0、max_output_tokens=4096 |
| T-DDEC-005 | DECISION §5/13 | Simulation correction request | 作为新的 decide() 自包含重新执行 Call A + Call B；不得复用上一 request strategy/provider session |
| T-DDEC-006 | DECISION §6.3 | moving prefetch A→B | prompt 明确 PATH BASE=planningOrigin=B，同时保留 self.tile=A/action.to=B |
| T-DDEC-007 | DECISION §6.4 | maxPathSteps=r | terrain 只序列化 clamp 后 origin±r square，带 global map size/window origin，row-major . / # |
| T-DDEC-008 | DECISION §6.5 | 相同 DecisionRequest 两次格式化 | provider-facing context byte-for-byte stable，不受 locale/object insertion order 影响 |
| T-DDEC-009 | DECISION §7 | strategy memo 含类似 instruction 文本 | Call B 仍把 memo 放在 data/context，不能提升为 system/instructions policy |
| T-DDEC-010 | DECISION §8–9 | Call B 返回合法 JSON shape | local parser 产出 detached PlanSubmission，requestId/generation 原样 echo |
| T-DDEC-011 | DECISION §9 | JSON 非法/空输出/unknown field/string coordinate/missing path | attempt_failure code=DECISION_OUTPUT_INVALID；不 regex repair、不 coercion |
| T-DDEC-012 | DECISION §8–9 | Plan shape 合法但 path 穿墙/target 不合法 | DecisionCompletion.completed；交给 Simulation validator 产生 PlanRejectReason |
| T-DDEC-013 | DECISION §10–11 | Responses incomplete content_filter | attempt_failure DECISION_PROVIDER_REFUSED |
| T-DDEC-014 | DECISION §10–11 | Responses incomplete max_output_tokens | attempt_failure DECISION_PROVIDER_INCOMPLETE |
| T-DDEC-015 | DECISION §11 | HTTP 429 / 5xx / network / timeout | 分别映射 RATE_LIMITED / UNAVAILABLE / NETWORK / TIMEOUT，且无 automatic retry |
| T-DDEC-016 | DECISION §11/§14 | HTTP 401/403 / 402 | 分别 session_fatal AUTH / QUOTA；transport只返回status/bodyText，不解析provider error body |
| T-DDEC-017 | DECISION §11.3 | unexpected fixed-request 400/422 | adapter/provider-contract invariant，Promise reject；不伪装为 Plan reject/BattleResult failure |
| T-DDEC-018 | DECISION §12 | external AbortSignal 在 Call A 前 abort | 不发 provider request；settle once，code=DECISION_ABORTED |
| T-DDEC-019 | DECISION §12 | Call A 完成后、Call B 前 abort | 不发 Call B；settle once；late provider callback 无额外 completion |
| T-DDEC-020 | DECISION §12 | Call B 中 abort 且 transport忽略 | DeepSeekDecision 本地立即settle once为DECISION_ABORTED，不等待transport；迟到resolve/reject丢弃且不得产生第二completion |
| T-DDEC-021 | DECISION §12.1 | 单个 provider request 超过 60s | attempt_failure DECISION_PROVIDER_TIMEOUT；不是 Battle gameplay deadline/dueTick |
| T-DDEC-022 | DECISION §14 | FakeDeepSeekTransport | 与 production 共用 `new DeepSeekDecision({ transport })` seam；只脚本化 `{status, bodyText}` / network reject / deferred / abort-late-resolve；不增加 testing-only injection factory |
| T-DDEC-023 | DECISION §18.3 | real Simulation + DeepSeekDecision(Fake transport) | initial request 两次 provider call→Plan→accept；existing Tick/Inbox/Replay semantics 不变 |
| T-DDEC-024 | DECISION §18.3 | first Plan gameplay-invalid | Simulation 发 correction decide()；新 request 再两次 provider call；attempt1 invalid 后按 frozen generation rule 结束 |
| T-DDEC-025 | DECISION §18.4 | configured real-transport / credential-gated smoke | product integration 提供真实 configured DeepSeekTransport，可手动验证 Call A non-empty + Call B structured + local parser；普通 CI 不访问 DeepSeek |
| T-DDEC-026 | DECISION §19 | package qualification | npm run test:battle 与 npm pack dry-run 通过；./decision 与 ./decision/testing 可解析 |
| T-DDEC-027 | DECISION §2 | transport 缺失/结构非法 | constructor/programmer configuration reject；不得自行读取 env/browser/global credential 或发网络请求 |
| T-DDEC-028 | DECISION §10–11 | HTTP 2xx + response.status=failed | attempt_failure DECISION_PROVIDER_UNAVAILABLE；provider error.code/message只可进入private diagnostics，不参与authority classification |
| T-DDEC-029 | DECISION §2.1/§4 | production caller 构造 DeepSeekDecision 并调用 decide | caller 只依赖 DecisionPort/DeepSeekDecision；production export 不暴露 analyze/strategize/materialize 或 workflow stage API |
| T-DDEC-030 | DECISION §2.1/§4 | v0 workflow 内部执行 Call A + Call B | exactly two calls 仍是当前 workflow acceptance；测试不得把 call count 写成 Simulation/Host ABI |
| T-DDEC-031 | DECISION §17 | 检查 v0 PlayerGuidance reservation | v0 不存在 setGuidance/currentGuidance/provider-thread Guidance hidden state，也不增加 generic extensions bag；existing transport-only construction path保持成立 |
| T-DDEC-032 | DECISION §17 | future-workflow architecture fixture/structural review | workflow 可在不修改 DecisionPort 与 Simulation wiring 的前提下由 Analyze+Strategize→Materialize 演进为 Analyze→Guidance→Strategize→Materialize；exact future Guidance type 不在 v0 实现中伪造 |
| T-DDEC-033 | DECISION §6.6 | Call A/Call B final serialized request body = 512 KiB | 允许发送；byte size只看最终UTF-8 JSON body |
| T-DDEC-034 | DECISION §6.6/§11 | final serialized request body > 512 KiB | 不发HTTP；session_fatal DECISION_CONTEXT_TOO_LARGE；不tokenize、不自动截断 |
| T-DDEC-035 | DECISION §10.1 | completed response含 reasoning item + assistant message/output_text | reasoning内容忽略；按provider顺序拼接所有assistant output_text |
| T-DDEC-036 | DECISION §10.1/§11 | HTTP 2xx completed response含 function_call/web_search_call/unknown output item | attempt_failure DECISION_PROVIDER_UNAVAILABLE；不得把tool结果当visible text，不升级成Runtime invariant |
| T-DDEC-037 | DECISION §10.1 | response.model返回具体版本名而非 deepseek-flash alias | 仍可成功；model只作为non-authoritative diagnostics |
| T-DDEC-038 | DECISION §14 | HTTP 503且body是HTML/plain text | transport resolve status=503/bodyText；Workflow直接映射DECISION_PROVIDER_UNAVAILABLE，不JSON.parse错误body |
| T-DDEC-039 | DECISION §10–11/§14 | HTTP 2xx但body不是JSON或Responses envelope malformed | attempt_failure DECISION_PROVIDER_UNAVAILABLE；进入普通Decision failure/circuit路径，不升级成Runtime invariant |
| T-DDEC-040 | DECISION §12.3 | external abort与60s timeout竞争 | settle判定时signal已aborted则DECISION_ABORTED优先；否则timeout→DECISION_PROVIDER_TIMEOUT；只settle一次并清理timer/listener |
| T-DDEC-041 | DECISION §14.2 | 同一DeepSeekDecision并发decide(A)/decide(B)，provider calls交错 | strategy/stage/timeout/abort/requestId/generation不串线；不得依赖mutex/global queue/per-actor mutable cache |
| T-DDEC-042 | DECISION §2.2/§14.1 | implementation structure review | 只保留DecisionPort→DecisionWorkflow→DeepSeekTransport三层seam；Analyzer/ErrorClassifier/BudgetManager/ConcurrencyManager等不得成为v0 framework/interface |
| T-DDEC-043 | DECISION §12.1/§14 | Call A与Call B | 两者共用同一callDeepSeek normalization path；不得复制HTTP/timeout/output-extraction分支 |


## 9. Control Plane / Replay

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-CTRL-001 | CTRL-001 | 两个 Tick 之间 Frame abort | 立即失效 authority，不等下个 Tick |
| T-CTRL-002 | CTRL-001 | Battle cancel 后 Promise/LLM 返回 | 不得修改结束 Battle |
| T-CTRL-003 | CTRL-001, RESULT-001 | RUNNING 时 battle.close() | 取消 authority、清理资源，run() 通过单一结果通道得到 cancelled，不同时产生同义 Promise rejection |
| T-CTRL-004 | RESULT-001, SIMULATION §24 | Presentation 抛 CONTENT_FAILED / COMMIT_FAILED | Runtime cleanup，run() 返回 failure source=presentation；INVALID_STATE/SCENE_MISMATCH/PROJECTION_CONFLICT/INVALID_DATA 走 programmer/invariant throw/reject |
| T-CTRL-005 | RESULT-001 | Presentation resize timer/internal callback 出现已分类 async fatal | Presentation 立即 cleanup 并只完成一次 `failure` channel；Runtime 观察后停止 authority并归约为 Battle failure；不得成为 unhandled callback exception |
| T-CTRL-006 | SIMULATION §24 | terminal Tick 已判 ally win，但 final render 同步 throw classified fatal | normal result尚未commit；最终 BattleResult=failure source=presentation |
| T-CTRL-007 | SIMULATION §24/28 | normal result final render成功并已commit，随后 async presentation.failure 到达 | 不改写已commit BattleResult |
| T-CTRL-008 | SIMULATION §4 | CREATED 调 pause/resume 或第二次 run | programmer error；close 幂等；RUNNING重复 resume / PAUSED重复 pause 为 no-op |
| T-CTRL-009 | SIMULATION §4 | SETTLED 后 cancel，再 close 两次 | cancel no-op；第一次 close→CLOSED并清理Presentation，第二次 close no-op |
| T-CTRL-010 | SIMULATION §5/28 | presentation.initialize 尚未返回时 async failure 或 cancel 先终止 session | initialize 后续返回不得继续 initial render / initial Decision / scheduler start；run() 保持已commit终止结果 |
| T-CTRL-011 | SIMULATION §6/28 | battle.pause()/resume() 调用 Presentation 时同步 classified fatal | Runtime 捕获并通过 terminal arbiter归约为 presentation failure；不得同时向调用方抛同义业务错误 |
| T-CTRL-012 | SIMULATION §16/17/24 | phase 7 已产生 redecision need，但 phase 8 terminal gate 随后结束 Battle | 不调用 DecisionPort；terminal suppress 同 Tick尚未发出的 Decision commands |
| T-CTRL-013 | SIMULATION §16/24 | 非 terminal Tick reducer输出 Decision command，但 presentation.render 同步 fatal | 先归约 presentation failure并 suppress Decision command；provider 不收到新 request |
| T-CTRL-014 | SIMULATION §24 | Presentation抛 INVALID_STATE/SCENE_MISMATCH/PROJECTION_CONFLICT/INVALID_DATA | 视为 Runtime/contract invariant或programmer error，throw/reject；不包装成 BattleResult.failure |
| T-CTRL-015 | SIMULATION §6/7 | currentTick/ID counter 下一次递增将超出 safe integer | 在溢出前停止 authority，BattleResult=failure source=simulation code=BATTLE_COUNTER_OVERFLOW；不得 wrap/继续 |
| T-CTRL-016 | CTRL-002, TIME-004 | RUNNING 调 `pause("host-background")` | 进入PAUSED；Snapshot.pauseReason=host-background；onPause({reason:"host-background"})恰好一次；clock冻结 |
| T-CTRL-017 | CTRL-002 | 已PAUSED/decision-circuit时再次 `pause("host-background")` | no-op；reason仍为decision-circuit；不得第二次发onPause |
| T-CTRL-018 | CTRL-002 | 任一PAUSED状态显式resume成功 | 进入RUNNING；Snapshot不再含pauseReason；不得自动产生第二次resume |
| T-CTRL-019 | CTRL-002 | RUNNING时调用legacy `pause()` 无参数 | 向后兼容等价于 `pause("host-background")` |
| T-CTRL-020 | CTRL-002 | subscribe onPause 后unsubscribe，再次发生pause | unsubscribe后不再通知；不影响Runtime pause本身 |
| T-REPLAY-001 | REPLAY-001 | Replay 一场已记录 Battle | 不重新调用 LLM；按记录的 request/consume/accept Tick 与 Plan 复现，不依赖真实 completion timestamp |
| T-REPLAY-002 | REPLAY-001, RNG-001 | Replay seeded contention | 相同 winner/result |
| T-REPLAY-003 | REPLAY-002 | 开关 diagnostics | gameplay result 不变 |
| T-REPLAY-004 | SIMULATION §26/27 | live run记录completion consumedTick，随后Replay | Replay从record.initial重建，按recorded consumedTick注入，不调用DecisionPort；重新生成的requestId/generation/requestTick/planningOrigin与record一致；final result/snapshot/gameplay Projection sequence一致 |
| T-REPLAY-005 | SIMULATION §27 | recorded contention winner与当前seed重算结果不一致 | Replay invariant failure，不静默采用recorded winner |
| T-REPLAY-006 | REPLAY-001, SIMULATION §26–27 | normal/decision-session-fatal/deterministic-simulation-failure record | replayability=deterministic；BattleReplayBuilder可运行并验证最终结果 |
| T-REPLAY-007 | REPLAY-001, SIMULATION §26–27 | external cancel 或 Presentation failure | replayability=audit_only；保留partial facts/result但 BattleReplayBuilder 明确拒绝 deterministic replay |
| T-REPLAY-008 | REPLAY-001, SIMULATION §26–27 | invariant rejection | replayability=audit_only(invariant_rejection)，无业务 result；不得伪造 replay terminal boundary |

## 10. Presentation

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-PRES-001 | ARCH-003 | Browser 掉帧 | Simulation result 不变 |
| T-PRES-002 | ARCH-003 | Effect asset load fail | damage/result 不变，可发 diagnostic |
| T-PRES-003 | ARCH-003 | Presentation camera/viewport 重新布局 | 不改 Simulation State；v0 camera 无 zoom/focusHint/animation |
| T-PRES-004 | STATE-001 | Sprite 插值位置 x=2.7 | Decision/Simulation 仍只看到 committed integer tile |
| T-PRES-005 | ARCH-006, BATTLE-001 | 仅用 synthetic Presentation input 初始化 4 个唯一 actorId | Presentation 可创建 4 个 actor visual/HUD entry 且无固定 ally/enemy slot；这不使 v0 Simulation 接受 4 Actor |
| T-PRES-006 | ARCH-003, ARCH-005, SIMULATION §5 | Runtime 启动 Battle session | 先观察 failure channel、await initialize、render tick-0 initial Projection、创建 requestTick=0 initial Decision，再启动 200ms Battle clock；SceneInit 不重复维护动态初值 |
| T-PRES-007 | ARCH-003 | 正常 BattleResult 已 resolve 但 scene 尚未退出 | final Projection 保持可见；直到 battle.close() 才关闭 Presentation |
| T-PRES-008 | CTRL-001 | RUNNING 状态直接调用 battle.close() | 等价于 cancel authority + cleanup；scheduler/late completion 无提交权，Presentation close 幂等 |
| T-PRES-009 | ARCH-003 | 没有新 Simulation Projection，仅 viewport resize | Simulation state/tick 不变；Presentation 自行推进 visualEpoch 并提交新 layout |
| T-PRES-010 | ARCH-003 | Tick N 发布 effectStarts=[effect-1]，Tick N+1 effectStarts=[] | effect-1 继续按 Presentation-local visual timing 播放并自行 cleanup；Simulation 不维护 active visual effect |
| T-PRES-011 | ARCH-003 | 同一个 effectId 因重复 render 再次出现 | 不重复创建 transient visual |
| T-PRES-012 | ARCH-003, ARCH-005 | initialize 完成后 first render | 只创建一次完整 RenderDomain；root/actor/effects/HUD key、tag、slot 与 FROZEN Render Tree 完全一致 |
| T-PRES-013 | ARCH-006 | Scene actor 输入顺序交换 | actor RenderNode 仍按 Contracts 定义的 ActorId ECMAScript ordinal string order 稳定排列，identity 不随输入顺序改变 |
| T-PRES-014 | ARCH-003 | Actor active movement，同时 viewport resize/camera 改变 | Actor data 只含 world motion，不含 screenX/fromScreenX；motionId/fingerprint/elapsed 不重启，只改变 parent transform |
| T-PRES-015 | ARCH-003 | 两个 alive Actor 分处地图两点 | camera 使用 movement.to-or-tile target 的 bounding midpoint，clamp Map bounds；无 zoom/animation |
| T-PRES-016 | ARCH-003 | Map 小于 logical viewport | 对应 camera 轴为 0，并通过 originX/originY 在 logical viewport 居中 |
| T-PRES-017 | ARCH-003 | initialize 首个 viewport 与后续连续 resize | 首次立即接受且不 clamp；后续只在 trailing-edge 100ms 提交 latest layout；相同 layout no-op |
| T-PRES-018 | TIME-004, ARCH-003 | PAUSED 中 movement/effect/autotile 正在进行且发生 resize | visual elapsed 全部冻结；resize 仍可提交且 paused=true；resume 后从冻结点继续 |
| T-PRES-019 | ARCH-003 | hit/immune/miss/invalid 四种 effectStarts | hit opacity 1.0；immune 0.6；miss/invalid 不创建 visual；四种 outcome 都消费 effectId |
| T-PRES-020 | ARCH-003 | initialize twice、pre-init render、pause before initial render | 按 Handler FROZEN 状态机产生 programmer/state error；close 幂等，CLOSED 后 render race-safe no-op |
| T-PRES-021 | ARCH-003 | older tick、same tick identical replay、same tick conflicting Projection | older ignore；identical replay no commit/no visualEpoch++；conflict fail fast |
| T-PRES-022 | ARCH-003 | Character/BattleEffect/Tileset/Autotile Browser decode failure | actor/tile 使用 placeholder或 effect skip + diagnostic；不改变 gameplay、不产生 Battle ACK |
| T-PRES-023 | ARCH-003 | first render 后执行 move/turn/damage/effect/pause/resume/resize | 全部使用 domain.update()；normal path 不调用 domain.replace() |
| T-PRES-024 | ARCH-003 | 两个 Actor 同时拥有不同 motionId | 两个 Browser motion 并行插值，不共享 scene-global motion id |
| T-PRES-025 | ARCH-006 | ActorId 恰好 115 UTF-8 bytes / 超过 115 UTF-8 bytes | 上界值生成的 `battle:actor:<actorId>` 不超过 Renderer 128-byte key limit；超界 ActorId 在进入 RenderDomain 前 reject |
| T-PRES-026 | ARCH-003 | hit/immune effect 与 actor、priority tile 位于同一 world 区域 | effect 作为 world-space overlay 始终绘制在 battlefield tile/actor 之上；HUD 独立，不参与 world overlay |
| T-PRES-027 | ARCH-003 | 超大合法 viewport 使 required +1-tile view payload 超过 Renderer capacity guard | 不 clamp、不截断、不 chunk；整次 visual commit 以 PRESENTATION_COMMIT_FAILED 失败且不产生 partial visualEpoch |
| T-PRES-028 | ARCH-003, TIME-004 | animated Autotile 无 suffix / `[N]` suffix，期间 pause/resume | 默认 250ms/frame；`[N]` 为 N*50ms/frame；pause 冻结 visual time，resume 从冻结点继续 |
| T-PRES-029 | ARCH-003 | resource/decode 延迟 >200ms，期间连续多个 visual commit | Character 与 Tileset/Autotile 的同 identity 请求共享 in-flight Promise，最终显示且 decoded Image 复用；seq fencing 不造成 starvation；reject 后允许 retry |
| T-PRES-030 | ARCH-003, ARCH-005 | synthetic Scene/Projection 驱动真实 BattlePresentationHandler | Handler 自建 RenderDomain，数据经 RenderManager → renderer-data → RendererRenderStore → WebProjector 到 lr-battle DOM；movement/effect/resize/close 可见 |
| T-PRES-031 | ARCH-003 | package build 后通过 Browser/HTTP 加载 Battle CSS | `dist/browser/battle.css` 存在、package export 正确、请求非 404 |
| T-PRES-032 | ARCH-003 | first full state 与 later update 分别做 capacity preflight | full state 使用 16384 node count；update 使用 4096 node operations并检查 prospective state；两者不混用 |
| T-PRES-033 | SIMULATION §23 | scheduler late wake catch-up Tick 11/12/13/14 | Simulation依次 render 4份 Projection；不dirty-coalesce，effectStarts/motion facts不丢 |


## 11. Result / Termination

| Test ID | Rules | 场景 | Expected |
| --- | --- | --- | --- |
| T-RESULT-001 | RESULT-001 | enemy 单独在 terminal gate HP=0 | ally win |
| T-RESULT-002 | RESULT-001 | ally 单独 HP=0 | enemy win |
| T-RESULT-003 | RESULT-001, HIT-006 | 双方同 batch HP=0 | simultaneous defeat |
| T-RESULT-004 | CTRL-001, RESULT-001 | 外部 cancel | cancelled termination path |
| T-RESULT-005 | RESULT-002, REPLAY-002 | 长时间无伤害/无进展 | v0 不自动 stalemate/timeout；只更新 diagnostics |

## 12. Core OPEN 状态

当前 Core gameplay 的 6 个原 OPEN 均已冻结，因此不再保留“没有 Expected 的核心测试占位”。`BATTLE-003`、`BATTLE-004` 与 `CTRL-002` 是实现 amendments（不是新的 gameplay reducer rule）；T-INIT-001..005、T-ARENA-001..005 与 T-CTRL-016..020 / 相关 T-DEC cases 已全部通过 automated blocking acceptance。

Presentation blocking OPEN 已清零，§10 已给出 frozen Presentation acceptance；Decision implementation acceptance 已在 §8.1 冻结。PlayerGuidance concrete contract/wiring 明确延期，但 DecisionWorkflow extensibility boundary 已冻结；pause reason / manual-resume policy 已冻结，剩余 Host 工作只是平台 background/foreground event 与 PokeMan Message Frame 接线。其他 OPEN 只涉及非 Presentation Content 统一 schema、未来 Guidance 与 configured DeepSeekTransport 的 credential/network/product capability handoff，这些不得反向改变已冻结 Expected。

## 13. 接真实 LLM 前的最低 Gate

至少应先用 headless Mock/Script 测通：

- `ResolvedBattleActor.initialHp`：字段省略兼容 maxHp、显式受损初值、非法值拒绝、Snapshot / Projection / Replay 一致；
- overdue Tick catch-up；
- Decision inbox snapshot 边界：snapshot 前到达本 Tick消费、snapshot 后到达下一 Tick消费；
- turn-only / turn+skill 的 Action 配额；
- move_start 瞬间转向；
- moving Actor 被 positive damage 中断并留 committed origin；
- moving Actor 被致命伤害时取消 step 且不新建 Decision；
- 同 Tick move completion + 后续 skill resolve；
- protection + retained attack intent；
- zero-damage hit 无 aftermath；
- recovery interruption；
- target movement 导致 lower coefficient / miss；
- no-LOS 行为；
- 0-Tick instant batch；
- seeded tile contention；
- Plan reject + correction failure；
- pause/background clock freeze + `pauseReason` / `onPause`；foreground 不自动 resume；
- 长时间无进展不自动 stalemate；
- simultaneous lethal；
- abort 后 late async completion。

通过这些测试代表 Rule reducer 的核心一致性成立；不代表 Browser 或真实 LLM 集成已经完成。
