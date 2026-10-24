// 表情包配图 e2e：whisper 气泡带图 / 聊天回复带图 / name 选项
// 前提：npm run build && npm run serve（:4322）+ node e2e/mock-server.mjs（:4323）
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

await page.goto('http://localhost:4322/playground/?mock=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })

// 1. 远程碎碎念带配图（mock 返回 image: 'cute'）
await page.mouse.click(400, 150)
await page.waitForFunction(() => {
  const b = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('.dfy-bubble')
  return b?.style.opacity === '1' && b?.textContent?.includes('mock 碎碎念')
}, undefined, { timeout: 25000 })
const whis = await page.evaluate(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const bubble = host.shadowRoot.querySelector('.dfy-bubble')
  const img = bubble.querySelector('img')
  return { text: bubble.textContent, imgSrc: img?.getAttribute('src') || '', imgLoaded: img?.complete && img?.naturalWidth > 0 }
})
check('碎碎念气泡有表情包', !!whis.imgSrc && whis.imgSrc.includes('memes/cute.png'), whis.imgSrc)
check('表情包图片加载成功', whis.imgLoaded)

// 2. 聊天回复带配图（mock 首事件 {"i":"cute"}）
const rect = await page.evaluate(() => {
  const r = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.dblclick(rect.x, rect.y)
await page.waitForTimeout(400)
await page.evaluate(() => {
  const input = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-chat-input input')
  input.value = '你好'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
await page.waitForFunction(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const input = host.shadowRoot.querySelector('.dfy-chat-input input')
  const msgs = [...host.shadowRoot.querySelectorAll('.dfy-msg')]
  return !input.disabled && msgs.some((m) => m.textContent.includes('一个字一个字回答'))
}, undefined, { timeout: 15000 })
const chat = await page.evaluate(() => {
  const bot = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-msg-bot')].at(-1)
  const img = bot.querySelector('img')
  return { imgSrc: img?.getAttribute('src') || '', imgLoaded: img?.complete && img?.naturalWidth > 0 }
})
check('聊天回复带表情包', chat.imgSrc.includes('memes/cute.png'), chat.imgSrc)
check('聊天表情包加载成功', chat.imgLoaded)

// 3. 图片缺失时优雅降级：把 src 指向不存在的键，img 应自动移除
const degraded = await page.evaluate(async () => {
  const host = document.querySelector('[data-dafeiyu]')
  const bubble = host.shadowRoot.querySelector('.dfy-bubble')
  const img = bubble.querySelector('img')
  if (!img) return 'no-img'
  img.src = '/assets/memes/not-exist.png'
  await new Promise((r) => setTimeout(r, 800))
  return bubble.querySelector('img') ? 'still-there' : 'removed'
})
check('素材缺失时图片自动隐藏', degraded === 'removed', degraded)

check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await page.screenshot({ path: '/tmp/meme-e2e.png' })
await browser.close()
