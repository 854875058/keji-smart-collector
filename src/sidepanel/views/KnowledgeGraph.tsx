import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Snippet, SourcePlatform } from '../../lib/types'
import { Button } from '../components/ui/button'
import { ArrowLeft } from 'lucide-react'

// ── 来源颜色映射 ──────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  ChatGPT: '#22c55e', // 绿色
  Claude: '#3b82f6',  // 蓝色
  Gemini: '#f97316',  // 橙色
}

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] || '#94a3b8' // 灰色
}

// ── 图节点 ──────────────────────────────────────────────
interface GraphNode {
  id: string
  snippet: Snippet
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  connections: number
}

// ── 图边 ──────────────────────────────────────────────
interface GraphEdge {
  source: string
  target: string
  weight: number
}

// ── 提取关键词 ──────────────────────────────────────────
function extractKeywords(snippet: Snippet): Set<string> {
  const keywords = new Set<string>()
  const stopWords = new Set(['的', '是', '在', '了', '和', '与', '或', '不', '有', '这', '那', '我', '你', '他', '她', '它', '们', '什么', '怎么', '如何', '为什么', '可以', '一个', '一些', '这个', '那个', 'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just'])

  const extractFromText = (text: string) => {
    // 提取中文词汇（2-4字）和英文单词
    const chineseWords = text.match(/[一-龥]{2,4}/g) || []
    const englishWords = text.match(/[a-zA-Z]{3,}/g) || []
    for (const word of chineseWords) {
      if (!stopWords.has(word)) keywords.add(word.toLowerCase())
    }
    for (const word of englishWords) {
      if (!stopWords.has(word.toLowerCase())) keywords.add(word.toLowerCase())
    }
  }

  extractFromText(snippet.title)
  extractFromText(snippet.question)
  // 限制回答内容长度避免太慢
  extractFromText(snippet.answer.slice(0, 500))
  if (snippet.tags) {
    for (const tag of snippet.tags) {
      keywords.add(tag.toLowerCase())
    }
  }

  return keywords
}

// ── 计算关键词重叠度 ──────────────────────────────────────
function computeKeywordOverlap(kw1: Set<string>, kw2: Set<string>): number {
  if (kw1.size === 0 || kw2.size === 0) return 0
  let overlap = 0
  for (const word of kw1) {
    if (kw2.has(word)) overlap++
  }
  return overlap / Math.sqrt(kw1.size * kw2.size) // Jaccard-like normalized
}

// ── 组件 ──────────────────────────────────────────────

interface Props {
  snippets: Snippet[]
  onBack: () => void
}

export function KnowledgeGraph({ snippets, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // 拖拽状态
  const dragRef = useRef<{
    nodeId: string | null
    offsetX: number
    offsetY: number
    isDragging: boolean
  }>({ nodeId: null, offsetX: 0, offsetY: 0, isDragging: false })

  // 缩放和平移状态
  const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  })

  // 预计算图数据（仅在 snippets 变化时重新计算）
  const { nodesMap, edges, nodeIds } = useMemo(() => {
    if (snippets.length === 0) return { nodesMap: new Map<string, GraphNode>(), edges: [], nodeIds: [] }

    // 提取所有笔记的关键词
    const keywordsMap = new Map<string, Set<string>>()
    for (const s of snippets) {
      keywordsMap.set(s.id, extractKeywords(s))
    }

    // 计算边（关键词重叠度）
    const edges: GraphEdge[] = []
    const connectionCount = new Map<string, number>()
    const THRESHOLD = 0.03 // 最低重叠阈值

    for (let i = 0; i < snippets.length; i++) {
      for (let j = i + 1; j < snippets.length; j++) {
        const kw1 = keywordsMap.get(snippets[i].id)!
        const kw2 = keywordsMap.get(snippets[j].id)!
        const overlap = computeKeywordOverlap(kw1, kw2)
        if (overlap >= THRESHOLD) {
          edges.push({ source: snippets[i].id, target: snippets[j].id, weight: overlap })
          connectionCount.set(snippets[i].id, (connectionCount.get(snippets[i].id) || 0) + 1)
          connectionCount.set(snippets[j].id, (connectionCount.get(snippets[j].id) || 0) + 1)
        }
      }
    }

    // 创建节点（初始位置随机分布在画布中）
    const canvas = canvasRef.current
    const w = canvas?.width || window.innerWidth || 1200
    const h = canvas?.height || (window.innerHeight - 100) || 700
    const nodesMap = new Map<string, GraphNode>()
    for (const s of snippets) {
      const connections = connectionCount.get(s.id) || 0
      const radius = Math.max(8, Math.min(24, 8 + connections * 3))
      nodesMap.set(s.id, {
        id: s.id,
        snippet: s,
        x: w / 2 + (Math.random() - 0.5) * w * 0.6,
        y: h / 2 + (Math.random() - 0.5) * h * 0.6,
        vx: 0,
        vy: 0,
        radius,
        connections,
      })
    }

    return { nodesMap, edges, nodeIds: snippets.map((s) => s.id) }
  }, [snippets])

  // 力导向布局模拟
  const simulate = useCallback(() => {
    const nodes = Array.from(nodesMap.values())
    if (nodes.length === 0) return

    const REPULSION = 3000
    const ATTRACTION = 0.005
    const DAMPING = 0.85
    const CENTER_GRAVITY = 0.001

    const canvas = canvasRef.current
    if (!canvas) return
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    // 节点间斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i]
        const n2 = nodes[j]
        let dx = n1.x - n2.x
        let dy = n1.y - n2.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) dist = 1
        const force = REPULSION / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        n1.vx += fx
        n1.vy += fy
        n2.vx -= fx
        n2.vy -= fy
      }
    }

    // 边的引力
    for (const edge of edges) {
      const n1 = nodesMap.get(edge.source)
      const n2 = nodesMap.get(edge.target)
      if (!n1 || !n2) continue
      const dx = n2.x - n1.x
      const dy = n2.y - n1.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const force = ATTRACTION * dist * edge.weight * 5
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      n1.vx += fx
      n1.vy += fy
      n2.vx -= fx
      n2.vy -= fy
    }

    // 中心引力（防止节点飘远）
    for (const node of nodes) {
      node.vx += (centerX - node.x) * CENTER_GRAVITY
      node.vy += (centerY - node.y) * CENTER_GRAVITY
    }

    // 更新位置（被拖拽的节点跳过）
    for (const node of nodes) {
      if (dragRef.current.isDragging && dragRef.current.nodeId === node.id) continue
      node.vx *= DAMPING
      node.vy *= DAMPING
      // 限速
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (speed > 10) {
        node.vx = (node.vx / speed) * 10
        node.vy = (node.vy / speed) * 10
      }
      node.x += node.vx
      node.y += node.vy
      // 边界限制
      const margin = node.radius + 5
      if (node.x < margin) { node.x = margin; node.vx = 0 }
      if (node.y < margin) { node.y = margin; node.vy = 0 }
      if (node.x > canvas.width - margin) { node.x = canvas.width - margin; node.vx = 0 }
      if (node.y > canvas.height - margin) { node.y = canvas.height - margin; node.vy = 0 }
    }
  }, [nodesMap, edges])

  // 绘制
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { scale, offsetX, offsetY } = transformRef.current

    // 清空（用背景色）
    const isDark = document.documentElement.classList.contains('dark')
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    // 绘制边
    for (const edge of edges) {
      const n1 = nodesMap.get(edge.source)
      const n2 = nodesMap.get(edge.target)
      if (!n1 || !n2) continue

      ctx.beginPath()
      ctx.moveTo(n1.x, n1.y)
      ctx.lineTo(n2.x, n2.y)
      ctx.strokeStyle = isDark
        ? `rgba(100, 116, 139, ${Math.min(0.8, edge.weight * 3)})`
        : `rgba(148, 163, 184, ${Math.min(0.6, edge.weight * 2)})`
      ctx.lineWidth = Math.max(0.5, edge.weight * 4)
      ctx.stroke()
    }

    // 绘制节点
    for (const node of nodesMap.values()) {
      const color = getSourceColor(node.snippet.source)
      const isSelected = selectedNode?.id === node.id

      // 光晕（选中节点）
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2)
        ctx.fillStyle = `${color}33`
        ctx.fill()
      }

      // 节点圆
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = isSelected ? '#1e293b' : 'rgba(255,255,255,0.6)'
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      ctx.stroke()

      // 节点文字（标题前几个字）
      if (node.radius >= 12) {
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.max(8, node.radius * 0.55)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const label = node.snippet.title.slice(0, 4)
        ctx.fillText(label, node.x, node.y)
      }
    }

    ctx.restore()
  }, [nodesMap, edges, selectedNode])

  // 动画循环
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      simulate()
      draw()
      animationRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      running = false
      cancelAnimationFrame(animationRef.current)
    }
  }, [simulate, draw])

  // 尺寸自适应
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const w = rect.width || window.innerWidth
      const h = (rect.height || window.innerHeight) - 100 // 减去顶栏和底部摘要
      canvas.width = w
      canvas.height = h
    }
    // 延迟执行确保容器已渲染
    resize()
    requestAnimationFrame(resize)
    setTimeout(resize, 100)

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 坐标转换：屏幕 -> 画布
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    }
  }, [])

  // 查找点击的节点
  const findNodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
    // 倒序遍历，后绘制的在上面
    const nodes = Array.from(nodesMap.values()).reverse()
    for (const node of nodes) {
      const dx = node.x - cx
      const dy = node.y - cy
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        return node
      }
    }
    return null
  }, [nodesMap])

  // 鼠标事件：拖拽 / 点击
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    const node = findNodeAt(x, y)
    if (node) {
      dragRef.current = {
        nodeId: node.id,
        offsetX: x - node.x,
        offsetY: y - node.y,
        isDragging: true,
      }
      setSelectedNode(node)
    }
  }, [screenToCanvas, findNodeAt])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.isDragging || !dragRef.current.nodeId) return
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    const node = nodesMap.get(dragRef.current.nodeId)
    if (node) {
      node.x = x - dragRef.current.offsetX
      node.y = y - dragRef.current.offsetY
      node.vx = 0
      node.vy = 0
    }
  }, [screenToCanvas, nodesMap])

  const handleMouseUp = useCallback(() => {
    dragRef.current.isDragging = false
    dragRef.current.nodeId = null
  }, [])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const { scale, offsetX, offsetY } = transformRef.current
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.2, Math.min(5, scale * delta))

    // 以鼠标位置为中心缩放
    const newOffsetX = mouseX - (mouseX - offsetX) * (newScale / scale)
    const newOffsetY = mouseY - (mouseY - offsetY) * (newScale / scale)

    transformRef.current = { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }
  }, [])

  // 重置视图
  const handleReset = useCallback(() => {
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 }
    setSelectedNode(null)
  }, [])

  // 按来源统计
  const sourceStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const s of snippets) {
      stats[s.source] = (stats[s.source] || 0) + 1
    }
    return stats
  }, [snippets])

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-700 dark:text-slate-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">知识图谱</div>
          <div className="text-xs text-slate-400">{snippets.length} 个节点 · {edges.length} 条连线</div>
        </div>
        <Button size="sm" variant="outline" onClick={handleReset}>
          重置视图
        </Button>
      </div>

      {/* 来源图例 */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        {Object.entries(sourceStats).map(([source, count]) => (
          <div key={source} className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: getSourceColor(source) }}
            />
            <span>{source} ({count})</span>
          </div>
        ))}
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* 底部选中笔记摘要 */}
      <div className="h-14 border-t border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-800 flex items-center gap-3">
        {selectedNode ? (
          <>
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: getSourceColor(selectedNode.snippet.source) }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {selectedNode.snippet.title}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                {selectedNode.snippet.summary || selectedNode.snippet.answer.slice(0, 100)}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">
              {selectedNode.connections} 关联
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-400">点击节点查看详情，滚轮缩放，拖拽移动</span>
        )}
      </div>
    </div>
  )
}
