// 聊天 e2e：远程碎碎念 / 双击面板 / 流式 / 错误分支 / 历史持久化
// 前提：npm run serve（:4322）+ node e2e/mock-server.mjs（:4323）
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const check = (n, ok, d = '') => console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`) || (!ok && (process.exitCode = 1))

const getState = () => {
  const host = document.querySelector('[data-dafeiyu]')
  const video = host.shadowRoot.querySelector('video')
  const bubble = host.shadowRoot.querySelector('.dfy-bubble')
  return {
    src: video.currentSrc,
    bubbleText: bubble.textContent,
    bubbleOn: bubble.style.opacity === '1',
    panelOpen: host.shadowRoot.querySelector('.dfy-chat').classList.contains('dfy-open'),
    panelVisible: host.shadowRoot.querySelector('.dfy-chat').style.display !== 'none',
    msgs: [...host.shadowRoot.querySelectorAll('.dfy-msg')].map((m) => ({ cls: m.className, text: m.textContent })),
    inputDisabled: host.shadowRoot.querySelector('.dfy-chat-input input').disabled
  }
}
const sendMsg = (text) => page.evaluate((t) => {
  const input = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-chat-input input')
  input.value = t
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}, text)

await page.goto('http://localhost:4322/playground/?mock=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })
await page.mouse.click(400, 150) // 碎碎念要首次交互后才开张
await page.waitForFunction(() => {
  const b = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('.dfy-bubble')
  return b?.style.opacity === '1' && b?.textContent?.includes('mock 碎碎念')
}, undefined, { timeout: 25000 })
let st = await page.evaluate(getState)
check('远程碎碎念（mock 后端）', st.bubbleOn && st.bubbleText.includes('mock'), st.bubbleText)
check('碎碎念播口型动画', /talk-screen\.webm/.test(st.src), st.src.split('/').pop())

const rect = await page.evaluate(() => {
  const r = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.dblclick(rect.x, rect.y)
await page.waitForTimeout(400)
st = await page.evaluate(getState)
check('双击打开聊天面板', st.panelOpen && st.panelVisible)

await sendMsg('你好大肥鱼')
await page.waitForTimeout(300)
st = await page.evaluate(getState)
check('发送后输入禁用', st.inputDisabled === true)
check('等待首字播思考动画', /talk-thinking\.webm/.test(st.src), st.src.split('/').pop())
await page.waitForFunction(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const input = host.shadowRoot.querySelector('.dfy-chat-input input')
  const msgs = [...host.shadowRoot.querySelectorAll('.dfy-msg')]
  return !input.disabled && msgs.some((m) => m.textContent.includes('一个字一个字回答'))
}, undefined, { timeout: 15000 })
st = await page.evaluate(getState)
check('用户消息上屏', st.msgs.some((m) => m.cls.includes('user') && m.text === '你好大肥鱼'))
check('流式回复完成', st.msgs.some((m) => m.cls.includes('bot') && m.text.includes('我是 mock 大肥鱼')) && st.inputDisabled === false)

await page.waitForFunction(() => !document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-chat-input input').disabled, undefined, { timeout: 5000 })
await sendMsg('err')
await page.waitForFunction(() => {
  const msgs = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelectorAll('.dfy-msg')
  return msgs && [...msgs].some((m) => m.textContent.includes('mock 后端故意报错'))
}, undefined, { timeout: 10000 })
st = await page.evaluate(getState)
check('错误事件转为提示', st.msgs.some((m) => m.cls.includes('err') && m.text.includes('故意报错')))
check('出错后输入恢复', st.inputDisabled === false)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })
await page.evaluate(() => window.__dfy.openChat())
await page.waitForTimeout(300)
await sendMsg('还记得我刚才说什么吗')
await page.waitForFunction(() => {
  const msgs = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelectorAll('.dfy-msg')
  return msgs && [...msgs].some((m) => m.textContent.includes('收到 3 条消息'))
}, undefined, { timeout: 15000 })
check('刷新后历史进上下文', true, 'mock 确认收到 3 条消息')

check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
