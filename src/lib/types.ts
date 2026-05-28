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
}

/** Agent 配置 */
export interface AgentConfig {
  provider: 'claude' | 'openai' | 'gemini'
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
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
  mode: 'page' | 'selection'
  requestId: string
}

export interface CaptureResultMessage {
  type: 'CAPTURE_RESULT'
  requestId: string
  payload?: Snippet
  error?: string
}

export type ContentMessage =
  | SaveSnippetMessage
  | AddToCollectionMessage
  | CapturePageMessage
  | CaptureResultMessage

/** 消息类型：扩展 ↔ Obsidian Native Host */
export interface ObsidianRequest {
  action: 'export' | 'export_batch' | 'check_exists' | 'get_vault_path'
  payload: {
    snippet?: Snippet
    snippets?: Snippet[]
    path?: string
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
