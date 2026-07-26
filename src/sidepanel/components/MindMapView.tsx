import { useMemo } from 'react'

export interface MindNode {
  id: string
  text: string
  children: MindNode[]
}

/**
 * 把 Markdown 缩进列表解析成树。
 * 缩进按每 2 个空格算一级，Tab 视作 2 个空格。
 */
export function parseMindMap(markdown: string): MindNode | null {
  const lines = (markdown || '').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return null

  const root: MindNode = { id: 'root', text: '', children: [] }
  // 栈中保存 [缩进层级, 节点]
  const stack: [number, MindNode][] = [[-1, root]]

  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.)?\s*(.*)$/)
    if (!match) return
    const text = match[2].trim().replace(/^\*\*(.*)\*\*$/, '$1')
    if (!text) return

    const indent = Math.floor(match[1].replace(/\t/g, '  ').length / 2)
    const node: MindNode = { id: `n${index}`, text, children: [] }

    while (stack.length > 1 && stack[stack.length - 1][0] >= indent) {
      stack.pop()
    }
    stack[stack.length - 1][1].children.push(node)
    stack.push([indent, node])
  })

  // 单一顶层节点时以它作为根，否则用第一行当主题、其余挂在其下
  if (root.children.length === 1) return root.children[0]
  if (root.children.length === 0) return null
  const [first, ...rest] = root.children
  return { ...first, children: [...first.children, ...rest] }
}

function MindBranch({ node, depth }: { node: MindNode; depth: number }) {
  const depthClass = `keji-mind-label-depth-${Math.min(depth, 4)}`
  return (
    <li className="keji-mind-node">
      <div className={`keji-mind-label ${depthClass}`}>{node.text}</div>
      {node.children.length > 0 && (
        <ul className="keji-mind-children">
          {node.children.map((child) => (
            <MindBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

interface MindMapViewProps {
  markdown: string
  /** 侧边栏空间窄，用紧凑排版 */
  compact?: boolean
}

/** 思维导图渲染：嵌套列表 + CSS 连线，不引入图表库 */
export default function MindMapView({ markdown, compact }: MindMapViewProps) {
  const tree = useMemo(() => parseMindMap(markdown), [markdown])

  if (!tree) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
        暂无可展示的思维导图内容。
      </div>
    )
  }

  return (
    <div className={`keji-mind-map${compact ? ' keji-mind-map--compact' : ''}`}>
      <div className="keji-mind-root">{tree.text}</div>
      {tree.children.length > 0 && (
        <ul className="keji-mind-children keji-mind-children--root">
          {tree.children.map((child) => (
            <MindBranch key={child.id} node={child} depth={1} />
          ))}
        </ul>
      )}
    </div>
  )
}
