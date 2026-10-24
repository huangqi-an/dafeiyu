import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'iife'],
  // IIFE 全局变量名：CDN 场景 <script src> 后用 Dafeiyu.mount({...})
  globalName: 'Dafeiyu',
  dts: true,
  target: 'es2019',
  clean: true,
  // tsup 的 iife 产物默认叫 index.global.js，统一改成包名，
  // 与 package.json 的 unpkg/jsdelivr 字段保持一致
  onSuccess: 'mv dist/index.global.js dist/dafeiyu.iife.js'
})
