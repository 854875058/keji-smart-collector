import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { copyFileSync, readdirSync, mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'fs'

/** 将 manifest.json 和 public/ 文件复制到 dist/，并修正 HTML 路径 */
function copyExtensionFiles(): Plugin {
  return {
    name: 'copy-extension-files',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist')
      // 复制 manifest.json
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'))
      // 复制 public/ 下所有文件
      const publicDir = resolve(__dirname, 'public')
      if (existsSync(publicDir)) {
        for (const file of readdirSync(publicDir)) {
          copyFileSync(resolve(publicDir, file), resolve(distDir, file))
        }
      }
      // 移动 HTML 文件到 dist 根目录并修正路径
      const entryDir = resolve(distDir, 'src/entry')
      if (existsSync(entryDir)) {
        for (const file of readdirSync(entryDir)) {
          if (file.endsWith('.html')) {
            let content = readFileSync(resolve(entryDir, file), 'utf-8')
            // 修正路径: ../sidepanel/main.tsx -> assets/sidepanel.js, ../web/main.tsx -> assets/web.js
            content = content.replace(/src="[^"]+"/, (m: string) => {
              if (file.includes('sidepanel')) return 'src="assets/sidepanel.js"'
              if (file.includes('web')) return 'src="assets/web.js"'
              if (file.includes('site')) return 'src="assets/site.js"'
              return m
            })
            // 修正绝对路径为相对路径
            content = content.replace(/href="\//g, 'href="')
            content = content.replace(/src="\//g, 'src="')
            writeFileSync(resolve(distDir, file), content)
          }
        }
        // 清理 src 目录
        try { unlinkSync(resolve(entryDir, 'sidepanel.html')) } catch {}
        try { unlinkSync(resolve(entryDir, 'web.html')) } catch {}
        try { unlinkSync(resolve(entryDir, 'site.html')) } catch {}
        try { rmdirSync(entryDir) } catch {}
        try { rmdirSync(resolve(distDir, 'src')) } catch {}
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyExtensionFiles(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/entry/sidepanel.html'),
        web: resolve(__dirname, 'src/entry/web.html'),
        site: resolve(__dirname, 'src/entry/site.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        // content script 由 vite.content.config.ts 单独构建为 IIFE
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'assets/background.js'
          if (chunkInfo.name === 'content') return 'assets/content.js'
          return 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          // 官网落地页有独立设计体系，样式单独产出，避免与 Tailwind 主包混在一起
          if (assetInfo.name === 'site.css') return 'assets/site.css'
          if (assetInfo.name?.endsWith('.css')) return 'assets/globals.css'
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
