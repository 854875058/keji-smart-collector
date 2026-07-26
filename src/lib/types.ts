/** 笔记来源平台 */
export type SourcePlatform = 'ChatGPT' | 'Claude' | 'Gemini' | 'Grok' | 'Web'

/** 云端同步状态 */
export type CloudStatus = 'none' | 'synced' | 'dirty'

/** 媒体附件 */
export interface MediaAttachment {
  images: ImageInfo[]
  tables: string[]
}

export interface ImageInfo {
  src: string
  alt?: string
}

/** 标注/高亮 */
export interface Annotation {
  text: string
  quote?: string
}

// ── 对话型笔记 ──────────────────────────────────────────

/**
 * 整段对话的元信息。
 * 只有「保存整个对话」产生的笔记才带这个字段，用来支持按会话地址去重更新。
 */
export interface ConversationMeta {
  /** 会话唯一标识，取自会话地址（去掉 query/hash 等易变部分） */
  conversationKey: string
  /** 本次捕获到的问答轮数，用于判断是否有新内容 */
  turnCount: number
  /** 最近一次抓取时间 */
  capturedAt: string
}

// ── 笔记 AI 产物 ──────────────────────────────────────────

/** 思维导图（以 Markdown 缩进列表存储，渲染时解析为树） */
export interface MindMap {
  markdown: string
  updatedAt: string
  model?: string
}

/** 单条笔记内的 AI 问答消息 */
export interface NoteChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

/** 挂在笔记上的 AI 产物，字段全部可选以兼容历史数据 */
export interface SnippetAI {
  mindMap?: MindMap
  chats?: NoteChatMessage[]
}

/** 笔记/收藏片段 */
export interface Snippet {
  id: string
  title: string
  question: string
  answer: string
  contentHtml?: string
  source: SourcePlatform | string
  folder?: string
  tags?: string[]
  timestamp: string
  url: string
  isFavourite?: boolean
  isPinned?: boolean
  cloudStatus?: CloudStatus
  media?: MediaAttachment
  annotations?: Annotation[]
  summary?: string
  /** AI 生成的思维导图与问答记录 */
  ai?: SnippetAI
  /** 整段对话捕获的元信息，仅对话型笔记有 */
  conversation?: ConversationMeta
}

/** AI 提供商预设 */
export interface AIPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  description?: string
}

/** Agent 配置（通用 OpenAI 兼容格式） */
export interface AgentConfig {
  baseUrl: string      // API 基础 URL
  apiKey: string       // API Key
  model: string        // 模型名称（自由输入）
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  presetId?: string    // 使用的预设 ID（可选）
}

/** Obsidian 配置 */
export interface ObsidianConfig {
  vaultPath: string
  folderPrefix: string
  exportFormat: 'markdown' | 'html'
  autoSync: boolean
}

/** 用户设置 */
export interface UserSettings {
  rememberMe: boolean
  agentConfig?: AgentConfig
  obsidianConfig?: ObsidianConfig
}

/** 消息类型：内容脚本 ↔ Background */
export interface SaveSnippetMessage {
  type: 'SAVE_SNIPPET'
  payload: Snippet
}

export interface AddToCollectionMessage {
  type: 'ADD_TO_COLLECTION'
  payload: Snippet
}

export interface CapturePageMessage {
  type: 'CAPTURE_PAGE'
  /** conversation = 强制整段对话捕获，不受当前选区影响 */
  mode: 'page' | 'selection' | 'conversation'
  requestId: string
}

export interface CaptureResultMessage {
  type: 'CAPTURE_RESULT'
  requestId: string
  payload?: Snippet
  error?: string
}

/** 侧边栏请求捕获当前标签页的整段对话 */
export interface CaptureConversationMessage {
  type: 'CAPTURE_CONVERSATION'
}

export type ContentMessage =
  | SaveSnippetMessage
  | AddToCollectionMessage
  | CapturePageMessage
  | CaptureResultMessage
  | CaptureConversationMessage

/** 消息类型：扩展 ↔ Obsidian Native Host */
export interface ObsidianRequest {
  action: 'export' | 'export_batch' | 'import_vault' | 'check_exists' | 'get_vault_path' | 'set_vault_path' | 'list_vault_folders'
  payload: {
    snippet?: Snippet
    snippets?: Snippet[]
    path?: string
    subfolder?: string
  }
}

export interface ObsidianResponse {
  success: boolean
  data?: any
  error?: string
}

/** Agent 消息 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCall?: {
    name: string
    params: Record<string, any>
    result?: string
  }
  timestamp: string
}

/** Agent 工具定义 */
export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, any>
  execute: (params: any, context: AgentContext) => Promise<string>
}

export interface AgentContext {
  snippets: Snippet[]
  folders: string[]
  updateSnippet: (id: string, changes: Partial<Snippet>) => Promise<void>
  addSnippet: (snippet: Snippet) => Promise<void>
}

// ── 智能文件夹 ──────────────────────────────────────────

/** 智能文件夹规则 */
export interface SmartFolderRule {
  field: 'source' | 'tags' | 'title' | 'answer'
  operator: 'contains' | 'equals' | 'startsWith'
  value: string
}

/** 智能文件夹 */
export interface SmartFolder {
  id: string
  name: string
  rules: SmartFolderRule[]
  operator: 'and' | 'or'
}

// ── AI 免费额度与 Pro ──────────────────────────────────────

/** 每日 AI 免费额度用量（服务端为准，本地仅做缓存展示） */
export interface AIUsage {
  /** 本地日期键，形如 2026-07-26，用于跨天自动归零 */
  date: string
  used: number
  limit: number
  /** 缓存归属的用户，切换账号时作废 */
  userId?: string
}

/** 账号权益 */
export interface ProStatus {
  isPro: boolean
  /** ISO 时间；免费用户为空 */
  expiresAt?: string
}
