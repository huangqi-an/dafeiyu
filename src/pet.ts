import { AnimName, CLICK_POOL, FEED_POOL, IDLE_POOL, LOOPING, isAnimName } from './anims'
import { BUILTIN_LINES, DEFAULTS } from './config'
import type { DafeiyuOptions, PetEndpoints } from './config'
import { addAffinity, FRIEND_LINES, levelOf, loadAffinity } from './affinity'
import { Bubble } from './bubble'
import { ChatPanel, streamChat } from './chat'
import type { ChatMessage } from './chat'
import { PetMenu } from './menu'
import { attachDrag, startFlight } from './physics'
import { Player } from './player'
import { Speech } from './speech'

const MOBILE_QUERY = '(max-width: 767px)'
const POS_KEY = 'dafeiyu:pos'
const MARGIN = 16
/** 循环动画（呼吸/睡觉/说话）每次停留的时长区间 */
const IDLE_STAY_MS: [number, number] = [8000, 15000]
const SLEEP_AFTER_MS = 5 * 60 * 1000
const ACTIVITY_CHECK_MS = 10 * 1000
/** 停留 30s 或发生任意交互后，碎碎念才开张（防弹跳流量空烧） */
const START_DELAY_MS = 30 * 1000
const COMBO_WINDOW_MS = 3000
const COMBO_ANGRY = 5
const THROW_SPEED = 0.5 // px/ms，低于此按「放下」处理
const RARE_CHANCE = 0.02
const RARE_CHANCE_FRIEND = 0.05 // 好感 ≥100（老朋友）后的彩蛋概率
const WANDER_CHANCE = 0.08
const BUBBLE_MS = 10000
const LONG_PRESS_MS = 800 // 按住不动这么久 = 摸头
const CHAT_HISTORY_KEY = 'dafeiyu:chat-history'
const CHAT_MAX_ITEMS = 10 // 5 轮问答，随请求发给后端
/** 素材画幅 16:9（640x360），视口裁剪按此估算；首帧后用实测值替换 */
const ASPECT_H = 9 / 16

type State = 'idle' | 'sleep' | 'talk' | 'drag' | 'fly' | 'wander' | 'react'

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function trimHistory(list: ChatMessage[]): ChatMessage[] {
  return list.slice(-CHAT_MAX_ITEMS).map((m) => ({ role: m.role, content: m.content.slice(0, 500) }))
}

export class Pet {
  /** 单例：重复 mount 时先销毁上一个 */
  static current: Pet | undefined

  private opts: Required<Pick<DafeiyuOptions, 'assetBase' | 'size' | 'zIndex' | 'whisperIntervalSec' | 'enabledOnMobile' | 'pageContext' | 'voice'>> &
    DafeiyuOptions
  private extraLines: string[]
  private endpoints: PetEndpoints | undefined

  private host!: HTMLDivElement
  private shadow!: ShadowRoot
  private video!: HTMLVideoElement
  private player!: Player
  private bubble!: Bubble
  private speech!: Speech

  private x = 0
  private y = 0
  private h = 0
  private state: State = 'idle'
  private stateToken = 0
  private lastIdle: AnimName | null = null
  private lastLine = ''
  private timers = new Set<number>()
  private wanderRaf = 0
  private flightCancel: (() => void) | null = null
  private detachDrag: (() => void) | null = null

  private lastActivity = Date.now()
  private started = false
  private combo = 0
  private comboAt = 0
  private reduced: boolean
  private dead = false

  private chatPanel: ChatPanel | null = null
  private chatOpen = false
  private chatHistory: ChatMessage[] = []
  private chatAbort: AbortController | null = null
  private menu: PetMenu | null = null
  private longPressTimer = 0
  private justPetted = false

  private onActivity = (): void => {
    this.lastActivity = Date.now()
    this.started = true
  }
  private onVisibility = (): void => {
    if (document.hidden) this.suspend()
    else this.resume()
  }
  private onResize = (): void => {
    this.clampIntoViewport()
    this.applyTransform()
  }

  constructor(options: DafeiyuOptions = {}) {
    Pet.current?.destroy()
    Pet.current = this

    this.opts = { ...DEFAULTS, ...options }
    this.extraLines = options.lines ?? []
    this.endpoints = options.endpoints
    this.reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    // 移动端默认不挂载：视频宠物在手机上又挡内容又费电
    if (!this.opts.enabledOnMobile && matchMedia(MOBILE_QUERY).matches) {
      this.dead = true
      return
    }

    this.buildDom()
    this.restorePosition()

    this.player = new Player(this.video, this.opts.assetBase)
    this.bubble = new Bubble(this.shadow)
    this.speech = new Speech(this.opts.voice)
    this.detachDrag = attachDrag(this.video, {
      onGrab: (px, py) => {
        this.grabOffX = px - this.x
        this.grabOffY = py - this.y
      },
      onDragMove: (px, py) => this.handleDragMove(px, py),
      onRelease: (vx, vy) => this.handleRelease(vx, vy),
      onClick: () => this.handleClick()
    })

    // 聊天是可选能力：配置了 endpoints.chat 才有面板和双击入口
    if (this.endpoints?.chat) {
      this.chatPanel = new ChatPanel(this.shadow, {
        title: this.petName,
        onSend: (text) => this.sendChat(text),
        onClose: () => this.closeChat()
      })
      this.chatHistory = this.loadHistory()
      this.video.addEventListener('dblclick', () =>
        this.chatOpen ? this.closeChat() : this.openChat()
      )
    }

    // 右键菜单（好感度/睡眠/聊天状态在 open() 时现取）
    this.menu = new PetMenu(this.shadow, this.host, {
      onSay: () => this.forceSay(),
      onFeed: () => this.feed(),
      onToggleSleep: () => this.toggleSleep(),
      onResetPos: () => this.resetPos(),
      onChat: () => (this.chatOpen ? this.closeChat() : this.openChat()),
      onToggleVoice: () => this.setVoice(!this.speech.enabled)
    })
    this.video.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // 已开时再右键 = 关闭（开关语义）
      if (this.menu?.isOpen) this.menu.close()
      else this.openMenu()
    })

    // 长按摸头：按住不动 800ms 触发；移动（变拖拽）或抬起即取消
    this.video.addEventListener('pointerdown', () => {
      this.cancelLongPress()
      this.longPressTimer = window.setTimeout(() => this.petting(), LONG_PRESS_MS)
    })
    this.video.addEventListener('pointerup', () => this.cancelLongPress())
    this.video.addEventListener('pointercancel', () => this.cancelLongPress())
    this.video.addEventListener('pointermove', (e) => {
      if (e.buttons && this.longPressTimer) this.cancelLongPress()
    })

    document.addEventListener('pointerdown', this.onActivity, { passive: true, capture: true })
    document.addEventListener('keydown', this.onActivity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('resize', this.onResize)

    if (this.reduced) {
      // 减少动效：静在呼吸第一帧，不跑任何自动行为；用户主动点击仍会回应
      void this.player.play('idle-breathing', true).then(() => this.player.pause())
      return
    }

    void this.player.play('idle-breathing', true).then((ok) => {
      if (!ok) {
        console.warn('[dafeiyu] 主待机动画加载失败，宠物退出。检查 assetBase 是否正确')
        this.destroy()
        return
      }
      this.h = this.video.getBoundingClientRect().height || this.opts.size * ASPECT_H
    })

    this.setT(() => (this.started = true), START_DELAY_MS)
    this.scheduleIdle(rand(1500, 4000))
    this.scheduleWhisper()
    this.setT(this.checkSleep.bind(this), ACTIVITY_CHECK_MS)
  }

  // ── DOM 与位置 ────────────────────────────────────────────────

  private buildDom(): void {
    this.host = document.createElement('div')
    this.host.setAttribute('data-dafeiyu', '')
    const hs = this.host.style
    hs.position = 'fixed'
    hs.left = '0'
    hs.top = '0'
    hs.width = `${this.opts.size}px`
    hs.zIndex = String(this.opts.zIndex)
    hs.pointerEvents = 'none'
    hs.contain = 'layout style'
    this.shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = `
      video {
        display: block;
        width: 100%;
        height: auto;
        pointer-events: auto;
        cursor: grab;
        user-select: none;
        -webkit-user-drag: none;
      }
      video:active { cursor: grabbing; }
    `
    this.shadow.appendChild(style)

    this.video = document.createElement('video')
    this.shadow.appendChild(this.video)
    document.body.appendChild(this.host)
  }

  private restorePosition(): void {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const size = this.opts.size
    const margin = MARGIN + 4
    let nx: number, ny: number
    const p = this.opts.position
    if (p === 'bottom-left' || p === 'top-left' || p === 'bottom-right' || p === 'top-right') {
      nx = p.endsWith('right') ? 1 : 0
      ny = p.startsWith('bottom') ? 1 : 0
    } else if (p && typeof p.x === 'number' && typeof p.y === 'number') {
      nx = p.x
      ny = p.y
    } else {
      // 记住上次位置，否则右下角
      try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
        if (saved && typeof saved.nx === 'number' && typeof saved.ny === 'number') {
          nx = saved.nx
          ny = saved.ny
        } else {
          nx = 1
          ny = 1
        }
      } catch {
        nx = 1
        ny = 1
      }
    }
    this.x = Math.min(Math.max(nx * vw - size / 2, margin), vw - size - margin)
    this.y = Math.min(Math.max(ny * vh - this.hPlaceholder() / 2, margin), vh - size * ASPECT_H - margin)
    this.applyTransform()
  }

  private hPlaceholder(): number {
    return this.h || this.opts.size * ASPECT_H
  }

  private applyTransform(): void {
    this.host.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px)`
  }

  private clampIntoViewport(): void {
    const vw = window.innerWidth
    const vh = window.innerHeight
    this.x = Math.min(Math.max(this.x, 4), Math.max(vw - this.opts.size - 4, 4))
    this.y = Math.min(Math.max(this.y, 4), Math.max(vh - this.hPlaceholder() - 4, 4))
  }

  private savePos(): void {
    try {
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({
          nx: (this.x + this.opts.size / 2) / window.innerWidth,
          ny: (this.y + this.hPlaceholder() / 2) / window.innerHeight
        })
      )
    } catch {
      /* 隐私模式等存不进就算了 */
    }
  }

  // ── 定时器 ────────────────────────────────────────────────────

  private setT(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id)
    this.timers.clear()
    if (this.wanderRaf) {
      cancelAnimationFrame(this.wanderRaf)
      this.wanderRaf = 0
    }
  }

  private bump(): number {
    return ++this.stateToken
  }

  // ── 待机调度 ──────────────────────────────────────────────────

  private scheduleIdle(delayMs: number): void {
    this.setT(() => this.pickNext(), delayMs)
  }

  private pickNext(): void {
    if (this.dead || this.reduced || this.state !== 'idle') return
    const rare = loadAffinity() >= 100 ? RARE_CHANCE_FRIEND : RARE_CHANCE
    const r = Math.random()
    if (r < rare && !this.player.unavailable.has('rare-whale')) {
      this.runOnce('rare-whale', 'react')
      return
    }
    if (r < RARE_CHANCE + WANDER_CHANCE && !this.player.unavailable.has('walk-crab')) {
      this.wander()
      return
    }
    const name = this.pickIdle()
    if (!name) return
    this.lastIdle = name
    if (LOOPING.has(name)) {
      void this.player.play(name, true).then((ok) => {
        if (!ok) this.pickNext()
      })
      this.scheduleIdle(rand(IDLE_STAY_MS[0], IDLE_STAY_MS[1]))
    } else {
      this.runOnce(name, 'idle')
    }
  }

  /** 待机池加权随机：呼吸为底，深夜哈欠加权；尽量不与上一段重复 */
  private pickIdle(): AnimName | null {
    let pool = IDLE_POOL.filter((n) => !this.player.unavailable.has(n))
    if (pool.length > 1 && this.lastIdle) {
      const filtered = pool.filter((n) => n !== this.lastIdle)
      if (filtered.length) pool = filtered
    }
    if (!pool.length) return null
    const hour = new Date().getHours()
    const weight = (n: AnimName): number => {
      if (n === 'idle-breathing') return 3
      if (n === 'idle-humming') return 1.2
      if (n === 'idle-looking') return 1
      return hour >= 22 || hour < 6 ? 2.2 : 0.5 // idle-yawn
    }
    const total = pool.reduce((s, n) => s + weight(n), 0)
    let r = Math.random() * total
    for (const n of pool) {
      r -= weight(n)
      if (r <= 0) return n
    }
    return pool[pool.length - 1]
  }

  /** 播一遍动画然后回到 idle 链；token 防旧链路复活 */
  private async runOnce(name: AnimName, from: State): Promise<void> {
    const token = this.bump()
    this.state = from === 'idle' ? 'idle' : from
    const ok = await this.player.playOnce(name)
    if (token !== this.stateToken) return
    if (this.state === 'drag' || this.state === 'fly' || this.dead) return
    this.state = 'idle'
    this.scheduleIdle(rand(300, 900))
  }

  /** 横向漫游：播走路动画的同时把容器挪一段 */
  private wander(): void {
    this.state = 'wander'
    this.bump()
    const vw = window.innerWidth
    const dir = Math.random() < 0.5 ? -1 : 1
    const from = this.x
    const to = Math.min(Math.max(from + dir * rand(120, 360), MARGIN), vw - this.opts.size - MARGIN)
    const dur = rand(1500, 3500)
    const t0 = performance.now()
    this.player.setMirror(dir < 0)
    void this.player.play('walk-crab', false)
    const step = (now: number) => {
      if (this.state !== 'wander') return
      const k = Math.min((now - t0) / dur, 1)
      // easeInOut：起步和停下都软一点
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      this.x = from + (to - from) * e
      this.applyTransform()
      if (k < 1) {
        this.wanderRaf = requestAnimationFrame(step)
      } else {
        this.wanderRaf = 0
        this.player.setMirror(false)
        this.savePos()
        this.state = 'idle'
        this.scheduleIdle(rand(300, 900))
      }
    }
    this.wanderRaf = requestAnimationFrame(step)
  }

  // ── 睡眠 ──────────────────────────────────────────────────────

  private checkSleep(): void {
    if (this.dead) return
    if (this.state === 'idle' && Date.now() - this.lastActivity > SLEEP_AFTER_MS) {
      this.state = 'sleep'
      this.bump()
      void this.player.play('sleep-snooze', true)
    }
    this.setT(this.checkSleep.bind(this), ACTIVITY_CHECK_MS)
  }

  private wake(): void {
    this.bubble.hide()
    void this.runOnce('wake-startled', 'react')
  }

  // ── 碎碎念 ────────────────────────────────────────────────────

  private scheduleWhisper(): void {
    const base = this.opts.whisperIntervalSec * 1000
    this.setT(() => {
      this.tryWhisper()
      this.scheduleWhisper()
    }, base * rand(0.7, 1.3))
  }

  private async tryWhisper(): Promise<void> {
    if (this.dead || this.reduced || !this.started || document.hidden) return
    if (this.state !== 'idle') return // 睡着/拖拽/说话中都不打扰
    let line = this.pickLine()
    let image: string | undefined
    if (this.endpoints?.whisper) {
      const remote = await this.fetchWhisper()
      // 等响应的几秒里状态可能变了（被拖走/开始聊天），晚到的台词直接丢弃
      if (this.dead || this.state !== 'idle') return
      if (remote) {
        line = remote.line
        image = remote.image ? this.memeUrl(remote.image) : undefined
      }
    }
    if (!line) return
    this.clearTimers()
    this.state = 'talk'
    this.bump()
    void this.player.play('talk-screen', true)
    const ny = (this.y + this.hPlaceholder() / 2) / window.innerHeight
    this.bubble.say(line, BUBBLE_MS, ny < 0.28, image)
    this.speech.speak(line)
    this.setT(() => {
      if (this.state === 'talk') {
        this.state = 'idle'
        this.scheduleIdle(rand(300, 900))
      }
    }, BUBBLE_MS)
  }

  /** 拉一句后端碎碎念（可带配图键名）；任何失败都返回 null，由本地台词池兜底 */
  private async fetchWhisper(): Promise<{ line: string; image?: string } | null> {
    const url = this.endpoints?.whisper
    if (!url) return null
    try {
      // 页面感知：把当前页标题/路径带给后端，AI 能就着访客正在看的内容说话
      const target = new URL(url, location.href)
      if (this.opts.pageContext !== false) {
        target.searchParams.set('title', document.title.slice(0, 60))
        target.searchParams.set('path', location.pathname.slice(0, 120))
      }
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(target.href, { signal: ctrl.signal })
      window.clearTimeout(timer)
      if (!res.ok) return null
      const data = await res.json()
      if (typeof data?.line === 'string') {
        const t = data.line.trim()
        if (t && t.length <= 120) {
          return {
            line: t,
            image: typeof data.image === 'string' ? data.image.slice(0, 40) : undefined
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  private pickLine(): string | null {
    let pool = BUILTIN_LINES.concat(this.extraLines)
    if (loadAffinity() >= 300) pool = pool.concat(FRIEND_LINES) // 挚友专属台词
    if (!pool.length) return null
    let line = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length > 1) {
      for (let i = 0; i < 3 && line === this.lastLine; i++) {
        line = pool[Math.floor(Math.random() * pool.length)]
      }
    }
    this.lastLine = line
    return line
  }

  // ── 拖拽与点击 ────────────────────────────────────────────────

  private grabOffX = 0
  private grabOffY = 0
  private dragging = false

  private handleDragMove(px: number, py: number): void {
    if (!this.dragging) {
      this.dragging = true
      this.clearTimers()
      this.flightCancel?.()
      this.flightCancel = null
      this.state = 'drag'
      this.bump()
      this.bubble.hide()
      void this.player.play('drag-startled', false)
    }
    this.lastActivity = Date.now()
    this.x = Math.min(Math.max(px - this.grabOffX, 0), window.innerWidth - this.opts.size)
    this.y = Math.min(Math.max(py - this.grabOffY, 0), window.innerHeight - this.hPlaceholder())
    this.applyTransform()
  }

  private handleRelease(vx: number, vy: number): void {
    this.dragging = false
    this.lastActivity = Date.now()
    const speed = Math.hypot(vx, vy)
    if (speed > THROW_SPEED) {
      this.state = 'fly'
      this.bump()
      this.flightCancel?.()
      this.flightCancel = startFlight({
        x: this.x,
        y: this.y,
        vx,
        vy,
        bounds: () => ({
          vw: window.innerWidth,
          vh: window.innerHeight,
          w: this.opts.size,
          h: this.hPlaceholder()
        }),
        onStep: (x, y) => {
          this.x = x
          this.y = y
          this.applyTransform()
        },
        onRest: (x, y) => {
          this.flightCancel = null
          this.x = x
          this.y = y
          this.savePos()
          if (this.state === 'fly') {
            this.state = 'idle'
            this.scheduleIdle(rand(300, 900))
          }
        }
      })
    } else {
      this.savePos()
      this.state = 'idle'
      this.scheduleIdle(rand(200, 600))
    }
  }

  private handleClick(): void {
    this.lastActivity = Date.now()
    this.started = true
    if (this.dead) return
    if (this.justPetted) {
      // 刚摸完头松手的那一下不是点击
      this.justPetted = false
      return
    }
    if (this.chatOpen) return // 聊天中，点击不打断对话
    if (this.state === 'sleep') {
      this.wake()
      return
    }
    this.bubble.hide()
    const now = Date.now()
    this.combo = now - this.comboAt < COMBO_WINDOW_MS ? this.combo + 1 : 1
    this.comboAt = now
    const angry = this.combo >= COMBO_ANGRY
    const pool = CLICK_POOL.filter((n) => !this.player.unavailable.has(n))
    const name: AnimName | null = angry
      ? this.player.unavailable.has('click-annoyed')
        ? (pool[0] ?? null)
        : 'click-annoyed'
      : (pool[Math.floor(Math.random() * pool.length)] ?? null)
    if (name) void this.runOnce(name, 'react')
    if (angry) {
      this.bubble.say('戳够了没有！', 3000, false)
      this.combo = 0
    }
  }

  // ── 聊天（endpoints.chat 配置后启用）─────────────────────────

  openChat(): void {
    if (this.dead || !this.chatPanel) return
    if (!this.chatOpen) {
      this.chatOpen = true
      this.clearTimers()
      this.state = 'talk'
      this.bump()
      this.bubble.hide()
      void this.player.play('talk-screen', true)
    }
    this.chatPanel.open()
  }

  closeChat(): void {
    if (!this.chatOpen) return
    this.chatOpen = false
    this.chatAbort?.abort()
    this.chatAbort = null
    // panel.close() 会回调 onClose → closeChat，这里已置 false，二次调用直接返回
    this.chatPanel?.close()
    if (!this.dead && !this.reduced) {
      this.state = 'idle'
      this.scheduleIdle(rand(300, 900))
    }
  }

  private sendChat(text: string): void {
    const panel = this.chatPanel
    const url = this.endpoints?.chat
    if (!panel || !url) return
    this.lastActivity = Date.now()
    panel.addUser(text)
    panel.setSending(true)
    void this.player.play('talk-thinking', true) // 等首字时的思考相

    const outgoing: ChatMessage[] = [...this.chatHistory, { role: 'user', content: text }]
    const handle = panel.startAssistant()
    let acc = ''
    let firstDelta = true
    this.chatAbort = streamChat(url, outgoing, {
      onDelta: (d) => {
        if (firstDelta) {
          firstDelta = false
          void this.player.play('talk-screen', true)
        }
        acc += d
        handle.push(d)
      },
      onImage: (key) => {
        const u = this.memeUrl(key)
        if (u) handle.setImage(u)
      },
      onDone: () => {
        handle.done()
        this.chatHistory = trimHistory([...outgoing, { role: 'assistant', content: acc || '…' }])
        this.saveHistory()
        panel.setSending(false)
        this.chatAbort = null
        // 完整回复落定后再整段朗读（流式逐字念会卡顿）
        this.speech.speak(acc)
      },
      onError: (msg) => {
        handle.error(msg)
        panel.setSending(false)
        this.chatAbort = null
      }
    })
  }

  private loadHistory(): ChatMessage[] {
    try {
      const raw = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]')
      if (!Array.isArray(raw)) return []
      return trimHistory(
        raw.filter(
          (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      )
    } catch {
      return []
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(this.chatHistory))
    } catch {
      /* 存不进就算了 */
    }
  }

  // ── 互动（右键菜单 / 手势入口）──────────────────────────────

  private openMenu(): void {
    if (this.dead || !this.menu) return
    const n = loadAffinity()
    this.menu.open(
      this.petName,
      n,
      levelOf(n).name,
      this.state === 'sleep',
      !!this.endpoints?.chat,
      this.speech.enabled
    )
  }

  /** 语音朗读开关（右键菜单入口）；关闭时立刻停掉正在读的 */
  setVoice(on: boolean): void {
    this.speech.setEnabled(on)
  }

  private get petName(): string {
    return this.opts.name ?? '大肥鱼'
  }

  /** 表情包键名 → 素材 URL；键名只放行 ASCII，防注入奇怪路径 */
  private memeUrl(key: string): string | undefined {
    return /^[a-z0-9-]{1,40}$/.test(key) ? `${this.opts.assetBase}memes/${key}.png` : undefined
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      window.clearTimeout(this.longPressTimer)
      this.longPressTimer = 0
    }
  }

  /** 摸头：长按触发，好感 +1；好感 ≥30（熟悉）后有概率冒泡回应 */
  private petting(): void {
    this.cancelLongPress()
    if (this.dead || this.chatOpen) return
    this.justPetted = true
    this.lastActivity = Date.now()
    const n = addAffinity(1)
    this.bubble.hide()
    if (n >= 30 && Math.random() < 0.34) {
      const pets = ['咕噜咕噜…好舒服', '再摸会儿也行', '摸头杀！']
      this.bubble.say(pets[Math.floor(Math.random() * pets.length)], 5000)
    }
    void this.runOnce('pet-scratch', 'react')
  }

  /** 喂食：好感 +2，随机吃一段；抽到「偷吃被抓住」配一句嘴硬台词 */
  feed(): void {
    if (this.dead) return
    this.lastActivity = Date.now()
    addAffinity(2)
    this.bubble.hide()
    const pool = FEED_POOL.filter((a) => !this.player.unavailable.has(a))
    if (!pool.length) return
    const name = pool[Math.floor(Math.random() * pool.length)]
    if (name === 'eat-caught') this.bubble.say('不、不是我偷吃的！', 5000)
    this.state = 'react'
    void this.runOnce(name, 'react')
  }

  /** 菜单里的睡觉/叫醒开关 */
  toggleSleep(): void {
    if (this.dead) return
    this.lastActivity = Date.now()
    if (this.state === 'sleep') {
      this.wake()
    } else {
      this.clearTimers()
      this.state = 'sleep'
      this.bump()
      this.bubble.hide()
      void this.player.play('sleep-snooze', true)
    }
  }

  /** 回到默认角落（右下），并清掉记住的位置；进行中的抛掷也要停 */
  resetPos(): void {
    if (this.dead) return
    this.flightCancel?.()
    this.flightCancel = null
    if (this.state === 'fly') {
      this.state = 'idle'
      this.scheduleIdle(rand(300, 900))
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    this.x = vw - this.opts.size - MARGIN
    this.y = vh - this.hPlaceholder() - MARGIN
    this.applyTransform()
    this.savePos()
  }

  // ── 可见性 ────────────────────────────────────────────────────

  private suspend(): void {
    this.clearTimers()
    this.flightCancel?.()
    this.flightCancel = null
    this.player.pause()
  }

  private resume(): void {
    if (this.dead || this.reduced) return
    if (this.chatOpen) {
      void this.player.play('talk-screen', true)
      return
    }
    if (this.state === 'sleep') {
      void this.player.play('sleep-snooze', true)
      this.setT(this.checkSleep.bind(this), ACTIVITY_CHECK_MS)
      this.scheduleWhisper()
      return
    }
    if (this.state === 'drag') return // 拖拽中不管
    this.state = 'idle'
    this.scheduleIdle(200)
    this.scheduleWhisper()
    this.setT(this.checkSleep.bind(this), ACTIVITY_CHECK_MS)
  }

  // ── 对外（调试/站点调用）与销毁 ───────────────────────────────

  forceSay(text?: string): void {
    if (this.dead) return
    const line = text ?? this.pickLine()
    if (!line) return
    this.clearTimers()
    this.state = 'talk'
    this.bump()
    void this.player.play('talk-screen', true)
    const ny = (this.y + this.hPlaceholder() / 2) / window.innerHeight
    this.bubble.say(line, BUBBLE_MS, ny < 0.28)
    this.speech.speak(line)
    this.setT(() => {
      if (this.state === 'talk') {
        this.state = 'idle'
        this.scheduleIdle(rand(300, 900))
      }
    }, BUBBLE_MS)
  }

  forcePlay(name: string): void {
    if (this.dead || !isAnimName(name) || this.player.unavailable.has(name)) return
    this.clearTimers()
    this.state = 'react'
    void this.runOnce(name, 'react')
  }

  destroy(): void {
    if (this.dead && !this.host) {
      if (Pet.current === this) Pet.current = undefined
      return
    }
    this.dead = true
    this.clearTimers()
    this.cancelLongPress()
    this.flightCancel?.()
    this.chatAbort?.abort()
    this.chatAbort = null
    this.menu?.destroy()
    this.speech.cancel()
    this.detachDrag?.()
    document.removeEventListener('pointerdown', this.onActivity, { capture: true } as EventListenerOptions)
    document.removeEventListener('keydown', this.onActivity, { capture: true } as EventListenerOptions)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('resize', this.onResize)
    this.bubble?.destroy()
    this.player?.pause()
    this.host?.remove()
    if (Pet.current === this) Pet.current = undefined
  }
}
