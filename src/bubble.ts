/** 台词气泡：挂在宠物容器上方的独立元素，自动消失 */
export class Bubble {
  private el: HTMLDivElement
  private hideTimer = 0
  private visible = false

  constructor(shadow: ShadowRoot) {
    this.el = document.createElement('div')
    // 样式写死在元素上：宿主站点的 CSS 进不来 Shadow DOM，这里的观感是自洽的；
    // 半透明深色底在明暗两种站点主题下都可读
    const s = this.el.style
    s.position = 'absolute'
    s.left = '50%'
    s.bottom = 'calc(100% + 12px)'
    s.transform = 'translateX(-50%) translateY(4px)'
    s.maxWidth = '230px'
    s.padding = '8px 12px'
    s.borderRadius = '12px'
    s.background = 'rgba(32, 34, 40, 0.92)'
    s.border = '1px solid rgba(255, 255, 255, 0.14)'
    s.color = '#f2f3f5'
    s.font = '13px/1.55 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    s.textAlign = 'center'
    s.wordBreak = 'break-word'
    s.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.18)'
    s.opacity = '0'
    s.transition = 'opacity 0.25s, transform 0.25s'
    s.pointerEvents = 'none'
    s.whiteSpace = 'normal'
    // 气泡小尾巴
    const tail = document.createElement('style')
    tail.textContent = `
      .dfy-bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 100%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: rgba(32, 34, 40, 0.92);
      }
    `
    shadow.appendChild(tail)
    this.el.className = 'dfy-bubble'
    shadow.appendChild(this.el)
  }

  /** 显示一句话；durationMs 后自动隐藏。宠物贴近视口顶部时翻到下方 */
  say(text: string, durationMs = 10000, flipBelow = false): void {
    this.el.textContent = text
    this.el.style.bottom = flipBelow ? 'auto' : 'calc(100% + 12px)'
    this.el.style.top = flipBelow ? 'calc(100% + 12px)' : 'auto'
    this.el.style.opacity = '1'
    this.el.style.transform = 'translateX(-50%) translateY(0)'
    this.visible = true
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.hide(), durationMs)
  }

  hide(): void {
    if (!this.visible) return
    this.visible = false
    window.clearTimeout(this.hideTimer)
    this.el.style.opacity = '0'
    this.el.style.transform = 'translateX(-50%) translateY(4px)'
  }

  destroy(): void {
    window.clearTimeout(this.hideTimer)
    this.el.remove()
  }
}
