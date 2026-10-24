/**
 * 动画注册表：语义名即 assets/ 下的文件名（不含扩展名），
 * 播放地址 = assetBase + 语义名 + ('.webm' | '.mov')。
 * 中文名 → ASCII 名的映射在 scripts/fetch-assets.sh 里，素材侧唯一来源。
 */
export const ANIMS = [
  'idle-breathing',
  'idle-humming',
  'idle-looking',
  'idle-yawn',
  'sleep-snooze',
  'wake-startled',
  'click-happy',
  'click-wave',
  'click-annoyed',
  'drag-startled',
  'talk-screen',
  'talk-thinking',
  'walk-crab',
  'rare-whale'
] as const

export type AnimName = (typeof ANIMS)[number]

export function isAnimName(v: string): v is AnimName {
  return (ANIMS as readonly string[]).includes(v)
}

/**
 * 无缝循环的动画：不等 ended（它们不结束），由调度器按停留时长切换；
 * 其余动画播一遍，ended 后回到调度器。播完停在最后一帧（浏览器的 ended 行为），
 * 正好用来做「反应动画定格」。
 */
export const LOOPING: ReadonlySet<AnimName> = new Set([
  'idle-breathing',
  'sleep-snooze',
  'talk-screen',
  'talk-thinking'
])

/** 待机池 */
export const IDLE_POOL: AnimName[] = ['idle-breathing', 'idle-humming', 'idle-looking', 'idle-yawn']

/** 点击回应池（连击达到阈值换 click-annoyed，在 pet.ts 判定） */
export const CLICK_POOL: AnimName[] = ['click-happy', 'click-wave']
