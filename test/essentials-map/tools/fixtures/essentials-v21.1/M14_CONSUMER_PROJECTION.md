# M14 Consumer Projection — RMXP/Essentials → Runtime FSDB JSON

> 状态：**Implemented / Qualified / Closed**
> 适用范围：`tools/fixtures/essentials-v21.1` 的 M14 consumer-facing semantic projection  
> 依赖：existing importer RC、M12 Content API、M14 Map Game Library  
> 日期：2026-09-10

## Objective

M14 只补第一个真实 map consumer 需要的最小 JSON view：

```text
lossless/importer RMXP representation
→ selective M14 consumer projection
→ Map/{id} + Tileset/{id}
→ M12 ContentClient
→ @loomrealm-game/map
```

这不是 universal map schema，也不是“把已知 RMXP object graph 全部转成 JSON”的新 importer layer。

## 1. Authority / scope

保持三层职责分离：

```text
RMXP / Essentials source semantics
    → 字段含义、容器 identity、行为来源

existing importer/lossless representation
    → Marshal graph、RmxpObject、RubyString、Table decoder、unknown/extra source fidelity

M14 consumer projection
    → 只 materialize 当前 map consumer 实际读取的普通 JsonValue facts
```

M14 Runtime MUST NOT receive：

```text
RmxpObject / RubyString wrapper / RubySymbol wrapper
GenericRubyObject / GenericMarshalNode
rubyObjectId / $id / $ref / $typed
Buffer / Int16Array runtime objects
Ruby Marshal bytes / .rxdata path
```

现有 lossless/structural importer path 继续保存未被 M14 consumer 使用的 source facts；M14 selective view 不替代它。

## 2. Exact M14 consumer records

M14 first slice materializes exactly two record families：

```text
Map/{mapId}
Tileset/{tilesetId}
```

These are semantic identities。The existing M12 FSDB Content projection exposes them as `struct.Map/{mapId}` and `struct.Tileset/{tilesetId}`；graphics are read as `resource.Graphics/{key}`。M14 Runtime uses those exact public Content namespaces without a qualification-only adapter。

### 2.1 Map/{id}

Consumer value contains exactly the facts M14 map Runtime consumes：

```ts
{
  tileset_id: number,
  width: number,
  height: number,
  data: {
    dimensions: number,
    xSize: number,
    ySize: number,
    zSize: number,
    values: number[]
  }
}
```

Do not materialize first-slice-unused `RPG::Map` members merely because the decoder knows them, including：

```text
bgm / bgs
autoplay flags
encounter_list / encounter_step
events
```

Those facts remain available through existing importer/lossless evidence and may gain a consumer projection only when a real later behavior reads them.

### 2.2 Tileset/{id}

Consumer value contains exactly：

```ts
{
  id: number,
  tileset_name: string,
  autotile_names: readonly (string | null)[], // exact length 7
  passages: ProjectedTable,
  priorities: ProjectedTable
}
```

`autotile_names` comes from `RPG::Tileset.@autotile_names`：

```text
must be Ruby Array length 7
null / nil / empty RubyString → null
non-empty RubyString → original text (no trim)
other element kinds → M14_CONSUMER_PROJECTION_FAILURE
```

Do not materialize still-unused Tileset members such as：

```text
name
panorama / fog / battleback
terrain_tags
```

### 2.3 Explicitly deferred record families

M14 first slice does not materialize or qualify：

```text
MapInfo/{id}
MapMetadata/{id}
MapEvent/*
```

If a later real behavior consumes one, add the smallest source-specific projection before that use. Do not pre-create empty/general families for symmetry.

## 3. Source-container → record identity

### 3.1 MapNNN.rxdata → Map/{N}

A canonical physical filename matching：

```text
Map<digits>.rxdata
```

with decoded known root `RPG::Map` materializes one record：

```text
Map/{decimal N}
```

Examples：

```text
Map001.rxdata → Map/1
Map042.rxdata → Map/42
```

Rules：

```text
N is a positive safe integer
leading zeroes disappear only through decimal interpretation
root must be known RPG::Map
one physical map root → one consumer Map record
```

Do not invent an `id` member in Map value; Content key owns map identity.

### 3.2 Tilesets.rxdata → Tileset/{i}

For each consumer-relevant non-null known `RPG::Tileset` at source array index `i`：

```text
Tilesets.rxdata[i]
→ Tileset/{i}
```

Required：

```text
i is a positive safe integer
projected RPG::Tileset.id exists
projected id == i
```

Index/id mismatch fails closed; it is not normalized or repaired. Null slots are skipped.

Exact v21.1 evidence contains non-null editor placeholder entries whose
`tileset_name` is empty and which are not referenced by any projected Map.
Those unreferenced empty-name placeholders are omitted like unused slots. An
empty-name entry referenced by any projected Map still fails closed. This is
the only placeholder exception; non-empty entries retain the index/id rule.

## 4. Scalar projection used by M14

Only scalar forms actually required by the records above need implementation.

```text
Ruby Integer
→ JSON number only when safe integer

RubyString used as semantic text
→ JSON string
```

Required unsafe integer, undefined/opaque required text, NaN/Infinity or another non-representable required fact fails closed.

M14 does not need a generic `projectJsonValue()` for arbitrary Ruby objects, Arrays or Hashes.

## 5. RGSS Table projection

Required decoded RGSS Table becomes exactly：

```ts
interface ProjectedTable {
  dimensions: number;
  xSize: number;
  ySize: number;
  zSize: number;
  values: number[];
}
```

Serialized element order is preserved. Frozen coordinate index：

```text
index(x,y,z)=x+y*xSize+z*xSize*ySize
```

So x changes fastest, then y, then z.

Materialization validates：

```text
dimensions is decoded RGSS dimension count
xSize/ySize/zSize are positive safe integers
values.length == xSize*ySize*zSize
all values preserve decoded Int16 values as finite safe JSON numbers
```

For the M14 required records specifically：

```text
Map.data:
    dimensions=3
    xSize=Map.width
    ySize=Map.height
    zSize=3
    values.length=width*height*3

Tileset.passages/priorities:
    dimensions=1
    ySize=1
    zSize=1
    values.length=xSize
```

Qualification MUST use a non-zero coordinate to prove axis order. There is no nested `[z][y][x]` consumer representation and no Runtime Table class.

## 6. Exact selective extraction

Preferred implementation is direct importer-local extraction, conceptually：

```text
projectRequiredInteger(...)
projectRequiredText(...)
projectTable(...)
projectMapRecord(root, filename)
projectTilesetRecords(root)
```

Names are private and non-normative.

`projectMapRecord` reads only：

```text
@tileset_id
@width
@height
@data
```

`projectTilesetRecords` reads only：

```text
@id
@tileset_name
@passages
@priorities
```

It MUST NOT recursively walk every known ivar merely because `RMXP_CLASS_REGISTRY` lists it.

Do not create：

```text
ConsumerProjector<T>
ProjectionRegistry
SemanticMaterializer hierarchy
ProjectionPipeline / ProjectionContext service
RMXP TypeScript class hierarchy
map-schema package
```

## 7. Resource identity

Existing raw-resource mapping remains authoritative：

```text
RPG::Tileset.tileset_name
→ Graphics / Tilesets/{tileset_name}

M14 initial characterName
→ Graphics / Characters/{characterName}
```

The consumer projection does not create AssetManifest, AssetManager or resource metadata records.

## 8. Failure / unknown facts

```text
unused by M14 consumer
→ do not materialize into M14 record
→ existing importer/lossless path remains source-fidelity evidence

required by M14 consumer but not mechanically representable
→ fail closed
→ add only the smallest explicit rule needed by the real consumer
```

Never push importer wrappers into Runtime as an escape hatch.

## 9. Qualification minimum

Before M14 closure prove：

```text
Map001.rxdata → Map/1
Tilesets.rxdata[i] → Tileset/{i}
Tileset id/index mismatch fails
Map consumer value has only tileset_id/width/height/data
Tileset consumer value has only id/tileset_name/autotile_names/passages/priorities
safe integer / required text failure rules
Table exact shape + non-zero coordinate ordering
Map.data zSize exactly 3 for selected M14 record
no decoder metadata/wrappers or unused nested RPG objects in consumer records
production FSDB persists/reads those records as JsonValue
@loomrealm-game/map obtains them only through ContentClient
```

Existing importer RC remains valid but does not by itself close this selective M14 consumer projection.
