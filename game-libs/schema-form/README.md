# Schema Form 游戏库

`@loomrealm-game/schema-form` 提供 caller 当前 Subsystem/Frame 内的一次性 declarative form interaction。它负责 schema/initial value validation、current canonical state、Loading、Presentation projection 和 submit/cancel/abort lifetime；caller 可通过 `onSubmit` 拥有异步业务校验、持久化与最终成功决定。

## 基本用法

不提供 `onSubmit` 时保持 legacy automatic-submit：同步验证通过后立即 resolve submitted。

```ts
const result = await openSchemaForm(scope, frame, {
  schema: {
    version: 1,
    title: "角色名称",
    fields: [
      {
        key: "name",
        kind: "string",
        label: "Name",
        required: true,
      },
    ],
  },
  cancelable: true,
});

if (result.type === "submitted") use(result.value);
```

## Caller-controlled 异步提交

配置 `onSubmit` 后，callback return/Promise resolve 不代表成功；只有 `control.close()` 会 resolve submitted，并返回该 attempt 创建时冻结的 snapshot。

```ts
const result = await openSchemaForm(scope, frame, {
  schema,
  cancelable: true,
  onSubmit: async (value, control) => {
    control.setLoading();

    const errors = await validateRemotely(value);
    if (errors.length !== 0) {
      control.sendValidateError(errors);
      control.cancelLoading();
      return;
    }

    await persist(value);
    control.close();
  },
});
```

Loading 时字段与全部 action controls 被禁用，Browser 不发 change/submit/cancel，Frame abort 仍立即生效。Callback 正常结束而未 close 时表单保持打开；残留 Loading 会自动清除。

## Browser-local draft

Field 可声明严格拼写的 `localstorageKey`：

```ts
{
  key: "name",
  kind: "string",
  label: "Name",
  localstorageKey: "game.character-create.name",
}
```

初值优先级是 explicit `initialValue[field.key]` → valid localStorage → field default → kind-empty。Browser 在 submit attempt 发出前 best-effort 写入每个 key；这只是当前 origin 的最近 draft，不表示业务提交成功，也不是 gameplay/Shared State/save-slot authority。不要用它保存密码、token、credential、payment 等敏感数据。

Restore 是 Runtime Session-owned one-shot：只有 retained `restorePending=true` 的 Presentation 才读取 localStorage；一旦 Runtime consume，Renderer/WebComponent rebuild 不会再次用旧 draft 覆盖 canonical state。

## 边界

- 同一 `Frame` 同时最多一个 active form。
- User cancel resolve `{ type: "cancelled" }`；Frame abort reject `AbortError`。
- Schema Form 不注册独立 Subsystem，也不通过 `frame.call()` 调用自己。
- `sendValidateError()` 使用 transient Render Event；错误不进入 Store/Shared State，Renderer reload 不 replay。
- V1 继续支持 `string`、`number`、`boolean`、`select`，版本仍为 `1`。
- 本次能力没有修改 Web Presentation API 或 Render Update Framework Contract。

## 文档入口

- [Schema Form v1 Design](./DESIGN.md) — V1 normative SSOT。
- [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md) — generic WC projection/custom event contract。
- [Render Update v1](../../doc/15-contracts/render-update-v1.md) — retained Render state/Event contract。
