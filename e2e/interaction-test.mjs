// 互动 e2e：右键菜单 / 喂食 / 长按摸头 / 好感度 / 睡眠开关 / 回原位
// 前提：npm run build && npm run serve（playground 在 :4322）
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(() => localStorage.clear()) // 好感度从零开始
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const check = (n, ok, d = '') => console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`) || (!ok && (process.exitCode = 1))

const getState = () => {
  const host = document.querySelector('[data-dafeiyu]')
  const video = host.shadowRoot.querySelector('video')
  return {
    src: video.currentSrc,
    menuOpen: host.shadowRoot.querySelector('.dfy-menu').classList.contains('dfy-open'),
    menuHead: host.shadowRoot.querySelector('.dfy-menu-head').textContent,
    menuBtns: [...host.shadowRoot.querySelectorAll('.dfy-menu button')]
      .filter((b) => b.style.display !== 'none')
      .map((b) => b.textContent),
    transform: host.style.transform,
    affinity: Number(localStorage.getItem('dafeiyu:affinity') || 0)
  }
}

await page.goto('http://localhost:4322/playground/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })

const center = async () => page.evaluate(() => {
  const b = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})
const clickMenu = (label) => page.evaluate((l) => {
  const btn = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-menu button')]
    .find((b) => b.textContent.includes(l))
  if (btn) btn.click()
  return !!btn
}, label)
const backToIdle = (timeout = 20000) => page.waitForFunction(
  () => /idle|sleep/.test(document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('video').currentSrc),
  undefined, { timeout }
)

// 1. 右键菜单（再右键一次应关闭——开关语义）
let c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(300)
let st = await page.evaluate(getState)
check('右键打开菜单', st.menuOpen)
check('菜单头部显示好感', st.menuHead.includes('好感 0') && st.menuHead.includes('陌生'), st.menuHead)
check('菜单项齐全（无聊天端点时隐藏聊天）', st.menuBtns.some((b) => b.includes('喂食')) &&
  st.menuBtns.some((b) => b.includes('睡觉')) && st.menuBtns.some((b) => b.includes('回原位')) &&
  !st.menuBtns.some((b) => b.includes('聊天')))
c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(200)
st = await page.evaluate(getState)
check('再次右键关闭菜单', !st.menuOpen)
c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(200)
st = await page.evaluate(getState)
check('第三次右键重新打开', st.menuOpen)

// 2. 喂食 → 吃相动画 + 好感 +2
await clickMenu('喂食')
await page.waitForTimeout(600)
st = await page.evaluate(getState)
check('喂食播吃相动画', /eat-/.test(st.src), st.src.split('/').pop())
check('喂食后菜单关闭', !st.menuOpen)
check('好感 +2', st.affinity === 2, String(st.affinity))
await backToIdle()

// 3. 长按摸头 → pet-scratch + 好感 +1，且松手不触发点击
c = await center()
await page.mouse.move(c.x, c.y)
await page.mouse.down()
await page.waitForTimeout(1100)
st = await page.evaluate(getState)
check('长按播挠痒动画', /pet-scratch/.test(st.src), st.src.split('/').pop())
await page.mouse.up()
await page.waitForTimeout(400)
st = await page.evaluate(getState)
check('好感累计 3', st.affinity === 3, String(st.affinity))
check('摸头后的松手不算点击', /pet-scratch|idle/.test(st.src), st.src.split('/').pop())

// 4. 睡觉/叫醒
c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(250)
await clickMenu('睡觉')
await page.waitForTimeout(500)
st = await page.evaluate(getState)
check('菜单睡觉生效', /sleep-snooze/.test(st.src), st.src.split('/').pop())
c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(250)
const woke = await clickMenu('叫醒')
check('睡着后菜单变叫醒并可用', woke)
await page.waitForTimeout(600)
st = await page.evaluate(getState)
check('叫醒播惊醒动画', /wake-startled/.test(st.src), st.src.split('/').pop())
await backToIdle()

// 5. 拖走再回原位
c = await center()
await page.mouse.move(c.x, c.y)
await page.mouse.down()
for (let i = 1; i <= 6; i++) { await page.mouse.move(c.x - i * 80, c.y - i * 20, { steps: 2 }); await page.waitForTimeout(16) }
await page.mouse.up()
await page.waitForTimeout(1200)
const before = (await page.evaluate(getState)).transform
c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(250)
await clickMenu('回原位')
await page.waitForTimeout(300)
st = await page.evaluate(getState)
const rect = await page.evaluate(() => document.querySelector('[data-dafeiyu]').getBoundingClientRect())
check('回原位（右下角）', st.transform !== before && rect.x > 900 && rect.y > 500, st.transform)

check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
