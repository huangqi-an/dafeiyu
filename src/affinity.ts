/**
 * 好感度：喂食 +2、摸头 +1、聊天每条 +2，存 localStorage。
 * 门槛效果在 pet.ts 里按档位解锁（详见 LEVELS 注释）。
 */

const KEY = 'dafeiyu:affinity'

export interface AffinityLevel {
  at: number
  name: string
}

/**
 * 档位与解锁效果：
 *   陌生(0)    无
 *   熟悉(30)   摸头有 1/3 概率冒泡回应
 *   老朋友(100) 蓝鲸现世彩蛋概率 2% → 5%
 *   挚友(300)   台词池追加 3 句专属台词
 */
export const LEVELS: AffinityLevel[] = [
  { at: 0, name: '陌生' },
  { at: 30, name: '熟悉' },
  { at: 100, name: '老朋友' },
  { at: 300, name: '挚友' }
]

/** 挚友解锁的专属台词 */
export const FRIEND_LINES = [
  '都认识这么久了，还是觉得你最好。',
  '老朋友来啦，今天位置给你留着呢。',
  '陪我这么久，深海里也数你脸熟。'
]

export function loadAffinity(): number {
  try {
    const n = Number(JSON.parse(localStorage.getItem(KEY) || '0'))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

export function saveAffinity(n: number): void {
  try {
    localStorage.setItem(KEY, String(Math.floor(n)))
  } catch {
    /* 存不进就算了 */
  }
}

export function addAffinity(delta: number): number {
  const n = loadAffinity() + delta
  saveAffinity(n)
  return n
}

export function levelOf(n: number): AffinityLevel {
  let cur = LEVELS[0]
  for (const lv of LEVELS) if (n >= lv.at) cur = lv
  return cur
}
