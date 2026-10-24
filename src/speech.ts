/**
 * 语音朗读：Web Speech API（浏览器自带 TTS，零成本零后端）。
 * 音质取决于访客系统（Win/macOS/安卓的中文语音都不错，Linux 桌面常缺失），
 * 缺语音的环境静默降级——朗读是锦上添花，不是依赖项。
 *
 * 开关状态记 localStorage（访客的偏好跨会话保留）；实例开关由构造参数传入。
 */

const VOICE_KEY = 'dafeiyu:voice'

export class Speech {
  private on: boolean
  private synth: SpeechSynthesis | null

  constructor(enabled: boolean) {
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
    let saved: boolean | null = null
    try {
      const raw = localStorage.getItem(VOICE_KEY)
      if (raw === '1' || raw === '0') saved = raw === '1'
    } catch {
      /* 隐私模式存不进，用实例默认 */
    }
    this.on = saved ?? enabled
    // 声音列表异步加载，挂个监听预热缓存
    this.synth?.addEventListener?.('voiceschanged', () => this.pickVoice())
  }

  get enabled(): boolean {
    return this.on
  }

  setEnabled(v: boolean): void {
    this.on = v
    if (!v) this.cancel()
    try {
      localStorage.setItem(VOICE_KEY, v ? '1' : '0')
    } catch {
      /* 存不进就算了 */
    }
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (!this.synth) return null
    const voices = this.synth.getVoices()
    // 优先中文语音；zh-CN/zh-TW/zh 都行，越靠前的越合心意
    return voices.find((v) => v.lang === 'zh-CN') || voices.find((v) => v.lang?.startsWith('zh')) || null
  }

  /** 朗读一段文本；关闭状态/无语音环境/文本为空都静默跳过 */
  speak(text: string): void {
    if (!this.on || !this.synth) return
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!clean) return
    try {
      this.synth.cancel()
      const u = new SpeechSynthesisUtterance(clean)
      const v = this.pickVoice()
      if (v) {
        u.voice = v
        u.lang = v.lang
      } else {
        u.lang = 'zh-CN'
      }
      u.rate = 1.05
      u.pitch = 1.15 // 稍微提亮一点，更像小宠物
      this.synth.speak(u)
    } catch {
      /* 语音环境异常时静默 */
    }
  }

  cancel(): void {
    try {
      this.synth?.cancel()
    } catch {
      /* 忽略 */
    }
  }
}
