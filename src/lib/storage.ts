import type { Snippet, AgentConfig, ObsidianConfig, SmartFolder } from './types'

// 序列化 Promise 链，防止并发写入冲突
let _updateQueue: Promise<void> = Promise.resolve()

/**
 * 写入 chrome.storage.local 并检查结果。
 *
 * chrome.storage.local.set 在超出配额时不会 reject，而是把错误挂在
 * chrome.runtime.lastError 上静默失败——调用方会以为已经存上了。
 * 这里显式检查并抛出，让上层能给出可见提示。
 */
async function setChecked(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(items)
  const err = chrome.runtime.lastError
  if (err) {
    const message = err.message || '未知错误'
    if (/quota/i.test(message)) {
      throw new Error(
        '本地存储空间已满，无法保存。请先删除部分笔记，或在扩展详情页确认已启用无限存储权限。'
      )
    }
    throw new Error(`保存失败：${message}`)
  }
}

/** chrome.storage.local 封装层 */
export const storage = {
  // ── 笔记 ──────────────────────────────────────────
  async getSnippets(): Promise<Snippet[]> {
    const { snippets } = await chrome.storage.local.get('snippets')
    return snippets || []
  },

  async saveSnippet(snippet: Snippet): Promise<void> {
    const snippets = await this.getSnippets()
    await setChecked({
      snippets: [{ cloudStatus: 'none', ...snippet }, ...snippets],
    })
  },

  /**
   * 查找同一会话已收藏的对话型笔记。
   * 只匹配带 conversation 元信息的笔记，避免把普通网页笔记误判成同一会话。
   */
  async findConversation(conversationKey: string): Promise<Snippet | null> {
    if (!conversationKey) return null
    const snippets = await this.getSnippets()
    return (
      snippets.find((s) => s.conversation?.conversationKey === conversationKey) ||
      null
    )
  },

  async deleteSnippet(id: string): Promise<void> {
    const snippets = await this.getSnippets()
    await setChecked({
      snippets: snippets.filter((s) => s.id !== id),
    })
  },

  async updateSnippet(id: string, changes: Partial<Snippet>): Promise<void> {
    _updateQueue = _updateQueue.then(async () => {
      const snippets = await this.getSnippets()
      const updated = snippets.map((s) => {
        if (s.id !== id) return s
        const merged = { ...s, ...changes }
        if (s.cloudStatus === 'synced' && !changes.cloudStatus) {
          merged.cloudStatus = 'dirty'
        }
        return merged
      })
      await setChecked({ snippets: updated })
    })
    return _updateQueue
  },

  // ── 文件夹 ──────────────────────────────────────────
  async getFolders(): Promise<string[]> {
    const { folders } = await chrome.storage.local.get('folders')
    return folders || []
  },

  async addFolder(name: string): Promise<void> {
    const folders = await this.getFolders()
    if (!folders.includes(name)) {
      await chrome.storage.local.set({ folders: [...folders, name] })
    }
  },

  async deleteFolder(name: string): Promise<void> {
    const folders = await this.getFolders()
    const snippets = await this.getSnippets()
    const remaining = snippets.filter((s) => s.folder !== name)
    const updatedFolders = folders.filter((f) => f !== name)
    const { activeFolder } = await chrome.storage.local.get('activeFolder')
    const { recentFolders } = await chrome.storage.local.get('recentFolders')
    await chrome.storage.local.set({
      folders: updatedFolders,
      snippets: remaining,
      activeFolder: activeFolder === name ? '' : activeFolder,
      recentFolders: (recentFolders || []).filter((f: string) => f !== name),
    })
  },

  // ── 当前文件夹 ──────────────────────────────────────
  async getActiveFolder(): Promise<string> {
    const { activeFolder } = await chrome.storage.local.get('activeFolder')
    return activeFolder || ''
  },

  async setActiveFolder(folder: string): Promise<void> {
    await chrome.storage.local.set({ activeFolder: folder })
  },

  // ── 最近使用文件夹 ──────────────────────────────────
  async getRecentFolders(): Promise<string[]> {
    const { recentFolders } = await chrome.storage.local.get('recentFolders')
    return recentFolders || []
  },

  async setRecentFolders(folders: string[]): Promise<void> {
    await chrome.storage.local.set({ recentFolders: folders })
  },

  // ── 收集箱 ──────────────────────────────────────────
  async getPendingCollectionItem(): Promise<Snippet | null> {
    const { pendingCollectionItem } = await chrome.storage.local.get('pendingCollectionItem')
    return pendingCollectionItem || null
  },

  async setPendingCollectionItem(item: Snippet | null): Promise<void> {
    await chrome.storage.local.set({ pendingCollectionItem: item })
  },

  async getCollectionModeActive(): Promise<boolean> {
    const { collectionModeActive } = await chrome.storage.local.get('collectionModeActive')
    return !!collectionModeActive
  },

  async setCollectionModeActive(active: boolean): Promise<void> {
    await chrome.storage.local.set({ collectionModeActive: active })
  },

  async getCollectionItems(): Promise<Snippet[]> {
    const { collectionItems } = await chrome.storage.local.get('collectionItems')
    return collectionItems || []
  },

  async setCollectionItems(items: Snippet[]): Promise<void> {
    await setChecked({ collectionItems: items })
  },

  async addCollectionItem(item: Snippet): Promise<void> {
    const items = await this.getCollectionItems()
    await setChecked({ collectionItems: [...items, item] })
  },

  async removeCollectionItem(id: string): Promise<void> {
    const items = await this.getCollectionItems()
    await setChecked({ collectionItems: items.filter((i) => i.id !== id) })
  },

  async clearCollectionItems(): Promise<void> {
    await chrome.storage.local.set({ collectionItems: [] })
  },

  // ── 用户设置 ──────────────────────────────────────────
  async getRememberMe(): Promise<boolean> {
    const { rememberMe } = await chrome.storage.local.get('rememberMe')
    return !!rememberMe
  },

  async setRememberMe(value: boolean): Promise<void> {
    await chrome.storage.local.set({ rememberMe: value })
  },

  // ── Agent 配置 ──────────────────────────────────────
  async getAgentConfig(): Promise<AgentConfig | null> {
    const { agentConfig } = await chrome.storage.local.get('agentConfig')
    return agentConfig || null
  },

  async setAgentConfig(config: AgentConfig): Promise<void> {
    await chrome.storage.local.set({ agentConfig: config })
  },

  // ── Obsidian 配置 ──────────────────────────────────
  async getObsidianConfig(): Promise<ObsidianConfig | null> {
    const { obsidianConfig } = await chrome.storage.local.get('obsidianConfig')
    return obsidianConfig || null
  },

  async setObsidianConfig(config: ObsidianConfig): Promise<void> {
    await chrome.storage.local.set({ obsidianConfig: config })
  },

  // ── 智能文件夹 ──────────────────────────────────────────
  async getSmartFolders(): Promise<SmartFolder[]> {
    const { smartFolders } = await chrome.storage.local.get('smartFolders')
    return smartFolders || []
  },

  async addSmartFolder(folder: SmartFolder): Promise<void> {
    const folders = await this.getSmartFolders()
    await chrome.storage.local.set({ smartFolders: [...folders, folder] })
  },

  async deleteSmartFolder(id: string): Promise<void> {
    const folders = await this.getSmartFolders()
    await chrome.storage.local.set({ smartFolders: folders.filter((f) => f.id !== id) })
  },
}
