// 可选：对接真实 dafeiyu-server（:8787，需自配 DEEPSEEK_API_KEY，产生少量 token 费用）
// 前提：npm run serve（:4322）+ 在别处跑着 dafeiyu-server
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

await page.goto('http://localhost:4322/playground/?server=http://localhost:8787', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })

const probe = await page.evaluate(async () => {
  const r = await fetch('http://localhost:8787/whisper')
  return await r.json()
})
check('跨域 whisper 返回真模型台词', probe.source === 'deepseek', probe.line)

const rect = await page.evaluate(() => {
  const r = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.dblclick(rect.x, rect.y)
await page.waitForTimeout(400)
await page.evaluate(() => {
  const input = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-chat-input input')
  input.value = '一句话介绍你自己'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
let reply = ''
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500)
  const msgs = await page.evaluate(() => {
    const host = document.querySelector('[data-dafeiyu]')
    const input = host.shadowRoot.querySelector('.dfy-chat-input input')
    const bot = [...host.shadowRoot.querySelectorAll('.dfy-msg-bot')].at(-1)
    return { done: !input.disabled, text: bot?.textContent || '', cls: bot?.className || '' }
  })
  if (msgs.done && msgs.text) { reply = msgs.text; break }
  if (msgs.cls.includes('err') && msgs.text) { reply = 'ERR:' + msgs.text; break }
}
check('真 DeepSeek 流式回复完成', reply.length > 2 && !reply.startsWith('ERR:'), reply.slice(0, 50))
check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
