/**
 * 聊天面板 + SSE 流式客户端。
 * 面板挂在宠物容器的 Shadow DOM 里（样式隔离），流式协议约定：
 *   POST {messages:[{role,content}...]} → text/event-stream
 *   data: {"d":"增量文本"} / data: {"e":"错误信息"} / data: [DONE]
 *   非 200 时返回 JSON {message} 由客户端转为错误提示
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantHandle {
  push(delta: string): void
  done(): void
  error(msg: string): void
}

const PANEL_STYLE = `
  .dfy-chat {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    width: 288px;
    max-width: calc(100vw - 24px);
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    background: rgba(32, 34, 40, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
    color: #f2f3f5;
    font: 13px/1.6 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    overflow: hidden;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity .2s, transform .2s;
    pointer-events: auto;
  }
  .dfy-chat.dfy-open { opacity: 1; transform: translateY(0); }
  .dfy-chat-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,.1);
  }
  .dfy-chat-close {
    border: 0; background: none; color: inherit; font-size: 15px;
    cursor: pointer; padding: 0 4px; line-height: 1; opacity: .7;
  }
  .dfy-chat-close:hover { opacity: 1; }
  .dfy-chat-list {
    max-height: 240px; min-height: 60px; overflow-y: auto;
    padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  }
  .dfy-msg { padding: 6px 10px; border-radius: 10px; max-width: 86%; word-break: break-word; white-space: pre-wrap; }
  .dfy-msg-user { align-self: flex-end; background: #3b6ea5; color: #fff; }
  .dfy-msg-bot { align-self: flex-start; background: rgba(255,255,255,.1); }
  .dfy-msg-err { align-self: center; color: #b9bcc4; font-size: 12px; background: none; padding: 2px; }
  .dfy-chat-input { display: flex; gap: 8px; padding: 8px 10px 10px; border-top: 1px solid rgba(255,255,255,.1); }
  .dfy-chat-input input {
    flex: 1; min-width: 0; border-radius: 8px; border: 1px solid rgba(255,255,255,.18);
    background: rgba(255,255,255,.08); color: inherit; font: inherit; padding: 5px 10px; outline: none;
  }
  .dfy-chat-input input:focus { border-color: rgba(255,255,255,.4); }
  .dfy-chat-input button {
    border: 0; border-radius: 8px; background: #3b6ea5; color: #fff;
    font: inherit; padding: 5px 12px; cursor: pointer;
  }
  .dfy-chat-input button:disabled { opacity: .5; cursor: default; }
`

export class ChatPanel {
  private root: HTMLDivElement
  private list: HTMLDivElement
  private input: HTMLInputElement
  private sendBtn: HTMLButtonElement
  private sending = false
  private openState = false
  private onSend: (text: string) => void
  private onClose: () => void

  constructor(shadow: ShadowRoot, handlers: { onSend(text: string): void; onClose(): void }) {
    this.onSend = handlers.onSend
    this.onClose = handlers.onClose

    const style = document.createElement('style')
    style.textContent = PANEL_STYLE
    shadow.appendChild(style)

    this.root = document.createElement('div')
    this.root.className = 'dfy-chat'
    this.root.style.display = 'none'

    const head = document.createElement('div')
    head.className = 'dfy-chat-head'
    head.textContent = '和大肥鱼聊聊'
    const close = document.createElement('button')
    close.className = 'dfy-chat-close'
    close.textContent = '×'
    close.setAttribute('aria-label', '关闭聊天')
    close.addEventListener('click', () => this.close())
    head.appendChild(close)

    this.list = document.createElement('div')
    this.list.className = 'dfy-chat-list'

    const tip = document.createElement('div')
    tip.className = 'dfy-msg dfy-msg-err'
    tip.textContent = '双击鱼也能打开/关闭'
    this.list.appendChild(tip)

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.placeholder = '说点什么…（Enter 发送）'
    this.input.maxLength = 500
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit()
      if (e.key === 'Escape') this.close()
      e.stopPropagation() // 别把按键漏给宿主页面（如站内搜索快捷键）
    })

    this.sendBtn = document.createElement('button')
    this.sendBtn.textContent = '发送'
    this.sendBtn.addEventListener('click', () => this.submit())

    const row = document.createElement('div')
    row.className = 'dfy-chat-input'
    row.append(this.input, this.sendBtn)

    this.root.append(head, this.list, row)
    shadow.appendChild(this.root)
  }

  get isOpen(): boolean {
    return this.openState
  }

  open(): void {
    this.openState = true
    this.root.style.display = 'flex'
    // 先显示再下一帧加 class，让 transition 有起点
    requestAnimationFrame(() => this.root.classList.add('dfy-open'))
    this.clampIntoViewport()
    this.input.focus()
  }

  close(): void {
    if (!this.openState) return
    this.openState = false
    this.root.classList.remove('dfy-open')
    // 等 transition 走完再隐藏（200ms）
    window.setTimeout(() => {
      if (!this.openState) this.root.style.display = 'none'
    }, 220)
    this.onClose()
  }

  /** 面板贴着宠物，宠物贴着视口左/右缘时把面板水平拉回视口内 */
  private clampIntoViewport(): void {
    this.root.style.marginLeft = '0'
    const r = this.root.getBoundingClientRect()
    const vw = window.innerWidth
    let shift = 0
    if (r.left < 8) shift = 8 - r.left
    else if (r.right > vw - 8) shift = vw - 8 - r.right
    if (shift !== 0) this.root.style.marginLeft = `${shift}px`
  }

  private submit(): void {
    const text = this.input.value.trim()
    if (!text || this.sending) return
    this.input.value = ''
    this.onSend(text)
  }

  setSending(v: boolean): void {
    this.sending = v
    this.sendBtn.disabled = v
    this.input.disabled = v
    if (!v) this.input.focus()
  }

  addUser(text: string): void {
    this.appendMsg('dfy-msg-user', text)
  }

  /** 一次性提示（错误/降级说明），不进对话流样式 */
  addNote(text: string): void {
    this.appendMsg('dfy-msg-err', text)
  }

  startAssistant(): AssistantHandle {
    const el = this.appendMsg('dfy-msg-bot', '')
    const scroll = () => (this.list.scrollTop = this.list.scrollHeight)
    return {
      push: (delta) => {
        el.textContent += delta
        scroll()
      },
      done: () => {
        if (!el.textContent) el.textContent = '…'
        scroll()
      },
      error: (msg) => {
        el.className = 'dfy-msg dfy-msg-err'
        el.textContent = msg
        scroll()
      }
    }
  }

  private appendMsg(cls: string, text: string): HTMLDivElement {
    const el = document.createElement('div')
    el.className = `dfy-msg ${cls}`
    el.textContent = text
    this.list.appendChild(el)
    this.list.scrollTop = this.list.scrollHeight
    return el
  }
}

/**
 * 流式对话请求。约定见文件头。任何失败都以 onError 收场，
 * 调用方只需处理三个回调；返回 AbortController 供中断（关面板/销毁时用）。
 */
export function streamChat(
  url: string,
  messages: ChatMessage[],
  handlers: {
    onDelta(text: string): void
    onDone(): void
    onError(msg: string): void
  },
  timeoutMs = 60000
): AbortController {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  const fail = (msg: string) => {
    window.clearTimeout(timer)
    handlers.onError(msg)
  }

  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: ctrl.signal
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        let msg = `连接不上大肥鱼（${res.status}）`
        try {
          const data = await res.json()
          if (typeof data.message === 'string') msg = data.message
        } catch {
          /* 保留默认文案 */
        }
        fail(msg)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE 事件以空行分隔；一次网络包可能含多个事件
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') {
              window.clearTimeout(timer)
              handlers.onDone()
              return
            }
            try {
              const evt = JSON.parse(payload)
              if (typeof evt.e === 'string') {
                fail(evt.e)
                return
              }
              if (typeof evt.d === 'string') handlers.onDelta(evt.d)
            } catch {
              /* 忽略解析不了的行 */
            }
          }
        }
      }
      // 流自然结束但没收到 [DONE]：按完成处理
      window.clearTimeout(timer)
      handlers.onDone()
    })
    .catch(() => fail('大肥鱼走神了，稍后再试'))

  return ctrl
}
