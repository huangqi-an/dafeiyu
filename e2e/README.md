# e2e —— dafeiyu 回归测试（Playwright + 本机 Chrome）

真实浏览器里跑包的全部行为：待机/点击/拖拽抛掷/聊天/右键菜单/摸头/喂食/好感度。

## 前提

- `npm install`（playwright-core 是 devDependency）
- 本机有 Chrome/Chromium（默认找 `/usr/bin/google-chrome`，没有就改测试里的 `executablePath`）
- 先构建并起 playground：`npm run build && npm run serve`（:4322）

## 运行

```bash
node e2e/mock-server.mjs &      # mock 后端（:4323，聊天/碎碎念用）
node e2e/interaction-test.mjs   # 互动：菜单/喂食/摸头/好感度/睡眠/回原位
node e2e/chat-test.mjs          # 聊天：面板/流式/错误/历史（依赖 mock）
node e2e/real-server-test.mjs   # 可选：对接真 dafeiyu-server（:8787 需自配 key）
```

`real-server-test.mjs` 需要先在别处跑一个 [dafeiyu-server](https://github.com/huangqi-an/dafeiyu-server)
并配置真实 `DEEPSEEK_API_KEY`（会产生几分钱 token 费用），不跑不影响前两个。

## 约定

- 测试通过 console 输出 `✓/✗`，任一失败退出码非 0
- 每个测试开全新的浏览器上下文并清空 localStorage（好感度/历史从零开始）
