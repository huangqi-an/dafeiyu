/**
 * 拖拽 + 抛掷物理。
 * 拖拽用 Pointer Events + setPointerCapture（鼠标/触摸统一）；
 * 抛掷是简单的重力 + 边界反弹，参数按「Q 弹但不飘」的手感调的。
 */

const DRAG_THRESHOLD_PX = 6
const SAMPLE_WINDOW_MS = 100
const GRAVITY = 0.0022 // px/ms²
const AIR_DRAG = 0.9995 // 每毫秒的速度保留率
const WALL_BOUNCE = 0.6
const FLOOR_BOUNCE = 0.45
const FLOOR_FRICTION = 0.85
const REST_SPEED = 0.03 // px/ms，低于此且贴地视为静止

export interface DragHandlers {
  /** 按下（还没判定为拖拽），参数为指针视口坐标 */
  onGrab(x: number, y: number): void
  /** 拖动中，参数为指针当前视口坐标 */
  onDragMove(x: number, y: number): void
  /** 松手，参数为 px/ms 速度（按最近 ~100ms 采样估算） */
  onRelease(vx: number, vy: number): void
  /** 按下后位移极小的松手 = 点击 */
  onClick(): void
}

/** 挂载拖拽交互，返回 detach 函数 */
export function attachDrag(el: HTMLElement, h: DragHandlers): () => void {
  let dragging = false
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let samples: { t: number; x: number; y: number }[] = []
  let pid = -1

  const onDown = (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    pid = e.pointerId
    startX = lastX = e.clientX
    startY = lastY = e.clientY
    samples = [{ t: performance.now(), x: startX, y: startY }]
    dragging = false
    el.setPointerCapture(pid)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    h.onGrab(startX, startY)
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    const x = e.clientX
    const y = e.clientY
    if (!dragging) {
      if (Math.hypot(x - startX, y - startY) < DRAG_THRESHOLD_PX) return
      dragging = true
    }
    lastX = x
    lastY = y
    const now = performance.now()
    samples.push({ t: now, x, y })
    while (samples.length > 2 && now - samples[0].t > SAMPLE_WINDOW_MS) samples.shift()
    h.onDragMove(x, y)
  }

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    try {
      el.releasePointerCapture(pid)
    } catch {
      /* 元素已移除时忽略 */
    }
    pid = -1
    if (!dragging) {
      h.onClick()
      return
    }
    const now = performance.now()
    samples.push({ t: now, x: lastX, y: lastY })
    const first = samples[0]
    const dt = Math.max(now - first.t, 1)
    h.onRelease((lastX - first.x) / dt, (lastY - first.y) / dt)
  }

  el.addEventListener('pointerdown', onDown)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
  }
}

export interface FlightOptions {
  x: number
  y: number
  vx: number
  vy: number
  /** 容器尺寸与视口尺寸（每帧现取，窗口可能变化；w/h 是宠物容器的宽高） */
  bounds: () => { vw: number; vh: number; w: number; h: number }
  onStep(x: number, y: number): void
  onRest(x: number, y: number): void
}

/** 抛掷飞行：rAF 循环，返回取消函数 */
export function startFlight(o: FlightOptions): () => void {
  let x = o.x
  let y = o.y
  let vx = o.vx
  let vy = o.vy
  let raf = 0
  let last = performance.now()
  let stillFrames = 0

  const step = (now: number) => {
    const dt = Math.min(now - last, 32) // 掉帧保护：单步最多按 32ms 算
    last = now
    const { vw, vh, w, h } = o.bounds()

    vy += GRAVITY * dt
    vx *= Math.pow(AIR_DRAG, dt)
    x += vx * dt
    y += vy * dt

    if (x < 0) {
      x = 0
      vx = -vx * WALL_BOUNCE
    } else if (x > vw - w) {
      x = vw - w
      vx = -vx * WALL_BOUNCE
    }
    if (y < 0) {
      y = 0
      vy = -vy * WALL_BOUNCE
    } else if (y > vh - h) {
      y = vh - h
      vy = -vy * FLOOR_BOUNCE
      vx *= FLOOR_FRICTION
      if (Math.abs(vy) < REST_SPEED) vy = 0
    }

    o.onStep(x, y)

    const speed = Math.hypot(vx, vy)
    if (speed < REST_SPEED && y >= vh - h - 1) {
      if (++stillFrames >= 3) {
        o.onRest(x, y)
        return
      }
    } else {
      stillFrames = 0
    }
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
