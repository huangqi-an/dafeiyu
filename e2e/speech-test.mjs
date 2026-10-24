// 语音 e2e：朗读触发（碎碎念/聊天/强制说话）、菜单开关、降级不报错
// 前提：npm run build && npm run serve（:4322）+ node e2e/mock-server.mjs（:4323）
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
// stub speechSynthesis：无头环境没有语音引擎，记录 speak 调用即可验证链路
await ctx.addInitScript(() => {
  // speechSynthesis 是 Window 的 [SameObject] 只读属性，对象本身换不掉；
  // 但方法在原型上，可以打补丁记录调用
  window.__spoken = []
  // 只补 speak：getVoices 若返回普通对象，赋给 utterance.voice 会因 WebIDL
  // 类型检查抛错（真浏览器返回的是 SpeechSynthesisVoice 实例，无此问题）
  const proto = Object.getPrototypeOf(window.speechSynthesis)
  proto.speak = function (u) { window.__spoken.push(u.text) }
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const check = (n, ok, d = '') => console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`) || (!ok && (process.exitCode = 1))

await page.goto('http://localhost:4322/playground/?mock=1&voice=1', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })

// 1. 强制说话 → 立即朗读
await page.evaluate(() => window.__dfy.say('语音测试第一句'))
await page.waitForTimeout(300)
let spoken = await page.evaluate(() => window.__spoken)
check('说话触发朗读', spoken.includes('语音测试第一句'), JSON.stringify(spoken))

// 2. 菜单显示语音开，切换后不再朗读，再切回恢复
const center = async () => page.evaluate(() => {
  const b = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})
let c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(250)
let st = await page.evaluate(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const btn = [...host.shadowRoot.querySelectorAll('.dfy-menu button')].find((b) => b.textContent.includes('语音'))
  return { label: btn?.textContent || '' }
})
check('菜单显示语音状态（开）', st.label.includes('语音：开'), st.label)
await page.evaluate(() => {
  const btn = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-menu button')]
    .find((b) => b.textContent.includes('语音'))
  btn.click()
})
await page.waitForTimeout(200)
await page.evaluate(() => window.__dfy.say('关掉后这句不该读'))
await page.waitForTimeout(300)
spoken = await page.evaluate(() => window.__spoken)
check('关闭后不再朗读', !spoken.includes('关掉后这句不该读'))
// 重新打开（实例 API）
await page.evaluate(() => window.__dfy.setVoice(true))
await page.evaluate(() => window.__dfy.say('恢复朗读第二句'))
await page.waitForTimeout(300)
spoken = await page.evaluate(() => window.__spoken)
check('重新开启恢复朗读', spoken.includes('恢复朗读第二句'))

// 3. 开关状态持久化：刷新后 setVoice 的偏好仍在
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })
await page.evaluate(() => window.__dfy.say('刷新后依然要读'))
await page.waitForTimeout(300)
spoken = await page.evaluate(() => window.__spoken)
check('开关偏好跨刷新保留', spoken.includes('刷新后依然要读'))

// 4. 聊天完成 → 整段朗读（mock 回复）
const rect = await page.evaluate(() => {
  const r = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.dblclick(rect.x, rect.y)
await page.waitForTimeout(400)
await page.evaluate(() => {
  const input = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-chat-input input')
  input.value = '念一下你的回复'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
await page.waitForFunction(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const input = host.shadowRoot.querySelector('.dfy-chat-input input')
  const msgs = [...host.shadowRoot.querySelectorAll('.dfy-msg')]
  return !input.disabled && msgs.some((m) => m.textContent.includes('一个字一个字回答'))
}, undefined, { timeout: 15000 })
await page.waitForTimeout(200)
spoken = await page.evaluate(() => window.__spoken)
check('聊天完成整段朗读', spoken.some((t) => t.includes('mock 大肥鱼')), JSON.stringify(spoken.at(-1)?.slice(0, 30)))

check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
