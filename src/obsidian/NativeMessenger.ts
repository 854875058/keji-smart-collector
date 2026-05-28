import type { Snippet, ObsidianRequest, ObsidianResponse } from '../lib/types'
import { snippetToMarkdown, snippetToFilename, snippetToFolderPath } from './MarkdownExporter'

const NATIVE_HOST_NAME = 'com.keji.obsidian'

/** 与 Obsidian Native Messaging Host 通信 */
export class NativeMessenger {
  private port: chrome.runtime.Port | null = null

  /** 连接到 Native Host */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
        this.port.onDisconnect.addListener(() => {
          this.port = null
        })
        resolve()
      } catch (err) {
        reject(new Error(`无法连接到 Obsidian Native Host: ${err}`))
      }
    })
  }

  /** 发送请求并等待响应 */
  private sendRequest(request: ObsidianRequest): Promise<ObsidianResponse> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error('未连接到 Native Host'))
        return
      }

      const listener = (response: ObsidianResponse) => {
        this.port!.onMessage.removeListener(listener)
        resolve(response)
      }

      this.port.onMessage.addListener(listener)
      this.port.postMessage(request)

      // 超时处理
      setTimeout(() => {
        this.port!.onMessage.removeListener(listener)
        reject(new Error('Native Host 响应超时'))
      }, 10000)
    })
  }

  /** 检查 Native Host 是否可用 */
  async isAvailable(): Promise<boolean> {
    try {
      await this.connect()
      const response = await this.sendRequest({ action: 'get_vault_path', payload: {} })
      return response.success
    } catch {
      return false
    }
  }

  /** 获取 Vault 路径 */
  async getVaultPath(): Promise<string | null> {
    const response = await this.sendRequest({ action: 'get_vault_path', payload: {} })
    return response.success ? response.data?.path : null
  }

  /** 检查文件是否已存在 */
  async checkExists(filePath: string): Promise<boolean> {
    const response = await this.sendRequest({
      action: 'check_exists',
      payload: { path: filePath },
    })
    return response.success && response.data?.exists
  }

  /** 导出单条笔记 */
  async exportSnippet(snippet: Snippet, vaultPath: string): Promise<boolean> {
    const markdown = snippetToMarkdown(snippet)
    const filename = snippetToFilename(snippet)
    const folder = snippetToFolderPath(snippet)
    const fullPath = `${vaultPath}/${folder}/${filename}`

    const response = await this.sendRequest({
      action: 'export',
      payload: {
        snippet,
        path: fullPath,
      },
    })
    return response.success
  }

  /** 批量导出笔记 */
  async exportBatch(snippets: Snippet[], vaultPath: string): Promise<{
    success: number
    failed: number
    errors: string[]
  }> {
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const snippet of snippets) {
      try {
        const ok = await this.exportSnippet(snippet, vaultPath)
        if (ok) success++
        else {
          failed++
          errors.push(`${snippet.title}: 导出失败`)
        }
      } catch (err: any) {
        failed++
        errors.push(`${snippet.title}: ${err.message}`)
      }
    }

    return { success, failed, errors }
  }

  /** 断开连接 */
  disconnect() {
    if (this.port) {
      this.port.disconnect()
      this.port = null
    }
  }
}

export const nativeMessenger = new NativeMessenger()
