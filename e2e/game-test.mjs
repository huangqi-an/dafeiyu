// 五子棋 e2e：菜单开局 / 落子与 AI 应对 / 对局循环动画 / 互斥与关闭
// 前提：npm run build && npm run serve（:4322）。纯本地功能，不需要 mock。
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

await page.goto('http://localhost:4322/playground/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const v = document.querySelector('[data-dafeiyu]')?.shadowRoot?.querySelector('video')
  return !!v && v.readyState >= 2
}, undefined, { timeout: 15000 })

const center = async () => page.evaluate(() => {
  const b = document.querySelector('[data-dafeiyu]').getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})

// 1. 菜单开局
let c = await center()
await page.mouse.click(c.x, c.y, { button: 'right' })
await page.waitForTimeout(250)
await page.evaluate(() => {
  const btn = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-menu button')]
    .find((b) => b.textContent.includes('五子棋'))
  btn.click()
})
await page.waitForTimeout(400)
let st = await page.evaluate(() => {
  const host = document.querySelector('[data-dafeiyu]')
  const panel = host.shadowRoot.querySelector('.dfy-game')
  return {
    open: panel?.classList.contains('dfy-open'),
    hasCanvas: !!panel?.querySelector('canvas'),
    status: panel?.querySelector('.dfy-game-status')?.textContent,
    moves: panel?.dataset.moves,
    src: host.shadowRoot.querySelector('video').currentSrc
  }
})
check('菜单打开棋局面板', st.open && st.hasCanvas)
check('初始状态轮到访客', st.status?.includes('轮到你'), st.status)
check('对局循环动画', /play-gomoku/.test(st.src), st.src.split('/').pop())

// 2. 落子 → AI 应对（黑先，AI 600~1100ms 后回）
const cellXY = (gx, gy) => page.evaluate(([x, y]) => {
  const canvas = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game canvas')
  const r = canvas.getBoundingClientRect()
  const scale = canvas.width / r.width
  return { cx: r.left + (11 + x * 22) / scale, cy: r.top + (11 + y * 22) / scale }
}, [gx, gy])
let p = await cellXY(7, 7)
await page.mouse.click(p.cx, p.cy)
await page.waitForTimeout(400)
st = await page.evaluate(() => {
  const panel = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game')
  return { status: panel.querySelector('.dfy-game-status').textContent, moves: panel.dataset.moves }
})
check('落子后轮到鱼（思考中）', st.status.includes('思考中'), st.status)
check('棋盘有 1 子', st.moves === '1', st.moves)
await page.waitForFunction(() => {
  const panel = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game')
  return panel.dataset.moves === '2'
}, undefined, { timeout: 5000 })
st = await page.evaluate(() => {
  const panel = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game')
  return { status: panel.querySelector('.dfy-game-status').textContent, moves: panel.dataset.moves }
})
check('AI 应对后回到访客', st.status.includes('轮到你') && st.moves === '2', `${st.status} / ${st.moves}`)

// 3. 再下两子验证连续对局
p = await cellXY(8, 7)
await page.mouse.click(p.cx, p.cy)
await page.waitForFunction(() => {
  const panel = document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game')
  return panel.dataset.moves === '4'
}, undefined, { timeout: 5000 })
check('连续落子应对正常', true)

// 4. 重开
await page.evaluate(() => {
  const btn = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-game-head button')]
    .find((b) => b.textContent.includes('重开'))
  btn.click()
})
await page.waitForTimeout(200)
st = await page.evaluate(() => document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game').dataset.moves)
check('重开清盘', st === '0', st)

// 5. 关闭 → 回到待机调度；再右键能重开（开关语义）
await page.evaluate(() => {
  const btn = [...document.querySelector('[data-dafeiyu]').shadowRoot.querySelectorAll('.dfy-game-head button')]
    .find((b) => b.textContent === '×')
  btn.click()
})
await page.waitForTimeout(400)
st = await page.evaluate(() => ({
  open: document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('.dfy-game').classList.contains('dfy-open'),
  src: document.querySelector('[data-dafeiyu]').shadowRoot.querySelector('video').currentSrc
}))
check('关闭后回到动画调度', !st.open && !/play-gomoku/.test(st.src), st.src.split('/').pop())

check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '))
await page.screenshot({ path: '/tmp/game-e2e.png' })
await browser.close()
