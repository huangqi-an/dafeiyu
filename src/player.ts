import type { AnimName } from './anims'

/**
 * Safari（macOS WebKit）不支持 VP9 的 alpha 通道：能解码、会播放，但渲染成黑底。
 * 「能解码」与「透明还在」是两件事，后者没有任何 Web API 可探测，只能按 UA 判断。
 * 判定逻辑与 dsh-pet 的 prefersMov() 一致。
 * 注：iOS 各浏览器均为 WebKit 内核，但移动端默认不挂载（enabledOnMobile=false）。
 */
export function prefersMov(): boolean {
  const ua = navigator.userAgent
  if (/Chrome|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua)) return false
  return /Mac/i.test(navigator.platform || ua)
}

const LOAD_TIMEOUT_MS = 10000

/** 单 <video> 换源播放器。所有动画只下载一次（浏览器缓存），失败者被记入黑名单 */
export class Player {
  readonly ext: '.webm' | '.mov'
  /** 加载失败（404 / 解码错误）的动画，调度器应将其从池中剔除 */
  readonly unavailable = new Set<AnimName>()
  private video: HTMLVideoElement
  private assetBase: string
  private token = 0
  private currentName: AnimName | null = null

  constructor(video: HTMLVideoElement, assetBase: string) {
    this.video = video
    this.assetBase = assetBase.endsWith('/') ? assetBase : assetBase + '/'
    this.ext = prefersMov() ? '.mov' : '.webm'
    video.muted = true
    video.playsInline = true
    video.preload = 'none'
    // 旧 WebKit 判定 muted 需要 attribute 而非 property，两个都设
    video.setAttribute('muted', '')
    video.setAttribute('aria-hidden', 'true')
    video.addEventListener('error', () => {
      if (this.currentName) this.unavailable.add(this.currentName)
    })
  }

  url(name: AnimName): string {
    return `${this.assetBase}${name}${this.ext}`
  }

  get playing(): AnimName | null {
    return this.currentName
  }

  /** 换源播放。resolve false 表示加载失败（已记入黑名单），调用方应换动画 */
  async play(name: AnimName, loop: boolean): Promise<boolean> {
    const token = ++this.token
    const url = this.url(name)
    const abs = new URL(url, location.href).href

    // 同一个循环动画已在播：不折腾，确保在播即可
    if (this.currentName === name && loop && this.video.loop && !this.video.ended) {
      void this.video.play().catch(() => {})
      return true
    }

    this.currentName = name
    this.video.loop = loop
    this.video.src = url
    this.video.load()

    const ok = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), LOAD_TIMEOUT_MS)
      const done = (v: boolean) => {
        window.clearTimeout(timer)
        this.video.removeEventListener('loadeddata', onData)
        this.video.removeEventListener('error', onError)
        resolve(v)
      }
      const onData = () => done(true)
      const onError = () => done(false)
      this.video.addEventListener('loadeddata', onData, { once: true })
      this.video.addEventListener('error', onError, { once: true })
    })
    if (token !== this.token) return false // 已被更新的播放请求取代
    if (!ok) {
      this.unavailable.add(name)
      return false
    }
    try {
      await this.video.play()
    } catch {
      // muted 自动播放被个别 WebView 拒绝：不重试，静默定格（首帧已在）
    }
    return token === this.token
  }

  /**
   * 播一遍并在 ended 时 resolve；加载失败立即 resolve false。
   * 不做 token 检查：被更新的播放取代时，这个 promise 可能晚 Resolve 或
   * 被后来者的 ended 提前 Resolve——调用方（pet.ts）有自己的状态代次守卫。
   */
  async playOnce(name: AnimName): Promise<boolean> {
    const started = await this.play(name, false)
    if (!started) return false
    return await new Promise<boolean>((resolve) => {
      const duration = (this.video.duration || 12) * 1000 + 2000
      const timer = window.setTimeout(() => finish(true), duration)
      const finish = (v: boolean) => {
        window.clearTimeout(timer)
        this.video.removeEventListener('ended', onEnd)
        this.video.removeEventListener('error', onErr)
        resolve(v)
      }
      const onEnd = () => finish(true)
      const onErr = () => finish(false)
      this.video.addEventListener('ended', onEnd, { once: true })
      this.video.addEventListener('error', onErr, { once: true })
    })
  }

  pause(): void {
    this.video.pause()
  }

  /** 朝向翻转（水平镜像），漫游向左走时用 */
  setMirror(faceLeft: boolean): void {
    this.video.style.transform = faceLeft ? 'scaleX(-1)' : ''
  }

  get el(): HTMLVideoElement {
    return this.video
  }
}
