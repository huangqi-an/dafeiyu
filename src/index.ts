import { Pet } from './pet'
import type { CornerPosition, DafeiyuOptions, PetEndpoints } from './config'

export type { CornerPosition, DafeiyuOptions, PetEndpoints }

export interface DafeiyuInstance {
  /** 移除宠物并清理全部监听与定时器 */
  destroy(): void
  /** 立刻说一句话（不传则从台词池随机） */
  say(text?: string): void
  /** 立刻播一段动画（语义名见包内 anims.ts / README） */
  play(name: string): void
  /** 喂食（好感 +2，随机播放吃相动画） */
  feed(): void
  /** 打开聊天面板（需配置 endpoints.chat，否则 no-op） */
  openChat(): void
  closeChat(): void
}

/**
 * 挂载宠物。同一页面重复调用会先销毁上一个实例。
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/dafeiyu/dist/dafeiyu.iife.js"></script>
 * <script>Dafeiyu.mount({ assetBase: '/pet-assets/' })</script>
 * ```
 */
export function mount(options: DafeiyuOptions = {}): DafeiyuInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('[dafeiyu] mount() 只能在浏览器里调用')
  }
  let pet: Pet | null = null
  const ensure = (): Pet => {
    if (!pet) pet = new Pet(options)
    return pet
  }
  if (document.body) {
    pet = new Pet(options)
  } else {
    document.addEventListener('DOMContentLoaded', () => ensure(), { once: true })
  }
  return {
    destroy: () => {
      pet?.destroy()
      pet = null
    },
    say: (text?: string) => ensure().forceSay(text),
    play: (name: string) => ensure().forcePlay(name),
    feed: () => ensure().feed(),
    openChat: () => ensure().openChat(),
    closeChat: () => ensure().closeChat()
  }
}

export default { mount }
