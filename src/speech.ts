/**
 * 语音朗读：Web Speech API（浏览器自带 TTS，零成本零后端）。
 * 音质取决于访客系统（Win/macOS/安卓的中文语音都不错，Linux 桌面常缺失），
 * 缺语音的环境静默降级——朗读是锦上添花，不是依赖项。
 *
 * 开关状态记 localStorage（访客的偏好跨会话保留）；实例开关由构造参数传入。
 */

const VOICE_KEY = 'dafeiyu:voice'
const VOICE_NAME_KEY = 'dafeiyu:voice-name'

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
    // 声音列表异步加载，挂个监听让后续读取拿到最新列表
    this.synth?.addEventListener?.('voiceschanged', () => this.currentVoice())
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

  /** 本机全部中文语音（Windows 一般 2-3 个，macOS 1-2 个，Linux 可能没有） */
  listZhVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return []
    return this.synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('zh'))
  }

  /** 当前生效的语音：记住的偏好名 → 第一个 zh-CN → 列表第一个 */
  currentVoice(): SpeechSynthesisVoice | null {
    const list = this.listZhVoices()
    if (!list.length) return null
    let savedName: string | null = null
    try {
      savedName = localStorage.getItem(VOICE_NAME_KEY)
    } catch {
      /* 读不到就用默认 */
    }
    if (savedName) {
      const hit = list.find((v) => v.name === savedName)
      if (hit) return hit
    }
    return list.find((v) => v.lang === 'zh-CN') || list[0]
  }

  /** 切到下一个中文语音并持久化偏好；无语音可切返回 null */
  cycleVoice(): SpeechSynthesisVoice | null {
    const list = this.listZhVoices()
    if (!list.length) return null
    const cur = this.currentVoice()
    const idx = cur ? list.indexOf(cur) : -1
    const next = list[(idx + 1) % list.length]
    try {
      localStorage.setItem(VOICE_NAME_KEY, next.name)
    } catch {
      /* 存不进就算了 */
    }
    return next
  }

  /** 菜单展示用：当前音色名（截断），无中文语音时显示「无」 */
  voiceLabel(): string {
    const v = this.currentVoice()
    if (!v) return '无'
    return v.name.length > 12 ? `${v.name.slice(0, 12)}…` : v.name
  }

  /** 朗读一段文本；关闭状态/无语音环境/文本为空都静默跳过 */
  speak(text: string): void {
    if (!this.on || !this.synth) return
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!clean) return
    try {
      this.synth.cancel()
      const u = new SpeechSynthesisUtterance(clean)
      const v = this.currentVoice()
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
