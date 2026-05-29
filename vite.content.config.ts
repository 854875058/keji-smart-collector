import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/** Content Script 单独构建为 IIFE 格式（Chrome 不支持 content script 使用 ES module） */
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,  // 不清空 dist，和其他构建共存
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'KejiContent',
      fileName: () => 'assets/content.js',
    },
    rollupOptions: {
      output: {
        // 内联所有依赖，不使用 import
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'assets/content.css'
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
