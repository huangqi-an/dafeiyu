export interface PetEndpoints {
  /** 碎碎念后端：GET → { line: string }；失败自动降级本地台词池 */
  whisper?: string
  /** 聊天后端：POST {messages:[{role,content}...]} → SSE（data:{"d":增量}|{"e":错误}|[DONE]） */
  chat?: string
}

export type CornerPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface DafeiyuOptions {
  /** 素材目录 URL（末尾带不带 / 都行）。默认 jsDelivr，发布后生效 */
  assetBase?: string
  /** 宠物显示宽度 px */
  size?: number
  /** 初始位置：角落名，或归一化中心坐标 {x,y}（0~1） */
  position?: CornerPosition | { x: number; y: number }
  /** 容器 z-index */
  zIndex?: number
  /** 追加台词（内置池之外）。传空数组则只用内置池 */
  lines?: string[]
  /** 自动说话间隔（秒），实际 ±30% 抖动 */
  whisperIntervalSec?: number
  /** 宠物显示名（菜单头部、聊天面板标题），默认「大肥鱼」 */
  name?: string
  /** 视口 <768px 时是否显示，默认隐藏 */
  enabledOnMobile?: boolean
  /** whisper 请求是否附带当前页面标题/路径（后端可据此说应景台词），默认开 */
  pageContext?: boolean
  /** AI 后端地址：配了才有碎碎念拉取和双击聊天面板，失败降级本地台词池 */
  endpoints?: PetEndpoints
}

export const DEFAULTS = {
  assetBase: 'https://cdn.jsdelivr.net/npm/dafeiyu/assets/',
  // 素材是 16:9 画幅、角色只占画面中段，宽度给足角色才有存在感
  size: 240,
  zIndex: 9999,
  whisperIntervalSec: 120,
  enabledOnMobile: false,
  pageContext: true
} as const

/**
 * 内置台词池：站点无关的通用句子。站点要有人设/导览语气，用 options.lines 追加；
 * 二期接 AI 后，台词由后端生成，本地池作为降级保留。
 */
export const BUILTIN_LINES: string[] = [
  '咕噜咕噜～',
  '这片网页的水质不错。',
  '你今天喝水了吗？',
  '摸鱼要适度哦。',
  '嗯？在看我？',
  '听说早睡的人运气不会太差。',
  '代码写完了吗？没写完也没事。',
  '风平浪静，适合发呆。',
  '要不要休息一下眼睛？',
  '我是一条有梦想的鱼。',
  '这个 bug 肯定不怪你。',
  '悄悄冒个泡。',
  '深水区禁止喧哗。',
  '今天也是元气满满的一天。',
  '别刷了，去看点长文章吧。',
  '有点困……先眯一会儿。',
  '鲸鱼是我远房亲戚，别提了。',
  '你回来啦。',
  '慢慢来，比较快。',
  '页面加载得还顺滑吗？',
  '周五的下午最漫长。',
  '深海信号不好，再说一遍？',
  '（吐了一串泡泡）',
  '值班中，有事戳我。'
]
