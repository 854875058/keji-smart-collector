import type { Snippet, AgentConfig, ObsidianConfig } from './types'

// 序列化 Promise 链，防止并发写入冲突
let _updateQueue: Promise<void> = Promise.resolve()

/** chrome.storage.local 封装层 */
export const storage = {
  // ── 笔记 ──────────────────────────────────────────
  async getSnippets(): Promise<Snippet[]> {
    const { snippets } = await chrome.storage.local.get('snippets')
    return snippets || []
  },

  async saveSnippet(snippet: Snippet): Promise<void> {
    const snippets = await this.getSnippets()
    await chrome.storage.local.set({
      snippets: [{ cloudStatus: 'none', ...snippet }, ...snippets],
    })
  },

  async deleteSnippet(id: string): Promise<void> {
    const snippets = await this.getSnippets()
    await chrome.storage.local.set({
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
      await chrome.storage.local.set({ snippets: updated })
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
    await chrome.storage.local.set({ collectionItems: items })
  },

  async addCollectionItem(item: Snippet): Promise<void> {
    const items = await this.getCollectionItems()
    await chrome.storage.local.set({ collectionItems: [...items, item] })
  },

  async removeCollectionItem(id: string): Promise<void> {
    const items = await this.getCollectionItems()
    await chrome.storage.local.set({ collectionItems: items.filter((i) => i.id !== id) })
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
}
