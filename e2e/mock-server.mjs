// mock 后端：whisper + SSE chat（带消息计数回显、600ms 首字延迟），端口 4323
import http from 'node:http'
const PORT = 4323
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
}
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  if (url.pathname === '/whisper' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', ...CORS })
    return res.end(JSON.stringify({ line: `mock 碎碎念 №${Math.floor(Math.random() * 1000)}`, source: 'mock' }))
  }
  if (url.pathname === '/chat' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let last = '', count = 0
      try {
        const msgs = JSON.parse(body).messages || []
        count = msgs.length
        last = msgs[msgs.length - 1]?.content || ''
      } catch {}
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...CORS })
      if (last.includes('err')) {
        res.write('data: {"e":"mock 后端故意报错"}\n\n'); res.write('data: [DONE]\n\n'); return res.end()
      }
      const reply = `你说的是「${last}」。（收到 ${count} 条消息）我是 mock 大肥鱼，会流式地一个字一个字回答。`
      setTimeout(() => {
        let i = 0
        const timer = setInterval(() => {
          i += 2
          res.write(`data: ${JSON.stringify({ d: reply.slice(i - 2, i) })}\n\n`)
          if (i >= reply.length) { clearInterval(timer); res.write('data: [DONE]\n\n'); res.end() }
        }, 40)
      }, 600)
    })
    return
  }
  res.writeHead(404, CORS); res.end('not found')
}).listen(PORT, () => console.log(`mock on :${PORT}`))
