/**
 * 五子棋：访客（黑，先手）vs 大肥鱼（白）。
 * 面板挂在宠物容器的 Shadow DOM 里；棋盘 15×15 canvas；
 * AI 是启发式——自己能赢立即下、访客下一步能赢立即挡、
 * 否则按「经过该点的连线潜力 + 中心偏好」贪心选点，够玩但不难赢。
 */

export type GameResult = 'player' | 'pet' | 'draw'

export interface GomokuHandlers {
  onEnd(result: GameResult): void
  onClose(): void
}

const SIZE = 15
const CELL = 22
const PAD = CELL / 2 + 4

const PANEL_STYLE = `
  .dfy-game {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    width: 348px;
    max-width: calc(100vw - 24px);
    border-radius: 14px;
    background: rgba(32, 34, 40, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
    color: #f2f3f5;
    font: 13px/1.6 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    overflow: hidden;
    display: none;
    pointer-events: auto;
  }
  .dfy-game.dfy-open { display: block; }
  .dfy-game-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,.1);
  }
  .dfy-game-head button {
    border: 0; background: none; color: inherit; font: inherit;
    cursor: pointer; padding: 0 4px; opacity: .75;
  }
  .dfy-game-head button:hover { opacity: 1; }
  .dfy-game-status {
    padding: 6px 12px 0; color: #b9bcc4; font-size: 12px;
  }
  .dfy-game canvas {
    display: block; margin: 8px auto 12px; border-radius: 8px;
    cursor: pointer; max-width: 100%; height: auto;
  }
`

export class GomokuPanel {
  private root: HTMLDivElement
  private statusEl: HTMLDivElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private board = new Int8Array(SIZE * SIZE) // 0 空 / 1 访客(黑) / 2 鱼(白)
  private turn: 1 | 2 = 1
  private over = false
  private openState = false
  private timer = 0
  private handlers: GomokuHandlers

  constructor(shadow: ShadowRoot, handlers: GomokuHandlers) {
    this.handlers = handlers

    const style = document.createElement('style')
    style.textContent = PANEL_STYLE
    shadow.appendChild(style)

    this.root = document.createElement('div')
    this.root.className = 'dfy-game'
    this.root.style.display = 'none'

    const head = document.createElement('div')
    head.className = 'dfy-game-head'
    const title = document.createElement('span')
    title.textContent = '和大肥鱼下五子棋'
    const btns = document.createElement('span')
    const reset = document.createElement('button')
    reset.textContent = '重开'
    reset.addEventListener('click', () => this.reset())
    const close = document.createElement('button')
    close.textContent = '×'
    close.setAttribute('aria-label', '关闭游戏')
    close.addEventListener('click', () => this.close())
    btns.append(reset, close)
    head.append(title, btns)

    this.statusEl = document.createElement('div')
    this.statusEl.className = 'dfy-game-status'

    this.canvas = document.createElement('canvas')
    this.canvas.width = SIZE * CELL + PAD * 2
    this.canvas.height = SIZE * CELL + PAD * 2
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e))

    this.ctx = this.canvas.getContext('2d')!

    this.root.append(head, this.statusEl, this.canvas)
    shadow.appendChild(this.root)
    this.draw()
  }

  get isOpen(): boolean {
    return this.openState
  }

  open(): void {
    this.openState = true
    this.root.style.display = 'block'
    requestAnimationFrame(() => this.root.classList.add('dfy-open'))
    this.clampIntoViewport()
    this.setStatus()
  }

  close(): void {
    if (!this.openState) return
    this.openState = false
    this.root.classList.remove('dfy-open')
    window.clearTimeout(this.timer)
    window.setTimeout(() => {
      if (!this.openState) this.root.style.display = 'none'
    }, 220)
    this.handlers.onClose()
  }

  destroy(): void {
    window.clearTimeout(this.timer)
    this.root.remove()
  }

  private clampIntoViewport(): void {
    this.root.style.marginLeft = '0'
    const r = this.root.getBoundingClientRect()
    const vw = window.innerWidth
    let shift = 0
    if (r.left < 8) shift = 8 - r.left
    else if (r.right > vw - 8) shift = vw - 8 - r.right
    if (shift !== 0) this.root.style.marginLeft = `${shift}px`
  }

  private reset(): void {
    this.board.fill(0)
    this.turn = 1
    this.over = false
    window.clearTimeout(this.timer)
    // e2e 观测点：落子数
    this.root.dataset.moves = '0'
    this.draw()
    this.setStatus()
  }

  private moves(): number {
    let n = 0
    for (const v of this.board) if (v) n++
    return n
  }

  private setStatus(): void {
    if (this.over) return // 终局文案由 end() 设置
    this.statusEl.textContent = this.turn === 1 ? '轮到你了（黑棋）' : '大肥鱼思考中…'
    this.root.dataset.moves = String(this.moves())
  }

  private onCanvasClick(e: MouseEvent): void {
    if (this.over || this.turn !== 1) return
    const rect = this.canvas.getBoundingClientRect()
    const scale = this.canvas.width / rect.width
    const x = Math.round(((e.clientX - rect.left) * scale - PAD) / CELL)
    const y = Math.round(((e.clientY - rect.top) * scale - PAD) / CELL)
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
    if (this.board[y * SIZE + x]) return
    this.place(x, y, 1)
    if (this.over) return
    this.turn = 2
    this.setStatus()
    // 模拟思考：600~1100ms 后落子（有生命感，也给动画留时间）
    this.timer = window.setTimeout(() => this.petMove(), 600 + Math.random() * 500)
  }

  private petMove(): void {
    if (this.over || !this.openState) return
    const idx = this.bestCell()
    if (idx < 0) {
      this.end('draw')
      return
    }
    this.place(idx % SIZE, Math.floor(idx / SIZE), 2)
    if (!this.over) {
      this.turn = 1
      this.setStatus()
    }
  }

  private place(x: number, y: number, who: 1 | 2): void {
    this.board[y * SIZE + x] = who
    this.draw()
    if (this.wins(x, y, who)) {
      this.end(who === 1 ? 'player' : 'pet')
    } else if (this.moves() >= SIZE * SIZE) {
      this.end('draw')
    }
  }

  /** 以 (x,y) 为中心四个方向数连子 */
  private wins(x: number, y: number, who: 1 | 2): boolean {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let n = 1
      for (const s of [1, -1]) {
        let i = x + dx * s
        let j = y + dy * s
        while (i >= 0 && j >= 0 && i < SIZE && j < SIZE && this.board[j * SIZE + i] === who) {
          n++
          i += dx * s
          j += dy * s
        }
      }
      if (n >= 5) return true
    }
    return false
  }

  // ── 启发式 AI ──────────────────────────────────────────────

  /** 该点对 who 的方向价值：连子数 × 开放端数 */
  private lineScore(x: number, y: number, who: 1 | 2): number {
    let total = 0
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let run = 1
      let open = 0
      for (const s of [1, -1]) {
        let i = x + dx * s
        let j = y + dy * s
        while (i >= 0 && j >= 0 && i < SIZE && j < SIZE && this.board[j * SIZE + i] === who) {
          run++
          i += dx * s
          j += dy * s
        }
        if (i >= 0 && j >= 0 && i < SIZE && j < SIZE && this.board[j * SIZE + i] === 0) open++
      }
      if (run >= 5) total += 10000
      else if (open === 0) total += 0 // 死棋不值钱
      else total += run * run * open
    }
    return total
  }

  private bestCell(): number {
    let best = -1
    let bestScore = -1
    const center = (SIZE - 1) / 2
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (this.board[i]) continue
      const x = i % SIZE
      const y = Math.floor(i / SIZE)
      const myWin = this.wins(x, y, 2)
      const yourWin = this.wins(x, y, 1)
      let score: number
      if (myWin) score = 1e9
      else if (yourWin) score = 1e8 // 挡住访客的必胜点
      else {
        score = this.lineScore(x, y, 2) * 1.1 + this.lineScore(x, y, 1)
        // 中心偏好：开局往中间凑
        score -= (Math.abs(x - center) + Math.abs(y - center)) * 2
      }
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  private end(result: GameResult): void {
    this.over = true
    this.statusEl.textContent =
      result === 'player' ? '你赢了！点「重开」再来一局' : result === 'pet' ? '大肥鱼赢了～不服就重开' : '平局，棋逢对手'
    this.root.dataset.moves = String(this.moves())
    this.handlers.onEnd(result)
  }

  // ── 绘制 ────────────────────────────────────────────────────

  private draw(): void {
    const c = this.ctx
    const w = this.canvas.width
    c.fillStyle = '#e2c08d'
    c.fillRect(0, 0, w, w)
    c.strokeStyle = '#8a6a3a'
    c.lineWidth = 1
    for (let i = 0; i < SIZE; i++) {
      c.beginPath()
      c.moveTo(PAD + i * CELL, PAD)
      c.lineTo(PAD + i * CELL, w - PAD)
      c.stroke()
      c.beginPath()
      c.moveTo(PAD, PAD + i * CELL)
      c.lineTo(w - PAD, PAD + i * CELL)
      c.stroke()
    }
    // 星位
    c.fillStyle = '#8a6a3a'
    for (const [sx, sy] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
      c.beginPath()
      c.arc(PAD + sx * CELL, PAD + sy * CELL, 2.5, 0, Math.PI * 2)
      c.fill()
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = this.board[y * SIZE + x]
        if (!v) continue
        c.beginPath()
        c.arc(PAD + x * CELL, PAD + y * CELL, CELL * 0.42, 0, Math.PI * 2)
        if (v === 1) {
          c.fillStyle = '#1c1e22'
          c.fill()
          c.strokeStyle = '#000'
          c.stroke()
        } else {
          c.fillStyle = '#f7f7f5'
          c.fill()
          c.strokeStyle = '#b9b5ad'
          c.stroke()
        }
      }
    }
  }
}
