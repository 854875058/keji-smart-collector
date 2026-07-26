/**
 * HTML 净化。
 *
 * 抓取到的 contentHtml 会被塞进 dangerouslySetInnerHTML 渲染，所以必须先净化。
 * 威胁面主要来自通用网页抓取（captureGenericPage 会抓任意页面的 article/main）：
 * 只要在恶意页面上保存过一次，那段 HTML 就带着事件属性进了库，之后每次打开
 * 这条笔记都会执行。扩展页面的 CSP 能挡内联 <script>，但挡不住已经进入 DOM
 * 的 on* 属性，web 端（非扩展页面）更没有这层保护。
 *
 * 这里用白名单策略：只保留已知安全的标签与属性，其余一律丢弃。
 */

/** 允许保留的标签 */
const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'pre', 's', 'section', 'small', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u',
  'ul',
])

/** 直接连同内容一起删除的标签（保留内容反而会泄漏脚本文本/样式） */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template',
  'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea',
  'svg', 'math', 'audio', 'video', 'source', 'track', 'canvas', 'portal',
])

/** 按标签允许的属性；'*' 为全局允许 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class', 'title', 'dir', 'lang']),
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'type']),
  details: new Set(['open']),
}

/** 允许出现在 href/src 里的协议 */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'data:image/']

/** 判断 URL 协议是否安全，拦掉 javascript:、vbscript:、非图片 data: 等 */
function isSafeUrl(value: string): boolean {
  // 去掉前导空白与控制字符——`java\tscript:` 这类写法浏览器仍会当成协议
  const v = value.replace(/[\x00-\x20]/g, '').toLowerCase()
  if (v.startsWith('#') || v.startsWith('/') || v.startsWith('./') || v.startsWith('../')) {
    return true
  }
  if (v.startsWith('data:')) return v.startsWith('data:image/')
  // 没有协议的相对地址放行
  if (!/^[a-z][a-z0-9+.-]*:/.test(v)) return true
  return SAFE_PROTOCOLS.some((p) => v.startsWith(p))
}

/** 递归净化一个已解析的元素树（原地修改） */
export function sanitizeElement(root: Element): void {
  // 先整体删掉危险标签及其内容
  root.querySelectorAll([...DROP_WITH_CONTENT].join(',')).forEach((e) => e.remove())

  const walk = (el: Element) => {
    // 先递归处理子节点：unwrap 会改变父节点的子列表，所以快照一份
    for (const child of Array.from(el.children)) walk(child)

    const tag = el.tagName.toLowerCase()

    // 清理属性
    const globalAllowed = ALLOWED_ATTRS['*']
    const tagAllowed = ALLOWED_ATTRS[tag]
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const allowed = globalAllowed.has(name) || (tagAllowed?.has(name) ?? false)
      // on* 事件属性、srcdoc、style 等一律移除
      if (!allowed) {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }

    // 外链统一加 noopener，避免被打开的页面反向操作来源窗口
    if (tag === 'a' && el.getAttribute('target')) {
      el.setAttribute('rel', 'noopener noreferrer')
    }

    // 不在白名单里的标签：保留其子内容，只脱掉这层壳
    if (!ALLOWED_TAGS.has(tag)) unwrap(el)
  }

  for (const child of Array.from(root.children)) walk(child)
}

/** 用子节点替换掉元素本身 */
function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/**
 * 净化 HTML 字符串。
 *
 * 用 DOMParser 解析而不是 innerHTML，避免在净化过程中就触发资源加载
 * （innerHTML 赋值会让 <img onerror> 立刻发起请求）。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    sanitizeElement(doc.body)
    return doc.body.innerHTML.trim()
  } catch {
    // 解析失败时宁可丢掉 HTML，也不返回未净化的内容
    return ''
  }
}
