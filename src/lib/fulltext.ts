/**
 * 全文索引模块 - 支持中文 bigram 和英文分词
 */

/** 判断字符是否为中文 */
function isChinese(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x4e00 && code <= 0x9fff
}

/** 判断字符是否为字母或数字 */
function isAlphaNum(ch: string): boolean {
  return /[a-z0-9]/i.test(ch)
}

/**
 * 分词器：中文 bigram + 英文单词
 * "你好世界Hello" -> ["你好", "好世", "世界", "hello"]
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase()
  let i = 0

  while (i < lower.length) {
    const ch = lower[i]

    if (isChinese(ch)) {
      // 中文 bigram：取当前字和下一个字组成词组
      tokens.push(ch)
      if (i + 1 < lower.length && isChinese(lower[i + 1])) {
        tokens.push(ch + lower[i + 1])
      }
      i++
    } else if (isAlphaNum(ch)) {
      // 英文/数字：连续字符作为一个 token
      let word = ''
      while (i < lower.length && isAlphaNum(lower[i])) {
        word += lower[i]
        i++
      }
      if (word.length >= 2) {
        tokens.push(word)
      }
    } else {
      i++
    }
  }

  return tokens
}

/** 倒排索引条目 */
interface IndexEntry {
  docId: string
  positions: number[]
}

/** 全文索引类 */
export class FullTextIndex {
  // token -> 文档 ID 列表（含位置信息）
  private invertedIndex: Map<string, IndexEntry[]> = new Map()
  // docId -> 文档长度
  private docLengths: Map<string, number> = new Map()
  // 总文档数
  private totalDocs = 0
  // 平均文档长度
  private avgDocLength = 0
  // 总 token 数（用于计算平均长度）
  private totalTokens = 0

  /**
   * 添加文档到索引
   * @param docId 文档唯一标识
   * @param text 文档文本内容
   */
  addDocument(docId: string, text: string): void {
    const tokens = tokenize(text)
    this.docLengths.set(docId, tokens.length)
    this.totalTokens += tokens.length
    this.totalDocs++
    this.avgDocLength = this.totalTokens / this.totalDocs

    // 记录每个 token 的位置
    const tokenPositions = new Map<string, number[]>()
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (!tokenPositions.has(token)) {
        tokenPositions.set(token, [])
      }
      tokenPositions.get(token)!.push(i)
    }

    // 更新倒排索引
    for (const [token, positions] of tokenPositions) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, [])
      }
      this.invertedIndex.get(token)!.push({ docId, positions })
    }
  }

  /**
   * 批量构建索引
   * @param documents 文档列表 [{ id, text }]
   */
  buildIndex(documents: { id: string; text: string }[]): void {
    this.clear()
    for (const doc of documents) {
      this.addDocument(doc.id, doc.text)
    }
  }

  /** 清空索引 */
  clear(): void {
    this.invertedIndex.clear()
    this.docLengths.clear()
    this.totalDocs = 0
    this.avgDocLength = 0
    this.totalTokens = 0
  }

  /**
   * 移除文档
   * @param docId 文档 ID
   */
  removeDocument(docId: string): void {
    const length = this.docLengths.get(docId) || 0
    this.totalTokens -= length
    this.docLengths.delete(docId)
    this.totalDocs = Math.max(0, this.totalDocs - 1)
    this.avgDocLength = this.totalDocs > 0 ? this.totalTokens / this.totalDocs : 0

    // 从倒排索引中移除
    for (const [token, entries] of this.invertedIndex) {
      const filtered = entries.filter((e) => e.docId !== docId)
      if (filtered.length === 0) {
        this.invertedIndex.delete(token)
      } else {
        this.invertedIndex.set(token, filtered)
      }
    }
  }

  /**
   * BM25 搜索
   * @param query 查询文本
   * @param topK 返回前 K 个结果
   * @param k1 词频饱和参数 (默认 1.5)
   * @param b 文档长度归一化参数 (默认 0.75)
   */
  search(
    query: string,
    topK: number = 10,
    k1: number = 1.5,
    b: number = 0.75
  ): { docId: string; score: number }[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    // 去重查询 token
    const uniqueTokens = [...new Set(queryTokens)]

    // 每个文档的得分
    const scores = new Map<string, number>()

    for (const token of uniqueTokens) {
      const entries = this.invertedIndex.get(token)
      if (!entries || entries.length === 0) continue

      // IDF: log((N - n + 0.5) / (n + 0.5) + 1)
      const n = entries.length
      const idf = Math.log((this.totalDocs - n + 0.5) / (n + 0.5) + 1)

      for (const entry of entries) {
        const tf = entry.positions.length
        const dl = this.docLengths.get(entry.docId) || 0

        // BM25 公式
        const numerator = tf * (k1 + 1)
        const denominator = tf + k1 * (1 - b + (b * dl) / this.avgDocLength)
        const score = idf * (numerator / denominator)

        scores.set(entry.docId, (scores.get(entry.docId) || 0) + score)
      }
    }

    // 排序并返回 topK
    return [...scores.entries()]
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * 获取包含指定 token 的文档数
   * @param token token 字符串
   */
  getTokenDocCount(token: string): number {
    return this.invertedIndex.get(token)?.length || 0
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    totalDocs: number
    totalTokens: number
    avgDocLength: number
    vocabularySize: number
  } {
    return {
      totalDocs: this.totalDocs,
      totalTokens: this.totalTokens,
      avgDocLength: this.avgDocLength,
      vocabularySize: this.invertedIndex.size,
    }
  }
}

// 导出单例
export const fullTextIndex = new FullTextIndex()
