/** 右键菜单：Shadow DOM 内的小面板，点外部/ESC 关闭 */
export interface MenuHandlers {
  onSay(): void
  onFeed(): void
  onToggleSleep(): void
  onResetPos(): void
  onChat(): void
}

const MENU_STYLE = `
  .dfy-menu {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    min-width: 148px;
    border-radius: 12px;
    background: rgba(32, 34, 40, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
    color: #f2f3f5;
    font: 13px/1.6 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    overflow: hidden;
    display: none;
    pointer-events: auto;
  }
  .dfy-menu.dfy-open { display: block; }
  .dfy-menu-head {
    padding: 7px 12px 5px;
    font-size: 12px;
    color: #b9bcc4;
    border-bottom: 1px solid rgba(255,255,255,.1);
  }
  .dfy-menu button {
    display: block; width: 100%; text-align: left;
    padding: 7px 14px; border: 0; background: none;
    color: inherit; font: inherit; cursor: pointer;
  }
  .dfy-menu button:hover { background: rgba(255,255,255,.09); }
`

export class PetMenu {
  private root: HTMLDivElement
  private head: HTMLDivElement
  private sleepBtn: HTMLButtonElement
  private chatBtn: HTMLButtonElement
  private openState = false
  private handlers: MenuHandlers
  private host: HTMLDivElement
  private onDocDown: (e: PointerEvent) => void
  private onKey: (e: KeyboardEvent) => void
  private onScroll: () => void

  constructor(shadow: ShadowRoot, host: HTMLDivElement, handlers: MenuHandlers) {
    this.handlers = handlers
    this.host = host

    const style = document.createElement('style')
    style.textContent = MENU_STYLE
    shadow.appendChild(style)

    this.root = document.createElement('div')
    this.root.className = 'dfy-menu'

    this.head = document.createElement('div')
    this.head.className = 'dfy-menu-head'
    this.root.appendChild(this.head)

    const item = (label: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button')
      b.textContent = label
      b.addEventListener('click', () => {
        this.close()
        fn()
      })
      this.root.appendChild(b)
      return b
    }
    item('💬 说句话', handlers.onSay)
    item('🍚 喂食', handlers.onFeed)
    this.sleepBtn = item('😴 睡觉', handlers.onToggleSleep)
    this.chatBtn = item('💬 聊天', handlers.onChat)
    item('🎯 回原位', handlers.onResetPos)

    shadow.appendChild(this.root)

    // 点菜单/宠物以外任意处关闭；composedPath 穿透 shadow DOM
    this.onDocDown = (e) => {
      if (!this.openState) return
      if (!e.composedPath().includes(this.host)) this.close()
    }
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.openState) this.close()
    }
    this.onScroll = () => this.close()
    document.addEventListener('pointerdown', this.onDocDown, true)
    document.addEventListener('keydown', this.onKey)
    window.addEventListener('scroll', this.onScroll, { passive: true })
  }

  get isOpen(): boolean {
    return this.openState
  }

  /**
   * @param affinity  好感数值（头部展示）
   * @param levelName 档位名
   * @param sleeping  当前是否睡着（决定「睡觉/叫醒」文案）
   * @param canChat   是否有聊天能力（无则隐藏聊天项）
   */
  open(affinity: number, levelName: string, sleeping: boolean, canChat: boolean): void {
    this.head.textContent = `大肥鱼 · 好感 ${affinity}（${levelName}）`
    this.sleepBtn.textContent = sleeping ? '⏰ 叫醒' : '😴 睡觉'
    this.chatBtn.style.display = canChat ? '' : 'none'
    this.openState = true
    this.root.classList.add('dfy-open')
    // 贴视口边缘时水平拉回
    this.root.style.marginLeft = '0'
    const r = this.root.getBoundingClientRect()
    const vw = window.innerWidth
    let shift = 0
    if (r.left < 8) shift = 8 - r.left
    else if (r.right > vw - 8) shift = vw - 8 - r.right
    if (shift !== 0) this.root.style.marginLeft = `${shift}px`
  }

  close(): void {
    this.openState = false
    this.root.classList.remove('dfy-open')
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown, true)
    document.removeEventListener('keydown', this.onKey)
    window.removeEventListener('scroll', this.onScroll)
    this.root.remove()
  }
}
