# KONKR Pocket Block 掌机连接与调试指南

> 面向需要在 Windows 主机上连接这台掌机做 adb / Chrome DevTools 实测的 agent。
> 最后验证日期：2026-10-31。文末附验收清单，照做即可确认链路正常。

## 1. 设备概况（已核实，勿重复排查）

| 项目 | 值 |
|---|---|
| 型号 | KONKR Pocket Block（`ro.product.model=Pocket Block`） |
| product / device | `Pocket_Block` |
| 系统 | Android 12，API 31（Android Go，`ro.config.low_ram=true`） |
| Chrome | **155.0.8059.84**（versionCode 805908474，旁加载版） |
| 出厂 Chrome | 110.0.5481.153（dumpsys 里以 Hidden system packages 存在，未被使用） |
| 无线调试名 | `adb-BW0112PA30004600`（`_adb._tcp`） |
| 手柄 | AYANEO Controller，Vendor 4001 / Product 0428，`/dev/input/event5` |

## 2. 主机环境

- Windows + PowerShell
- adb：`C:\Users\lithd\platform-tools\adb.exe`
- Python（仅需标准库）
- CDP 客户端：`C:\Users\lithd\AppData\Local\Temp\cdp_eval.py`（本机无 websocket 模块，勿找 pip，源码备份见附录 B，Temp 被清理后可重建）

## 3. 连接方式

### 3.1 推荐流程：ZeroTier 探路 → 内网优先，ZeroTier 兜底

思路：ZeroTier 地址固定（172.24.0.139），内网快但 IP 会变。先用 ZeroTier 建立通道，读出掌机当前的内网 IP，内网能通就切内网并断开 ZeroTier；内网不通就留在 ZeroTier。全程只保留一条 transport，后续命令免 `-s` 纠结。

```powershell
$adb = "C:\Users\lithd\platform-tools\adb.exe"

# 1) 先连固定的 ZeroTier 地址
& $adb connect 172.24.0.139:5555

# 2) 经 ZeroTier 通道读掌机 wlan0 的内网 IP（会变，勿硬编码）
$lan = (& $adb -s 172.24.0.139:5555 shell "ip -f inet addr show wlan0" |
    Select-String -Pattern 'inet\s+(\d+\.\d+\.\d+\.\d+)').Matches[0].Groups[1].Value
# → 形如 192.168.31.x

# 3) 尝试内网直连并验证
& $adb connect "${lan}:5555"
$model = & $adb -s "${lan}:5555" shell getprop ro.product.model   # → Pocket Block

# 4) 二选一：内网通→用内网；不通→退回 ZeroTier
if ($model -match 'Pocket Block') {
    & $adb disconnect 172.24.0.139:5555   # 内网优先，断开 ZeroTier 通道
} else {
    & $adb disconnect "${lan}:5555"       # 内网不可用，留在 ZeroTier
}
& $adb devices -l   # 确认只剩一条 transport
```

> 注意第 3 步 `${lan}:5555` 的花括号写法，原因见 §9。
> 若主机与掌机不在同一局域网，步骤 3 会连不上（超时），流程自动落到 ZeroTier，属预期行为。

### 3.2 兜底：mDNS（ZeroTier 整体不通时）

ZeroTier 空闲后对端路径可能失效（实测 10-30 出现单向不通：设备→主机通、主机→设备超时，有流量触发后路径重建恢复，17ms 级）。若 3.1 第 1 步就连不上，改用 mDNS 发现：

```powershell
& $adb mdns services
# 输出形如：adb-BW0112PA30004600	_adb._tcp	192.168.31.x:5555
& $adb connect 192.168.31.x:5555
```

历史 IP：192.168.31.5（10-27）→ 192.168.31.6（10-29 起）。**不要硬编码 IP**，每次以 mDNS 或 ZeroTier 通道读出的为准。

### 3.3 ZeroTier 备注

| 节点 | ZeroTier 地址 |
|---|---|
| 掌机（tun0） | **172.24.0.139/16** |
| Windows 主机 | 172.24.137.107/16（网络 `272f5eae16956013`） |

- 实测 ping 17–258ms（抖动大），TCP 5555 可达，adb/shell 正常；设备端 ZeroTier 应用为 `com.zerotier.one`。
- ⚠️ `219.139.217.130` **不是**这台设备的 ZeroTier 地址（不在托管网段 172.24.0.0/16 内，流量会被丢给默认网关），勿使用。
- ZeroTier 排障顺序：主机侧 `Get-Service`（ZeroTierOneService）→ 设备侧 `ip addr show tun0` 与 `ps -A | grep zerotier`（经内网/mDNS 通道执行）→ 两侧各 ping 对方 ZeroTier 地址定位断向。

### 3.4 多 transport 注意

若因排障需要两条连接并存，所有命令必须带 `-s`：

```powershell
& $adb devices -l   # 先看序列号
& $adb -s 192.168.31.6:5555 shell getprop ro.product.model
```

日常按 3.1 的流程结束时只留一条，避免混淆。

## 4. 连接验证（三条 getprop）

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.product.model   # → Pocket Block
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.build.version.release  # → 12
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.build.version.sdk  # → 31
```

Chrome 版本核对：

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell dumpsys package com.android.chrome | Select-String versionName
# 第一条 versionName=155.0.8059.84 是当前启用版本；110.0.5481.153 是隐藏的出厂包，正常现象
```

## 5. Chrome 远程调试（CDP）

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> forward tcp:9222 localabstract:chrome_devtools_remote
Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json' -UseBasicParsing | Select-Object -ExpandProperty Content
```

- 页面 id 每次会变，以 `/json` 返回为准（10-27 时 LoomRealm PWA 是 id 14）。
- 常驻页面：`https://lithd.ltd/pwa/pokeman/`（LoomRealm PWA）及其 service worker。`https://www.gamepadtester.cn/` 视情况可能不在。
- 在页面里求值：把表达式写进 js 文件，然后

```powershell
python C:\Users\lithd\AppData\Local\Temp\cdp_eval.py <pageId> <exprfile>
```

### 排障

| 症状 | 处理 |
|---|---|
| 9222 连上即被关闭 / 页面掉线 | 重新 `adb connect` + 重新 `forward`（forward 解析在连接时，socket 重建后必须重做） |
| forward 正常但 `/json` 拿不到 | 设备端 `cat /proc/net/unix | grep devtools`，若无 `@chrome_devtools_remote`：`am force-stop com.android.chrome` 后 `am start -n com.android.chrome/com.google.android.apps.chrome.Main`，socket 会随重启出现。**副作用**：所有页面重载，getGamepads() 清空（见 §6） |
| IP 变了 | `mdns services` 重新拿地址 |

## 6. 手柄已知事实（已核实，勿重复排查）

- Chrome 里 `gamepad.mapping` 是**空字符串**，不是 `"standard"`。游戏（PWA）要求 `mapping === "standard"` 才认手柄，所以被忽略——对应 `lithdoo/loom-realm#111`。
- 方向键在内核是 `ABS_HAT0X/Y`（不是 KEY_*），Chrome 已转成按钮：**上 12、下 13、左 14、右 15**（2026-10-25 人在 gamepadtester.cn 上实按核出）。
- 四根轴恒为 0。
- **刚 navigate/reload 后 `getGamepads()` 是空的，直到页面发生真实交互**；且实测仅屏幕触摸（user activation）不够，还需手柄本身有一次实体按键。空列表 ≠ 手柄不存在，不要据此下结论。
- adb root 不可用；shell 写不了 event5（`sendevent` Permission denied）。
- 要让 agent 驱动已部署的 PWA，用 §7 的 `loomrealm:debug-input`。不要把 `getGamepads()` 为空理解成调试输入也不可用。

## 7. 调试输入（`loomrealm:debug-input`）

实体手柄仍受 §6 限制。agent 要推动已部署 PWA 里的地图或对话时，向**当前活动**的 `<game-controls-input>` 直接派发调试事件。这是 Controls 的 held 快照，不是 Chrome Gamepad 事件，也不能用来证明 AYANEO 实体键或 #111。

前置：页面 `document.documentElement.dataset.loomrealmProduct === "ready"`，且恰好有一个未禁用的控件：

```js
document.querySelectorAll("game-controls-input:not([data-input-disabled])").length === 1
```

`data-input-disabled="duplicate"` 的副本没有监听器。若已安装的 `controls/device-input.browser.js` 里没有字符串 `loomrealm:debug-input`，说明掌机还在旧游戏包上。先用 CDP 对 `https://lithd.ltd/pwa/pokeman/` 做 `Page.reload` 且 `ignoreCache: true`，让新的 `pokeman-bundle.json` 装进去。这次改动在游戏包里，Service Worker 外壳代际可以不变。

事件必须 **direct-dispatch** 到那个元素。下面任一不满足都会被静默忽略，角色不动：

- 类型是 `CustomEvent`，且 `event.target` 就是该元素（不要派到 `window` / `document` / 父节点）
- `bubbles`、`composed`、`cancelable` 都是 `false`
- `detail` 是普通对象，自有键恰好是 `version` 和 `down`
- `version === 1`
- `down` 是按钮名数组，无重复，最多 14 个

按钮名：`up` `down` `left` `right` `south` `east` `west` `north` `leftBumper` `rightBumper` `leftTrigger` `rightTrigger` `start` `select`。

这是**当前按住的完整快照**，不是一次点按。`down: ["left"]` 会一直按住左，直到下一次事件改掉它。动作完成后必须再送 `down: []`，否则角色会连续走格。相同快照重复发送不会再产生边沿。CDP 里合成的 `KeyboardEvent` 不是 `isTrusted`，游戏会丢掉；不要改用 `keyevent`。

把下面的表达式存成 js 文件，再用 `cdp_eval.py <pageId> <exprfile>` 跑。把 `BUTTON` 换成要按住的按钮名。

```js
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const button = "BUTTON";
  const elements = [...document.querySelectorAll("game-controls-input:not([data-input-disabled])")];
  if (document.documentElement.dataset.loomrealmProduct !== "ready") throw new Error("PWA not ready");
  if (elements.length !== 1) throw new Error(`expected one active game-controls-input, got ${elements.length}`);
  const snapshot = () => {
    const data = document.querySelector("lr-map-sprite")?._latestData ?? null;
    const mapView = document.querySelector("lr-map-view");
    return {
      mapId: mapView?._acceptedVisualScene?.view?.mapId ?? mapView?._latestData?.mapId ?? null,
      x: data ? data.x : null,
      y: data ? data.y : null,
      direction: data ? data.direction : null,
      motion: data ? data.motion : null,
    };
  };
  const send = (down) => elements[0].dispatchEvent(new CustomEvent("loomrealm:debug-input", {
    detail: { version: 1, down },
    bubbles: false,
    composed: false,
    cancelable: false,
  }));
  const before = snapshot();
  send([button]);
  const deadline = Date.now() + 2500;
  let during = snapshot();
  while (Date.now() < deadline) {
    during = snapshot();
    if (during.motion !== null || during.x !== before.x || during.y !== before.y || during.mapId !== before.mapId) break;
    await sleep(16);
  }
  send([]);
  const releaseDeadline = Date.now() + 3000;
  let after = snapshot();
  while (Date.now() < releaseDeadline) {
    after = snapshot();
    if (after.motion === null) break;
    await sleep(16);
  }
  return { before, during, after, failure: window.__loomrealmPwa?.failure ?? null };
})()
```

方向按钮推动地图角色；`south` 走确认/交互。生效与否看返回的坐标、朝向或 `motion`，没有单独的 ACK。2026-10-31 在已部署的 #140 PWA 上核实：冒泡的 `down` 不移动角色；direct `left` 使地图 2 上的角色从 `(8, 8)` 走到 `(7, 8)` 后停住。

## 8. 禁止事项

- 不要把手柄输入伪造进实测：`input keyevent KEYCODE_DPAD_*` 不能代替实体按键；不要新建虚拟 uhid 设备。agent 驱动 PWA 只用 §7，且不能把 §7 的结果写成实体手柄或 #111 已通过。
- 不要回装出厂 Chrome 110；Play 商店不会给这台 Android Go 设备提供 Chrome 更新。
- 未经明确要求：不改本仓库代码、不提交、不动 issue（尤其 #100、#111）。
- 访问 GitHub 需代理 `http://127.0.0.1:17890`；本机无 `gh`。**不要打印 git credential / token。**

## 9. PowerShell 陷阱

- 不要写内联 `python -c "..."`——PowerShell 会吃掉 `$?`、引号和正则。**一律存成文件再运行**（上文 `cdp_eval.py <pageId> <exprfile>` 的用法就是为此设计）。
- 变量拼端口必须写 `"${lan}:5555"`：`$lan:5555` 会被 PowerShell 当作驱动器/作用域限定符解析，结果为空或报错。
- adb shell 里带管道/grep 的命令整体加引号，让管道在设备端执行：

```powershell
& $adb -s <addr> shell "grep -i devtools /proc/net/unix"
```

## 10. 验收清单（新 agent 照做）

1. 按 §3.1 流程连接：ZeroTier 探路 → 内网优先 → 单通道收尾（ZeroTier 不通则走 §3.2 mDNS）
2. `adb connect` → `devices -l` 确认 `product:Pocket_Block`
3. getprop 三连（§4）
4. `forward` → `http://127.0.0.1:9222/json` 拿到页面列表
5. `cdp_eval.py` 在 PWA 页面求值 `navigator.userAgent`，应含 `Chrome/155`
6. （可选）`getGamepads()` 为空属正常，解释见 §6；要出 AYANEO Controller 需人手按一次实体键
7. （需要驱动 PWA 时）按 §7 direct-dispatch `loomrealm:debug-input`，松开时送 `down: []`；角色位置或对话发生变化，且 `failure` 仍为 `null`

## 附录 A：getGamepads 求值脚本示例（gp_check.js）

```js
JSON.stringify({
  ua: navigator.userAgent,
  pads: Array.from(navigator.getGamepads()).map(p => p ? {
    index: p.index,
    id: p.id,
    mapping: p.mapping,
    connected: p.connected,
    axesCount: p.axes.length,
    buttonsCount: p.buttons.length,
    axes: p.axes.map(a => Math.round(a * 1000) / 1000),
    pressed: p.buttons.map((b, i) => b.pressed || b.value > 0.5 ? i : -1).filter(i => i >= 0)
  } : null),
  raw: navigator.getGamepads().length
}, null, 2)
```

## 附录 B：cdp_eval.py 源码备份

标准库实现的 CDP WebSocket 客户端，用法 `python cdp_eval.py <pageId> <exprfile>`：

```python
import base64
import json
import os
import socket
import struct
import sys

HOST = "127.0.0.1"
PORT = 9222


def handshake(path):
    sock = socket.create_connection((HOST, PORT), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {HOST}:{PORT}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(request.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit("websocket handshake closed")
        data += chunk
    if b" 101 " not in data.split(b"\r\n", 1)[0]:
        raise SystemExit(data[:300].decode("utf-8", "replace"))
    return sock


def send_text(sock, text):
    payload = text.encode()
    mask = os.urandom(4)
    header = bytearray([0x81])
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    header.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def recv_text(sock):
    def read_exact(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise SystemExit("socket closed")
            buf += chunk
        return buf

    while True:
        first, second = read_exact(2)
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", read_exact(2))[0]
        if second & 0x80:
            mask = read_exact(4)
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(read_exact(length)))
        else:
            payload = read_exact(length)
        if opcode == 0x1:
            return payload.decode()
        if opcode == 0x8:
            raise SystemExit("websocket closed")
        if opcode == 0x9:
            # ping
            continue


def call(sock, method, params, call_id):
    send_text(sock, json.dumps({"id": call_id, "method": method, "params": params}))
    while True:
        message = json.loads(recv_text(sock))
        if message.get("id") == call_id:
            return message


if __name__ == "__main__":
    page_id = sys.argv[1]
    expression = open(sys.argv[2], encoding="utf-8").read()
    sock = handshake(f"/devtools/page/{page_id}")
    result = call(sock, "Runtime.evaluate", {
        "expression": expression,
        "returnByValue": True,
        "awaitPromise": True,
    }, 1)
    print(json.dumps(result.get("result", result), ensure_ascii=False, indent=2)[:8000])
    sock.close()
```
