# dafeiyu

一行代码给网站加一只「大肥鱼」网页宠物：右下角常驻、会走动、会说话、
能点击互动、能拎起来抛出去。零依赖，Shadow DOM 隔离样式。
动画素材来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT），致谢见
[`THIRD-PARTY-NOTICE.md`](./THIRD-PARTY-NOTICE.md)。

## 使用

### npm（发布后可用）

```ts
import { mount } from 'dafeiyu'

mount({ assetBase: 'https://your-host/pet-assets/' })
```

### CDN / 构建产物（一行接入）

```html
<script src="https://cdn.jsdelivr.net/npm/dafeiyu/dist/dafeiyu.iife.js"></script>
<script>
  Dafeiyu.mount({ assetBase: 'https://cdn.jsdelivr.net/npm/dafeiyu/assets/' })
</script>
```

零配置也能跑（内置台词池）；`assetBase` 指向你自托管的一份素材即可换皮。

## 配置项

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `assetBase` | `string` | jsDelivr（发布后生效） | 素材目录 URL，末尾带 `/` |
| `size` | `number` | `160` | 宠物显示宽度（px） |
| `position` | `string \| {x,y}` | `'bottom-right'` | 初始位置：角落名或归一化坐标 |
| `zIndex` | `number` | `9999` | 容器 z-index |
| `lines` | `string[]` | `[]` | 追加台词（内置池之外） |
| `whisperIntervalSec` | `number` | `120` | 自动说话间隔（秒，±30% 抖动） |
| `enabledOnMobile` | `boolean` | `false` | 视口 <768px 时是否显示 |
| `endpoints` | `{whisper?,chat?}` | 空 | AI 后端地址；配了才有碎碎念拉取与双击聊天，推荐搭配 [dafeiyu-server](https://github.com/huangqi-an/dafeiyu-server) 自建 |

## 行为一览

- 待机池随机循环（呼吸/哼歌/张望/打哈欠，深夜哈欠加权），2% 概率触发「蓝鲸现世」彩蛋
- 无操作 5 分钟睡着（点击惊醒）；连点 5 次会生气
- 可拖拽，松手带惯性抛掷 + 重力 + 边界反弹
- 定时冒泡说一句（内置约 24 句，可追加；配 `endpoints` 后由 [dafeiyu-server](https://github.com/huangqi-an/dafeiyu-server) 这类后端生成 AI 台词，失败自动降级本地池）
- 双击宠物打开聊天面板（需配 `endpoints.chat`），SSE 流式回复，历史 5 轮存 localStorage
- `prefers-reduced-motion` 时静止不自动播放动画；页面不可见时暂停一切
- Safari（macOS WebKit）自动切换 HEVC-alpha 的 `.mov` 素材（需素材目录含同名 mov）

## 开发

```bash
npm install            # 或走镜像：--registry=https://registry.npmmirror.com
npm run build          # 产出 dist/（ESM + IIFE + d.ts）
npm run serve          # 起本地静态服务，打开 http://localhost:4322/playground/
```

素材下载：`scripts/fetch-assets.sh`（从 dsh-pet 仓库拉取并重命名，可重复执行）。
同步到个人站：`scripts/sync-to-site.sh`。

## 已知限制

- iOS 上所有浏览器均为 WebKit 内核且不支持 VP9-alpha，移动端默认隐藏；
  开启 `enabledOnMobile` 前需自行验证
- 素材视频无 CC 字幕，纯视觉装饰，无障碍用户请配 `prefers-reduced-motion` 降级（已内置）

## License

MIT（本项目代码）。动画素材的第三方来源与许可见 `THIRD-PARTY-NOTICE.md`。
